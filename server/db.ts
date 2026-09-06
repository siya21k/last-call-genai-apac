import fs from 'fs';
import path from 'path';
import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import type { Deadline, CheckInEntry, UserStatus, PartnerInvite, RiskLevel } from '../src/types';

// Load Firebase applet configuration
let firebaseConfig: any = {};
try {
  const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(cfgPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  }
} catch (e) {
  console.warn('[DB] Could not load firebase-applet-config.json:', e);
}

const adminApp = !getApps().length
  ? initializeApp({
      projectId: firebaseConfig.projectId || process.env.GCLOUD_PROJECT,
    })
  : getApp();

export const adminAuth = getAuth(adminApp);

// Initialize Admin Firestore
export const adminDb = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
  ? getFirestore(adminApp, firebaseConfig.firestoreDatabaseId)
  : getFirestore(adminApp);

// Local persistence fallback file for development/sandbox without IAM cross-project credentials
const LOCAL_STORE_FILE = path.resolve(process.cwd(), 'data-store.json');

interface MemoryStore {
  deadlines: Record<string, Deadline>; // key: `${uid}_${deadlineId}`
  entries: Record<string, CheckInEntry>; // key: `${uid}_${deadlineId}_${entryId}`
  statuses: Record<string, UserStatus>; // key: `${uid}`
  invites: Record<string, PartnerInvite>; // key: `${uid}`
}

function loadLocalStore(): MemoryStore {
  try {
    if (fs.existsSync(LOCAL_STORE_FILE)) {
      return JSON.parse(fs.readFileSync(LOCAL_STORE_FILE, 'utf8'));
    }
  } catch (e) {
    console.warn('[DB] Error loading local store:', e);
  }
  return { deadlines: {}, entries: {}, statuses: {}, invites: {} };
}

