import { describe, expect, it } from "vitest";
import {
  applyAiReview,
  keepAnswer,
  newRecord,
  qualityStats,
  reopenFlag,
  submit,
  submitCheck,
  syncFlags,
  updateAssessment,
} from "./audit";
import { REVIEW_STEP } from "./fields";
import { TEST_NOW, cleanAssessment } from "./testing";
import type { AiReviewResult, Assessment, AssessmentRecord } from "./types";

const T0 = TEST_NOW;
const T1 = new Date(T0.getTime() + 60_000);
const T2 = new Date(T0.getTime() + 120_000);

function recordWith(overrides: Partial<Assessment>): AssessmentRecord {
  return { ...newRecord("r1", T0), step: REVIEW_STEP, assessment: cleanAssessment(overrides) };
}

const NO_AI: AiReviewResult = { mode: "demo", flags: [], summary: null };

const AI_FLOW: AiReviewResult = {
  mode: "live",
  summary: "A summary.",
  flags: [
    {
      fields: ["flow", "notes"],
      concern: "Your notes and the flow answer seem to differ. Could you look again?",
      why: 'Flow is "Fast" but the notes say the water is barely moving.',
      question: "How quickly does a leaf move downstream?",
      confidence: "high",
    },
  ],
};

describe("raising flags", () => {
  it("raises nothing for a clean assessment", () => {
    expect(syncFlags(recordWith({}), T0, "all").flags).toEqual([]);
  });

  it("records the answers as they were when the flag was raised", () => {
    const r = syncFlags(recordWith({ colour: "brown" }), T0, "all");
    expect(r.flags).toHaveLength(1);
    expect(r.flags[0]).toMatchObject({
      id: "clear-but-coloured",
      source: "rule",
      raisedAt: T0.toISOString(),
      before: { clarity: "clear", colour: "brown" },
    });
    expect(r.flags[0].decision).toBeUndefined();
  });

  it("raises only errors while the volunteer is still filling in the form", () => {
    const r = syncFlags(recordWith({ colour: "brown", ph: 15 }), T0, "errors");
    expect(r.flags.map((f) => f.id)).toEqual(["ph-range"]);
  });

  it("never tracks missing-required-field errors", () => {
    const r = syncFlags(recordWith({ streamName: "" }), T0, "all");
    expect(r.flags).toEqual([]);
  });

  it("never changes the volunteer's answers", () => {
    const before = recordWith({ colour: "brown", odour: "sewage", ph: 15 });
    const copy = structuredClone(before.assessment);
    const after = syncFlags(before, T0, "all");
    expect(after.assessment).toEqual(copy);
  });
});

describe("fix it", () => {
  it("marks a rule flag fixed, with before and after, once the answers stop conflicting", () => {
    let r = syncFlags(recordWith({ colour: "brown" }), T0, "all");
    r = updateAssessment(r, { clarity: "cloudy" }, T1);
    expect(r.flags[0]).toMatchObject({
      decision: "fixed",
      decidedAt: T1.toISOString(),
      before: { clarity: "clear", colour: "brown" },
      after: { clarity: "cloudy", colour: "brown" },
    });
  });

  it("does not count as fixed if the volunteer changes nothing", () => {
    let r = syncFlags(recordWith({ colour: "brown" }), T0, "all");
    r = syncFlags(r, T1, "all");
    expect(r.flags[0].decision).toBeUndefined();
  });

  it("reopens the flag if the conflict comes back", () => {
    let r = syncFlags(recordWith({ colour: "brown" }), T0, "all");
    r = updateAssessment(r, { clarity: "cloudy" }, T1);
    r = updateAssessment(r, { clarity: "clear" }, T2);
    expect(r.flags).toHaveLength(1);
    expect(r.flags[0].decision).toBeUndefined();
  });

  it("marks an AI flag fixed when one of its fields changes", () => {
    let r = applyAiReview(recordWith({ flow: "fast", notes: "Water barely moving" }), AI_FLOW, T0);
    expect(r.flags[0].decision).toBeUndefined();
    r = updateAssessment(r, { flow: "slow" }, T1);
    expect(r.flags[0]).toMatchObject({
      source: "ai",
      decision: "fixed",
      before: { flow: "fast" },
      after: { flow: "slow" },
    });
  });

  it("shows the final answer as 'after', not a half-finished edit", () => {
    let r = syncFlags(recordWith({ odour: "sewage", life: ["fish"] }), T0, "all");
    r = updateAssessment(r, { pollutionSources: [] }, T1);
    r = updateAssessment(r, { pollutionSources: ["pipe"] }, T2);
    expect(r.flags[0]).toMatchObject({
      decision: "fixed",
      decidedAt: T1.toISOString(),
      before: { odour: "sewage", pollutionSources: ["none_seen"] },
      after: { odour: "sewage", pollutionSources: ["pipe"] },
    });
  });

  it("reopens an AI flag if the volunteer puts the original answer back", () => {
    let r = applyAiReview(recordWith({ flow: "fast", notes: "Water barely moving" }), AI_FLOW, T0);
    r = updateAssessment(r, { flow: "slow" }, T1);
    r = updateAssessment(r, { flow: "fast" }, T2);
    expect(r.flags[0].decision).toBeUndefined();
  });

  it("leaves an AI flag open when an unrelated field changes", () => {
    let r = applyAiReview(recordWith({ flow: "fast", notes: "Water barely moving" }), AI_FLOW, T0);
    r = updateAssessment(r, { erosion: "some" }, T1);
    expect(r.flags[0].decision).toBeUndefined();
  });
});

