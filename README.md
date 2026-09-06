# Last Call — ADHD Deadline & Focus Journal

A user-authenticated deadline-and-focus journal built for people with ADHD and time-blindness. Built with Google Gemini API, Firebase Authentication, Cloud Firestore, and Google Cloud Run.

---

## 1. System Architecture & Threat Model

### Threat Summary Table

| Zone | Threat | Severity | Countermeasure Implemented |
| :--- | :--- | :--- | :--- |
| **Input Surfaces** | Prompt injection / parameter tampering on check-in and deadlines | High | Schema validation, length caps, and schema-constrained Gemini JSON mode. |
| **Planning & Reasoning** | Hallucinated guidance or off-topic conversational drift | Medium | System instructions narrowly bound to task-initiation micro-actions and environmental context. |
| **Tool / Execution** | Unauthorized Firestore writes bypassing business logic | Critical | Firestore Security Rules deny all client writes to deadlines, entries, and status (`allow write: if false`). Writes occur exclusively via Admin SDK on verified backend endpoints. |
| **Memory & State** | Cross-user data leakage or privilege escalation | Critical | ABAC/RBAC enforced in `firestore.rules` using custom claims (`role`, `ownerUid`). Partner role is strictly scoped to `users/{uid}/status` with read-only access. |
| **Inter-System** | Webhook credential exposure or notification spoofing | High | Webhook URLs loaded server-side only via environment variables / Secret Manager; alerts are triggered server-side with sanitized, size-capped payloads. |

---

## 2. Prerequisites & Google Cloud Setup

Ensure you have the Google Cloud SDK (`gcloud`) installed and authenticated:

```bash
# Log in with your Google account
gcloud auth login

# Set active project
gcloud config set project YOUR_PROJECT_ID

# Enable required Google Cloud APIs
gcloud services enable \
  run.googleapis.com \
  secretmanager.googleapis.com \
  firestore.googleapis.com \
  identitytoolkit.googleapis.com
```

---

## 3. Secret Management Setup

### Runtime Secrets in Google Cloud Run

For deployments on Cloud Run, store sensitive credentials in Google Cloud Secret Manager:

```bash
# 1. Create and populate Gemini API Key secret
gcloud secrets create GEMINI_API_KEY --replication-policy="automatic"
echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=-

# 2. (Optional) Create Slack Webhook URL secret for critical initiation alerts
gcloud secrets create SLACK_WEBHOOK_URL --replication-policy="automatic"
echo -n "https://hooks.slack.com/services/..." | gcloud secrets versions add SLACK_WEBHOOK_URL --data-file=-

# 3. Grant default Cloud Run compute service account access
PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format='value(projectNumber)')

gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding SLACK_WEBHOOK_URL \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

> **Note for AI Studio Build Mode:** The `GEMINI_API_KEY` is already auto-provisioned as a server-side environment secret by AI Studio. Additional secrets like `SLACK_WEBHOOK_URL` can be entered via AI Studio's **Settings → Secrets** panel.

---

## 4. Firestore Database & Security Rules

1. Provision Cloud Firestore in Native Mode:
```bash
gcloud firestore databases create --location=nam5
```

2. Deploy the security rules defined in `firestore.rules`:
```bash
firebase deploy --only firestore:rules
```

### Exact Firestore Rules Summary
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isOwner(uid) {
      return request.auth != null && request.auth.uid == uid;
    }
    function isPartnerOf(uid) {
      return request.auth != null &&
        request.auth.token.role == 'partner' &&
        request.auth.token.ownerUid == uid;
    }

    match /users/{uid}/status/{document} {
      allow read: if isOwner(uid) || isPartnerOf(uid);
      allow write: if false; // Admin SDK only
    }

    match /users/{uid}/deadlines/{deadlineId} {
      allow read: if isOwner(uid);
      allow write: if false; // Admin SDK only
    }

    match /users/{uid}/entries/{entryId} {
      allow read: if isOwner(uid);
      allow write: if false; // Admin SDK only
    }

    match /users/{uid}/partnerInvite/{document} {
      allow read: if isOwner(uid);
      allow write: if false; // Admin SDK only
    }
  }
}
```

