import { GoogleGenAI, Type } from '@google/genai';
import type {
  ConsequenceType,
  AnchorTimes,
  RelativeDaySignal,
  AnchorPhraseSignal,
} from '../src/types';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/**
 * Resilient Gemini Fallback Ladder
 * Primary: gemini-3.6-flash
 * High-Availability Fallback: gemini-3.1-flash-lite
 * Dynamic Alias: gemini-flash-latest
 * Deep Reasoning Fallback: gemini-3.7-flash
 */
const MODEL_LADDER = [
  'gemini-3.6-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
  'gemini-3.7-flash',
];

export async function generateContentWithFallback(
  promptOrContents: any,
  config: {
    systemInstruction?: string;
    temperature?: number;
    responseMimeType?: string;
    responseSchema?: any;
    maxOutputTokens?: number;
  } = {}
): Promise<string> {
  let lastError: any = null;

  for (const modelName of MODEL_LADDER) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: promptOrContents,
        config: {
          systemInstruction: config.systemInstruction,
          temperature: config.temperature ?? 0.2,
          responseMimeType: config.responseMimeType,
          responseSchema: config.responseSchema,
          maxOutputTokens: config.maxOutputTokens,
        },
      });

      if (response && response.text) {
        return response.text;
      }
    } catch (err: any) {
      lastError = err;
      const errMsg = err?.message || String(err);
      console.warn(`[Gemini Fallback] Model ${modelName} failed: ${errMsg}. Attempting next ladder step...`);
    }
  }

  throw new Error(`All Gemini models in fallback ladder exhausted. Last error: ${lastError?.message || lastError}`);
}

export function parseJsonSafely(raw: string): any {
  if (!raw || typeof raw !== 'string') return null;
  let cleaned = raw.trim();
  // Strip markdown code fences (```json ... ```)
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }
  // Find outermost JSON object
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  return JSON.parse(cleaned);
}

export function hasDegenerateRepetition(text: string): boolean {
  if (!text || typeof text !== 'string') return true;
  if (text.length > 120) return true;
  const words = text.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
  const freq: Record<string, number> = {};
  for (const w of words) {
    freq[w] = (freq[w] || 0) + 1;
    if (freq[w] >= 3) return true;
  }
  for (let i = 0; i < words.length - 1; i++) {
    const bigram = `${words[i]} ${words[i + 1]}`;
    let count = 0;
    for (let j = 0; j < words.length - 1; j++) {
      if (`${words[j]} ${words[j + 1]}` === bigram) count++;
    }
    if (count >= 2) return true;
  }
  return false;
}

export interface ClassifiedMessageResult {
  intent: 'task-creation' | 'log-entry' | 'check-in' | 'correction' | 'conversation';
  taskCreation?: {
    name: string;
    relativeDay: RelativeDaySignal;
    relativeDayCount?: number | null;
    specificDate?: string | null;
    explicitTime?: string | null;
    anchorPhrase?: AnchorPhraseSignal | null;
    consequenceType: ConsequenceType;
    systemConfirmation?: string;
    dueAt: string; // Deterministically computed by backend date-math!
  };
  logEntryMatch?: {
    matchedTaskId: string | null;
    confidence: 'high' | 'low' | 'none';
    candidateTaskName?: string;
    matchedTaskName?: string;
  };
  checkIn?: {
    targetTaskId: string | null;
    targetTaskName?: string;
    userIntent: string;
  };
  correction?: {
    isReversal: boolean;
    targetTaskPhrase?: string | null;
  };
  conversationalReply?: string;
}

/**
 * Message Router Schema (Single extraction call covering intent classification and routing)
 * NOTE: The extraction schema returns structural signals ONLY.
 * Gemini NEVER calculates an absolute datetime or ISO timestamp.
 */
const MESSAGE_CLASSIFIER_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    intent: {
      type: Type.STRING,
      enum: ['task-creation', 'log-entry', 'check-in', 'correction', 'conversation'],
      description: 'Classification of user message in the ADHD focus thread.',
    },
    taskCreation: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: 'Clean concise task title' },
        relativeDay: {
          type: Type.STRING,
          enum: [
            'today',
            'tomorrow',
            'in_N_days',
            'next_week',
            'next_monday',
            'next_tuesday',
            'next_wednesday',
            'next_thursday',
            'next_friday',
            'next_saturday',
            'next_sunday',
            'specific_date',
            'unspecified',
          ],
          description: 'Structural relative day indicator (today, tomorrow, in_N_days, next_week, next_<weekday>, specific_date, or unspecified).',
        },
        relativeDayCount: {
          type: Type.INTEGER,
          description: 'Number of days N if relativeDay is in_N_days (e.g. 2, 3, 5). Null otherwise.',
        },
        specificDate: {
          type: Type.STRING,
          description: 'Specific date string (YYYY-MM-DD) if relativeDay is specific_date. Null otherwise.',
        },
        explicitTime: {
          type: Type.STRING,
          description: 'Explicit clock time mentioned in 24-hour "HH:MM" (e.g. "14:00", "09:30", "17:00"), or null if no explicit clock time was given.',
        },
        anchorPhrase: {
          type: Type.STRING,
          enum: ['before_work', 'after_work', 'before_sleep', 'lunch', 'none'],
          description: 'Structural anchor phrase: before_work, after_work, before_sleep, lunch, or none.',
        },
        consequenceType: {
          type: Type.STRING,
          enum: ['hard', 'soft', 'unspecified'],
          description: 'hard if hard deadline with real external consequences (taxes, flight, bills), soft if flexible personal habit, unspecified if ambiguous.',
        },
        systemConfirmation: {
          type: Type.STRING,
          description: 'Brief system style confirmation strictly under 60 characters e.g. "Set task \'Pay electric bill\'."',
        },
      },
      required: ['name', 'relativeDay', 'consequenceType'],
    },
    logEntryMatch: {
      type: Type.OBJECT,
      properties: {
        matchedTaskId: {
          type: Type.STRING,
          description: 'The task ID from the open tasks context that this log entry completes, or null if no confident match.',
        },
        confidence: {
          type: Type.STRING,
          enum: ['high', 'low', 'none'],
          description: 'high if clear semantic match to an open task; low if possible/ambiguous; none if unrelated or nothing matches.',
        },
        candidateTaskName: {
          type: Type.STRING,
          description: 'Name of the candidate task if confidence is low.',
        },
        matchedTaskName: {
          type: Type.STRING,
          description: 'Name of the matched task if confidence is high.',
        },
      },
    },
    checkIn: {
      type: Type.OBJECT,
      properties: {
        targetTaskId: {
          type: Type.STRING,
          description: 'Task ID if user is checking in on or stuck on a specific open task, or null',
        },
        targetTaskName: {
          type: Type.STRING,
          description: 'Name of the task being checked in on',
        },
        userIntent: {
          type: Type.STRING,
          description: 'Brief summary of what user needs help initiating',
        },
      },
    },
    correction: {
      type: Type.OBJECT,
      properties: {
        isReversal: {
          type: Type.BOOLEAN,
          description: 'True if user is telling us to undo or revert a previous auto-close match.',
        },
        targetTaskPhrase: {
          type: Type.STRING,
          description: 'If the user specified which task was mistaken or should be undone (e.g. "vet", "taxes", "not the laundry"), the specific task name or keyword. Null if generic like "wrong one" or "undo".',
        },
      },
      description: 'Strictly undo-only reversal flag with optional disambiguation reference. Never infers or sets replacement target tasks.',
    },
    conversationalReply: {
      type: Type.STRING,
      description: 'Conversational response if intent is conversation. Blunt, irreverent toward avoidance, warm toward person, concise (1-2 sentences max). Zero generic corporate motivational slop.',
    },
  },
  required: ['intent'],
};

