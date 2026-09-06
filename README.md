# Last Call — ADHD Deadline & Focus Journal

A user-authenticated deadline-and-focus journal engineered specifically for adults with ADHD, executive dysfunction, and time-blindness. Built with Google Gemini API, Firebase Authentication, Cloud Firestore, and Google Cloud Run.

---

## 1. System Architecture & Threat Model

### Agentic Threat Modeling Summary

| Zone | Threat | Severity | Countermeasure Implemented |
| :--- | :--- | :--- | :--- |
| **Input Surfaces** | Prompt injection / parameter tampering on check-ins, tasks, or corrections | High | Strict schema validation, string sanitization, and Gemini JSON schema-constrained generation with model fallback ladder. |
| **Planning & Reasoning** | Intent routing confusion, hallucinated coaching, or premature state collapse | Medium | Unified intent router (`task-creation`, `log-entry`, `check-in`, `correction`, `conversation`) decoupled from multi-turn initiation coaching; completion schema fires strictly at session end. |
| **Tool / Execution** | Direct client database tampering or unauthorized state transitions | Critical | Zero insecure defaults. `firestore.rules` enforces `allow write: if false` on all collections. All database writes execute exclusively via backend Firebase Admin SDK endpoints with authenticated JWT verification. |
| **Memory & State** | Cross-user data leakage, partner overexposure, or orphaned task records | Critical | Owner-bound path authorization (`request.auth.uid == userId`). Partners never receive Firestore security-rule grants; partner aggregate views are computed on-demand server-side without granting access to raw chat transcripts or tasks. |
| **Inter-System** | Token hijacking, VAPID key confusion, or hardcoded credentials | High | No hardcoded API keys. Server-side secrets managed via AI Studio / Secret Manager. Client VAPID key treated as public configuration. |

---

## 2. Environment & Prerequisites (Google Cloud Starter Tier)

> **Important Deployment Note**: This project is architected for the **Google Cloud Starter Tier**. It runs entirely within a single unified Cloud Run container without requiring Cloud Functions, Cloud Scheduler, or Pub/Sub. No instructions or dependencies for those services are needed or supported.

Ensure you have the Google Cloud SDK (`gcloud`) installed and authenticated:

```bash
# Authenticate with Google Cloud
gcloud auth login

# Set active project
gcloud config set project YOUR_PROJECT_ID

# Enable required Google Cloud APIs
gcloud services enable \
  run.googleapis.com \
  firestore.googleapis.com \
  identitytoolkit.googleapis.com \
  fcm.googleapis.com \
  secretmanager.googleapis.com
```

---

## 3. Secret Management Setup

### Runtime Secrets (Cloud Run)

- **AI Studio Build Mode**: The `GEMINI_API_KEY` is auto-provisioned as a server-side environment secret by the AI Studio environment. Never expose it to client-side code or prefix it with `VITE_`.
- **Standard Tier (Billing Enabled)**: If deploying outside AI Studio to a Standard Tier GCP project, store secrets in Secret Manager:

```bash
# 1. Create Gemini API Key secret
gcloud secrets create GEMINI_API_KEY --replication-policy="automatic"
echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=-

# 2. Grant Cloud Run compute service account access
PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format='value(projectNumber)')

gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

- **Starter Tier (Zero-Billing)**: Set `GEMINI_API_KEY` directly as an environment variable in Cloud Run container settings.

---

## 4. Web Push Notification Setup (Firebase Cloud Messaging)

Firebase Cloud Messaging (FCM) allows Last Call to send deadline and check-in nudges directly to the user's browser:

1. **Enable FCM API**:
   ```bash
   gcloud services enable fcm.googleapis.com
   ```
2. **Generate Web Push Key Pair (VAPID Key)**:
   - Navigate to the [Firebase Console](https://console.firebase.google.com/) → Select your Project.
   - Go to **Project Settings** (gear icon) → **Cloud Messaging** tab.
   - Under **Web configuration**, click **Generate key pair**.
   - Copy the generated Key pair.
3. **Configure the VAPID Key**:
   - The Web Push VAPID key is a **public-facing client configuration value**, NOT a server secret.
   - Provide it in client configuration or `.env` as `VITE_FIREBASE_VAPID_KEY`. Do not place it in Secret Manager.
   - Server-side FCM dispatch uses the existing Firebase Admin SDK default credentials without needing extra Secret Manager bindings.

---

## 5. Cloud Firestore Database & Security Rules

### Production Security Rules (`firestore.rules`)

The security architecture enforces complete client-write lockout. All writes happen via verified backend Admin SDK endpoints. Partners have zero direct access to Firestore documents.

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isOwner(uid) { return request.auth != null && request.auth.uid == uid; }

    match /users/{userId} {
      allow read: if isOwner(userId);
      allow write: if false;

      match /tasks/{taskId} {
        allow read: if isOwner(userId);
        allow write: if false;

        match /entries/{entryId} {
          allow read: if isOwner(userId);
          allow write: if false;
        }
      }

      match /logEntries/{logEntryId} {
        allow read: if isOwner(userId);
        allow write: if false;
      }

      match /dailyStrip/{dateId} {
        allow read: if isOwner(userId);
        allow write: if false;
      }

      match /threadMessages/{messageId} {
        allow read: if isOwner(userId);
        allow write: if false;
      }

      match /partnerInvite/current {
        allow read: if isOwner(userId);
        allow write: if false;
      }
    }
  }
}
```

