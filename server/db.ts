import fs from 'fs';
import path from 'path';
import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import type {
  Task,
  TaskStatus,
  ConsequenceType,
  ThreadMessage,
  LogEntry,
  TaskEntry,
  DailyStrip,
  PartnerInvite,
  AnchorTimes,
  UserProfile,
  JournalEntry,
} from '../src/types';

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
export const adminDb =
  firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
    ? getFirestore(adminApp, firebaseConfig.firestoreDatabaseId)
    : getFirestore(adminApp);

// Local persistence fallback store for development/sandbox without IAM cross-project credentials
const LOCAL_STORE_FILE = path.resolve(process.cwd(), 'data-store.json');

interface MemoryStore {
  users: Record<string, UserProfile>;
  tasks: Record<string, Task>; // key: `${uid}_${taskId}`
  taskEntries: Record<string, TaskEntry[]>; // key: `${uid}_${taskId}`
  threadMessages: Record<string, ThreadMessage[]>; // key: `${uid}`
  logEntries: Record<string, LogEntry[]>; // key: `${uid}`
  dailyStrip: Record<string, Record<string, string>>; // key: `${uid}` -> { [date]: line }
  invites: Record<string, PartnerInvite>; // key: `${uid}`
  journalEntries: Record<string, JournalEntry[]>; // key: `${uid}`
}

function loadLocalStore(): MemoryStore {
  try {
    if (fs.existsSync(LOCAL_STORE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(LOCAL_STORE_FILE, 'utf8'));
      return {
        users: parsed.users || {},
        tasks: parsed.tasks || {},
        taskEntries: parsed.taskEntries || {},
        threadMessages: parsed.threadMessages || {},
        logEntries: parsed.logEntries || {},
        dailyStrip: parsed.dailyStrip || {},
        invites: parsed.invites || {},
        journalEntries: parsed.journalEntries || {},
      };
    }
  } catch (e) {
    console.warn('[DB] Error loading local store:', e);
  }
  return { users: {}, tasks: {}, taskEntries: {}, threadMessages: {}, logEntries: {}, dailyStrip: {}, invites: {}, journalEntries: {} };
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
 * User Profile & Settings
 */
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  try {
    const docSnap = await adminDb.collection('users').doc(uid).get();
    if (docSnap.exists) {
      return docSnap.data() as UserProfile;
    }
  } catch (err: any) {
    console.warn('[DB] Fallback getUserProfile:', err.message);
  }
  const store = loadLocalStore();
  return store.users[uid] || null;
}

export async function upsertUserProfile(
  uid: string,
  params: { email?: string | null; displayName?: string | null; anchorTimes?: AnchorTimes; notificationToken?: string; timezone?: string }
): Promise<UserProfile> {
  const nowIso = new Date().toISOString();
  const existing = (await getUserProfile(uid)) || {
    uid,
    email: params.email || null,
    displayName: params.displayName || null,
    photoURL: null,
    anchorTimes: { beforeWork: '08:30', afterWork: '17:30', beforeSleep: '23:00' },
    timezone: params.timezone || 'UTC',
  };

  const updated: UserProfile = {
    ...existing,
    email: params.email !== undefined ? params.email : existing.email,
    displayName: params.displayName !== undefined ? params.displayName : existing.displayName,
    anchorTimes: params.anchorTimes ? { ...existing.anchorTimes, ...params.anchorTimes } : existing.anchorTimes,
    notificationToken: params.notificationToken !== undefined ? params.notificationToken : existing.notificationToken,
    timezone: params.timezone !== undefined ? params.timezone : (existing.timezone || 'UTC'),
  };

  try {
    await adminDb.collection('users').doc(uid).set(sanitizePayload(updated), { merge: true });
  } catch (err: any) {
    console.warn('[DB] Fallback upsertUserProfile to local store:', err.message);
  }

  const store = loadLocalStore();
  store.users[uid] = updated;
  saveLocalStore(store);
  return updated;
}

/**
 * Task Management
 */
export async function getTasks(uid: string): Promise<Task[]> {
  const tasks: Task[] = [];
  try {
    const snapshot = await adminDb.collection('users').doc(uid).collection('tasks').get();
    snapshot.forEach((doc) => {
      tasks.push({ id: doc.id, ...(doc.data() as any) });
    });
    return tasks.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  } catch (err: any) {
    console.warn('[DB] Fallback getTasks from local store:', err.message);
    const store = loadLocalStore();
    Object.entries(store.tasks).forEach(([k, t]) => {
      if (k.startsWith(`${uid}_`)) {
        tasks.push({ ...t });
      }
    });
    return tasks.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  }
}