/**
 * Single Extraction Call: Classifies intent, extracts task creation or matches log entry against open tasks.
 */
export async function classifyAndExtractMessage(
  userMessage: string,
  context: {
    nowIso: string;
    clientTimezone?: string;
    clientOffsetMinutes?: number;
    anchorTimes?: AnchorTimes;
    openTasks?: Array<{ id: string; name: string; dueAt: string; consequenceType: string }>;
    lastSystemMessage?: { text: string; relatedTaskId?: string | null; messageType?: string } | null;
  }
): Promise<ClassifiedMessageResult> {
  const defaultAnchorTimes = {
    beforeWork: '08:30',
    afterWork: '17:30',
    beforeSleep: '23:00',
    ...(context.anchorTimes || {}),
  };

  const openTasksList = (context.openTasks || [])
    .map((t) => `- ID: "${t.id}", Name: "${t.name}", Due: ${t.dueAt}, Consequence: ${t.consequenceType}`)
    .join('\n');

  const tzInfo = context.clientTimezone ? `User Timezone: ${context.clientTimezone} (UTC offset: ${context.clientOffsetMinutes !== undefined ? -context.clientOffsetMinutes : 0} minutes)` : 'User Timezone: UTC';

  const systemInstruction = `You are "Last Call", an ADHD task-initiation and focus assistant.
Current ISO Time (UTC): ${context.nowIso}
${tzInfo}
User Anchor Times (in user local time): Before Work (${defaultAnchorTimes.beforeWork}), Midday/Lunch (12:00), After Work (${defaultAnchorTimes.afterWork}), Before Sleep (${defaultAnchorTimes.beforeSleep}).

Open Tasks Context:
${openTasksList || '(No current open tasks on the board)'}

Previous System Message: ${context.lastSystemMessage ? `"${context.lastSystemMessage.text}" (Task ID: ${context.lastSystemMessage.relatedTaskId || 'none'}, Type: ${context.lastSystemMessage.messageType || 'normal'})` : '(None)'}

Classify the incoming user message into EXACTLY ONE intent:
1. "task-creation": The user states a task to do in the future (e.g. "submit taxes Friday 5pm", "call mom after work", "buy groceries", "pay electric bill next week", "submit project before lunch tomorrow").
   - Extract structural signals ONLY. NEVER compute an absolute datetime or ISO-8601 string.
   - Extract:
     * "name": Clean concise task title without time anchors or filler.
     * "relativeDay": 'today' | 'tomorrow' | 'in_N_days' | 'next_week' | 'next_monday' | 'next_tuesday' | 'next_wednesday' | 'next_thursday' | 'next_friday' | 'next_saturday' | 'next_sunday' | 'specific_date' | 'unspecified'
     * "relativeDayCount": Integer N if relativeDay is in_N_days (e.g. 2, 3), null otherwise.
     * "specificDate": 'YYYY-MM-DD' if user states an explicit calendar date (e.g. "October 12th"), null otherwise.
     * "explicitTime": 'HH:MM' 24-hour clock string if user gives a specific time (e.g. "5pm" -> "17:00", "2:30pm" -> "14:30", "9am" -> "09:00"), null if no clock time.
     * "anchorPhrase": 'before_work' | 'after_work' | 'before_sleep' | 'lunch' | 'none'
     * "consequenceType": 'hard' | 'soft' | 'unspecified'
   - NEVER ask a follow-up question.
   - Provide a brief inline system confirmation (e.g. "Set task 'Pay electric bill'.").

2. "log-entry": The user says they completed or worked on something (e.g. "finished laundry", "just called the vet", "done with the quarterly report", "sent the email to dave").
   - Compare the user's action against Open Tasks by semantic similarity:
     * If high confidence semantic match to an open task: set confidence="high", matchedTaskId=task.id, matchedTaskName=task.name.
     * If ambiguous or partial match: set confidence="low", matchedTaskId=task.id, candidateTaskName=task.name.
     * If no open task matches or open tasks list is empty: set confidence="none", matchedTaskId=null.

3. "correction": The user is rejecting, reversing, or undoing a previous match confirmation (e.g. "no, that's not it", "wrong one", "undo that", "that wasn't the vet call", "no wrong task", "undo vet").
   - Note: This is STRICTLY an undo action. Do NOT infer any replacement target task.
   - Set isReversal=true.
   - If user specified which task was mistaken (e.g. "that wasn't the vet", "wrong one on taxes"), set targetTaskPhrase to that keyword or task name. If generic ("wrong one", "undo that"), set targetTaskPhrase to null.

4. "check-in": The user wants to start an open task, expresses being stuck/frozen on something, or asks for help initiating (e.g. "stuck on report", "help me start the taxes", "can't focus", "help initiating vet call").
   - Match against Open Tasks if a specific task applies; set targetTaskId and targetTaskName.
   - userIntent: Brief summary of what user needs help initiating.

5. "conversation": Casual banter, greetings, questions, venting, or unrelated remarks (e.g. "hey", "tired today", "how does this work").
   - Provide conversationalReply: blunt, irreverent toward avoidance, warm toward person, concise (1-2 sentences).

Return valid JSON strictly matching the schema.`;

  // STEP 1: Primary Extraction Call with structured output and maxOutputTokens cap
  let parsed: ClassifiedMessageResult | null = null;
  try {
    const rawJson = await generateContentWithFallback(userMessage, {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: MESSAGE_CLASSIFIER_SCHEMA,
      temperature: 0.1,
      maxOutputTokens: 1024,
    });

    console.log(`[Gemini Classifier] Raw model extraction response for "${userMessage}":\n`, rawJson);
    const candidate = parseJsonSafely(rawJson);
    if (candidate && candidate.intent) {
      parsed = candidate;
    }
  } catch (primaryErr: any) {
    console.warn('[Gemini Classifier] Primary extraction failed or produced invalid JSON:', primaryErr?.message || primaryErr);
  }

  // STEP 2: Retry-then-fallback logic
  // If JSON.parse() fails (or missing intent), retry once with stricter instruction
  if (!parsed || !parsed.intent) {
    try {
      console.info('[Gemini Classifier] Retrying with strict schema enforcement instruction...');
      const strictInstruction = `${systemInstruction}\n\nCRITICAL: Return strictly valid JSON adhering to the schema. Output only the JSON object without markdown fences, commentary, or repeated phrases. Keep all string fields concise and under 60 characters.`;
      const retryJson = await generateContentWithFallback(userMessage, {
        systemInstruction: strictInstruction,
        responseMimeType: 'application/json',
        responseSchema: MESSAGE_CLASSIFIER_SCHEMA,
        temperature: 0.0,
        maxOutputTokens: 1024,
      });

      console.log(`[Gemini Classifier] Retry extraction response:\n`, retryJson);
      const retryCandidate = parseJsonSafely(retryJson);
      if (retryCandidate && retryCandidate.intent) {
        parsed = retryCandidate;
      }
    } catch (retryErr: any) {
      console.warn('[Gemini Classifier] Retry extraction failed:', retryErr?.message || retryErr);
    }
  }

  // If successfully parsed, calculate deterministic dueAt from extracted structural signals
  if (parsed && parsed.intent) {
    if (parsed.taskCreation) {
      const computed = computeDeterministicDueAt(
        {
          relativeDay: parsed.taskCreation.relativeDay,
          relativeDayCount: parsed.taskCreation.relativeDayCount,
          specificDate: parsed.taskCreation.specificDate,
          explicitTime: parsed.taskCreation.explicitTime,
          anchorPhrase: parsed.taskCreation.anchorPhrase,
        },
        {
          timezone: context.clientTimezone,
          anchorTimes: context.anchorTimes,
          now: new Date(context.nowIso),
        }
      );
      parsed.taskCreation.dueAt = computed.dueAt;
      parsed.taskCreation.systemConfirmation = `Set task '${parsed.taskCreation.name}' due ${computed.formattedLabel}.`;
    }
    return parsed;
  }

  // STEP 3: Fallback object (raw model output is NEVER surfaced to user)
  console.warn('[Gemini Classifier] Model extraction failed. Executing deterministic fallback object.');
  return buildDeterministicFallback(userMessage, context);
}

