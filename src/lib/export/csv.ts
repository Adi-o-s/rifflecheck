import { qualityStats } from "../audit";
import { FIELDS, displayValue, isEmpty, optionLabel } from "../fields";
import type { AssessmentRecord, FieldKey } from "../types";

const DATA_FIELDS = FIELDS.filter((f) => f.type !== "photo");

export const CSV_COLUMNS = [
  "record_id",
  "status",
  "submitted_at",
  ...DATA_FIELDS.map((f) => f.key),
  "photo_attached",
  "flags_raised",
  "flags_fixed",
  "flags_kept",
  "rule_flags",
  "ai_flags",
  "has_overrides",
  "kept_reasons",
  "context_notes",
  "ai_review",
  "summary",
];

/** One cell. Numbers stay bare so a spreadsheet reads them as numbers; choices use the on-screen label. */
function cell(key: FieldKey, record: AssessmentRecord): string {
  const value = record.assessment[key];
  if (isEmpty(value)) return "";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map((v) => optionLabel(key, v)).join("; ");
  return displayValue(key, value);
}

function quote(value: string): string {
  // A leading =, +, - or @ would be run as a formula by spreadsheet software.
  const safe = /^[=+\-@\t\r]/.test(value) && Number.isNaN(Number(value)) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function csvRow(record: AssessmentRecord): string[] {
  const stats = qualityStats(record);
  const kept = record.flags.filter((f) => f.decision === "kept");
  return [
    record.id,
    record.status,
    record.submittedAt ?? "",
    ...DATA_FIELDS.map((f) => cell(f.key, record)),
    record.assessment.photo ? "yes" : "no",
    String(stats.total.raised),
    String(stats.total.fixed),
    String(stats.total.kept),
    String(stats.rule.raised),
    String(stats.ai.raised),
    kept.length ? "yes" : "no",
    kept.map((f) => f.reason ?? "").join(" | "),
    record.contextNotes.join(" | "),
    record.ai.mode ?? "not run",
    record.summary?.text ?? "",
  ];
}

/** One header row, then one row per assessment. */
export function toCsv(records: AssessmentRecord[]): string {
  const rows = [CSV_COLUMNS, ...records.map(csvRow)];
  return rows.map((row) => row.map(quote).join(",")).join("\r\n") + "\r\n";
}
