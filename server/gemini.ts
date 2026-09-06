import { GoogleGenAI, Type } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Resilient Model Fallback Ladder per directives
const MODEL_FALLBACK_LADDER = [
  'gemini-3.6-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
  'gemini-3.7-flash',
];

export async function generateContentWithFallback(
  contents: any,
  options: {
    systemInstruction?: string;
    responseMimeType?: string;
    responseSchema?: any;
    temperature?: number;
  } = {}
): Promise<string> {
  let lastError: any = null;

  for (const modelName of MODEL_FALLBACK_LADDER) {
    try {
      const config: any = {};
      if (options.systemInstruction) config.systemInstruction = options.systemInstruction;
      if (options.responseMimeType) config.responseMimeType = options.responseMimeType;
      if (options.responseSchema) config.responseSchema = options.responseSchema;
      if (options.temperature !== undefined) config.temperature = options.temperature;

      const response = await ai.models.generateContent({
        model: modelName,
        contents,
        config,
      });

      if (response && response.text) {
        return response.text;
      }
    } catch (err: any) {
      lastError = err;
      const errMsg = err?.message || String(err);
      console.warn(`[Gemini Fallback] Model ${modelName} failed: ${errMsg}. Attempting next ladder step...`);
      // Continues to next model in fallback ladder
    }
  }

  throw new Error(`All Gemini models in fallback ladder exhausted. Last error: ${lastError?.message || lastError}`);
}

export const CHECK_IN_SYSTEM_INSTRUCTION = `You are "Last Call", an ADHD task-initiation assistant for people struggling with executive dysfunction, procrastination, and time-blindness.
Your mission is NARROWLY scoped: identify what is actually stopping the user from starting their task RIGHT NOW.
Tone guidelines:
- Blunt and slightly irreverent toward the avoidance, but NEVER shaming or hostile toward the person.
- Zero generic life coaching, motivational slogans, or corporate productivity fluff.
- Be concise (2-4 sentences per response). This is a tight check-in, not an endless therapy session.
- Cut straight to the friction: Sensory overload? Perfectionism paralysis? Can't find the file? Missing step 1? Phone glued to hand? Avoidance location like staying in bed?
- Give ONE ultra-low-friction micro-action to cross the activation threshold (e.g. "Open the document and type one terrible sentence," or "Get out of bed and drink half a glass of cold water before opening the laptop").
- Push them to commit to the immediate next 5 minutes.`;

export interface StructuredCheckInResult {
  category: string;
  riskLevel: 'low' | 'medium' | 'critical';
  summary: string;
  actionItems: string[];
  flaggedForReview?: boolean;
}

const STRUCTURED_EXTRACTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    category: {
      type: Type.STRING,
      description: 'The primary blocker category (e.g., sensory overload, task ambiguity, perfectionism, physical fatigue, transition resistance, environmental distraction).',
    },
    riskLevel: {
      type: Type.STRING,
      enum: ['low', 'medium', 'critical'],
      description: 'The urgency and risk of missing the deadline. Critical if hours away with zero progress, medium if looming and stuck, low if minor hesitation.',
    },
    summary: {
      type: Type.STRING,
      description: 'A punchy 1-2 sentence summary of the exact friction and agreed start plan.',
    },
    actionItems: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '1 to 3 tiny immediate concrete physical micro-actions.',
    },
  },
  required: ['category', 'riskLevel', 'summary', 'actionItems'],
};

export const COMPLETE_FALLBACK_OBJECT: StructuredCheckInResult = {
  category: 'general',
  riskLevel: 'low',
  summary: 'Summary unavailable — flagged for review.',
  actionItems: [],
  flaggedForReview: true,
};

export async function extractStructuredSummary(
  deadlineName: string,
  dueAt: string,
  locationTag: string,
  conversation: Array<{ role: string; text: string }>
): Promise<StructuredCheckInResult> {
  const formattedTranscript = conversation
    .map((m) => `${m.role === 'user' ? 'User' : 'Coach'}: ${m.text}`)
    .join('\n');

  const extractionPrompt = `Analyze this ADHD task-initiation check-in for deadline: "${deadlineName}" (Due: ${dueAt}, Location: "${locationTag}").
Extract the structured output according to the schema.
Transcript:
${formattedTranscript}`;

  // Attempt 1: Schema-constrained call
  try {
    const rawText = await generateContentWithFallback(extractionPrompt, {
      systemInstruction: 'You are a structured extraction engine for ADHD focus check-ins. Return only valid JSON adhering strictly to the schema.',
      responseMimeType: 'application/json',
      responseSchema: STRUCTURED_EXTRACTION_SCHEMA,
      temperature: 0.1,
    });

    const parsed = JSON.parse(rawText);
    if (validateStructuredOutput(parsed)) {
      return parsed;
    }
  } catch (err) {
    console.warn('[Structured Extraction] Attempt 1 failed:', err);
  }

  // Attempt 2: Stricter instruction retry
  try {
    const retryPrompt = `CRITICAL: The previous JSON output failed validation or parsing. Return ONLY a valid JSON object with EXACT keys: "category", "riskLevel" ("low"|"medium"|"critical"), "summary", "actionItems" (array of strings). Do not include markdown codeblocks or extra text.
Deadline: "${deadlineName}" (Due: ${dueAt}, Location: "${locationTag}")
Transcript:
${formattedTranscript}`;

    const retryText = await generateContentWithFallback(retryPrompt, {
      systemInstruction: 'Return strict JSON with fields: category, riskLevel, summary, actionItems. No markdown, no preface.',
      responseMimeType: 'application/json',
      temperature: 0.0,
    });

    const parsedRetry = JSON.parse(retryText);
    if (validateStructuredOutput(parsedRetry)) {
      return parsedRetry;
    }
  } catch (retryErr) {
    console.warn('[Structured Extraction] Retry failed:', retryErr);
  }

  // Complete fallback object with every field populated and flagged for review
  console.warn('[Structured Extraction] Falling back to complete fallback object.');
  return { ...COMPLETE_FALLBACK_OBJECT };
}

function validateStructuredOutput(obj: any): obj is StructuredCheckInResult {
  if (!obj || typeof obj !== 'object') return false;
  if (typeof obj.category !== 'string' || !obj.category.trim()) return false;
  if (!['low', 'medium', 'critical'].includes(obj.riskLevel)) return false;
  if (typeof obj.summary !== 'string' || !obj.summary.trim()) return false;
  if (!Array.isArray(obj.actionItems)) return false;
  return true;
}