---

## 5. Cloud Run Deployment

Deploy the container to Cloud Run using `gcloud run deploy`:

```bash
gcloud run deploy last-call \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest,SLACK_WEBHOOK_URL=SLACK_WEBHOOK_URL:latest"
```

### Required Campaign Verification Binding

Apply the mandatory challenge label to register the service for automated verification:

```bash
gcloud run services update last-call \
  --update-labels=dev-tutorial=cloud-run-ai-challenge \
  --region=us-central1
```

---

## 6. Role-Based Access Control (RBAC) Admin Workflow

To protect user confidentiality, custom claims can only be provisioned server-side by an administrator out-of-band:

### Step 1: Owner sends invite in the application
1. The owner opens **Partner** in the app header and enters the partner's email address.
2. The server creates `users/{ownerUid}/partnerInvite/current` with status `pending`.

### Step 2: Administrator activates the partner role
The administrator runs the CLI script in Cloud Shell or a secure terminal session:

```bash
node scripts/assign-partner.js --email partner@example.com --ownerUid <OWNER_UID>
```

- Verifies that the partner has a registered Firebase account.
- Sets custom claims `{ role: 'partner', ownerUid: '<OWNER_UID>' }`.
- Atomically updates the invite document to status `active`.
- Prevents accidental overwrites of existing active partners unless `--confirm-overwrite` is passed.

### Step 3: Revoking a partner
The owner or administrator can revoke access at any time:

```bash
node scripts/revoke-partner.js --ownerUid <OWNER_UID>
```
This clears custom claims on the partner account and marks the invite as `revoked`.

---

## 7. Functional Stability & Walkthrough Test Cases

Every user interaction has been implemented and tested:

### Test Case 1: Google Sign-In & Instant Preview Mode
1. **Action**: Click "Sign In with Google" on landing screen (or click "Test as Owner" in iframe preview).
2. **Expected Outcome**: App authenticates without asking for passwords, loads user profile, and initializes dashboard.

### Test Case 2: Adding a Deadline
1. **Action**: Click "Add Deadline", enter name "Complete client proposal", select time horizon (e.g. "In 2 Hours"), and submit.
2. **Expected Outcome**: Backend endpoint validates input, persists deadline via Admin SDK, triggers status recomputation, and returns updated list and next deadline summary.

### Test Case 3: Task Initiation Check-In with Gemini
1. **Action**: Click "Check In" on an active deadline. Select location tag (e.g., "In Bed" or "Office"). Type: "I am frozen scrolling because the outline feels too big."
2. **Expected Outcome**: Last Call responds with blunt, non-shaming initiation coaching ("Pick one sentence. Set a 2-minute timer.").

### Test Case 4: Structured Extraction & Micro-Actions
1. **Action**: Click "Finish Check-In & Save".
2. **Expected Outcome**: Gemini structured extraction returns category, risk level, summary, and interactive checkboxes for immediate micro-actions. Deadline's `latestRiskLevel` is updated. If risk is critical and Slack webhook is configured, an alert is transmitted.

### Test Case 5: Post-Mortem Check-In on Missed Deadlines
1. **Action**: Start check-in on a deadline whose target time has passed.
2. **Expected Outcome**: Session explicitly accommodates post-mortems with non-judgmental root cause exploration rather than failing or disabling check-in.

### Test Case 6: Marking Tasks Done (Including Late Finishes)
1. **Action**: Click "Done" (or "Mark Done Late") on any pending or missed task.
2. **Expected Outcome**: Status updates to `met`, streak increments, and next upcoming deadline is recalibrated.

### Test Case 7: Accountability Partner Read-Only Isolation
1. **Action**: Log in with custom claims `{ role: 'partner', ownerUid: '<OWNER_UID>' }`.
2. **Expected Outcome**: Partner view displays exclusively aggregate status (streak, risk level, next deadline). Private entries and conversation transcripts are hidden and blocked at the security rule level.