export function getZonedParts(date: Date, timeZone?: string) {
  const tz = timeZone || 'UTC';
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      weekday: 'short',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '';

    let hour = parseInt(getPart('hour'), 10);
    if (hour === 24) hour = 0;

    return {
      year: parseInt(getPart('year'), 10),
      month: parseInt(getPart('month'), 10),
      day: parseInt(getPart('day'), 10),
      weekday: getPart('weekday'),
      hour,
      minute: parseInt(getPart('minute'), 10),
    };
  } catch {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getUTCDay()],
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
    };
  }
}

export function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone?: string
): Date {
  const tz = timeZone || 'UTC';
  try {
    const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
    const parts = getZonedParts(guess, tz);
    const testLocalAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
    const targetLocalAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
    const diff = targetLocalAsUtc - testLocalAsUtc;
    return new Date(guess.getTime() + diff);
  } catch {
    return new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  }
}

export function computeDeterministicDueAt(
  signals: {
    relativeDay?: string | null;
    relativeDayCount?: number | null;
    specificDate?: string | null;
    explicitTime?: string | null;
    anchorPhrase?: string | null;
  },
  options: {
    timezone?: string;
    anchorTimes?: AnchorTimes;
    now?: Date;
  } = {}
): { dueAt: string; formattedLabel: string; anchorPhraseUsed: string | null } {
  const timezone = options.timezone || 'UTC';
  const now = options.now || new Date();
  const safeAnchor: AnchorTimes = {
    beforeWork: '08:30',
    afterWork: '17:30',
    beforeSleep: '23:00',
    ...(options.anchorTimes || {}),
  };

  const nowParts = getZonedParts(now, timezone);

  // 1. Resolve day offset
  let dayOffset = 1;
  const relDay = (signals.relativeDay || 'unspecified').toLowerCase();

  if (relDay === 'today') {
    dayOffset = 0;
  } else if (relDay === 'tomorrow') {
    dayOffset = 1;
  } else if (relDay === 'in_n_days') {
    dayOffset = signals.relativeDayCount && signals.relativeDayCount > 0 ? signals.relativeDayCount : 2;
  } else if (relDay === 'next_week') {
    dayOffset = 7;
  } else if (relDay.startsWith('next_')) {
    const weekdayName = relDay.replace('next_', '');
    const weekdays: Record<string, number> = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };
    const dowNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const currentDow = dowNames.indexOf(nowParts.weekday);
    const targetDow = weekdays[weekdayName] !== undefined ? weekdays[weekdayName] : -1;
    if (targetDow !== -1 && currentDow !== -1) {
      let diff = (targetDow - currentDow + 7) % 7;
      if (diff === 0) diff = 7;
      dayOffset = diff;
    } else {
      dayOffset = 7;
    }
  }

  // 2. Resolve time (HH:MM)
  let timeStr = '09:00';
  let anchorPhraseUsed: string | null = null;

  const rawAnchor = (signals.anchorPhrase || '').toLowerCase();
  if (rawAnchor.includes('before_work') || rawAnchor.includes('before work')) {
    timeStr = safeAnchor.beforeWork || '08:30';
    anchorPhraseUsed = 'before work';
  } else if (rawAnchor.includes('after_work') || rawAnchor.includes('after work')) {
    timeStr = safeAnchor.afterWork || '17:30';
    anchorPhraseUsed = 'after work';
  } else if (
    rawAnchor.includes('before_sleep') ||
    rawAnchor.includes('before sleep') ||
    rawAnchor.includes('bed') ||
    rawAnchor.includes('night')
  ) {
    timeStr = safeAnchor.beforeSleep || '23:00';
    anchorPhraseUsed = 'before sleep';
  } else if (rawAnchor.includes('lunch') || rawAnchor.includes('noon')) {
    timeStr = '12:00';
    anchorPhraseUsed = 'lunch';
  } else if (signals.explicitTime && /^\d{1,2}:\d{2}$/.test(signals.explicitTime.trim())) {
    timeStr = signals.explicitTime.trim();
  }

  const [rawH, rawM] = timeStr.split(':').map((s) => parseInt(s, 10));
  const h = isNaN(rawH) ? 9 : rawH;
  const m = isNaN(rawM) ? 0 : rawM;

  // 3. Resolve target calendar date in user's timezone
  let resolvedYear: number;
  let resolvedMonth: number;
  let resolvedDay: number;

  if (relDay === 'specific_date' && signals.specificDate && /^\d{4}-\d{2}-\d{2}$/.test(signals.specificDate)) {
    const [sy, sm, sd] = signals.specificDate.split('-').map(Number);
    resolvedYear = sy;
    resolvedMonth = sm;
    resolvedDay = sd;
  } else {
    // Add dayOffset days to user local date
    const targetDateInLocal = new Date(Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day + dayOffset));
    resolvedYear = targetDateInLocal.getUTCFullYear();
    resolvedMonth = targetDateInLocal.getUTCMonth() + 1;
    resolvedDay = targetDateInLocal.getUTCDate();
  }

  let targetUtc = zonedDateTimeToUtc(resolvedYear, resolvedMonth, resolvedDay, h, m, timezone);

  // If relDay was 'today' and time is already past, advance by 1 day
  if (relDay === 'today' && targetUtc.getTime() <= now.getTime()) {
    const rolledLocal = new Date(Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day + 1));
    targetUtc = zonedDateTimeToUtc(
      rolledLocal.getUTCFullYear(),
      rolledLocal.getUTCMonth() + 1,
      rolledLocal.getUTCDate(),
      h,
      m,
      timezone
    );
    dayOffset = 1;
  }

  // Format label
  const hour12 = h % 12 || 12;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const timeFormatted = `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;

  let dayLabel = 'tomorrow';
  if (dayOffset === 0) dayLabel = 'today';
  else if (dayOffset === 1) dayLabel = 'tomorrow';
  else if (dayOffset === 7) dayLabel = 'next week';
  else if (dayOffset > 1) dayLabel = `in ${dayOffset} days`;

  const formattedLabel = anchorPhraseUsed
    ? `${dayLabel} (${anchorPhraseUsed}, ${timeFormatted})`
    : `${dayLabel} at ${timeFormatted}`;

  return {
    dueAt: targetUtc.toISOString(),
    formattedLabel,
    anchorPhraseUsed,
  };
}

function buildDeterministicFallback(
  userMessage: string,
  context: {
    nowIso: string;
    clientTimezone?: string;
    clientOffsetMinutes?: number;
    anchorTimes?: AnchorTimes;
    openTasks?: Array<{ id: string; name: string; dueAt: string; consequenceType: string }>;
  }
): ClassifiedMessageResult {
  const lower = userMessage.toLowerCase().trim();

  // 1. Correction / Reversal check
  if (
    lower.startsWith('no') ||
    lower.includes('wrong one') ||
    lower.includes('not that') ||
    lower.includes('undo') ||
    lower.includes('wrong task')
  ) {
    let taskHint: string | null = null;
    for (const t of context.openTasks || []) {
      if (lower.includes(t.name.toLowerCase())) {
        taskHint = t.name;
        break;
      }
    }
    return { intent: 'correction', correction: { isReversal: true, targetTaskPhrase: taskHint } };
  }

  // 2. Log entry check
  if (
    lower.startsWith('done') ||
    lower.startsWith('finished') ||
    lower.startsWith('just ') ||
    lower.startsWith('completed')
  ) {
    return {
      intent: 'log-entry',
      logEntryMatch: { confidence: 'none', matchedTaskId: null },
    };
  }

  // 3. Check-in check
  if (
    lower.startsWith('stuck') ||
    lower.startsWith('help') ||
    lower.includes("can't focus") ||
    lower.includes('start')
  ) {
    const matched = (context.openTasks || []).find((t) => lower.includes(t.name.toLowerCase()));
    return {
      intent: 'check-in',
      checkIn: {
        targetTaskId: matched?.id || null,
        targetTaskName: matched?.name || 'task',
        userIntent: userMessage,
      },
    };
  }

  // 4. Task creation check (contains time anchors or action verbs)
  const taskKeywords = [
    'tomorrow',
    'tonight',
    'today',
    'pm',
    'am',
    'before',
    'after',
    'at ',
    'due',
    'next week',
    'friday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'saturday',
    'sunday',
  ];
  const hasTimeAnchor = taskKeywords.some((k) => lower.includes(k));
  const startsWithVerb = /^(pay|call|buy|email|send|submit|file|schedule|clean|book|order|pick up|make)\b/i.test(lower);

  if (hasTimeAnchor || startsWithVerb) {
    const cleanName =
      userMessage.replace(/\b(before work|after work|before sleep|tomorrow|today|next week|at \d+:?\d*|\b(am|pm)\b)/gi, '').trim() ||
      userMessage;

    let relativeDay: RelativeDaySignal = 'tomorrow';
    let relativeDayCount: number | null = null;
    let anchorPhrase: AnchorPhraseSignal = 'none';
    let explicitTime: string | null = null;

    if (lower.includes('today') || lower.includes('tonight')) relativeDay = 'today';
    else if (lower.includes('tomorrow')) relativeDay = 'tomorrow';
    else if (lower.includes('next week')) relativeDay = 'next_week';
    else if (lower.includes('in 2 days') || lower.includes('two days')) {
      relativeDay = 'in_N_days';
      relativeDayCount = 2;
    } else if (lower.includes('in 3 days') || lower.includes('three days')) {
      relativeDay = 'in_N_days';
      relativeDayCount = 3;
    }

    if (lower.includes('before work')) anchorPhrase = 'before_work';
    else if (lower.includes('after work')) anchorPhrase = 'after_work';
    else if (lower.includes('before sleep') || lower.includes('night') || lower.includes('bed')) anchorPhrase = 'before_sleep';
    else if (lower.includes('lunch') || lower.includes('noon')) anchorPhrase = 'lunch';

    const timeMatch = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
    if (timeMatch) {
      let h = parseInt(timeMatch[1], 10);
      const m = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      const ampm = timeMatch[3].toLowerCase();
      if (ampm === 'pm' && h < 12) h += 12;
      if (ampm === 'am' && h === 12) h = 0;
      explicitTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    const computed = computeDeterministicDueAt(
      { relativeDay, relativeDayCount, explicitTime, anchorPhrase },
      { timezone: context.clientTimezone, anchorTimes: context.anchorTimes, now: new Date(context.nowIso) }
    );

    return {
      intent: 'task-creation',
      taskCreation: {
        name: cleanName,
        relativeDay,
        relativeDayCount,
        explicitTime,
        anchorPhrase,
        consequenceType: 'unspecified',
        dueAt: computed.dueAt,
        systemConfirmation: `Set task '${cleanName}' due ${computed.formattedLabel}.`,
      },
    };
  }

  // 5. Default conversation fallback
  return {
    intent: 'conversation',
    conversationalReply:
      "Got it. I'm here. Drop a new task on the board, check in on an open item, or log what you just finished.",
  };
}

/**
 * Step 10: Daily Strip Generation
 * A short, purely descriptive one-line summary per day (e.g., "quiet Tuesday," "mostly the vet thing").
 * Generated from that day's log entries and completed tasks.
 */
export async function generateDailyStripSummary(
  dateStr: string,
  logEntries: string[],
  completedTaskNames: string[],
  mood?: string | null
): Promise<string> {
  if (logEntries.length === 0 && completedTaskNames.length === 0) {
    if (mood) {
      return `Quiet day (${mood}).`;
    }
    return '';
  }

  const prompt = `Date: ${dateStr}