describe("keep my answer", () => {
  const raised = () => syncFlags(recordWith({ colour: "brown" }), T0, "all");

  it.each(["", "   ", "ok"])("rejects the reason %j", (reason) => {
    const result = keepAnswer(raised(), "clear-but-coloured", reason, T1);
    expect(result.ok).toBe(false);
  });

  it("records the reason and the unchanged answers", () => {
    const result = keepAnswer(raised(), "clear-but-coloured", "  Peat stained but see-through ", T1);
    if (!result.ok) throw new Error(result.error);
    expect(result.record.flags[0]).toMatchObject({
      decision: "kept",
      reason: "Peat stained but see-through",
      decidedAt: T1.toISOString(),
      before: { clarity: "clear", colour: "brown" },
      after: { clarity: "clear", colour: "brown" },
    });
    expect(result.record.assessment).toEqual(raised().assessment);
  });

  it("refuses to keep a hard error", () => {
    const r = syncFlags(recordWith({ ph: 15 }), T0, "all");
    expect(keepAnswer(r, "ph-range", "My meter says so", T1).ok).toBe(false);
  });

  it("stays decided when the screen is revisited", () => {
    const kept = keepAnswer(raised(), "clear-but-coloured", "Checked on site", T1);
    if (!kept.ok) throw new Error(kept.error);
    expect(syncFlags(kept.record, T2, "all").flags[0].decision).toBe("kept");
  });

  it("asks again if the answers change but still conflict", () => {
    const kept = keepAnswer(raised(), "clear-but-coloured", "Checked on site", T1);
    if (!kept.ok) throw new Error(kept.error);
    const r = updateAssessment(kept.record, { colour: "grey" }, T2);
    expect(r.flags[0].decision).toBeUndefined();
    expect(r.flags[0].reason).toBeUndefined();
  });

  it("can be undone before submitting", () => {
    const kept = keepAnswer(raised(), "clear-but-coloured", "Checked on site", T1);
    if (!kept.ok) throw new Error(kept.error);
    expect(reopenFlag(kept.record, "clear-but-coloured", T2).flags[0].decision).toBeUndefined();
  });
});

describe("AI review results", () => {
  it("adds AI flags labelled with their source and confidence", () => {
    const r = applyAiReview(recordWith({ flow: "fast", notes: "Water barely moving" }), AI_FLOW, T0);
    expect(r.flags[0]).toMatchObject({ source: "ai", severity: "check", confidence: "high" });
    expect(r.ai).toMatchObject({ status: "done", mode: "live" });
    expect(r.summary).toEqual({ text: "A summary.", source: "ai" });
  });

  it("drops an AI flag that only repeats a rule flag", () => {
    const base = syncFlags(recordWith({ colour: "brown" }), T0, "all");
    const dup: AiReviewResult = {
      ...AI_FLOW,
      flags: [{ ...AI_FLOW.flags[0], fields: ["colour", "clarity"] }],
    };
    expect(applyAiReview(base, dup, T1).flags.map((f) => f.source)).toEqual(["rule"]);
  });

  it("replaces undecided AI flags on a second review and keeps decided ones", () => {
    let r = applyAiReview(recordWith({ flow: "fast", notes: "Water barely moving" }), AI_FLOW, T0);
    r = applyAiReview(r, AI_FLOW, T1);
    expect(r.flags).toHaveLength(1);
    const kept = keepAnswer(r, r.flags[0].id, "Checked on site", T1);
    if (!kept.ok) throw new Error(kept.error);
    r = applyAiReview(kept.record, AI_FLOW, T2);
    expect(r.flags).toHaveLength(1);
    expect(r.flags[0].decision).toBe("kept");
  });
});