export async function createTask(
  uid: string,
  params: {
    name: string;
    dueAt: string;
    consequenceType?: ConsequenceType;
    anchorPhrase?: string | null;
  }
): Promise<Task> {
  const taskId = 'task_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const nowIso = new Date().toISOString();

  const taskData: Task = {
    id: taskId,
    name: params.name.trim(),
    dueAt: params.dueAt,
    anchorPhrase: params.anchorPhrase || null,
    status: 'pending',
    consequenceType: params.consequenceType || 'unspecified',
    patternNote: '',
    lastGuaranteedNudgeAt: null,
    lastEscalationNudgeAt: null,
    createdAt: nowIso,
  };

  try {
    const taskRef = adminDb.collection('users').doc(uid).collection('tasks').doc(taskId);
    await taskRef.set(sanitizePayload(taskData));
  } catch (err: any) {
    console.warn('[DB] Fallback createTask to local store:', err.message);
  }

  const store = loadLocalStore();
  store.tasks[`${uid}_${taskId}`] = taskData;
  saveLocalStore(store);
  return taskData;
}

export async function markTaskDone(uid: string, taskId: string): Promise<Task> {
  let task: Task | null = null;
  const nowIso = new Date().toISOString();
  try {
    const taskRef = adminDb.collection('users').doc(uid).collection('tasks').doc(taskId);
    const snap = await taskRef.get();
    if (snap.exists) {
      task = { id: snap.id, ...(snap.data() as any), status: 'met', completedAt: nowIso };
      await taskRef.update({ status: 'met', completedAt: nowIso });
    }
  } catch (err: any) {
    console.warn('[DB] Fall markTaskDone:', err.message);
  }

  const store = loadLocalStore();
  const key = `${uid}_${taskId}`;
  if (store.tasks[key]) {
    store.tasks[key].status = 'met';
    store.tasks[key].completedAt = nowIso;
    task = { ...store.tasks[key] };
    saveLocalStore(store);
  }

  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }
  return task;
}

export async function reopenTask(uid: string, taskId: string): Promise<Task> {
  let task: Task | null = null;
  try {
    const taskRef = adminDb.collection('users').doc(uid).collection('tasks').doc(taskId);
    await taskRef.update({ status: 'pending', completedAt: null });
    const snap = await taskRef.get();
    if (snap.exists) {
      task = { id: snap.id, ...(snap.data() as any) };
    }
  } catch (err: any) {
    console.warn('[DB] Fallback reopenTask:', err.message);
  }

  const store = loadLocalStore();
  const key = `${uid}_${taskId}`;
  if (store.tasks[key]) {
    store.tasks[key].status = 'pending';
    store.tasks[key].completedAt = null;
    task = { ...store.tasks[key] };
    saveLocalStore(store);
  }

  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }
  return task;
}

export async function releaseTask(uid: string, taskId: string): Promise<Task> {
  let task: Task | null = null;
  try {
    const taskRef = adminDb.collection('users').doc(uid).collection('tasks').doc(taskId);
    await taskRef.update({ status: 'released' });
    const snap = await taskRef.get();
    if (snap.exists) {
      task = { id: snap.id, ...(snap.data() as any) };
    }
  } catch (err: any) {
    console.warn('[DB] Fallback releaseTask:', err.message);
  }

  const store = loadLocalStore();
  const key = `${uid}_${taskId}`;
  if (store.tasks[key]) {
    store.tasks[key].status = 'released';
    task = { ...store.tasks[key] };
    saveLocalStore(store);
  }

  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }
  return task;
}

/**
 * Task Entries (Subcollection under users/{uid}/tasks/{taskId}/entries)
 */