### Key Security Design Guarantees:
1. **Admin SDK Write Boundary**: Clients can never write directly to `tasks`, `entries`, `logEntries`, `dailyStrip`, `threadMessages`, or `partnerInvite`. All mutations pass through verified server-side validation.
2. **Pinned Partner Document**: `partnerInvite` is pinned at the singleton ID `current`, preventing unbounded invite collection spam.
3. **Zero Partner Rule Grants**: Accountability partners are never granted direct Firestore reads. The partner view is synthesized on demand by `/api/partner/summary` using Admin SDK permissions, returning only aggregate metrics (streak, focus risk, next deadline) without exposing private transcripts.

### Deploying Security Rules:
```bash
firebase deploy --only firestore:rules
```

---

## 6. Cloud Run Deployment

Deploy the self-contained Express + Vite production bundle directly to Cloud Run:

```bash
gcloud run deploy last-call \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars="NODE_ENV=production"
```

### Required Challenge Verification Campaign Labeling

To register the application for automated challenge and hackathon verification, apply the mandatory campaign resource label:

```bash
gcloud run services update last-call \
  --update-labels=dev-tutorial=cloud-run-ai-challenge \
  --region=us-central1
```

---

## 7. Out-of-Band Partner RBAC Scripts

Accountability partner custom claims are provisioned strictly out-of-band by administrators to ensure zero client privilege escalation:

### 1. Assigning an Accountability Partner
```bash
node scripts/assign-partner.js --email partner@example.com --ownerUid <OWNER_UID> [--confirm-overwrite]
```
- Looks up the registered Firebase user by email.
- Sets verified custom claims `{ role: 'partner', ownerUid: '<OWNER_UID>' }`.
- Updates `users/{ownerUid}/partnerInvite/current` to `status: 'active'`.

### 2. Revoking an Accountability Partner
```bash
node scripts/revoke-partner.js --ownerUid <OWNER_UID>
```
- Revokes custom claims from the active partner account.
- Sets `users/{ownerUid}/partnerInvite/current` to `status: 'revoked'`.

---

## 8. Comprehensive Interactive Walkthrough & Test Cases

Every user interaction has a corresponding end-to-end test verification procedure:

### Test Case 1: Passwordless Google Authentication & User Profile
1. **Action**: Click "Sign in with Google" on the login screen.
2. **Expected Outcome**: Firebase Authentication authenticates the user without custom password handling. Backend provisions the user record with default anchor times (Wake 08:00, Work 09:00, EOD 17:00, Bed 23:00) and displays the main board.

### Test Case 2: Natural Language Task Creation & Anchor Mapping
1. **Action**: In the terminal prompt, type: `"Call mom before work tomorrow morning"` or `"File taxes hard deadline by end of day"`.
2. **Expected Outcome**:
   - Router classifies message as `task-creation`.
   - Extracts deadline mapped to user's anchor times (e.g. Work: 09:00, EOD: 17:00).
   - Task card appears in the Board with consequence badge (`hard` / `soft`).

### Test Case 3: Activity Logging & High-Confidence Auto-Close
1. **Action**: With a pending task `"Submit payroll"`, type: `"Just finished submitting payroll"`.
2. **Expected Outcome**:
   - Router classifies message as `log-entry`.
   - Matches `"Submit payroll"` with high confidence.
   - Task status transitions to `met`.
   - An inline auto-close card appears in the thread with an `[Undo]` button and confirmation message.

### Test Case 4: Disambiguated Undo / Reversal with Intervening Logs
1. **Action**: Auto-close Task A (`"Call vet"`). Next, send an unrelated message `"Drank a glass of water"`. Then type `"wrong one"`.
2. **Expected Outcome**:
   - Router classifies message as `correction`.
   - System bypasses the normal water log entry and identifies the most recent `auto-close` message.
   - Reopens Task A to `pending`, unlinks the vet log entry, and confirms reversal without affecting other tasks.
   - Alternatively, typing `"wrong one on vet"` specifically targets the vet task regardless of order.

### Test Case 5: Multi-Turn Task Initiation Check-In Coaching
1. **Action**: Type `"stuck on my report, feeling frozen"` or click the **Check in / Break paralysis** button on a task card.
2. **Expected Outcome**:
   - Direct button initiation bypasses the classifier schema.
   - Gemini initiation coach provides blunt, anti-avoidance coaching (1-2 sentences) and identifies the paralysis barrier.
   - Conversation supports multi-turn dialogue to talk through the obstacle.

### Test Case 6: Check-In Completion Schema & Subcollection Persistence
1. **Action**: Click **Done micro-step** or send completion prompt.
2. **Expected Outcome**:
   - Router / endpoint fires `extractCheckInCompletion` strictly once at the end of the session.
   - Saves structured summary and `nextPhysicalAction` into `users/{userId}/tasks/{taskId}/entries/{entryId}`.
   - Acknowledges locked micro-action in the chat thread.

### Test Case 7: Shame-Free Task Amnesty (Release)
1. **Action**: On an overdue or overwhelming task, click the **Release task (Amnesty)** button (feather icon).
2. **Expected Outcome**:
   - Backend marks task status as `released`.
   - Task moves off the active radar without negative streak penalties or failure badges.
   - Amnesty record is added to the chat thread.

### Test Case 8: Accountability Partner Modal Dismissibility
1. **Action**: Open Partner Modal via header or side panel. Send an invite email. With invite pending, click the **X** button, the **Close** button, or press `Escape`.
2. **Expected Outcome**:
   - Modal dismisses cleanly and does not reopen on re-render.
   - Invite remains safely in `pending` status on the server.

### Test Case 9: Accountability Partner Read-Only Aggregate Isolation
1. **Action**: Authenticate with partner custom claims `{ role: 'partner', ownerUid: '<OWNER_UID>' }`.
2. **Expected Outcome**:
   - Partner view displays solely the partner summary (streak count, active focus risk, upcoming deadline title).
   - Chat threads, log entries, and check-in subcollections are completely hidden and inaccessible.
