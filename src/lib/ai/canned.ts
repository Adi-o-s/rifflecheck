import { summariseAnswers } from "../summary";
import type { AiFlagPayload, Assessment } from "../types";

/**
 * Demo mode: prepared responses for the three built-in samples, used when no
 * API key is set. Each flag carries a condition so it only appears while the
 * answers it talks about are still on the form. That keeps the demo honest if
 * someone edits a sample before running the review.
 */
interface CannedFlag extends AiFlagPayload {
  when: (a: Assessment) => boolean;
}

const CANNED: Record<string, CannedFlag[]> = {
  "sample-clean": [],
  "sample-contradictory": [
    {
      when: (a) => a.flow === "fast" && /barely moving/i.test(a.notes),
      fields: ["flow", "notes"],
      concern: "Your notes and your flow answer seem to describe different water speeds. Could you look again?",
      why: 'Flow is recorded as "Fast", but your notes say "Water barely moving today".',
      question: "If you drop a leaf in, does it move faster or slower than walking pace?",
      confidence: "high",
    },
    {
      when: (a) => /\bpipe\b/i.test(a.notes) && a.pollutionSources.includes("none_seen"),
      fields: ["notes", "pollutionSources"],
      concern: "Your notes mention a pipe, but visible pollution sources is recorded as None seen. Could you look again?",
      why: 'Your notes say "A pipe on the far bank was dripping into the stream", and visible pollution sources is "None seen".',
      question: "Is the pipe you noted flowing into the stream?",
      confidence: "high",
    },
  ],
  "sample-unusual": [],
};

export function hasCanned(seedId: string | undefined): seedId is string {
  return !!seedId && seedId in CANNED;
}

export function cannedReview(seedId: string, a: Assessment): { flags: AiFlagPayload[]; summary: string } {
  const flags = CANNED[seedId]
    .filter((f) => f.when(a))
    .map((f) => ({
      fields: f.fields,
      concern: f.concern,
      why: f.why,
      question: f.question,
      confidence: f.confidence,
    }));
  return { flags, summary: summariseAnswers(a) };
}