export async function createTaskEntry(
  uid: string,
  taskId: string,
  params: {
    summary: string;
    nextPhysicalAction: string;
    conversation?: Array<{ role: 'user' | 'assistant'; text: string; timestamp: string }>;
  }
): Promise<TaskEntry> {
  const entryId = 'entry_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const nowIso = new Date().toISOString();

  const entry: TaskEntry = {
    id: entryId,
    taskId,
    summary: params.summary,
    nextPhysicalAction: params.nextPhysicalAction,
    conversation: params.conversation || [],
    createdAt: nowIso,
  };

  try {
    await adminDb
      .collection('users')
      .doc(uid)
      .collection('tasks')
      .doc(taskId)
      .collection('entries')
      .doc(entryId)
      .set(sanitizePayload(entry));
  } catch (err: any) {
    console.warn('[DB] Fallback createTaskEntry to local store:', err.message);
  }

  const store = loadLocalStore();
  const storeKey = `${uid}_${taskId}`;
  if (!store.taskEntries[storeKey]) store.taskEntries[storeKey] = [];
  store.taskEntries[storeKey].push(entry);
  saveLocalStore(store);

  return entry;
}

export async function getTaskEntries(uid: string, taskId: string): Promise<TaskEntry[]> {
  const entries: TaskEntry[] = [];
  try {
    const snap = await adminDb
      .collection('users')
      .doc(uid)
      .collection('tasks')
      .doc(taskId)
      .collection('entries')
      .orderBy('createdAt', 'desc')
      .get();
    snap.forEach((doc) => {
      entries.push({ id: doc.id, ...(doc.data() as any) });
    });
    return entries;
  } catch (err: any) {
    console.warn('[DB] Fallback getTaskEntries:', err.message);
    const store = loadLocalStore();
    const storeKey = `${uid}_${taskId}`;
    return (store.taskEntries[storeKey] || []).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }
}

export async function updateTask(uid: string, taskId: string, updates: Partial<Task>): Promise<Task> {
  const finalUpdates: Partial<Task> = { ...updates };
  // If dueAt is being modified, reset nudge tracking so nudges can trigger under the new deadline
  if (finalUpdates.dueAt !== undefined) {
    if (finalUpdates.lastGuaranteedNudgeAt === undefined) {
      finalUpdates.lastGuaranteedNudgeAt = null;
    }
    if (finalUpdates.lastEscalationNudgeAt === undefined) {
      finalUpdates.lastEscalationNudgeAt = null;
    }
  }

  try {
    const taskRef = adminDb.collection('users').doc(uid).collection('tasks').doc(taskId);
    await taskRef.update(sanitizePayload(finalUpdates));
  } catch (err: any) {
    console.warn('[DB] Fallback updateTask:', err.message);
  }

  const store = loadLocalStore();
  const key = `${uid}_${taskId}`;
  if (store.tasks[key]) {
    store.tasks[key] = { ...store.tasks[key], ...finalUpdates };
    saveLocalStore(store);
    return store.tasks[key];
  }

  const fresh = (await getTasks(uid)).find((t) => t.id === taskId);
  if (!fresh) throw new Error(`Task ${taskId} not found`);
  return fresh;
}

/**
 * Log Entries Management
 */
export async function createLogEntry(
  uid: string,
  params: { text: string; matchedTaskId?: string | null }
): Promise<LogEntry> {
  const logEntryId = 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const nowIso = new Date().toISOString();

  const entry: LogEntry = {
    id: logEntryId,
    text: params.text.trim(),
    matchedTaskId: params.matchedTaskId || null,
    createdAt: nowIso,
  };

  try {
    await adminDb
      .collection('users')
      .doc(uid)
      .collection('logEntries')
      .doc(logEntryId)
      .set(sanitizePayload(entry));
  } catch (err: any) {
    console.warn('[DB] Fallback createLogEntry:', err.message);
  }

  const store = loadLocalStore();
  if (!store.logEntries[uid]) store.logEntries[uid] = [];
  store.logEntries[uid].push(entry);
  saveLocalStore(store);

  return entry;
}

export async function unlinkLogEntry(uid: string, logEntryId: string): Promise<void> {
  try {
    await adminDb
      .collection('users')
      .doc(uid)
      .collection('logEntries')
      .doc(logEntryId)
      .update({ matchedTaskId: null });
  } catch (err: any) {
    console.warn('[DB] Fallback unlinkLogEntry:', err.message);
  }

  const store = loadLocalStore();
  if (store.logEntries[uid]) {
    const item = store.logEntries[uid].find((l) => l.id === logEntryId);
    if (item) item.matchedTaskId = null;
    saveLocalStore(store);
  }
}

