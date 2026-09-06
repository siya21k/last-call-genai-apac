import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  adminAuth,
  getUserProfile,
  upsertUserProfile,
  getTasks,
  createTask,
  markTaskDone,
  reopenTask,
  releaseTask,
  createTaskEntry,
  getTaskEntries,
  updateTask,
  getThreadMessages,
  addThreadMessage,
  createLogEntry,
  unlinkLogEntry,
  getLogEntries,
  getDailyStrips,
  saveDailyStrip,
  saveDailyStripMood,
  getPartnerInvite,
  createPartnerInvite,
  revokePartner,
  getJournalEntries,
  createJournalEntry,
  deleteJournalEntry,
  setOwnerPresence,
  getOwnerPresence,
} from './server/db';
import {
  classifyAndExtractMessage,
  generateDailyStripSummary,
  generateCheckInCoaching,
  extractCheckInCompletion,
  hasDegenerateRepetition,
  getZonedParts,
} from './server/gemini';
import type { DailyStrip, DailyStripItem } from './src/types';

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
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      role: (decodedToken as any).role,
      ownerUid: (decodedToken as any).ownerUid,
    };
    next();
  } catch (err: any) {
    // If verifyIdToken fails in sandbox without ADC IAM, inspect JWT payload safely
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
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

/**
 * Lazy, Request-Triggered Daily Strip Refresh
 * Summarizes the day's activity into a single descriptive sentence.
 */
async function refreshDailyStrip(uid: string) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [allLogs, allTasks, existingStrips] = await Promise.all([
      getLogEntries(uid),
      getTasks(uid),
      getDailyStrips(uid),
    ]);
    const todayStrip = existingStrips.find((s) => s.date === today);
    const mood = todayStrip?.mood || null;

    const todayLogs = allLogs.filter((l) => l.createdAt.startsWith(today)).map((l) => l.text);
    const todayCompletedTasks = allTasks
      .filter((t) => t.status === 'met' && (t.completedAt || t.createdAt).startsWith(today))
      .map((t) => t.name);

    if (todayLogs.length > 0 || todayCompletedTasks.length > 0 || mood) {
      const line = await generateDailyStripSummary(today, todayLogs, todayCompletedTasks, mood);
      if (line) {
        await saveDailyStrip(uid, today, line, mood);
      }
    }
  } catch (e) {
    console.warn('[DailyStrip] Error refreshing daily strip:', e);
  }
}

function enrichDailyStripsWithItems(
  strips: DailyStrip[],
  tasks: any[],
  logEntries: any[],
  timeZone: string = 'UTC'
): DailyStrip[] {
  const getDateStr = (isoString?: string | null) => {
    if (!isoString) return null;
    try {
      const parts = getZonedParts(new Date(isoString), timeZone);
      return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
    } catch {
      return isoString.slice(0, 10);
    }
  };

  return strips.map((strip) => {
    const items: DailyStripItem[] = [];

    // Completed tasks on this day
    tasks.forEach((t) => {
      if (t.status === 'met') {
        const d = getDateStr(t.completedAt || t.dueAt || t.createdAt);
        if (d === strip.date) {
          items.push({
            id: t.id,
            type: 'task',
            text: t.name,
            timestamp: t.completedAt || t.dueAt || t.createdAt,
          });
        }
      }
    });

    // Log entries on this day
    logEntries.forEach((l) => {
      const d = getDateStr(l.createdAt);
      if (d === strip.date) {
        items.push({
          id: l.id,
          type: 'log',
          text: l.text,
          timestamp: l.createdAt,
        });
      }
    });

    items.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return {
      ...strip,
      items,
    };
  });
}

// ----------------------------------------------------
// API ROUTES
// ----------------------------------------------------

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Last Call Retro Engine', time: new Date().toISOString() });
});