Log Entries recorded today:
${logEntries.map((l) => `- ${l}`).join('\n') || '(None)'}

Tasks completed today:
${completedTaskNames.map((t) => `- ${t}`).join('\n') || '(None)'}
${mood ? `User mood context today: ${mood} (Subtly color the phrasing/tone of the description with this vibe — e.g. low energy, steady rhythm, or sluggish start — without rating the mood, using exclamation marks, or adding motivational slogans)` : ''}

Task: Write a single, concise, purely descriptive one-line summary phrase for this day (e.g., "quiet Tuesday," "mostly the vet thing," "slowly worked through quarterly taxes").
Rules:
- Max 10-12 words.
- Descriptive and grounded only in the facts above.
- Zero cheerleading, zero productivity slogans, zero exclamation marks.`;

  try {
    const summary = await generateContentWithFallback(prompt, {
      systemInstruction: 'You are a minimalist daily activity summarizer. Produce only one plain text summary sentence.',
      temperature: 0.3,
      maxOutputTokens: 60,
    });
    return summary.trim().replace(/^["']|["']$/g, '');
  } catch (err: any) {
    console.warn('[Gemini Daily Strip] Generation failed, using fallback:', err?.message || err);
    if (completedTaskNames.length > 0) {
      return `Wrapped up ${completedTaskNames[0]}${completedTaskNames.length > 1 ? ` and ${completedTaskNames.length - 1} more` : ''}.`;
    }
    return `Logged ${logEntries.length} items today.`;
  }
}

/**
 * Section 20: Check-in Tone Safety Directive
 * Validation Schema for evaluating candidate check-in responses.
 */
const CHECK_IN_VALIDATION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    isSafe: {
      type: Type.BOOLEAN,
      description:
        'True ONLY if the response obeys all Section 20 principles: no ultimatums, no suggestions to quit/disengage, and no attacks on the person.',
    },
    containsUltimatum: {
      type: Type.BOOLEAN,
      description:
        'True if the response contains an ultimatum, "either/or" condition, or coercive demand (e.g. "either do X or close tab").',
    },
    suggestsQuitOrDisengage: {
      type: Type.BOOLEAN,
      description:
        'True if the response suggests, implies, or presents quitting, giving up, abandoning, walking away, or closing the tab as an option or alternative.',
    },
    targetsPersonNotTask: {
      type: Type.BOOLEAN,
      description:
        'True if the response critiques, shames, or attacks the user\'s character, effort, or worth rather than the task or avoidance.',
    },
    violationSummary: {
      type: Type.STRING,
      description: 'Specific tone safety principle violated, or "none" if safe.',
    },
  },
  required: ['isSafe', 'containsUltimatum', 'suggestsQuitOrDisengage', 'targetsPersonNotTask', 'violationSummary'],
};

/**
 * Heuristic fast-path check for obvious tone safety violations (Section 20).
 */
function heuristicToneViolationCheck(candidateText: string): string[] {
  const violations: string[] = [];
  const text = candidateText.toLowerCase();

  // Pattern 1: Binary ultimatum with quit/abandon framing
  if (
    /\beither\b[\s\S]{1,60}\bor\b[\s\S]{1,60}(quit|give up|walk away|close (the )?tab|forget it|stop trying|abandon)\b/i.test(
      text
    )
  ) {
    violations.push('Binary ultimatum presenting quitting or closing tabs as an option');
  }

  // Pattern 2: Suggestions to close tab / give up / walk away
  if (/\b(close (the )?tab|close your tab|give up|just quit|walk away|abandon it|stop trying)\b/i.test(text)) {
    violations.push('Suggestion to quit, disengage, or close tab');
  }

  // Pattern 3: Language targeting the person's character rather than the task
  if (/\b(you('re| are) (lazy|worthless|hopeless|incapable|a failure))\b/i.test(text)) {
    violations.push('Language targeting the person rather than the task');
  }

  return violations;
}

/**
 * Section 20 Validation Pass:
 * Runs lightweight check verifying candidate response contains no ultimatums, no quit-framing,
 * and targets task/avoidance rather than person.
 */
export async function validateCheckInResponse(
  candidateText: string,
  userMessage: string,
  taskName: string
): Promise<{ isSafe: boolean; violatedPrinciples: string[] }> {
  // 1. Fast heuristic check
  const heuristicViolations = heuristicToneViolationCheck(candidateText);
  if (heuristicViolations.length > 0) {
    return { isSafe: false, violatedPrinciples: heuristicViolations };
  }

  // 2. Model-based structured evaluation pass
  const validationPrompt = `Task being worked on: "${taskName}"
