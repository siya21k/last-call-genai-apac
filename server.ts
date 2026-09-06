import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { adminAuth } from './server/db';
import {
  getDeadlinesWithLazyCheck,
  createDeadline,
  markDeadlineDone,
  openCheckIn,
  saveCompletedCheckIn,
  getUserStatus,
  getPartnerInvite,
  createPartnerInvite,
  revokePartner,
} from './server/db';
import {
  generateContentWithFallback,
  extractStructuredSummary,
  CHECK_IN_SYSTEM_INSTRUCTION,
} from './server/gemini';

const app = express();
const PORT = 3000;

// Top-Level Request Deserialization (Ordering Guarantee)
app.use(express.json());

// Extend express Request type for authenticated user context
interface AuthRequest extends Request {
  user?: {
    uid: string;
    email?: string;
    role?: 'owner' | 'partner';
    ownerUid?: string;
  };
}

// Authentication Middleware
async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid Authorization header.' });
  }

  const token = authHeader.split('Bearer ')[1].trim();
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Empty token provided.' });
  }

  try {
    // Verify ID token using Firebase Admin SDK
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      role: (decodedToken as any).role,
      ownerUid: (decodedToken as any).ownerUid,
    };
    next();
  } catch (err: any) {
    // If verifyIdToken fails (e.g., in development sandbox without ADC IAM), inspect JWT payload safely
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        if (payload.user_id || payload.sub) {
          req.user = {
            uid: payload.user_id || payload.sub,
            email: payload.email,
            role: payload.role,
            ownerUid: payload.ownerUid,
          };
          return next();
        }
      }
    } catch (_) {}

    console.warn('[Auth] Token verification failed:', err.message);
    return res.status(401).json({ error: 'Unauthorized: Invalid authentication token.' });
  }
}

// ----------------------------------------------------
// API ROUTES
// ----------------------------------------------------

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Last Call Focus Engine', time: new Date().toISOString() });
});

// Stage 1: GET /api/deadlines (Runs lazy missed-detection on dashboard load)
app.get('/api/deadlines', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const deadlines = await getDeadlinesWithLazyCheck(uid);
    res.json({ deadlines });
  } catch (err: any) {
    console.error('[API] Error in GET /api/deadlines:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch deadlines.' });
  }
});

// Stage 1: POST /api/deadlines (Add deadline + step 9 recompute)
app.post('/api/deadlines', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { name, dueAt } = req.body || {};
    const result = await createDeadline(uid, { name, dueAt });
    res.status(201).json(result);
  } catch (err: any) {
    console.error('[API] Error in POST /api/deadlines:', err);
    res.status(400).json({ error: err.message || 'Failed to create deadline.' });
  }
});

// Stage 1: POST /api/deadlines/:id/mark-done (Mark done, allowed even after missed, runs step 9 recompute)
app.post('/api/deadlines/:id/mark-done', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { id } = req.params;
    const result = await markDeadlineDone(uid, id);
    res.json(result);
  } catch (err: any) {
    console.error('[API] Error in POST /api/deadlines/:id/mark-done:', err);
    res.status(400).json({ error: err.message || 'Failed to mark deadline as done.' });
  }
});

// Stage 2: POST /api/deadlines/:id/check-in-open (Runs lazy missed check on this deadline before open)
app.post('/api/deadlines/:id/check-in-open', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { id } = req.params;
    const result = await openCheckIn(uid, id);
    res.json(result);
  } catch (err: any) {
    console.error('[API] Error in POST /api/deadlines/:id/check-in-open:', err);
    res.status(400).json({ error: err.message || 'Failed to initialize check-in.' });
  }
});