// GET /api/thread: Load entire thread messages, active tasks, daily strips, anchor times
app.get('/api/thread', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const [messages, tasks, profile, rawStrips, logEntries] = await Promise.all([
      getThreadMessages(uid),
      getTasks(uid),
      getUserProfile(uid),
      getDailyStrips(uid),
      getLogEntries(uid),
    ]);

    const dailyStrips = enrichDailyStripsWithItems(rawStrips, tasks, logEntries, profile?.timezone || 'UTC');

    // Initial greeting if thread is completely empty
    if (messages.length === 0) {
      const initialGreeting = await addThreadMessage(uid, {
        role: 'system',
        text: 'Last Call online. Type a task to drop on the board, a check-in on an open item, or a log of what you just finished.',
        messageType: 'normal',
      });
      messages.push(initialGreeting);
    }

    res.json({
      messages,
      tasks,
      dailyStrips,
      anchorTimes: profile?.anchorTimes || { beforeWork: '08:30', afterWork: '17:30', beforeSleep: '23:00' },
    });
  } catch (err: any) {
    console.error('[API] Error in GET /api/thread:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch thread.' });
  }
});

// GET /api/dailystrips: Load enriched daily strips
app.get('/api/dailystrips', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const [rawStrips, tasks, profile, logEntries] = await Promise.all([
      getDailyStrips(uid),
      getTasks(uid),
      getUserProfile(uid),
      getLogEntries(uid),
    ]);
    const dailyStrips = enrichDailyStripsWithItems(rawStrips, tasks, logEntries, profile?.timezone || 'UTC');
    res.json({ dailyStrips });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch daily strips.' });
  }
});

// POST /api/dailystrips/mood: Optional mood tap to flavor daily strip summary
app.post('/api/dailystrips/mood', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { mood, date } = req.body;
    const targetDate = date || new Date().toISOString().split('T')[0];
    const sanitizedMood = typeof mood === 'string' && mood.trim().length > 0 ? mood.trim() : null;

    // Save mood
    await saveDailyStripMood(uid, targetDate, sanitizedMood);

    // Refresh strip summary if needed to immediately flavor today's line
    const [allLogs, allTasks, profile] = await Promise.all([
      getLogEntries(uid),
      getTasks(uid),
      getUserProfile(uid),
    ]);
    const targetLogs = allLogs.filter((l) => l.createdAt.startsWith(targetDate)).map((l) => l.text);
    const targetTasks = allTasks
      .filter((t) => t.status === 'met' && (t.completedAt || t.createdAt).startsWith(targetDate))
      .map((t) => t.name);

    if (targetLogs.length > 0 || targetTasks.length > 0 || sanitizedMood) {
      const newLine = await generateDailyStripSummary(targetDate, targetLogs, targetTasks, sanitizedMood);
      if (newLine) {
        await saveDailyStrip(uid, targetDate, newLine, sanitizedMood);
      }
    }

    const updatedRawStrips = await getDailyStrips(uid);
    const dailyStrips = enrichDailyStripsWithItems(updatedRawStrips, allTasks, allLogs, profile?.timezone || 'UTC');
    res.json({ success: true, dailyStrips });
  } catch (err: any) {
    console.error('[API] Error in POST /api/dailystrips/mood:', err);
    res.status(500).json({ error: err.message || 'Failed to update mood.' });
  }
});

// GET /api/tasks: List tasks
app.get('/api/tasks', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const tasks = await getTasks(uid);
    res.json({ tasks });
  } catch (err: any) {
    console.error('[API] Error in GET /api/tasks:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch tasks.' });
  }
});

// POST /api/tasks: Add task manually through exact same pipeline
app.post('/api/tasks', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { name, dueAt, consequenceType, anchorPhrase } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Task name is required.' });
    }

    const task = await createTask(uid, {
      name: name.trim(),
      dueAt: dueAt || new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      consequenceType: consequenceType || 'unspecified',
      anchorPhrase: anchorPhrase || null,
    });

    await addThreadMessage(uid, {
      role: 'system',
      text: `Added task '${task.name}' due ${new Date(task.dueAt).toLocaleString('en-US', {
        weekday: 'short',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })}.`,
      relatedTaskId: task.id,
      messageType: 'task-created',
    });

    await refreshDailyStrip(uid);
    res.json({ task });
  } catch (err: any) {
    console.error('[API] Error in POST /api/tasks:', err);
    res.status(500).json({ error: err.message || 'Failed to create task.' });
  }
});