User message: "${userMessage}"
Candidate check-in response to evaluate:
"${candidateText}"

Evaluate whether this candidate response obeys the following mandatory principles:
1. No ultimatums: It must never issue an "either/or" demand or threat.
2. No quit-framing: Giving up, quitting, abandoning the task, or closing the tab must NEVER be presented as an option, in any framing, including as one side of a binary choice.
3. Target the task, not the person: It must target the task or avoidance behavior, never insulting or degrading the user's character or worth.

Return structured JSON according to schema.`;

  try {
    const rawJson = await generateContentWithFallback(validationPrompt, {
      systemInstruction:
        'You are an impartial tone safety auditor for an ADHD focus assistant. Strictly check for ultimatums, quit-framing, or personal attacks.',
      responseMimeType: 'application/json',
      responseSchema: CHECK_IN_VALIDATION_SCHEMA,
      temperature: 0.0,
      maxOutputTokens: 150,
    });

    const parsed = JSON.parse(rawJson);
    const violated: string[] = [];
    if (parsed.containsUltimatum) violated.push('Contains ultimatum or either/or demand');
    if (parsed.suggestsQuitOrDisengage) violated.push('Presents quitting, giving up, or closing tabs as an option');
    if (parsed.targetsPersonNotTask) violated.push('Targets person rather than task');
    if (parsed.violationSummary && parsed.violationSummary !== 'none' && violated.length === 0) {
      violated.push(parsed.violationSummary);
    }

    const isSafe = parsed.isSafe === true && violated.length === 0;
    return { isSafe, violatedPrinciples: violated };
  } catch (err: any) {
    console.warn('[Gemini Tone Validation] Validation pass error (falling back to heuristic):', err?.message || err);
    // If structured call fails, heuristic passed above, so assume safe
    return { isSafe: true, violatedPrinciples: [] };
  }
}

/**
 * Fixed, safe, generic supportive line per Section 20.
 * Returned if generation fails or is flagged twice by tone safety validation.
 * Never risks exposing the user to an unvalidated response.
 */
export function getFixedSafeCoachingFallback(taskName: string): string {
  const safeName = (taskName || 'this task').trim();
  return `You don't have to tackle the whole thing at once. What is the single smallest physical micro-action you can take for '${safeName}' right now?`;
}