function saveLocalStore(store: MemoryStore) {
  try {
    fs.writeFileSync(LOCAL_STORE_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch (e) {
    console.error('[DB] Error saving local store:', e);
  }
}

// Clean undefined values to prevent Firestore driver errors
export function sanitizePayload<T extends Record<string, any>>(obj: T): T {
  return JSON.parse(
    JSON.stringify(obj, (k, v) => (v === undefined ? null : v))
  );
}

/**
 * Step 9: Recompute and write the users/{uid}/status document any time:
 * - a deadline is added
 * - a deadline's status changes (met or missed)
 * - a check-in completes
 *
 * Implemented as one transaction:
 * (a) READ PHASE: read all user's deadline docs; for any that are "pending" with passed dueAt,
 *     compute (in memory) that they are now "missed".
 * (b) WRITE PHASE: using in-memory corrected statuses, compute streak/currentRiskLevel/next-deadline;
 *     write any deadline docs whose status just flipped to "missed", AND the recomputed users/{uid}/status document.
 */
export async function recomputeUserStatus(uid: string): Promise<UserStatus> {
  const nowIso = new Date().toISOString();

  try {
    // Attempt Firestore Transaction with Admin SDK
    const userRef = adminDb.collection('users').doc(uid);
    const deadlinesCol = userRef.collection('deadlines');
    const statusRef = userRef.collection('status').doc('current');

    return await adminDb.runTransaction(async (transaction) => {
      // (a) READ PHASE: Read all deadlines
      const snapshot = await transaction.get(deadlinesCol);
      const deadlines: Deadline[] = [];
      const newlyMissedDeadlineIds: string[] = [];

      snapshot.forEach((doc) => {
        const data = doc.data() as any;
        const dl: Deadline = {
          id: doc.id,
          name: data.name,
          dueAt: data.dueAt,
          createdAt: data.createdAt,
          status: data.status,
          latestRiskLevel: data.latestRiskLevel ?? null,
        };

        // In-memory status correction for pending overdue deadlines
        if (dl.status === 'pending' && new Date(dl.dueAt).getTime() <= Date.now()) {
          dl.status = 'missed';
          newlyMissedDeadlineIds.push(dl.id);
        }
        deadlines.push(dl);
      });

      // (b) Calculate status metrics
      const computedStatus = calculateStatusMetrics(deadlines, nowIso);

      // WRITE PHASE: Commit newly missed deadlines and recomputed status
      for (const missedId of newlyMissedDeadlineIds) {
        transaction.update(deadlinesCol.doc(missedId), { status: 'missed' });
      }

      transaction.set(statusRef, sanitizePayload(computedStatus));
      return computedStatus;
    });
  } catch (err: any) {
    console.warn('[DB] Admin SDK transaction fallback to resilient storage:', err.message);

    // Resilient local store implementation
    const store = loadLocalStore();
    const userDeadlines: Deadline[] = Object.entries(store.deadlines)
      .filter(([key]) => key.startsWith(`${uid}_`))
      .map(([_, dl]) => ({ ...dl }));

    const newlyMissed: Deadline[] = [];
    userDeadlines.forEach((dl) => {
      if (dl.status === 'pending' && new Date(dl.dueAt).getTime() <= Date.now()) {
        dl.status = 'missed';
        store.deadlines[`${uid}_${dl.id}`].status = 'missed';
        newlyMissed.push(dl);
      }
    });

    const computedStatus = calculateStatusMetrics(userDeadlines, nowIso);
    store.statuses[uid] = computedStatus;
    saveLocalStore(store);
    return computedStatus;
  }
}

/**
 * Metric calculation helper:
 * - streak = count of consecutive "met" deadlines, walking backward from the most recently due deadline,
 *   stopping at the first "missed" one encountered. "pending" is skipped in this walk.
 * - currentRiskLevel = highest latestRiskLevel among deadlines currently "pending"
 *   (critical > medium > low; "none" if none pending or none have latestRiskLevel)
 * - nextDeadlineName / nextDeadlineAt = soonest "pending" deadline by dueAt.
 */
function calculateStatusMetrics(deadlines: Deadline[], nowIso: string): UserStatus {
  // 1. Streak calculation: sort by dueAt descending (most recently due first)
  const sortedByDueDesc = [...deadlines].sort(
    (a, b) => new Date(b.dueAt).getTime() - new Date(a.dueAt).getTime()
  );

  let streak = 0;
  for (const dl of sortedByDueDesc) {
    if (dl.status === 'pending') {
      // Pending tasks are skipped in this walk
      continue;
    }
    if (dl.status === 'met') {
      streak += 1;
    } else if (dl.status === 'missed') {
      // Stop at first missed one encountered
      break;
    }
  }

  // 2. Pending deadlines
  const pendingDeadlines = deadlines.filter((d) => d.status === 'pending');

  // 3. Current Risk Level
  let currentRiskLevel: RiskLevel = 'none';
  const riskPriority: Record<string, number> = { critical: 3, medium: 2, low: 1 };
  let highestPriority = 0;

  for (const dl of pendingDeadlines) {
    if (dl.latestRiskLevel && riskPriority[dl.latestRiskLevel]) {
      const priority = riskPriority[dl.latestRiskLevel];
      if (priority > highestPriority) {
        highestPriority = priority;
        currentRiskLevel = dl.latestRiskLevel as RiskLevel;
      }
    }
  }

  // 4. Next deadline (soonest pending deadline by dueAt)
  const sortedPendingSoonest = [...pendingDeadlines].sort(
    (a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
  );

  const nextDl = sortedPendingSoonest[0] || null;

  return {
    streak,
    nextDeadlineName: nextDl ? nextDl.name : null,
    nextDeadlineAt: nextDl ? nextDl.dueAt : null,
    currentRiskLevel,
    updatedAt: nowIso,
  };
}

/**
 * Step 8: GET /deadlines endpoint lazy check on dashboard load.
 * Runs lazy missed-detection on all pending overdue deadlines before returning.
 */
export async function getDeadlinesWithLazyCheck(uid: string): Promise<Deadline[]> {
  try {
    const userRef = adminDb.collection('users').doc(uid);
    const snapshot = await userRef.collection('deadlines').get();
    const batch = adminDb.batch();
    let hasUpdates = false;

    const list: Deadline[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data() as any;
      const dl: Deadline = {
        id: doc.id,
        name: data.name,
        dueAt: data.dueAt,
        createdAt: data.createdAt,
        status: data.status,
        latestRiskLevel: data.latestRiskLevel ?? null,
      };

      if (dl.status === 'pending' && new Date(dl.dueAt).getTime() <= Date.now()) {
        dl.status = 'missed';
        batch.update(doc.ref, { status: 'missed' });
        hasUpdates = true;
      }
      list.push(dl);
    });

    if (hasUpdates) {
      await batch.commit();
      await recomputeUserStatus(uid);
    }

    return list.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  } catch (err: any) {
    console.warn('[DB] Falling back to local store for getDeadlines:', err.message);
    const store = loadLocalStore();
    let hasUpdates = false;
    const list: Deadline[] = [];

    Object.entries(store.deadlines).forEach(([key, dl]) => {
      if (key.startsWith(`${uid}_`)) {
        if (dl.status === 'pending' && new Date(dl.dueAt).getTime() <= Date.now()) {
          dl.status = 'missed';
          store.deadlines[key].status = 'missed';
          hasUpdates = true;
        }
        list.push({ ...dl });
      }
    });

    if (hasUpdates) {
      saveLocalStore(store);
      await recomputeUserStatus(uid);
    }

    return list.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  }
}

/**
 * Step 3: Add deadline via backend endpoint.
 * Validates input, writes doc with Admin SDK, and runs Step 9 recompute before returning.
 */
export async function createDeadline(
  uid: string,
  params: { name: string; dueAt: string }
): Promise<{ deadline: Deadline; status: UserStatus }> {
  const { name, dueAt } = params;
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new Error('Deadline name is required and cannot be blank.');
  }
  if (!dueAt || isNaN(new Date(dueAt).getTime())) {
    throw new Error('Valid due date/time is required.');
  }

  const deadlineId = 'dl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const nowIso = new Date().toISOString();

  const deadlineData: Deadline = {
    id: deadlineId,
    name: name.trim(),
    dueAt: new Date(dueAt).toISOString(),
    createdAt: nowIso,
    status: 'pending',
    latestRiskLevel: null, // set to null explicitly at creation, never left undefined
  };

  try {
    const dlRef = adminDb.collection('users').doc(uid).collection('deadlines').doc(deadlineId);
    await dlRef.set(sanitizePayload(deadlineData));
  } catch (err: any) {
    console.warn('[DB] Fallback save deadline to local store:', err.message);
    const store = loadLocalStore();
    store.deadlines[`${uid}_${deadlineId}`] = deadlineData;
    saveLocalStore(store);
  }

  const updatedStatus = await recomputeUserStatus(uid);
  return { deadline: deadlineData, status: updatedStatus };
}

/**
 * Step 8: Mark deadline done endpoint.
 * Sets status to "met" manually. Allowed regardless of current status —
 * including marking a deadline "met" after it was already "missed".
 * Triggers Step 9 recompute in the same request.
 */
export async function markDeadlineDone(
  uid: string,
  deadlineId: string
): Promise<{ deadline: Deadline; status: UserStatus }> {
  let updatedDeadline: Deadline | null = null;

  try {
    const dlRef = adminDb.collection('users').doc(uid).collection('deadlines').doc(deadlineId);
    const docSnap = await dlRef.get();
    if (!docSnap.exists) {
      throw new Error(`Deadline ${deadlineId} not found`);
    }
    const data = docSnap.data() as any;
    updatedDeadline = {
      id: docSnap.id,
      name: data.name,
      dueAt: data.dueAt,
      createdAt: data.createdAt,
      status: 'met',
      latestRiskLevel: data.latestRiskLevel ?? null,
    };
    await dlRef.update({ status: 'met' });
  } catch (err: any) {
    console.warn('[DB] Fallback markDeadlineDone to local store:', err.message);
    const store = loadLocalStore();
    const key = `${uid}_${deadlineId}`;
    if (!store.deadlines[key]) {
      throw new Error(`Deadline ${deadlineId} not found`);
    }
    store.deadlines[key].status = 'met';
    updatedDeadline = { ...store.deadlines[key] };
    saveLocalStore(store);
  }

  const updatedStatus = await recomputeUserStatus(uid);
  return { deadline: updatedDeadline!, status: updatedStatus };
}

/**
 * Step 8: Check-in open endpoint.
 * Runs lazy check on this deadline before opening check-in.
 */
export async function openCheckIn(
  uid: string,
  deadlineId: string
): Promise<{ deadline: Deadline; entries: CheckInEntry[] }> {
  let deadline: Deadline | null = null;
  const entries: CheckInEntry[] = [];

  try {
    const dlRef = adminDb.collection('users').doc(uid).collection('deadlines').doc(deadlineId);
    const docSnap = await dlRef.get();
    if (!docSnap.exists) {
      throw new Error(`Deadline ${deadlineId} not found`);
    }
    const data = docSnap.data() as any;
    deadline = {
      id: docSnap.id,
      name: data.name,
      dueAt: data.dueAt,
      createdAt: data.createdAt,
      status: data.status,
      latestRiskLevel: data.latestRiskLevel ?? null,
    };

    // Lazy missed check on open
    if (deadline.status === 'pending' && new Date(deadline.dueAt).getTime() <= Date.now()) {
      deadline.status = 'missed';
      await dlRef.update({ status: 'missed' });
      await recomputeUserStatus(uid);
    }

    // Fetch entries
    const entriesSnap = await dlRef.collection('entries').orderBy('createdAt', 'desc').get();
    entriesSnap.forEach((eDoc) => {
      const eData = eDoc.data() as any;
      entries.push({
        id: eDoc.id,
        deadlineId,
        category: eData.category,
        riskLevel: eData.riskLevel,
        summary: eData.summary,
        actionItems: eData.actionItems || [],
        locationTag: eData.locationTag,
        conversation: eData.conversation || [],
        createdAt: eData.createdAt,
        notified: eData.notified ?? false,
      });
    });
  } catch (err: any) {
    console.warn('[DB] Fallback openCheckIn to local store:', err.message);
    const store = loadLocalStore();
    const dlKey = `${uid}_${deadlineId}`;
    if (!store.deadlines[dlKey]) {
      throw new Error(`Deadline ${deadlineId} not found`);
    }

    deadline = { ...store.deadlines[dlKey] };
    if (deadline.status === 'pending' && new Date(deadline.dueAt).getTime() <= Date.now()) {
      deadline.status = 'missed';
      store.deadlines[dlKey].status = 'missed';
      saveLocalStore(store);
      await recomputeUserStatus(uid);
    }

    Object.entries(store.entries).forEach(([key, entry]) => {
      if (key.startsWith(`${uid}_${deadlineId}_`)) {
        entries.push({ ...entry });
      }
    });
    entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  return { deadline, entries };
}

/**
 * Step 7: Save completed check-in.
 * - Single Firestore BATCHED WRITE: saves entry document (notified: false explicitly)
 *   AND writes resulting riskLevel onto parent deadline doc as `latestRiskLevel`.
 * - Transactional status recompute (step 9).
 * - Step 10: Inline Slack notification if riskLevel is "critical":
 *   - Check entry's notified field.
 *   - Send Slack message with ONLY deadline name and "critical".
 *   - Check-in save succeeds independent of notification outcome.
 *   - Follow-up write sets notified: true on confirmed success.
 */
export async function saveCompletedCheckIn(
  uid: string,
  deadlineId: string,
  params: {
    category: string;
    riskLevel: 'low' | 'medium' | 'critical';
    summary: string;
    actionItems: string[];
    locationTag: 'home' | 'office' | 'in bed' | 'other';
    conversation: Array<{ role: 'user' | 'assistant'; text: string; timestamp: string }>;
  }
): Promise<{ entry: CheckInEntry; deadline: Deadline; status: UserStatus; slackAlertSent: boolean }> {
  const entryId = 'entry_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const nowIso = new Date().toISOString();

  const entryData: CheckInEntry = {
    id: entryId,
    deadlineId,
    category: params.category,
    riskLevel: params.riskLevel,
    summary: params.summary,
    actionItems: params.actionItems,
    locationTag: params.locationTag,
    conversation: params.conversation,
    createdAt: nowIso,
    notified: false, // Explicitly false, never undefined
  };

  let deadlineName = '';
  let updatedDeadline: Deadline | null = null;

  try {
    // Single Firestore BATCHED WRITE
    const batch = adminDb.batch();
    const userRef = adminDb.collection('users').doc(uid);
    const dlRef = userRef.collection('deadlines').doc(deadlineId);
    const entryRef = dlRef.collection('entries').doc(entryId);

    const dlDoc = await dlRef.get();
    if (!dlDoc.exists) {
      throw new Error(`Deadline ${deadlineId} not found`);
    }
    const dlData = dlDoc.data() as any;
    deadlineName = dlData.name;

    // 1. Entry document
    batch.set(entryRef, sanitizePayload(entryData));

    // 2. Parent deadline document: write latestRiskLevel
    batch.update(dlRef, { latestRiskLevel: params.riskLevel });

    // Commit batch atomically
    await batch.commit();

    updatedDeadline = {
      id: dlDoc.id,
      name: dlData.name,
      dueAt: dlData.dueAt,
      createdAt: dlData.createdAt,
      status: dlData.status,
      latestRiskLevel: params.riskLevel,
    };
  } catch (err: any) {
    console.warn('[DB] Fallback saveCompletedCheckIn to local store:', err.message);
    const store = loadLocalStore();
    const dlKey = `${uid}_${deadlineId}`;
    if (!store.deadlines[dlKey]) {
      throw new Error(`Deadline ${deadlineId} not found`);
    }

    deadlineName = store.deadlines[dlKey].name;
    store.deadlines[dlKey].latestRiskLevel = params.riskLevel;
    store.entries[`${uid}_${deadlineId}_${entryId}`] = entryData;
    saveLocalStore(store);

    updatedDeadline = { ...store.deadlines[dlKey] };
  }

  // Step 9: Recompute and write users/{uid}/status document
  const updatedStatus = await recomputeUserStatus(uid);

  // Step 10: Slack notification for Critical Risk
  let slackAlertSent = false;
  if (params.riskLevel === 'critical' && !entryData.notified) {
    slackAlertSent = await sendCriticalSlackAlert(uid, deadlineId, entryId, deadlineName);
  }

  return {
    entry: entryData,
    deadline: updatedDeadline!,
    status: updatedStatus,
    slackAlertSent,
  };
}

/**
 * Step 10: Send inline Slack notification on critical risk.
 * Payloads contain ONLY deadline name and risk level ("critical") — deliberately excludes summary.
 * Check-in save succeeds independent of notification outcome.
 */
async function sendCriticalSlackAlert(
  uid: string,
  deadlineId: string,
  entryId: string,
  deadlineName: string
): Promise<boolean> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.info('[Slack Alert] SLACK_WEBHOOK_URL not configured. Skipping alert.');
    return false;
  }

  try {
    const payload = {
      text: `🚨 *Last Call Critical Alert*: Task "*${deadlineName}*" has been flagged at risk level *CRITICAL*.`,
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      console.log(`[Slack Alert] Sent alert for entry ${entryId}`);
      // Small follow-up write to set notified: true on confirmed HTTP 200
      try {
        const entryRef = adminDb
          .collection('users')
          .doc(uid)
          .collection('deadlines')
          .doc(deadlineId)
          .collection('entries')
          .doc(entryId);
        await entryRef.update({ notified: true });
      } catch (writeErr) {
        const store = loadLocalStore();
        const key = `${uid}_${deadlineId}_${entryId}`;
        if (store.entries[key]) {
          store.entries[key].notified = true;
          saveLocalStore(store);
        }
      }
      return true;
    } else {
      console.warn(`[Slack Alert] Webhook returned status ${response.status}: ${await response.text()}`);
      return false;
    }
  } catch (netErr: any) {
    console.warn(`[Slack Alert] Failed to send webhook: ${netErr.message}`);
    return false;
  }
}