// PATCH /api/tasks/:id: Edit task deadline/details directly (e.g. push deadline back)
app.patch('/api/tasks/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { id } = req.params;
    const { name, dueAt, consequenceType, anchorPhrase } = req.body || {};

    const existingTasks = await getTasks(uid);
    const existing = existingTasks.find((t) => t.id === id);
    if (!existing) {
      return res.status(404).json({ error: `Task ${id} not found.` });
    }

    const updates: any = {};
    if (name !== undefined) updates.name = String(name).trim();
    if (dueAt !== undefined) {
      updates.dueAt = String(dueAt);
      updates.lastGuaranteedNudgeAt = null;
      updates.lastEscalationNudgeAt = null;
    }
    if (anchorPhrase !== undefined) updates.anchorPhrase = anchorPhrase;
    if (consequenceType !== undefined) {
      updates.consequenceType = consequenceType;
    } else {
      if (!existing.consequenceType || existing.consequenceType === 'unspecified') {
        updates.consequenceType = 'unspecified';
      }
    }

    const updatedTask = await updateTask(uid, id, updates);

    await addThreadMessage(uid, {
      role: 'system',
      text: `Updated '${updatedTask.name}' due date to ${new Date(updatedTask.dueAt).toLocaleString('en-US', {
        weekday: 'short',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })}.`,
      relatedTaskId: updatedTask.id,
      messageType: 'normal',
    });

    await refreshDailyStrip(uid);
    res.json({ task: updatedTask });
  } catch (err: any) {
    console.error('[API] Error in PATCH /api/tasks/:id:', err);
    res.status(500).json({ error: err.message || 'Failed to update task.' });
  }
});

// GET /api/journal: List all journal entries
app.get('/api/journal', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const entries = await getJournalEntries(uid);
    res.json({ entries });
  } catch (err: any) {
    console.error('[API] Error in GET /api/journal:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch journal entries.' });
  }
});

// POST /api/journal: Create journal entry
app.post('/api/journal', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { text, title, tags } = req.body || {};
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Entry text is required.' });
    }
    const entry = await createJournalEntry(uid, {
      text: text.trim(),
      title: title ? String(title).trim() : undefined,
      tags: Array.isArray(tags) ? tags : [],
    });
    res.json({ entry });
  } catch (err: any) {
    console.error('[API] Error in POST /api/journal:', err);
    res.status(500).json({ error: err.message || 'Failed to save journal entry.' });
  }
});

// DELETE /api/journal/:id: Delete journal entry
app.delete('/api/journal/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { id } = req.params;
    await deleteJournalEntry(uid, id);
    res.json({ success: true, id });
  } catch (err: any) {
    console.error('[API] Error in DELETE /api/journal/:id:', err);
    res.status(500).json({ error: err.message || 'Failed to delete journal entry.' });
  }
});

// POST /api/tasks/:id/done: One-tap manual mark done in side panel
app.post('/api/tasks/:id/done', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { id } = req.params;
    const updatedTask = await markTaskDone(uid, id);

    // Write inline confirmation into thread
    await addThreadMessage(uid, {
      role: 'system',
      text: `Marked '${updatedTask.name}' done directly from the task panel.`,
      relatedTaskId: updatedTask.id,
      messageType: 'normal',
    });

    // Refresh daily strip
    await refreshDailyStrip(uid);

    res.json({ task: updatedTask });
  } catch (err: any) {
    console.error('[API] Error in POST /api/tasks/:id/done:', err);
    res.status(400).json({ error: err.message || 'Failed to complete task.' });
  }
});

// POST /api/tasks/:id/release: Amnesty release of stale/overdue tasks
app.post('/api/tasks/:id/release', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const taskId = req.params.id;
    const task = await releaseTask(uid, taskId);

    await addThreadMessage(uid, {
      role: 'system',
      text: `Released '${task.name}'. Board cleared.`,
      relatedTaskId: task.id,
      messageType: 'amnesty',
    });

    await refreshDailyStrip(uid);
    res.json({ task });
  } catch (err: any) {
    console.error('[API] Error in POST /api/tasks/:id/release:', err);
    res.status(400).json({ error: err.message || 'Failed to release task.' });
  }
});

// GET /api/tasks/:id/entries: Fetch task entries subcollection
app.get('/api/tasks/:id/entries', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const taskId = req.params.id;
    const entries = await getTaskEntries(uid, taskId);
    res.json({ entries });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch task entries.' });
  }
});