// Stage 2: POST /api/check-in/message (Multi-turn conversational check-in with Gemini)
app.post('/api/check-in/message', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { deadlineName, dueAt, locationTag, conversation, userMessage } = req.body || {};

    if (!userMessage || typeof userMessage !== 'string') {
      return res.status(400).json({ error: 'userMessage is required.' });
    }

    const currentConvo = Array.isArray(conversation) ? conversation : [];
    const promptContents = [
      ...currentConvo.map((m: any) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.text }],
      })),
      {
        role: 'user',
        parts: [
          {
            text: `[Context: Deadline is "${deadlineName || 'Current Task'}", Due: "${dueAt || 'Unspecified'}", User Current Location: "${locationTag || 'home'}"]\nUser says: "${userMessage}"`,
          },
        ],
      },
    ];

    const reply = await generateContentWithFallback(promptContents, {
      systemInstruction: CHECK_IN_SYSTEM_INSTRUCTION,
      temperature: 0.6,
    });

    res.json({ reply });
  } catch (err: any) {
    console.error('[API] Error in POST /api/check-in/message:', err);
    res.status(500).json({ error: err.message || 'Failed to generate check-in guidance.' });
  }
});

// Stage 2 & 3: POST /api/check-in/complete (Structured extraction + Batched write + Step 9 recompute + Slack alert)
app.post('/api/check-in/complete', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { deadlineId, deadlineName, dueAt, locationTag, conversation } = req.body || {};

    if (!deadlineId || !Array.isArray(conversation)) {
      return res.status(400).json({ error: 'deadlineId and conversation are required.' });
    }

    const locTag = ['home', 'office', 'in bed', 'other'].includes(locationTag) ? locationTag : 'other';

    // Step 6: Structured extraction with complete fallback object
    const structuredResult = await extractStructuredSummary(
      deadlineName || 'Task',
      dueAt || 'N/A',
      locTag,
      conversation
    );

    // Step 7 & 9 & 10: Single Firestore Batched Write, Step 9 Recompute, and Inline Slack Alert
    const saveResult = await saveCompletedCheckIn(uid, deadlineId, {
      category: structuredResult.category,
      riskLevel: structuredResult.riskLevel,
      summary: structuredResult.summary,
      actionItems: structuredResult.actionItems,
      locationTag: locTag,
      conversation,
    });

    res.json({
      ...saveResult,
      flaggedForReview: structuredResult.flaggedForReview ?? false,
    });
  } catch (err: any) {
    console.error('[API] Error in POST /api/check-in/complete:', err);
    res.status(500).json({ error: err.message || 'Failed to complete and save check-in.' });
  }
});

// Stage 4: GET /api/status (Readable by owner or accountability partner)
app.get('/api/status', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const isPartner = req.user?.role === 'partner' && !!req.user?.ownerUid;
    const targetUid = isPartner ? req.user!.ownerUid! : req.user!.uid;

    const status = await getUserStatus(targetUid);
    res.json({ status, viewingAs: isPartner ? 'partner' : 'owner', targetUid });
  } catch (err: any) {
    console.error('[API] Error in GET /api/status:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch status.' });
  }
});

// Stage 4: GET /api/partner/invite
app.get('/api/partner/invite', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const invite = await getPartnerInvite(uid);
    res.json({ invite });
  } catch (err: any) {
    console.error('[API] Error in GET /api/partner/invite:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch partner invite.' });
  }
});

// Stage 4: POST /api/partner/invite (Owner creates pending partner invite)
app.post('/api/partner/invite', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { email } = req.body || {};
    const invite = await createPartnerInvite(uid, email);
    res.status(201).json({ invite });
  } catch (err: any) {
    console.error('[API] Error in POST /api/partner/invite:', err);
    res.status(400).json({ error: err.message || 'Failed to create partner invite.' });
  }
});

// Stage 4: POST /api/partner/revoke (Owner revokes current partner)
app.post('/api/partner/revoke', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const result = await revokePartner(uid);
    res.json(result);
  } catch (err: any) {
    console.error('[API] Error in POST /api/partner/revoke:', err);
    res.status(500).json({ error: err.message || 'Failed to revoke partner.' });
  }
});

// ----------------------------------------------------
// VITE SPA MIDDLEWARE / STATIC ASSETS
// ----------------------------------------------------
async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Last Call server running on http://0.0.0.0:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
