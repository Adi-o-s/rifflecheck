import { REVIEW_STEP, emptyAssessment, toLocalInput } from "./fields";
import { contextNotes, isRequiredFlag, runRules } from "./rules";
import { summariseAnswers } from "./summary";
import type {
  AiReviewResult,
  Assessment,
  AssessmentRecord,
  FieldKey,
  Flag,
  Snapshot,
  Source,
  TrackedFlag,
} from "./types";

/**
 * The human-in-the-loop state machine. Every function here is pure: it takes a
 * record and returns a new one. Nothing in this file ever writes to
 * `record.assessment`; only the volunteer's own input does that.
 */

export const KEEP_REASONS = [
  "I double-checked on site and it is correct",
  "It is explained in my notes",
  "The answer options do not fit what I see",
  "I cannot re-check right now",
] as const;

export const MIN_REASON_LENGTH = 3;

export function newRecord(id: string, now: Date, seedId?: string): AssessmentRecord {
  const iso = now.toISOString();
  return {
    id,
    seedId,
    status: "draft",
    createdAt: iso,
    updatedAt: iso,
    step: 1,
    assessment: emptyAssessment(toLocalInput(now)),
    flags: [],
    ai: { status: "idle" },
    contextNotes: [],
  };
}

export function snapshot(a: Assessment, fields: FieldKey[]): Snapshot {
  const out: Snapshot = {};
  // The photo is a large data URL; record only whether one was attached.
  for (const key of fields) out[key] = key === "photo" ? (a.photo ? "attached" : null) : a[key];
  return out;
}

function same(x: Snapshot, y: Snapshot): boolean {
  return JSON.stringify(x) === JSON.stringify(y);
}