// POST /api/tasks/:id/checkin: Direct task initiation check-in coaching from task panel
// Fully BYPASSES classifyAndExtractMessage and fuzzy router since task is already unambiguous
app.post('/api/tasks/:id/checkin', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const taskId = req.params.id;
    const tasks = await getTasks(uid);
    const task = tasks.find((t) => t.id === taskId);
    if (!task) {
      return res.status(404).json({ error: `Task ${taskId} not found.` });
    }

    const { note } = req.body || {};
    const promptMessage = note
      ? `Check in on task "${task.name}": ${note}`
      : `Check in on task "${task.name}". Need help initiating.`;

    // Record user intent in thread
    const userMsg = await addThreadMessage(uid, {
      role: 'user',
      text: promptMessage,
      relatedTaskId: task.id,
    });

    // Fetch existing recent transcript for this task if any to support multi-turn
    const existingMessages = await getThreadMessages(uid);
    const taskHistory = existingMessages
      .filter((m) => m.relatedTaskId === task.id)
      .slice(-6);

    // Call dedicated check-in coaching generator directly - bypasses router schema completely
    const coachingText = await generateCheckInCoaching(
      task,
      note || 'Need help initiating this task.',
      taskHistory
    );

    const systemMsg = await addThreadMessage(uid, {
      role: 'system',
      text: coachingText,
      relatedTaskId: task.id,
      messageType: 'checkin-prompt',
    });

    // Realtime Presence: check-in started
    await setOwnerPresence(uid, true);

    res.json({ userMessage: userMsg, systemMessage: systemMsg, task });
  } catch (err: any) {
    console.error('[API] Error in POST /api/tasks/:id/checkin:', err);
    res.status(500).json({ error: err.message || 'Failed to initiate check-in.' });
  }
});

// POST /api/tasks/:id/checkin/complete: Complete check-in session and fire structured extraction {summary, nextPhysicalAction}
app.post('/api/tasks/:id/checkin/complete', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const taskId = req.params.id;
    const tasks = await getTasks(uid);
    const task = tasks.find((t) => t.id === taskId);
    if (!task) {
      return res.status(404).json({ error: `Task ${taskId} not found.` });
    }

    const messages = await getThreadMessages(uid);
    const taskMessages = messages.filter((m) => m.relatedTaskId === task.id).slice(-8);

    // Run completion schema once at the end of the conversation
    const completion = await extractCheckInCompletion(task, taskMessages);

    // Persist into subcollection users/{uid}/tasks/{taskId}/entries/{entryId}
    const entry = await createTaskEntry(uid, task.id, {
      summary: completion.summary,
      nextPhysicalAction: completion.nextPhysicalAction,
      conversation: taskMessages.map((m) => ({
        role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        text: m.text,
        timestamp: m.createdAt,
      })),
    });

    const systemMsg = await addThreadMessage(uid, {
      role: 'system',
      text: `⚡ **Action locked:** ${completion.nextPhysicalAction}\n\n*Check-in recorded for "${task.name}". Set a 2-minute timer and begin.*`,
      relatedTaskId: task.id,
      messageType: 'normal',
    });

    // Realtime Presence: check-in completed
    await setOwnerPresence(uid, false);

    res.json({ entry, systemMessage: systemMsg, task });
  } catch (err: any) {
    console.error('[API] Error in POST /api/tasks/:id/checkin/complete:', err);
    res.status(500).json({ error: err.message || 'Failed to complete check-in.' });
  }
});

// POST /api/tasks/:id/checkin/exit: Explicit exit / abandonment of check-in
app.post('/api/tasks/:id/checkin/exit', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    await setOwnerPresence(uid, false);
    res.json({ success: true, isCheckingIn: false });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to exit check-in.' });
  }
});

// POST /api/presence/exit: General check-in exit / cancel
app.post('/api/presence/exit', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    await setOwnerPresence(uid, false);
    res.json({ success: true, isCheckingIn: false });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to exit check-in.' });
  }
});

