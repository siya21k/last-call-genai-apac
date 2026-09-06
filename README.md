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

## 7. Partner RBAC & Backend Workflow

Accountability partner access follows a zero-trust, consent-driven workflow without requiring manual CLI scripts for standard user actions:

### In-App Backend Endpoints (Authenticated & Role-Gated)

1. **Owner Approves/Sends Partner Request**: `POST /api/partner/invite/approve`
   - **Security Boundary**: Requires verified JWT authentication. The caller's `uid` must match `ownerUid` on the `users/{ownerUid}/partnerInvite/current` record.
   - **Validation & State Engine**:
     - Verifies whether the target email is registered in Firebase Authentication (`EMAIL_NOT_REGISTERED` response if not yet registered).
     - Checks if the partner is already active (`ALREADY_SETUP` response).
     - Checks if the email is already assigned to a different owner (`DIFFERENT_OWNER_CONFLICT` requires explicit UI confirmation).
     - Checks if the owner already has an active partner (`REPLACE_ACTIVE_PARTNER` requires explicit UI confirmation).
     - Upon confirmation, writes `{ email, status: 'pending', partnerUid: null, approvedAt }` to `users/{ownerUid}/partnerInvite/current`.

2. **Invited User Receives and Accepts/Declines Request**:
   - `GET /api/partner/incoming-invite`: Queries if the authenticated caller has any pending partner invites matching their email or UID.
   - `POST /api/partner/invite/accept`: The invited partner explicitly consents. Verifies caller identity, applies custom claims `{ role: 'partner', ownerUid }` via Firebase Admin SDK, and updates invite status to `'active'`.
   - `POST /api/partner/invite/decline`: Allows the invited user to decline the invite, clearing or archiving the record.

3. **Revocation**: `POST /api/partner/revoke`
   - Can be called by either the **owner** (to remove their current partner) or the **partner** (to disconnect themselves).
   - Automatically revokes custom claims on the partner account and updates the invite status to `'revoked'`.

### Developer Out-of-Band Admin Scripts (Optional / Emergency Use)

For administrative emergencies, command-line scripts remain available:
```bash
# Emergency manual assignment (optional fallback)
node scripts/assign-partner.js --email partner@example.com --ownerUid <OWNER_UID> [--confirm-overwrite]

# Emergency manual revocation (optional fallback)
node scripts/revoke-partner.js --ownerUid <OWNER_UID>
```

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

### Test Case 8: Accountability Partner Modal Dismissibility & Keyboard Accessibility
1. **Action**: Open Partner Modal via header or side panel. Send an invite email. With invite pending, click the **X** button, the **Close** button, or press `Escape`.
2. **Expected Outcome**:
   - Modal dismisses cleanly and does not reopen on re-render.
   - Invite remains safely in `pending` status on the server.

### Test Case 9: Partner Invite Conflict & Structured Error Handling
1. **Action**: In the Partner Modal, enter an email that has not yet signed in, or an email already partnered to another owner. Click "Add Partner".
2. **Expected Outcome**:
   - If email is unregistered: A structured banner explains that the user needs to sign in with Google once so their account exists.
   - If email is partnered to another owner: A confirmation box prompts `"This email is already a partner for a different owner — confirm to reassign?"`.
   - Clicking `"Confirm & Reassign"` proceeds with the reassignment safely via `confirmOverwrite: true`.

### Test Case 10: Two-Sided Explicit Partner Consent (Accept / Decline)
1. **Action**: Owner sends/approves an invite to `partner@example.com`. The partner logs in with Google.
2. **Expected Outcome**:
   - An in-app banner appears: `"<Owner> wants to share their daily focus status with you — accept?"`
   - If partner clicks **Decline**: Invite is dismissed without granting claims.
   - If partner clicks **Accept**: `POST /api/partner/invite/accept` assigns custom claims `{ role: 'partner', ownerUid }`, refreshes token, and switches partner to Partner Focus Monitor.

### Test Case 11: Accountability Partner Read-Only Aggregate Isolation & Self-Revoke
1. **Action**: Authenticate as partner. View the Partner Focus Monitor. Click **"Disconnect as Partner"**.
2. **Expected Outcome**:
   - Partner view displays solely aggregate daily strip line and hard-consequence escalation alert. All raw tasks, check-in chats, and journal entries are strictly blocked.
   - Clicking "Disconnect as Partner" calls `POST /api/partner/revoke`, clears claims, and returns user to standard mode.

### Test Case 12: Journal Semantic Retrieval, Embedding Fallback & Supportive Reflection
1. **Action**: Switch to the **Reflect** tab in the side panel. Submit a journal entry (e.g. `"Feeling stuck on administrative paperwork again this week"`).
2. **Expected Outcome**:
   - **Embedding Model Ladder**: The backend computes embeddings using `gemini-embedding-2-preview`, falling back to `gemini-embedding-001` (the deprecated and shut-down `text-embedding-004` is completely excluded).
   - **Trustworthy Fallback Guarantee**: If all real embedding models are unreachable, semantic retrieval is **skipped entirely** rather than generating fabricated hash-based matches. The model generates a supportive reflection based strictly on the current entry alone.
   - **Isolated Retrieval**: If past entries exist with real embeddings, cosine similarity searches only the current user's past entries (`users/{userId}/journalEntries`) — zero cross-user data leakage.
   - **Human-in-the-Loop Partner Outreach**: If a persistent multi-day heavy pattern is observed, Gemini optionally suggests a short drafted note to the partner. The note is never sent automatically; the user must explicitly review and send it.
   - **Crisis Safety Net**: If crisis or self-harm language is detected, the static, unalterable emergency resource block is returned immediately; all AI reflection and partner outreach suggestions are strictly suppressed.

### Test Case 13: Check-in Tone Safety Directive, Validation Pass & Fallback (Section 20)
1. **Action**: Start a check-in on a task (either from the buddy list "Check In" button or by typing `"stuck on studying"` in the main thread). Express panic or fear (e.g. `"I feel like I'm going to fail tomorrow"`).
2. **Expected Outcome**:
   - **Distinction Between Fear & Avoidance**: The response does not issue an ultimatum or push past the fear. It briefly validates the anxiety first, then redirects directly to a 2-minute physical start (e.g. `"Failing tomorrow doesn't erase what you can read tonight. What's the actual first page you'd open right now?"`).
   - **Absolute Ban on Quit-Framing**: The system never presents giving up, quitting, or closing tabs as an option (e.g. "Either revise or close the tab" is strictly forbidden and rejected).
   - **Validation Pass**: Every generated coaching turn is inspected by a structured validator. If any ultimatum, quit-framing, or personal critique is detected, the turn is flagged and regenerated once with explicit corrective directives.
   - **Guaranteed Safe Fallback**: If two generation attempts fail tone validation, the engine automatically falls back to an immutable, safe generic supportive line (`"You don't have to tackle the whole thing at once. What is the single smallest physical micro-action you can take for '<task>' right now?"`)—never permitting an unvalidated response to reach the user.