/**
 * Read Status Document:
 * - Readable by owner or accountability partner
 */
export async function getUserStatus(uid: string): Promise<UserStatus> {
  try {
    const statusRef = adminDb.collection('users').doc(uid).collection('status').doc('current');
    const docSnap = await statusRef.get();
    if (docSnap.exists) {
      return docSnap.data() as UserStatus;
    }
  } catch (err: any) {
    console.warn('[DB] Fallback getUserStatus:', err.message);
    const store = loadLocalStore();
    if (store.statuses[uid]) {
      return store.statuses[uid];
    }
  }

  // Default initial status if not computed yet
  return recomputeUserStatus(uid);
}

/**
 * Partner Invite Management
 */
export async function getPartnerInvite(uid: string): Promise<PartnerInvite | null> {
  try {
    const docSnap = await adminDb
      .collection('users')
      .doc(uid)
      .collection('partnerInvite')
      .doc('current')
      .get();
    if (docSnap.exists) {
      return docSnap.data() as PartnerInvite;
    }
  } catch (err: any) {
    console.warn('[DB] Fallback getPartnerInvite:', err.message);
    const store = loadLocalStore();
    if (store.invites[uid]) {
      return store.invites[uid];
    }
  }
  return null;
}

export async function createPartnerInvite(uid: string, email: string): Promise<PartnerInvite> {
  if (!email || !email.includes('@')) {
    throw new Error('A valid email address is required for partner invitation.');
  }

  const nowIso = new Date().toISOString();
  const invite: PartnerInvite = {
    email: email.trim().toLowerCase(),
    status: 'pending',
    partnerUid: null,
    createdAt: nowIso,
  };

  try {
    await adminDb
      .collection('users')
      .doc(uid)
      .collection('partnerInvite')
      .doc('current')
      .set(sanitizePayload(invite));
  } catch (err: any) {
    console.warn('[DB] Fallback createPartnerInvite:', err.message);
    const store = loadLocalStore();
    store.invites[uid] = invite;
    saveLocalStore(store);
  }

  return invite;
}

export async function revokePartner(uid: string): Promise<{ success: boolean; partnerUid: string | null }> {
  let partnerUid: string | null = null;

  try {
    const inviteRef = adminDb.collection('users').doc(uid).collection('partnerInvite').doc('current');
    const inviteSnap = await inviteRef.get();

    if (inviteSnap.exists) {
      const data = inviteSnap.data() as PartnerInvite;
      partnerUid = data.partnerUid;

      // Revoke claims on partner account directly if exists
      if (partnerUid) {
        try {
          await adminAuth.setCustomUserClaims(partnerUid, {});
        } catch (claimErr: any) {
          console.warn(`[DB] Warning: Could not clear claims on partner ${partnerUid}:`, claimErr.message);
        }
      }

      await inviteRef.update({
        status: 'revoked',
        partnerUid: null,
      });
    }
  } catch (err: any) {
    console.warn('[DB] Fallback revokePartner to local store:', err.message);
    const store = loadLocalStore();
    if (store.invites[uid]) {
      partnerUid = store.invites[uid].partnerUid;
      store.invites[uid].status = 'revoked';
      store.invites[uid].partnerUid = null;
      saveLocalStore(store);
    }
  }

  return { success: true, partnerUid };
}