export function fingerprint(a: Assessment): string {
  const { photo, ...rest } = a;
  void photo;
  const text = JSON.stringify(rest);
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

export type Raise = "none" | "errors" | "all";

/**
 * Bring the tracked flags in line with the current answers.
 *
 * - A tracked rule flag whose rule no longer fires was fixed by the volunteer.
 * - A kept rule flag whose answers changed but still conflict is reopened.
 * - A tracked AI flag is fixed once the volunteer changes one of its fields.
 * - New rule flags are added only when `raise` says the volunteer has now been
 *   shown them (errors on "Next", everything on the review screen).
 */
export function syncFlags(record: AssessmentRecord, now: Date, raise: Raise): AssessmentRecord {
  const a = record.assessment;
  const iso = now.toISOString();
  const active = new Map(
    runRules(a, now)
      .filter((f) => !isRequiredFlag(f))
      .map((f) => [f.id, f]),
  );

  const flags = record.flags.map((tracked): TrackedFlag => {
    // "Fixed" keeps the time of the first change, but `after` always follows the
    // form, so the audit trail shows the final answer and not a half-finished edit.
    const fixed = (fields: FieldKey[]): TrackedFlag => ({
      ...tracked,
      decision: "fixed",
      reason: undefined,
      decidedAt: tracked.decision === "fixed" ? tracked.decidedAt : iso,
      after: snapshot(a, fields),
    });
    const reopened: TrackedFlag = {
      ...tracked,
      decision: undefined,
      reason: undefined,
      decidedAt: undefined,
      after: undefined,
    };

    if (tracked.source === "ai") {
      const changed = !same(snapshot(a, tracked.fields), tracked.before);
      if (changed) return fixed(tracked.fields);
      // The volunteer put the original answers back, so the question is open again.
      return tracked.decision === "fixed" ? reopened : tracked;
    }

    const current = active.get(tracked.id);
    const trackedFields = Object.keys(tracked.before) as FieldKey[];
    if (!current) return fixed(trackedFields);
    // The rule fires (again). Refresh its wording, and reopen it if the answers
    // it was decided on are no longer the answers on the form.
    const refreshed: TrackedFlag = { ...tracked, ...current };
    const decidedOn = tracked.decision === "kept" ? tracked.after : undefined;
    const stillDecided = decidedOn && same(snapshot(a, Object.keys(decidedOn) as FieldKey[]), decidedOn);
    if (stillDecided) return refreshed;
    const allFields = Array.from(new Set([...trackedFields, ...current.fields]));
    return {
      ...refreshed,
      before: tracked.decision ? snapshot(a, allFields) : { ...snapshot(a, current.fields), ...tracked.before },
      decision: undefined,
      reason: undefined,
      decidedAt: undefined,
      after: undefined,
    };
  });

  if (raise !== "none") {
    const known = new Set(flags.map((f) => f.id));
    for (const flag of active.values()) {
      if (known.has(flag.id)) continue;
      if (raise === "errors" && flag.severity !== "error") continue;
      flags.push({ ...flag, raisedAt: iso, before: snapshot(a, flag.fields) });
    }
  }

  return { ...record, flags };
}

export function updateAssessment(
  record: AssessmentRecord,
  patch: Partial<Assessment>,
  now: Date,
): AssessmentRecord {
  const next = { ...record, assessment: { ...record.assessment, ...patch }, updatedAt: now.toISOString() };
  return syncFlags(next, now, record.step === REVIEW_STEP ? "all" : "none");
}

export type KeepResult = { ok: true; record: AssessmentRecord } | { ok: false; error: string };

export function keepAnswer(record: AssessmentRecord, flagId: string, reason: string, now: Date): KeepResult {
  const flag = record.flags.find((f) => f.id === flagId);
  if (!flag) return { ok: false, error: "That flag no longer applies." };
  if (flag.severity === "error") {
    return { ok: false, error: "This one has to be fixed before the assessment can be submitted." };
  }
  const trimmed = reason.trim();
  if (trimmed.length < MIN_REASON_LENGTH) {
    return { ok: false, error: "Please give a short reason for keeping your answer." };
  }
  const iso = now.toISOString();
  const flags = record.flags.map((f) =>
    f.id === flagId
      ? { ...f, decision: "kept" as const, reason: trimmed, decidedAt: iso, after: snapshot(record.assessment, f.fields) }
      : f,
  );
  return { ok: true, record: { ...record, flags, updatedAt: iso } };
}

/** Lets the volunteer change their mind about a "keep" before submitting. */
export function reopenFlag(record: AssessmentRecord, flagId: string, now: Date): AssessmentRecord {
  const flags = record.flags.map((f) =>
    f.id === flagId && f.decision === "kept"
      ? { ...f, decision: undefined, reason: undefined, decidedAt: undefined, after: undefined }
      : f,
  );
  return { ...record, flags, updatedAt: now.toISOString() };
}

function fieldSetKey(fields: FieldKey[]): string {
  return [...fields].sort().join("|");
}

/**
 * Store the outcome of an AI review. Undecided flags from an earlier AI review
 * are replaced; decided ones stay in the audit trail. An AI flag is dropped if
 * it only repeats a rule flag or something the volunteer already chose to keep.
 */
export function applyAiReview(record: AssessmentRecord, result: AiReviewResult, now: Date): AssessmentRecord {
  const iso = now.toISOString();
  const a = record.assessment;
  // A review that did not run tells us nothing new, so earlier AI flags stay.
  const ran = result.mode === "live" || result.mode === "demo";
  const kept = record.flags.filter((f) => !ran || f.source !== "ai" || f.decision);
  const seen = new Set(
    kept
      .filter((f) => f.source === "rule" || (f.decision === "kept" && same(snapshot(a, f.fields), f.after ?? {})))
      .map((f) => fieldSetKey(f.fields)),
  );
  const added: TrackedFlag[] = [];
  result.flags.forEach((f, i) => {
    const key = fieldSetKey(f.fields);
    if (seen.has(key)) return;
    seen.add(key);
    added.push({
      id: `ai:${iso}:${i}`,
      source: "ai",
      severity: "check",
      fields: f.fields,
      concern: f.concern,
      why: f.why,
      question: f.question,
      confidence: f.confidence,
      raisedAt: iso,
      before: snapshot(a, f.fields),
    });
  });
  return {
    ...record,
    flags: [...kept, ...added],
    ai: {
      status: "done",
      mode: result.mode,
      notice: result.notice,
      model: result.model,
      reviewedAt: iso,
      inputHash: fingerprint(a),
    },
    summary: result.summary ? { text: result.summary, source: "ai" } : ran ? undefined : record.summary,
    updatedAt: iso,
  };
}

export interface SubmitCheck {
  errors: Flag[];
  undecided: TrackedFlag[];
  aiPending: boolean;
  ok: boolean;
}

export function submitCheck(record: AssessmentRecord, now: Date): SubmitCheck {
  const errors = runRules(record.assessment, now).filter((f) => f.severity === "error");
  const undecided = record.flags.filter((f) => !f.decision && f.severity !== "error");
  const aiPending = record.ai.status === "idle";
  return { errors, undecided, aiPending, ok: errors.length === 0 && undecided.length === 0 && !aiPending };
}

export type SubmitResult = { ok: true; record: AssessmentRecord } | { ok: false; check: SubmitCheck };

export function submit(record: AssessmentRecord, now: Date): SubmitResult {
  const synced = syncFlags(record, now, "all");
  const check = submitCheck(synced, now);
  if (!check.ok) return { ok: false, check };
  const iso = now.toISOString();
  // An AI summary written before the volunteer changed an answer would no longer
  // match the record, so fall back to one built directly from the final answers.
  const aiSummaryCurrent = synced.summary?.source === "ai" && synced.ai.inputHash === fingerprint(synced.assessment);
  return {
    ok: true,
    record: {
      ...synced,
      status: "submitted",
      submittedAt: iso,
      updatedAt: iso,
      contextNotes: contextNotes(synced.assessment),
      summary: aiSummaryCurrent ? synced.summary : { text: summariseAnswers(synced.assessment), source: "answers" },
    },
  };
}

export interface QualityRow {
  raised: number;
  fixed: number;
  kept: number;
  open: number;
}

export function qualityStats(record: AssessmentRecord): Record<Source | "total", QualityRow> {
  const row = (flags: TrackedFlag[]): QualityRow => ({
    raised: flags.length,
    fixed: flags.filter((f) => f.decision === "fixed").length,
    kept: flags.filter((f) => f.decision === "kept").length,
    open: flags.filter((f) => !f.decision).length,
  });
  return {
    rule: row(record.flags.filter((f) => f.source === "rule")),
    ai: row(record.flags.filter((f) => f.source === "ai")),
    total: row(record.flags),
  };
}
