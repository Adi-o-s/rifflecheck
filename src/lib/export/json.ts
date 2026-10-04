import { qualityStats } from "../audit";
import { FIELDS, displayValue } from "../fields";
import type { AssessmentRecord } from "../types";

/** The full record for researchers: raw answer codes, on-screen labels, and the audit trail. */
export function toJsonExport(record: AssessmentRecord) {
  const { photo, ...answers } = record.assessment;
  return {
    format: "rifflecheck-record",
    version: 1,
    record: {
      id: record.id,
      status: record.status,
      createdAt: record.createdAt,
      submittedAt: record.submittedAt ?? null,
      sampleId: record.seedId ?? null,
    },
    answers: { ...answers, photoAttached: Boolean(photo) },
    labels: Object.fromEntries(
      FIELDS.filter((f) => f.type !== "photo").map((f) => [f.key, displayValue(f.key, record.assessment[f.key])]),
    ),
    summary: record.summary ?? null,
    contextNotes: record.contextNotes,
    aiReview: record.ai,
    dataQuality: qualityStats(record),
    auditTrail: record.flags,
  };
}
