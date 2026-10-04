import { isFieldKey } from "../fields";
import { contextNotes, runRules } from "../rules";
import type { AiFlagPayload, AiReviewResult, Assessment, FieldKey, Flag } from "../types";
import { cannedReview, hasCanned } from "./canned";
import { SYSTEM_PROMPT, buildPayload, buildUserMessage, type PromptPayload } from "./prompt";
import { AI_FIELD_KEYS, AiResponseSchema, GEMINI_RESPONSE_SCHEMA, type AiResponse } from "./schema";

export const DEFAULT_MODEL = "gemini-3.5-flash-lite";
/** Used for the retry when the main model is rate limited; each model has its own free quota. */
export const FALLBACK_MODEL = "gemini-3.1-flash-lite";
export const UNAVAILABLE = "AI review unavailable, rule checks only.";

export interface ReviewDeps {
  apiKey?: string;
  model?: string;
  fallbackModel?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * A last line of defence behind the prompt. Anything that reads like a score,
 * a stated cause, or health advice is dropped rather than shown.
 */
const POLICY_PATTERNS: RegExp[] = [
  /\b(health|quality|pollution)\s+(score|rating|grade|index)\b/i,
  /\b\d+(\.\d+)?\s*(\/|out of)\s*(5|10|100)\b/i,
  /\b(un)?safe\s+(to|for)\b/i,
  /\b(do not|don't|avoid|should not|shouldn't|never)\s+(swim|drink|touch|bathe|paddle|wade|let)/i,
  /\b(see|consult|visit)\s+a\s+(doctor|physician|vet)\b/i,
  /\b(is|are|was|were)\s+(caused by|due to|contaminated|polluted)\b/i,
  /\b(wrong|incorrect|mistaken|a mistake)\b/i,
];

export function violatesPolicy(text: string): boolean {
  return POLICY_PATTERNS.some((p) => p.test(text));
}

function fieldSetKey(fields: string[]): string {
  return [...fields].sort().join("|");
}

const normalise = (text: string) => text.toLowerCase().replace(/\s+/g, " ");

/**
 * Grounding check: the AI may only refer to what was submitted. Anything it
 * puts in quotation marks, and every number it mentions, must appear in the
 * answers it was shown. A flag that fails is treated as invented and dropped.
 */
export function isGrounded(text: string, payload: PromptPayload): boolean {
  const corpus = normalise(payload.answers.map((a) => `${a.question} ${a.answer}`).join(" \n "));
  const quoted = [...text.matchAll(/"([^"]{2,})"|\u201c([^\u201d]{2,})\u201d/g)].map((m) => m[1] ?? m[2]);
  for (const quote of quoted) {
    if (!corpus.includes(normalise(quote).replace(/[.,;:!?]+$/, ""))) return false;
  }
  const known = new Set(corpus.match(/\d+(?:\.\d+)?/g) ?? []);
  for (const number of text.match(/\d+(?:\.\d+)?/g) ?? []) {
    if (!known.has(number)) return false;
  }
  return true;
}

export interface Sanitised {
  flags: AiFlagPayload[];
  summary: string | null;
  /** How many of the model's flags the guards removed. */
  dropped: number;
}

/**
 * Keep only flags that point at real, visible fields, obey the policy, stay
 * grounded in the submitted answers (when a payload is given), and add
 * something new.
 */
export function sanitise(response: AiResponse, ruleFlags: Flag[], payload?: PromptPayload): Sanitised {
  const ruleSets = new Set(ruleFlags.map((f) => fieldSetKey(f.fields)));
  const seen = new Set<string>();
  const flags: AiFlagPayload[] = [];
  for (const flag of response.flags) {
    const fields = Array.from(new Set(flag.fields)).filter(
      (k): k is FieldKey => isFieldKey(k) && AI_FIELD_KEYS.includes(k),
    );
    if (fields.length === 0) continue;
    const text = `${flag.concern} ${flag.why} ${flag.question}`;
    if (violatesPolicy(text)) continue;
    if (payload && !isGrounded(text, payload)) continue;
    const key = fieldSetKey(fields);
    if (ruleSets.has(key) || seen.has(key)) continue;
    seen.add(key);
    flags.push({ ...flag, fields });
  }
  const summaryOk = !violatesPolicy(response.summary) && (!payload || isGrounded(response.summary, payload));
  return { flags, summary: summaryOk ? response.summary : null, dropped: response.flags.length - flags.length };
}

/** Parse and validate the model's raw text. Throws on anything that is not the agreed shape. */
export function parseResponse(text: string): AiResponse {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return AiResponseSchema.parse(JSON.parse(trimmed));
}

class GeminiError extends Error {
  constructor(readonly status: number) {
    super(`Gemini responded with HTTP ${status}`);
  }
}

async function callGemini(userMessage: string, deps: Required<Pick<ReviewDeps, "apiKey" | "model" | "fetchImpl" | "timeoutMs">>): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(deps.model)}:generateContent`;
  const response = await deps.fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": deps.apiKey },
    signal: AbortSignal.timeout(deps.timeoutMs),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: userMessage }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: GEMINI_RESPONSE_SCHEMA,
      },
    }),
  });
  if (!response.ok) throw new GeminiError(response.status);
  const data = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
  if (!text) throw new Error("Gemini returned no text");
  return text;
}

export const MAX_ATTEMPTS = 2;

/**
 * Layer 2. Returns flags for the volunteer to consider. It never returns a
 * changed assessment, and it never throws: every failure ends in rule checks
 * only, with a notice the volunteer can read.
 */
export async function reviewAssessment(
  input: { assessment: Assessment; seedId?: string },
  deps: ReviewDeps = {},
): Promise<AiReviewResult> {
  const { assessment, seedId } = input;
  const ruleFlags = runRules(assessment);

  if (!deps.apiKey) {
    if (hasCanned(seedId)) {
      const canned = cannedReview(seedId, assessment);
      const clean = sanitise(canned, ruleFlags, buildPayload(assessment, ruleFlags, []));
      return {
        mode: "demo",
        flags: clean.flags,
        summary: clean.summary,
        notice: "Demo mode: no AI key is set, so this is a prepared example response for the built-in sample.",
      };
    }
    return {
      mode: "unavailable",
      flags: [],
      summary: null,
      notice: `${UNAVAILABLE} No AI key is set on this server (demo mode).`,
    };
  }

  const settings = {
    apiKey: deps.apiKey,
    model: deps.model || DEFAULT_MODEL,
    fetchImpl: deps.fetchImpl ?? fetch,
    timeoutMs: deps.timeoutMs ?? 20_000,
  };
  const payload = buildPayload(assessment, ruleFlags, contextNotes(assessment));
  const message = buildUserMessage(payload);

  let model = settings.model;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const parsed = parseResponse(await callGemini(message, { ...settings, model }));
      const clean = sanitise(parsed, ruleFlags, payload);
      return { mode: "live", flags: clean.flags, summary: clean.summary, model, dropped: clean.dropped };
    } catch (error) {
      console.warn(`AI review attempt ${attempt} (${model}) failed:`, error instanceof Error ? error.message : error);
      // Rate limited or overloaded: retrying the same model would fail again, so try the other one.
      if (error instanceof GeminiError && (error.status === 429 || error.status === 503)) {
        model = deps.fallbackModel || FALLBACK_MODEL;
      }
    }
  }
  return {
    mode: "failed",
    flags: [],
    summary: null,
    model: settings.model,
    notice: `${UNAVAILABLE} The AI did not give a usable answer, even after one retry.`,
  };
}