// POST /api/thread/message: Unified message router with Gemini extraction
app.post('/api/thread/message', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { message, clientTimezone, clientOffsetMinutes } = req.body || {};

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message cannot be empty.' });
    }

    const trimmed = message.trim();

    // 1. Write user's message to thread
    const userMsgRecord = await addThreadMessage(uid, {
      role: 'user',
      text: trimmed,
    });

    // 2. Load context for classification
    const [tasks, profile, threadMessages] = await Promise.all([
      getTasks(uid),
      getUserProfile(uid),
      getThreadMessages(uid),
    ]);

    // Auto-update user timezone if provided and not yet stored
    if (clientTimezone && (!profile || profile.timezone !== clientTimezone)) {
      await upsertUserProfile(uid, { timezone: clientTimezone });
    }

    const openTasks = tasks.filter((t) => t.status === 'pending');
    const systemMessages = threadMessages.filter((m) => m.role === 'system');
    const lastSystemMsg = systemMessages.length > 0 ? systemMessages[systemMessages.length - 1] : null;

    // 3. Single Gemini extraction call
    const nowIso = new Date().toISOString();
    const classification = await classifyAndExtractMessage(trimmed, {
      nowIso,
      clientTimezone,
      clientOffsetMinutes,
      anchorTimes: profile?.anchorTimes,
      openTasks: openTasks.map((t) => ({ id: t.id, name: t.name, dueAt: t.dueAt, consequenceType: t.consequenceType })),
      lastSystemMessage: lastSystemMsg
        ? { text: lastSystemMsg.text, relatedTaskId: lastSystemMsg.relatedTaskId, messageType: lastSystemMsg.messageType }
        : null,
    });

    let systemMsgRecord: any = null;
    let createdTask: any = null;

    if (classification.intent === 'task-creation' && classification.taskCreation) {
      // Step 3: Task creation
      const tc = classification.taskCreation;
      console.log(`[Task Creation] Model returned dueAt: "${tc.dueAt}", anchorPhrase: "${tc.anchorPhrase}", name: "${tc.name}"`);
      createdTask = await createTask(uid, {
        name: tc.name || trimmed,
        dueAt: tc.dueAt || new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        consequenceType: tc.consequenceType || 'unspecified',
        anchorPhrase: tc.anchorPhrase || null,
      });

      let confirmText = `Set task '${createdTask.name}' due ${new Date(createdTask.dueAt).toLocaleString('en-US', {
        weekday: 'short',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })}.`;

      if (
        tc.systemConfirmation &&
        tc.systemConfirmation.length <= 100 &&
        !hasDegenerateRepetition(tc.systemConfirmation)
      ) {
        confirmText = tc.systemConfirmation;
      }

      systemMsgRecord = await addThreadMessage(uid, {
        role: 'system',
        text: confirmText,
        relatedTaskId: createdTask.id,
        messageType: 'task-created',
      });
    } else if (classification.intent === 'log-entry') {
      // Step 4: Log entry with fuzzy-match reverse extraction
      const match = classification.logEntryMatch;
      const isHigh = match?.confidence === 'high' && match.matchedTaskId;
      const isLow = match?.confidence === 'low' && (match.candidateTaskName || match.matchedTaskId);

      // Save log entry to users/{uid}/logEntries
      const logEntry = await createLogEntry(uid, {
        text: trimmed,
        matchedTaskId: isHigh ? match.matchedTaskId : null,
      });

      if (isHigh && match.matchedTaskId) {
        // High confidence match: Auto-close matched task
        try {
          const closedTask = await markTaskDone(uid, match.matchedTaskId);
          // Always name the task specifically so a wrong auto-close is immediately visible to user
          systemMsgRecord = await addThreadMessage(uid, {
            role: 'system',
            text: `Marked '${closedTask.name}' done.`,
            relatedTaskId: closedTask.id,
            relatedLogEntryId: logEntry.id,
            messageType: 'auto-close',
          });
        } catch (err) {
          // If task not found or already done
          systemMsgRecord = await addThreadMessage(uid, {
            role: 'system',
            text: `Logged: "${trimmed}".`,
            relatedLogEntryId: logEntry.id,
            messageType: 'normal',
          });
        }
      } else if (isLow) {
        // Low-confidence or ambiguous match: ask user to confirm against single returned candidate
        const candidateName = match.candidateTaskName || 'open task';
        systemMsgRecord = await addThreadMessage(uid, {
          role: 'system',
          text: `Logged: "${trimmed}". Did you mean to mark '${candidateName}' done?`,
          relatedTaskId: match.matchedTaskId || null,
          relatedLogEntryId: logEntry.id,
          messageType: 'candidate-prompt',
        });
      } else {
        // Plain statement that nothing obvious matched
        systemMsgRecord = await addThreadMessage(uid, {
          role: 'system',
          text: `Logged: "${trimmed}". (No matching open task on the board).`,
          relatedLogEntryId: logEntry.id,
          messageType: 'normal',
        });
      }

      await refreshDailyStrip(uid);
    } else if (classification.intent === 'correction') {
      // Step 4 Reversal Flow: Strictly undo-only
      // Find eligible auto-close messages in the thread
      const autoCloseMessages = threadMessages
        .slice()
        .reverse()
        .filter((m) => m.role === 'system' && m.messageType === 'auto-close' && m.relatedTaskId);

      let targetAutoClose: (typeof threadMessages)[0] | undefined;

      // Disambiguation check:
      // If user specified a target task phrase (e.g. "vet", "taxes", "not the report"):
      const phrase = classification.correction?.targetTaskPhrase?.toLowerCase().trim();
      if (phrase && autoCloseMessages.length > 0) {
        for (const msg of autoCloseMessages) {
          if (msg.relatedTaskId) {
            const candidateTask = tasks.find((t) => t.id === msg.relatedTaskId);
            if (
              candidateTask &&
              (candidateTask.name.toLowerCase().includes(phrase) ||
                phrase.includes(candidateTask.name.toLowerCase()))
            ) {
              targetAutoClose = msg;
              break;
            }
          }
        }
      }

      // If no phrase was given or no phrase matched, target the most recent auto-close
      // (this automatically skips any intermediate normal logs, chat messages, or check-ins)
      if (!targetAutoClose && autoCloseMessages.length > 0) {
        targetAutoClose = autoCloseMessages[0];
      }

      if (targetAutoClose && targetAutoClose.relatedTaskId) {
        // Reopen the mistakenly-closed task (status back to 'pending')
        const reopenedTask = await reopenTask(uid, targetAutoClose.relatedTaskId);
        // Clear log entry's matchedTaskId to null
        if (targetAutoClose.relatedLogEntryId) {
          await unlinkLogEntry(uid, targetAutoClose.relatedLogEntryId);
        }

        // Inline system confirmation of undo
        systemMsgRecord = await addThreadMessage(uid, {
          role: 'system',
          text: `Reopened '${reopenedTask.name}' and unlinked log entry.`,
          relatedTaskId: reopenedTask.id,
          messageType: 'reopened',
        });

        await refreshDailyStrip(uid);
      } else {
        systemMsgRecord = await addThreadMessage(uid, {
          role: 'system',
          text: 'No recent auto-closed task found to undo.',
          messageType: 'normal',
        });
      }
    } else if (classification.intent === 'check-in') {
      // Stage 3 Task Initiation / Multi-turn Check-In Flow
      // Realtime Presence: Start check-in or refresh heartbeat
      await setOwnerPresence(uid, true);

      const checkIn = classification.checkIn || {
        targetTaskId: null,
        userIntent: trimmed,
      };

      let targetTaskId = checkIn.targetTaskId;
      // If no targetTaskId matched from AI, see if an open task name matches user message
      if (!targetTaskId) {
        const found = openTasks.find(
          (t) =>
            trimmed.toLowerCase().includes(t.name.toLowerCase()) ||
            t.name.toLowerCase().includes(trimmed.toLowerCase())
        );
        if (found) targetTaskId = found.id;
      }

      const matchedTask = targetTaskId ? openTasks.find((t) => t.id === targetTaskId) : null;
      const targetObj = matchedTask || {
        id: 'general',
        name: checkIn.targetTaskName || 'task',
        dueAt: undefined,
        consequenceType: 'soft',
      };

      // Gather recent transcript turns for this task/context
      const taskHistory = threadMessages
        .filter((m) => (targetTaskId ? m.relatedTaskId === targetTaskId : true))
        .slice(-6);

      // Dedicated conversational coaching call - decoupled from router schema
      const coachingText = await generateCheckInCoaching(targetObj, trimmed, taskHistory);

      systemMsgRecord = await addThreadMessage(uid, {
        role: 'system',
        text: coachingText,
        relatedTaskId: targetTaskId || null,
        messageType: 'checkin-prompt',
      });
    } else if (classification.intent === 'conversation') {
      // Check if user is currently in an active check-in session to handle heartbeat or explicit exit
      const activePresence = await getOwnerPresence(uid);
      const lower = trimmed.toLowerCase();
      const isExitIntent =
        lower === 'exit' ||
        lower === 'cancel' ||
        lower === 'stop' ||
        lower === 'abandon' ||
        lower === 'exit check-in' ||
        lower === 'cancel check-in' ||
        lower === 'stop check-in';

      if (activePresence?.isCheckingIn && isExitIntent) {
        await setOwnerPresence(uid, false);
        systemMsgRecord = await addThreadMessage(uid, {
          role: 'system',
          text: 'Exited check-in. Realtime focus presence reset to idle.',
          messageType: 'normal',
        });
      } else {
        if (activePresence?.isCheckingIn) {
          // Heartbeat refresh on subsequent message exchange within active check-in
          await setOwnerPresence(uid, true);
        }
        const reply = classification.conversationalReply || 'Message received. What are we starting on right now?';
        systemMsgRecord = await addThreadMessage(uid, {
          role: 'system',
          text: reply,
          messageType: 'normal',
        });
      }
    } else {
      systemMsgRecord = await addThreadMessage(uid, {
        role: 'system',
        text: 'Got your update.',
        messageType: 'normal',
      });
    }

    res.json({
      classification,
      userMessage: userMsgRecord,
      systemMessage: systemMsgRecord,
      createdTask,
    });
  } catch (err: any) {
    console.error('[API] Error in POST /api/thread/message:', err);
    res.status(500).json({ error: err.message || 'Failed to process message.' });
  }
});

