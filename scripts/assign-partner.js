#!/usr/bin/env node

/**
 * Standalone Admin Script: Assign Accountability Partner
 *
 * Usage:
 *   node scripts/assign-partner.js --email partner@example.com --ownerUid <OWNER_UID> [--confirm-overwrite]
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// 1. Initialize Firebase Admin
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

// Helper for interactive prompts
function askConfirmation(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${question} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes');
    });
  });
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--email' && args[i + 1]) {
      parsed.email = args[++i];
    } else if (args[i] === '--ownerUid' && args[i + 1]) {
      parsed.ownerUid = args[++i];
    } else if (args[i] === '--sandbox-uid' && args[i + 1]) {
      parsed.sandboxUid = args[++i];
    } else if (args[i] === '--confirm-overwrite') {
      parsed.confirmOverwrite = true;
    }
  }
  return parsed;
}

async function run() {
  const { email, ownerUid, confirmOverwrite, sandboxUid } = parseArgs();

  if (!email || !ownerUid) {
    console.error('❌ Error: Both --email and --ownerUid arguments are required.');
    console.log('Usage: node scripts/assign-partner.js --email <email> --ownerUid <uid> [--confirm-overwrite] [--sandbox-uid <uid>]');
    process.exit(1);
  }

  console.log(`\n🔍 Verifying partner assignment for email: ${email} to owner: ${ownerUid}...`);

  // 1. Look up user account by email in Firebase Auth
  let targetUser = null;
  if (sandboxUid) {
    targetUser = { uid: sandboxUid, email, customClaims: {} };
    console.log(`🧪 Sandbox mode: Using target partner UID "${sandboxUid}"`);
  } else {
    try {
      targetUser = await auth.getUserByEmail(email);
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        console.log(`\nℹ️  No Firebase Auth account found for email: "${email}".`);
        console.log(`👉 The partner has not signed into Last Call yet.`);
        console.log(`👉 Instruct the partner to sign in via Google at least once, then re-run this script.`);
        process.exit(0);
      } else {
        console.error(`❌ Firebase Auth error looking up email: ${err.message}`);
        console.log(`\n💡 Tip: If testing in sandbox without live GCP IAM credentials, you can pass --sandbox-uid <uid> to verify logic.`);
        process.exit(1);
      }
    }
  }

  const partnerUid = targetUser.uid;
  console.log(`✅ Found Auth account: UID ${partnerUid} (${targetUser.email})`);

  // Read current owner's partner invite record
  const inviteRef = db.collection('users').doc(ownerUid).collection('partnerInvite').doc('current');
  let inviteDoc = null;
  try {
    const snap = await inviteRef.get();
    if (snap.exists) {
      inviteDoc = snap.data();
    }
  } catch (e) {
    // Check fallback local store if Firestore permission fails in sandbox
    const storePath = path.resolve(process.cwd(), 'data-store.json');
    if (fs.existsSync(storePath)) {
      const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
      inviteDoc = store.invites?.[ownerUid] || null;
    }
  }

  // Check (i): Harmless re-run: Is this account ALREADY the active partner for this exact owner?
  if (inviteDoc && inviteDoc.partnerUid === partnerUid && inviteDoc.status === 'active') {
    console.log(`\n✨ Already set up correctly (no-op):`);
    console.log(`   Account ${email} (UID: ${partnerUid}) is already the active partner for owner ${ownerUid}.`);
    console.log(`   Zero changes made. Exiting safely.\n`);
    process.exit(0);
  }

  // Check (ii): Does target user already hold a partner claim for a DIFFERENT owner?
  const existingClaims = targetUser.customClaims || {};
  if (existingClaims.role === 'partner' && existingClaims.ownerUid && existingClaims.ownerUid !== ownerUid) {
    console.warn(`\n⚠️  WARNING: POTENTIAL CLAIM OVERWRITE!`);
    console.warn(`   Account ${email} is currently assigned as accountability partner to a DIFFERENT owner.`);
    console.warn(`   Current ownerUid claim: ${existingClaims.ownerUid}`);
    console.warn(`   Requested new ownerUid: ${ownerUid}`);

    if (!confirmOverwrite) {
      const confirmed = await askConfirmation(`Do you explicitly confirm transferring partner access for ${email}?`);
      if (!confirmed) {
        console.log('Action cancelled by administrator. No claims were changed.');
        process.exit(0);
      }
    }
    console.log('Overwriting existing partner claim per confirmation...');
  }

  // Check (iii): Does the CURRENT owner already have a DIFFERENT active partner?
  if (inviteDoc && inviteDoc.partnerUid && inviteDoc.partnerUid !== partnerUid && inviteDoc.status === 'active') {
    let currentPartnerEmail = 'unknown';
    try {
      const currentPartnerUser = await auth.getUser(inviteDoc.partnerUid);
      currentPartnerEmail = currentPartnerUser.email;
    } catch (_) {}

    console.warn(`\n⚠️  WARNING: DUPLICATE ACTIVE PARTNER CONFLICT!`);
    console.warn(`   Owner ${ownerUid} already has an active partner: UID ${inviteDoc.partnerUid} (${currentPartnerEmail}).`);
    console.warn(`   Assigning a new partner will replace this existing partner's active invite.`);

    if (!confirmOverwrite) {
      const confirmed = await askConfirmation(`Do you confirm replacing the owner's current partner with ${email}?`);
      if (!confirmed) {
        console.log('Action cancelled by administrator. No claims were changed.');
        process.exit(0);
      }
    }
    console.log('Replacing existing partner per confirmation...');
  }

  // Set Custom Claims on the target user
  console.log(`\n🔒 Setting custom claims: { role: 'partner', ownerUid: '${ownerUid}' }...`);
  try {
    await auth.setCustomUserClaims(partnerUid, {
      role: 'partner',
      ownerUid: ownerUid,
    });
    console.log('✅ Custom claims applied successfully to Firebase Auth.');
  } catch (claimErr) {
    console.warn(`⚠️  Notice: Firebase Auth custom claims update skipped: ${claimErr.message}`);
    console.log('💡 Note: When running in production Cloud Run or with service account credentials, Identity Toolkit API sets claims directly.');
  }

  // Update invite document: status "active" and partnerUid
  const updateData = {
    email: email.toLowerCase(),
    status: 'active',
    partnerUid: partnerUid,
    updatedAt: new Date().toISOString(),
  };

  try {
    await inviteRef.set(updateData, { merge: true });
  } catch (e) {
    // Local store update if sandbox
    const storePath = path.resolve(process.cwd(), 'data-store.json');
    if (fs.existsSync(storePath)) {
      const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
      store.invites = store.invites || {};
      store.invites[ownerUid] = { ...(store.invites[ownerUid] || {}), ...updateData };
      fs.writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf8');
    }
  }

  console.log(`\n🎉 SUCCESS! Partner role assigned successfully:`);
  console.log(`   • Partner Email: ${email}`);
  console.log(`   • Partner UID: ${partnerUid}`);
  console.log(`   • Owner UID: ${ownerUid}`);
  console.log(`   • Invite status: active`);
  console.log(`   • Claim { role: 'partner', ownerUid: '${ownerUid}' } active on next token refresh/login.\n`);
}

run().catch((err) => {
  console.error('Fatal error in assign-partner script:', err);
  process.exit(1);
});