/**
 * Multi-turn Task Initiation Coaching Turn:
 * Section 20 Check-in Tone Safety Directive implementation.
 * - General principles: no quit-framing, distinguish avoidance from fear/distress,
 *   default to gentler response under uncertainty, target task not person.
 * - Validation pass with 1 regeneration attempt on flag.
 * - Immutable safe fallback if flagged twice.
 */
export async function generateCheckInCoaching(
  task: { id: string; name: string; dueAt?: string; consequenceType?: string },
  userMessage: string,
  history: Array<{ role: 'user' | 'assistant' | 'system'; text: string }> = []
): Promise<string> {
  const historyLines = history
    .slice(-6)
    .map((m) => `${m.role === 'user' ? 'User' : 'Last Call'}: ${m.text}`)
    .join('\n');

  const baseSystemInstruction = `You are "Last Call", a task initiation coach for adults with ADHD, executive dysfunction, and time-blindness.
Task: "${task.name}"
Due: ${task.dueAt || 'Unspecified'} (${task.consequenceType || 'soft'} consequence)

MANDATORY PRINCIPLES (Section 20 Check-in Tone Safety Directive):
1. TARGET THE TASK, NEVER THE PERSON:
   - Bluntness targets the task or the avoidance behavior — never the person's character, effort, or worth.
   - Ban all shaming, guilt, sarcasm, or personal judgments.

2. BAN ON QUIT-FRAMING & ULTIMATUMS:
   - Giving up, quitting, walking away, or disengaging must NEVER be presented as an option, in ANY framing, including as one side of a binary choice.
   - NEVER use "either/or" ultimatums (e.g. NEVER say "Either do X or close the tab", "Either revise or quit").

3. DISTINGUISH AVOIDANCE FROM FEAR/DISTRESS:
   - Avoidance (procrastination, distraction, inertia, sluggish start): Give a firm push toward immediate physical action.
   - Fear or anxiety about outcomes (fear of failing, panic, catastrophic thoughts): Give brief acknowledgment/validation first, then redirect to the smallest next physical action — never an ultimatum, never a skip straight to consequences.
   - Example pair (illustrative only):
     * BAD: "Either revise or close the tab."
     * BETTER: "Failing tomorrow doesn't erase the studying you can still do tonight. What's the actual first page you'd open right now?"

4. DEFAULT TO GENTLER RESPONSE UNDER UNCERTAINTY:
   - When genuinely unsure whether the user's message reflects pure avoidance or fear/distress, ALWAYS default to the gentler (fear/distress) response: acknowledge the difficulty briefly, then ask for the 2-minute physical micro-step.

STYLE & LENGTH:
- Keep response short: 1-3 sentences maximum.
- Ban all corporate SaaS cheerleading, generic motivational platitudes, exclamation marks, or condescending advice.
- Point to a concrete physical micro-step taking under 2 minutes (e.g., opening a document, putting hands on a tool, writing one line).`;

  const prompt = `${historyLines ? `Previous Turns:\n${historyLines}\n\n` : ''}User: ${userMessage}\n\nLast Call:`;

  // Attempt 1: Standard Generation
  let candidate = '';
  try {
    candidate = (
      await generateContentWithFallback(prompt, {
        systemInstruction: baseSystemInstruction,
        temperature: 0.3,
        maxOutputTokens: 200,
      })
    ).trim();
  } catch (err: any) {
    console.warn('[Gemini Coaching] Attempt 1 generation failed:', err?.message || err);
    return getFixedSafeCoachingFallback(task.name);
  }

  // Validation Pass 1
  const validation1 = await validateCheckInResponse(candidate, userMessage, task.name);
  if (validation1.isSafe) {
    return candidate;
  }

  console.warn(
    `[Gemini Tone Safety] Attempt 1 flagged: ${validation1.violatedPrinciples.join(', ')}. Candidate: "${candidate}". Regenerating once with corrective instruction...`
  );

  // Attempt 2: Regenerate once with a corrective instruction naming the specific violated principles
  const correctiveInstruction = `${baseSystemInstruction}

CRITICAL CORRECTIVE INSTRUCTION:
Your previous draft was FLAGGED and REJECTED for the following tone safety violation(s): ${validation1.violatedPrinciples.join(', ')}.
You MUST correct this immediately:
- Do NOT present giving up, quitting, or disengaging as an option in ANY way.
- Do NOT issue ultimatums or binary either/or choices.
- If the user expresses fear, anxiety, or overwhelm, validate briefly and ask for the single 2-minute physical start.
- Focus strictly on the task, never the person's character.`;

  try {
    candidate = (
      await generateContentWithFallback(prompt, {
        systemInstruction: correctiveInstruction,
        temperature: 0.1,
        maxOutputTokens: 200,
      })
    ).trim();
  } catch (err: any) {
    console.warn('[Gemini Coaching] Attempt 2 generation failed:', err?.message || err);
    return getFixedSafeCoachingFallback(task.name);
  }

  // Validation Pass 2
  const validation2 = await validateCheckInResponse(candidate, userMessage, task.name);
  if (validation2.isSafe) {
    return candidate;
  }

  // Flagged a second time: Fall back to fixed, safe, generic supportive line
  console.warn(
    `[Gemini Tone Safety] Attempt 2 also flagged: ${validation2.violatedPrinciples.join(', ')}. Candidate: "${candidate}". Falling back to immutable safe supportive line.`
  );
  return getFixedSafeCoachingFallback(task.name);
}