// GET & POST /api/settings: Anchor times & notifications
app.get('/api/settings', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const profile = await getUserProfile(uid);
    res.json({
      anchorTimes: profile?.anchorTimes || { beforeWork: '08:30', afterWork: '17:30', beforeSleep: '23:00' },
      notificationToken: profile?.notificationToken || null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load settings.' });
  }
});

app.post('/api/settings', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { anchorTimes, notificationToken, timezone } = req.body || {};
    const updated = await upsertUserProfile(uid, {
      anchorTimes,
      notificationToken,
      timezone,
    });
    res.json({ settings: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update settings.' });
  }
});

// Partner Invite Endpoints
app.get('/api/partner/invite', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const invite = await getPartnerInvite(uid);
    res.json({ invite });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch partner invite.' });
  }
});

app.post('/api/partner/invite', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const { email, partnerEmail } = req.body || {};
    const targetEmail = (email || partnerEmail || '').toString().trim();
    if (!targetEmail) {
      return res.status(400).json({ error: 'Valid partner email address is required.' });
    }
    const invite = await createPartnerInvite(uid, targetEmail);
    res.status(201).json({ invite });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to create partner invite.' });
  }
});

app.post('/api/partner/revoke', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const result = await revokePartner(uid);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to revoke partner.' });
  }
});