describe("AI review that did not run", () => {
  const FAILED: AiReviewResult = { mode: "failed", flags: [], summary: null, notice: "AI review unavailable, rule checks only." };

  it("keeps earlier AI flags and records the notice", () => {
    let r = applyAiReview(recordWith({ flow: "fast", notes: "Water barely moving" }), AI_FLOW, T0);
    r = applyAiReview(r, FAILED, T1);
    expect(r.flags).toHaveLength(1);
    expect(r.ai).toMatchObject({ status: "done", mode: "failed", notice: FAILED.notice });
  });

  it("still lets the volunteer submit on rule checks alone", () => {
    const r = applyAiReview(recordWith({}), FAILED, T0);
    expect(submit(r, T1).ok).toBe(true);
  });
});

describe("submitting", () => {
  it("is blocked until the AI review step has been run", () => {
    const check = submitCheck(recordWith({}), T0);
    expect(check).toMatchObject({ ok: false, aiPending: true });
  });

  it("is blocked while any flag has no decision", () => {
    let r = syncFlags(recordWith({ colour: "brown" }), T0, "all");
    r = applyAiReview(r, NO_AI, T0);
    const result = submit(r, T1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.check.undecided.map((f) => f.id)).toEqual(["clear-but-coloured"]);
  });

  it("is blocked while an error remains", () => {
    const r = applyAiReview(recordWith({ ph: 15 }), NO_AI, T0);
    const result = submit(r, T1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.check.errors.map((f) => f.id)).toEqual(["ph-range"]);
  });

  it("is blocked while a required answer is missing", () => {
    const r = applyAiReview(recordWith({ weather: "" }), NO_AI, T0);
    expect(submit(r, T1).ok).toBe(false);
  });

  it("goes through once every flag is decided, and stores the context note and a summary", () => {
    let r = syncFlags(recordWith({ colour: "brown", rain48h: "yes" }), T0, "all");
    r = applyAiReview(r, NO_AI, T0);
    const kept = keepAnswer(r, "clear-but-coloured", "Peat stained but see-through", T1);
    if (!kept.ok) throw new Error(kept.error);
    const result = submit(kept.record, T2);
    if (!result.ok) throw new Error("expected submit to pass");
    expect(result.record.status).toBe("submitted");
    expect(result.record.submittedAt).toBe(T2.toISOString());
    expect(result.record.summary?.source).toBe("answers");
    expect(result.record.summary?.text).toContain("Ribeira de Coselhas");
    expect(result.record.contextNotes).toEqual([]);
  });

  it("attaches the recent-rain note to the record", () => {
    const r = applyAiReview(recordWith({ rain48h: "yes", clarity: "cloudy", life: ["fish"] }), NO_AI, T0);
    const result = submit(r, T1);
    if (!result.ok) throw new Error("expected submit to pass");
    expect(result.record.contextNotes[0]).toContain("rain");
  });

  it("replaces an AI summary that was written before an answer changed", () => {
    let r = applyAiReview(recordWith({ flow: "fast", notes: "Water barely moving" }), AI_FLOW, T0);
    r = updateAssessment(r, { flow: "slow" }, T1);
    const result = submit(r, T2);
    if (!result.ok) throw new Error("expected submit to pass");
    expect(result.record.summary?.source).toBe("answers");
  });
});

describe("data quality counts", () => {
  it("counts raised, fixed and kept flags by source", () => {
    let r = syncFlags(recordWith({ colour: "brown", odour: "sewage", flow: "fast", notes: "barely moving" }), T0, "all");
    r = applyAiReview(r, AI_FLOW, T0);
    r = updateAssessment(r, { clarity: "cloudy" }, T1);
    const kept = keepAnswer(r, r.flags.find((f) => f.source === "ai")!.id, "Checked on site", T1);
    if (!kept.ok) throw new Error(kept.error);
    const stats = qualityStats(kept.record);
    expect(stats.rule).toEqual({ raised: 4, fixed: 1, kept: 0, open: 3 });
    expect(stats.ai).toEqual({ raised: 1, fixed: 0, kept: 1, open: 0 });
    expect(stats.total.raised).toBe(5);
  });
});