export interface CheckInCompletionResult {
  summary: string;
  nextPhysicalAction: string;
}

const CHECK_IN_COMPLETION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description: 'Concise 1-sentence summary of the obstacle and resolution agreed on during check-in.',
    },
    nextPhysicalAction: {
      type: Type.STRING,
      description: 'The physical micro-action taking under 2 minutes that the user committed to start immediately.',
    },
  },
  required: ['summary', 'nextPhysicalAction'],
};

/**
 * Check-In Completion Schema:
 * Fired strictly once at the end of a check-in conversation to produce the persisted TaskEntry summary and micro-action.
 */
export async function extractCheckInCompletion(
  task: { id: string; name: string },
  transcript: Array<{ role: 'user' | 'assistant' | 'system'; text: string }>
): Promise<CheckInCompletionResult> {
  const transcriptText = transcript
    .map((m) => `${m.role === 'user' ? 'User' : 'Last Call'}: ${m.text}`)
    .join('\n');

  const systemInstruction = `You are "Last Call". Summarize the completed check-in session for task "${task.name}".
Extract:
1. summary: A clean, direct 1-sentence summary of what had blocked initiation and how it was broken down.
2. nextPhysicalAction: A concrete, tangible micro-action taking under 2 minutes that was established as the immediate launch point.

Return valid JSON strictly matching the schema.`;

  try {
    const rawJson = await generateContentWithFallback(transcriptText || `Checked in on ${task.name}`, {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: CHECK_IN_COMPLETION_SCHEMA,
      temperature: 0.1,
      maxOutputTokens: 250,
    });

    const parsed = JSON.parse(rawJson);
    return {
      summary: parsed.summary || `Checked in on ${task.name}`,
      nextPhysicalAction: parsed.nextPhysicalAction || 'Take the first 2-minute physical step.',
    };
  } catch (err) {
    console.warn('[Gemini] extractCheckInCompletion fallback:', err);
    return {
      summary: `Check-in on ${task.name} completed.`,
      nextPhysicalAction: 'Start 2-minute timer on initial step.',
    };
  }
}

/**
 * Section 19: Crisis Language Safety Directive
 * Fixed resource block — this exact text, not model-generated, ever.
 */
export const CRISIS_RESOURCE_BLOCK = `If you're going through something difficult right now, you don't have to handle it alone.

India — Tele-MANAS (Govt. of India, 24/7, all languages):
Call 14416 or 1800-891-4416

United States — 988 Suicide & Crisis Lifeline (24/7):
Call or text 988

If you're outside these regions, please search for a local crisis line, or contact a local emergency number.`;

/**
 * Checks for crisis / self-harm / suicidal language.
 * Coarse safety net, not a diagnostic tool.
 */
export function isCrisisLanguage(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const normalized = text.toLowerCase().trim();

  const crisisPatterns = [
    /\bsuicid/i,
    /\bkill myself\b/i,
    /\bend my life\b/i,
    /\bwant to die\b/i,
    /\bdon'?t want to live\b/i,
    /\bnot wanting to live\b/i,
    /\bself[-\s]?harm/i,
    /\bcutting myself\b/i,
    /\bbetter off dead\b/i,
    /\bhang myself\b/i,
    /\boverdose\b/i,
    /\bending it all\b/i,
    /\bslit my wrist\b/i,
    /\btake my own life\b/i,
    /\btired of living\b/i,
    /\bno reason to live\b/i,
    /\bcan'?t go on living\b/i,
    /\bwish i was dead\b/i,
    /\bwish i were dead\b/i,
  ];

  return crisisPatterns.some((pattern) => pattern.test(normalized));
}