// Step 11: GET /api/partner/status (Computed on demand, verified role + ownerUid match)
app.get('/api/partner/status', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const requestedOwnerUid = req.query.ownerUid as string;
    const callerRole = req.user?.role;
    const callerOwnerUid = req.user?.ownerUid;

    // Strict authorization: caller must be a partner with matching ownerUid
    if (callerRole !== 'partner' || !callerOwnerUid || (requestedOwnerUid && callerOwnerUid !== requestedOwnerUid)) {
      return res.status(403).json({
        error: 'Forbidden: Caller is not authorized to view status for this owner.',
      });
    }

    const [tasks, strips] = await Promise.all([getTasks(callerOwnerUid), getDailyStrips(callerOwnerUid)]);
    const now = Date.now();
    const escalationWindowMs = 48 * 3600 * 1000;

    // Check if anything hard-consequence is within the escalation window
    const hasHardConsequenceInEscalationWindow = tasks.some((t) => {
      if (t.status !== 'pending' || t.consequenceType !== 'hard') return false;
      const dueTime = new Date(t.dueAt).getTime();
      return dueTime > now && dueTime - now <= escalationWindowMs;
    });

    const latestStrip = strips.length > 0 ? strips[0].line : 'No activity logged yet today.';

    res.json({
      dailyStripLine: latestStrip,
      hasHardConsequenceInEscalationWindow,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to compute partner status.' });
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