export async function getLogEntries(uid: string): Promise<LogEntry[]> {
  const entries: LogEntry[] = [];
  try {
    const snap = await adminDb
      .collection('users')
      .doc(uid)
      .collection('logEntries')
      .orderBy('createdAt', 'desc')
      .get();
    snap.forEach((doc) => {
      entries.push({ id: doc.id, ...(doc.data() as any) });
    });
    return entries;
  } catch (err: any) {
    console.warn('[DB] Fallback getLogEntries:', err.message);
    const store = loadLocalStore();
    return (store.logEntries[uid] || []).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }
}

/**
 * Daily Strip Management
 */
export async function getDailyStrips(uid: string): Promise<DailyStrip[]> {
  const strips: DailyStrip[] = [];
  try {
    const snap = await adminDb.collection('users').doc(uid).collection('dailyStrip').get();
    snap.forEach((doc) => {
      const data = doc.data() as any;
      strips.push({ date: doc.id, line: data.line || '', mood: data.mood || null });
    });
    return strips.sort((a, b) => b.date.localeCompare(a.date));
  } catch (err: any) {
    console.warn('[DB] Fallback getDailyStrips:', err.message);
    const store = loadLocalStore();
    const userStrips = (store.dailyStrip as any)?.[uid] || {};
    return Object.entries(userStrips)
      .map(([date, val]: [string, any]) => {
        if (typeof val === 'string') {
          return { date, line: val, mood: null };
        }
        return { date, line: val.line || '', mood: val.mood || null };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }
}

export async function saveDailyStrip(
  uid: string,
  date: string,
  line: string,
  mood?: string | null
): Promise<DailyStrip> {
  const item: DailyStrip = { date, line, mood: mood || null };
  try {
    const payload: any = { line };
    if (mood !== undefined) {
      payload.mood = mood;
    }
    await adminDb
      .collection('users')
      .doc(uid)
      .collection('dailyStrip')
      .doc(date)
      .set(sanitizePayload(payload), { merge: true });
  } catch (err: any) {
    console.warn('[DB] Fallback saveDailyStrip:', err.message);
  }

  const store = loadLocalStore() as any;
  if (!store.dailyStrip) store.dailyStrip = {};
  if (!store.dailyStrip[uid]) store.dailyStrip[uid] = {};
  const prev = store.dailyStrip[uid][date];
  const existingMood = typeof prev === 'object' ? prev?.mood : null;
  store.dailyStrip[uid][date] = {
    line,
    mood: mood !== undefined ? mood : existingMood,
  };
  saveLocalStore(store);

  return item;
}

export async function saveDailyStripMood(
  uid: string,
  date: string,
  mood: string | null
): Promise<{ date: string; mood: string | null }> {
  try {
    await adminDb
      .collection('users')
      .doc(uid)
      .collection('dailyStrip')
      .doc(date)
      .set(sanitizePayload({ mood }), { merge: true });
  } catch (err: any) {
    console.warn('[DB] Fallback saveDailyStripMood:', err.message);
  }

  const store = loadLocalStore() as any;
  if (!store.dailyStrip) store.dailyStrip = {};
  if (!store.dailyStrip[uid]) store.dailyStrip[uid] = {};
  const prev = store.dailyStrip[uid][date];
  const existingLine = typeof prev === 'string' ? prev : prev?.line || '';
  store.dailyStrip[uid][date] = {
    line: existingLine,
    mood,
  };
  saveLocalStore(store);

  return { date, mood };
}

/**
 * Thread Messages Management
 */
export async function getThreadMessages(uid: string): Promise<ThreadMessage[]> {
  const messages: ThreadMessage[] = [];
  try {
    const snapshot = await adminDb
      .collection('users')
      .doc(uid)
      .collection('threadMessages')
      .orderBy('createdAt', 'asc')
      .get();
    snapshot.forEach((doc) => {
      messages.push({ id: doc.id, ...(doc.data() as any) });
    });
    return messages;
  } catch (err: any) {
    console.warn('[DB] Fallback getThreadMessages:', err.message);
    const store = loadLocalStore();
    return store.threadMessages[uid] || [];
  }
}

export async function addThreadMessage(
  uid: string,
  params: {
    role: 'user' | 'system';
    text: string;
    relatedTaskId?: string | null;
    relatedLogEntryId?: string | null;
    messageType?: ThreadMessage['messageType'];
  }
): Promise<ThreadMessage> {
  const messageId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const nowIso = new Date().toISOString();

  const message: ThreadMessage = {
    id: messageId,
    role: params.role,
    text: params.text,
    relatedTaskId: params.relatedTaskId || null,
    relatedLogEntryId: params.relatedLogEntryId || null,
    messageType: params.messageType || 'normal',
    createdAt: nowIso,
  };

  try {
    await adminDb
      .collection('users')
      .doc(uid)
      .collection('threadMessages')
      .doc(messageId)
      .set(sanitizePayload(message));
  } catch (err: any) {
    console.warn('[DB] Fallback addThreadMessage to local store:', err.message);
  }

  const store = loadLocalStore();
  if (!store.threadMessages[uid]) store.threadMessages[uid] = [];
  store.threadMessages[uid].push(message);
  saveLocalStore(store);

  return message;
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
  }
  const store = loadLocalStore();
  return store.invites[uid] || null;
}

export async function createPartnerInvite(uid: string, email: string): Promise<PartnerInvite> {
  const invite: PartnerInvite = {
    email: email.trim().toLowerCase(),
    status: 'pending',
    partnerUid: null,
    createdAt: new Date().toISOString(),
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
  }

  const store = loadLocalStore();
  store.invites[uid] = invite;
  saveLocalStore(store);
  return invite;
}

export async function revokePartner(uid: string): Promise<{ success: boolean }> {
  try {
    await adminDb
      .collection('users')
      .doc(uid)
      .collection('partnerInvite')
      .doc('current')
      .update({ status: 'revoked', partnerUid: null });
  } catch (err: any) {
    console.warn('[DB] Fallback revokePartner:', err.message);
  }

  const store = loadLocalStore();
  if (store.invites[uid]) {
    store.invites[uid].status = 'revoked';
    store.invites[uid].partnerUid = null;
    saveLocalStore(store);
  }

  return { success: true };
}

/**
 * Journal Entries Management (users/{uid}/journalEntries/{entryId})
 */
export async function getJournalEntries(uid: string): Promise<JournalEntry[]> {
  const entries: JournalEntry[] = [];
  try {
    const snap = await adminDb
      .collection('users')
      .doc(uid)
      .collection('journalEntries')
      .orderBy('createdAt', 'desc')
      .get();
    snap.forEach((doc) => {
      entries.push({ id: doc.id, ...(doc.data() as any) });
    });
    return entries;
  } catch (err: any) {
    console.warn('[DB] Fallback getJournalEntries:', err.message);
    const store = loadLocalStore();
    return (store.journalEntries?.[uid] || []).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }
}

export async function createJournalEntry(
  uid: string,
  params: { text: string; title?: string | null; link?: string | null; tags?: string[] }
): Promise<JournalEntry> {
  const entryId = 'jnl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const nowIso = new Date().toISOString();

  const entry: JournalEntry = {
    id: entryId,
    text: params.text.trim(),
    title: params.title ? params.title.trim() : null,
    link: params.link ? params.link.trim() : null,
    tags: Array.isArray(params.tags) ? params.tags : [],
    createdAt: nowIso,
  };

  try {
    await adminDb
      .collection('users')
      .doc(uid)
      .collection('journalEntries')
      .doc(entryId)
      .set(sanitizePayload(entry));
  } catch (err: any) {
    console.warn('[DB] Fallback createJournalEntry:', err.message);
  }

  const store = loadLocalStore();
  if (!store.journalEntries) store.journalEntries = {};
  if (!store.journalEntries[uid]) store.journalEntries[uid] = [];
  store.journalEntries[uid].unshift(entry);
  saveLocalStore(store);

  return entry;
}

export async function deleteJournalEntry(uid: string, entryId: string): Promise<void> {
  try {
    await adminDb
      .collection('users')
      .doc(uid)
      .collection('journalEntries')
      .doc(entryId)
      .delete();
  } catch (err: any) {
    console.warn('[DB] Fallback deleteJournalEntry:', err.message);
  }

  const store = loadLocalStore();
  if (store.journalEntries?.[uid]) {
    store.journalEntries[uid] = store.journalEntries[uid].filter((e) => e.id !== entryId);
    saveLocalStore(store);
  }
}