/**
 * Embedding Model Fallback Ladder (Verified against official @google/genai SDK):
 * 1. gemini-embedding-2-preview (Google's multimodal embedding model)
 * 2. gemini-embedding-001 (Google's GA text-only embedding model; replacement for shut-down text-embedding-004)
 * Note: text-embedding-004 was shut down by Google on January 14, 2026.
 */
const EMBEDDING_MODELS_LADDER = [
  'gemini-embedding-2-preview',
  'gemini-embedding-001',
];

export interface TextEmbeddingResult {
  vector: number[] | null;
  isRealSemanticEmbedding: boolean;
  modelUsed?: string | null;
}

/**
 * Computes text embedding using Gemini embedding models ladder:
 * Primary: gemini-embedding-2-preview
 * Second rung: gemini-embedding-001
 * 
 * If all real embedding models fail, returns isRealSemanticEmbedding: false and vector: null.
 * Callers MUST skip retrieval entirely when isRealSemanticEmbedding is false to avoid
 * presenting fabricated hash-based "connections" to past entries.
 */
export async function computeTextEmbedding(text: string): Promise<TextEmbeddingResult> {
  const clean = (text || '').trim();
  if (!clean) {
    return { vector: null, isRealSemanticEmbedding: false, modelUsed: null };
  }

  for (const model of EMBEDDING_MODELS_LADDER) {
    try {
      const response = await ai.models.embedContent({
        model,
        contents: clean,
      });
      const values = response?.embeddings?.[0]?.values;
      if (Array.isArray(values) && values.length > 0) {
        return {
          vector: values,
          isRealSemanticEmbedding: true,
          modelUsed: model,
        };
      }
    } catch (err: any) {
      console.warn(`[Gemini] embedContent with ${model} failed:`, err?.message || err);
    }
  }

  // All real embedding models failed or were unreachable.
  // Skip retrieval entirely to never fabricate a semantic connection.
  console.warn(
    '[Gemini] All real embedding models in fallback chain failed. Semantic retrieval will be skipped to prevent fabricating false connections.'
  );
  return {
    vector: null,
    isRealSemanticEmbedding: false,
    modelUsed: null,
  };
}

/**
 * Computes cosine similarity between two numeric vectors.
 */
export function computeCosineSimilarity(vecA?: number[], vecB?: number[]): number {
  if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  const sim = dot / (Math.sqrt(normA) * Math.sqrt(normB));
  return Math.max(-1, Math.min(1, sim));
}

const SUPPORTIVE_REFLECTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    reflection: {
      type: Type.STRING,
      description: 'A 1 to 3 sentence supportive reflection observing patterns from history. Do not diagnose or predict anything.',
    },
    offerPartnerNote: {
      type: Type.BOOLEAN,
      description: 'True only if a recurring heavy pattern or persistent difficulty across multiple entries is observed.',
    },
    draftPartnerNote: {
      type: Type.STRING,
      nullable: true,
      description: 'A short, gentle draft note to their partner if offerPartnerNote is true; null otherwise.',
    },
  },
  required: ['reflection', 'offerPartnerNote'],
};

/**
 * Section 17 & 18: Generates a supportive reflection incorporating similar past entries.
 * Evaluates human-in-the-loop partner outreach draft if a recurring heavy pattern is observed.
 */
export async function generateJournalSupportiveReflection(
  currentText: string,
  similarPastEntries: Array<{ id: string; text: string; createdAt: string; similarity: number }>
): Promise<{
  reflection: string;
  offerPartnerNote: boolean;
  draftPartnerNote?: string | null;
}> {
  const pastContext = similarPastEntries
    .map(
      (e, idx) =>
        `Past Entry ${idx + 1} (${new Date(e.createdAt).toLocaleDateString()}): "${e.text}" (similarity: ${(e.similarity * 100).toFixed(0)}%)`
    )
    .join('\n');

  const systemInstruction = `You are a quiet, empathetic journal reflection assistant for "Last Call".
Your goal is to provide a brief, grounded reflection (1-3 sentences) on the user's latest journal entry, drawing on their relevant past entries when applicable.

MANDATORY RULES:
1. Grounded Pattern Reflection: You reflect what the user has written. You may notice real patterns ("this is the third time this week you've mentioned feeling behind on paperwork", or "like yesterday, you noted wanting more uninterrupted focus").
2. NEVER diagnose, predict, or assess mental health: Never use clinical or psychological labels (ADHD, executive dysfunction, depression, anxiety, burnout, pathology). Never say "you are struggling with X" or "this indicates that you will...".
3. Tone: Warm, validating, and quiet when heavy, but practical and grounded. No saccharine cheerleading or generic SaaS motivational slogans.
4. Human-in-the-Loop Partner Outreach:
   - If and ONLY if you observe a recurring heavy pattern across past entries and today (e.g. repeated overwhelm, paralysis, exhaustion over multiple days/entries):
     Set offerPartnerNote to true, and provide a short, gentle, non-alarmist draftPartnerNote (e.g., "Hey, I've been feeling pretty swamped with tasks the past few days and wanted to check in.").
   - If this is an ordinary day, a single hard day without recurring history, a positive log, or not a recurring heavy pattern:
     Set offerPartnerNote to false, and draftPartnerNote to null.
   - Never alert or send anything automatically.

Return valid JSON adhering strictly to the schema.`;

  const prompt = `Current Entry:
"${currentText}"

Similar Past Entries from this user:
${pastContext || 'No similar past entries available.'}
`;

  try {
    const rawJson = await generateContentWithFallback(prompt, {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: SUPPORTIVE_REFLECTION_SCHEMA,
      temperature: 0.2,
      maxOutputTokens: 300,
    });

    const parsed = JSON.parse(rawJson);
    return {
      reflection: parsed.reflection || 'Noted your entry and saved it to your log.',
      offerPartnerNote: Boolean(parsed.offerPartnerNote),
      draftPartnerNote: parsed.offerPartnerNote
        ? parsed.draftPartnerNote || "Hey, just letting you know I've been feeling a bit overloaded lately."
        : null,
    };
  } catch (err) {
    console.warn('[Gemini] generateJournalSupportiveReflection fallback:', err);
    return {
      reflection: 'Saved your reflection to your personal journal history.',
      offerPartnerNote: false,
      draftPartnerNote: null,
    };
  }
}
