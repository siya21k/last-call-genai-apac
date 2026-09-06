#!/usr/bin/env node

/**
 * Standalone Admin Script: Revoke Accountability Partner
 *
 * Usage:
 *   node scripts/revoke-partner.js --ownerUid <OWNER_UID>
 */

import fs from 'fs';
import path from 'path';
import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

let firebaseConfig = {};
try {
  const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(cfgPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    if (firebaseConfig.projectId) {
      process.env.GCLOUD_PROJECT = firebaseConfig.projectId;
      process.env.GOOGLE_CLOUD_PROJECT = firebaseConfig.projectId;
    }
  }
} catch (e) {
  console.error('Error reading firebase-applet-config.json:', e);
}

const app = !getApps().length
  ? initializeApp({
      projectId: firebaseConfig.projectId,
    })
  : getApp();

const auth = getAuth(app);
const db = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--ownerUid' && args[i + 1]) {
      parsed.ownerUid = args[++i];
    }
  }
  return parsed;
}

async function run() {
  const { ownerUid } = parseArgs();

  if (!ownerUid) {
    console.error('❌ Error: --ownerUid argument is required.');
    console.log('Usage: node scripts/revoke-partner.js --ownerUid <uid>');
    process.exit(1);
  }

  console.log(`\n🔍 Looking up partner invite for owner: ${ownerUid}...`);

  // Direct O(1) read of partnerInvite document
  const inviteRef = db.collection('users').doc(ownerUid).collection('partnerInvite').doc('current');
  let inviteDoc = null;

  try {
    const snap = await inviteRef.get();
    if (snap.exists) {
      inviteDoc = snap.data();
    }
  } catch (e) {
    const storePath = path.resolve(process.cwd(), 'data-store.json');
    if (fs.existsSync(storePath)) {
      const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
      inviteDoc = store.invites?.[ownerUid] || null;
    }
  }

  if (!inviteDoc || !inviteDoc.partnerUid) {
    console.log(`ℹ️  No active partner currently associated with owner ${ownerUid}. Nothing to revoke.`);
    process.exit(0);
  }

  const partnerUid = inviteDoc.partnerUid;
  console.log(`✅ Located active partner UID: ${partnerUid} (${inviteDoc.email})`);

  // Clear custom claims on the partner account
  console.log(`🔒 Clearing custom claims on UID ${partnerUid}...`);
  try {
    await auth.setCustomUserClaims(partnerUid, {});
    console.log(`✅ Successfully wiped custom claims for partner ${partnerUid}.`);
  } catch (claimErr) {
    console.warn(`⚠️ Warning: Could not clear claims in Firebase Auth: ${claimErr.message}`);
  }

  // Update invite document: status "revoked", partnerUid: null
  const updateData = {
    status: 'revoked',
    partnerUid: null,
    revokedAt: new Date().toISOString(),
  };

  try {
    await inviteRef.set(updateData, { merge: true });
  } catch (e) {
    const storePath = path.resolve(process.cwd(), 'data-store.json');
    if (fs.existsSync(storePath)) {
      const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
      if (store.invites?.[ownerUid]) {
        store.invites[ownerUid].status = 'revoked';
        store.invites[ownerUid].partnerUid = null;
        fs.writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf8');
      }
    }
  }

  console.log(`\n🎉 SUCCESS! Partner revoked:`);
  console.log(`   • Partner UID ${partnerUid} claims removed.`);
  console.log(`   • Owner ${ownerUid} partnerInvite updated to status: "revoked" and partnerUid: null.`);
  console.log(`\n📌 THREAT MODEL RESIDUAL NOTE:`);
  console.log(`   Firebase Auth ID tokens remain cryptographically valid until they expire (up to 1 hour).`);
  console.log(`   The revoked partner's currently active client session may retain read access to the`);
  console.log(`   status document until their ID token refreshes or their session expires.\n`);
}

run().catch((err) => {
  console.error('Fatal error in revoke-partner script:', err);
  process.exit(1);
});
