"use client";

import Link from "next/link";
import { qualityStats } from "@/lib/audit";
import { download, fileSlug, formatWhen } from "@/lib/client";
import { toCsv } from "@/lib/export/csv";
import { buildFhirBundle } from "@/lib/export/fhir";
import { toJsonExport } from "@/lib/export/json";
import { FIELDS, STEPS, displayValue } from "@/lib/fields";
import { useRecord } from "@/lib/storage";
import type { AssessmentRecord, TrackedFlag } from "@/lib/types";
import { Changes } from "./FlagCard";
import { Card, Notice, SeverityBadge, SourceBadge, btnPrimary, btnSecondary } from "./ui";

function AuditEntry({ flag }: { flag: TrackedFlag }) {
  return (
    <li className="rounded-2xl border border-slate-300 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={flag.severity} />
        <SourceBadge source={flag.source} confidence={flag.confidence} />
      </div>
      <p className="mt-2 font-semibold">{flag.concern}</p>
      <p className="mt-1 text-sm text-slate-800">{flag.why}</p>
      <p className="mt-3 font-semibold">
        Decision: {flag.decision === "kept" ? "kept the answer" : "fixed the answer"}
      </p>
      {flag.decision === "kept" ? <p className="text-sm">Reason given: {flag.reason}</p> : null}
      <Changes flag={flag} />
      <p className="mt-2 text-sm text-slate-700">
        Raised {formatWhen(flag.raisedAt)} · decided {formatWhen(flag.decidedAt)}
      </p>
    </li>
  );
}

function Downloads({ record }: { record: AssessmentRecord }) {
  const name = `rifflecheck-${fileSlug(record.assessment.streamName)}-${record.id.slice(0, 8)}`;
  return (
    <Card>
      <h2 className="text-lg font-semibold">Downloads</h2>
      <p className="mt-1 text-sm text-slate-800">
        FHIR is a health-data standard, so this record can be read by health and research systems. JSON and
        CSV are for researchers and spreadsheets.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <button
          type="button"
          className={btnPrimary}
          onClick={() =>
            download(`${name}.fhir.json`, JSON.stringify(buildFhirBundle(record), null, 2), "application/fhir+json")
          }
        >
          Download FHIR
        </button>
        <button
          type="button"
          className={btnSecondary}
          onClick={() => download(`${name}.json`, JSON.stringify(toJsonExport(record), null, 2), "application/json")}
        >
          Download JSON
        </button>
        <button
          type="button"
          className={btnSecondary}
          onClick={() => download(`${name}.csv`, toCsv([record]), "text/csv;charset=utf-8")}
        >
          Download CSV
        </button>
      </div>
    </Card>
  );
}

export function RecordView({ id }: { id: string }) {
  const record = useRecord(id);
  if (record === null) return <p className="text-slate-800">Loading…</p>;
  if (record === undefined) {
    return (
      <Card>
        <h1 className="text-xl font-semibold">Record not found</h1>
        <p className="mt-2 text-slate-800">It may have been saved in a different browser.</p>
        <Link href="/" className={`${btnPrimary} mt-4`}>
          Back to home
        </Link>
      </Card>
    );
  }
  if (record.status !== "submitted") {
    return (
      <Card>
        <h1 className="text-xl font-semibold">This assessment is not submitted yet</h1>
        <Link href={`/assess/${record.id}`} className={`${btnPrimary} mt-4`}>
          Continue the assessment
        </Link>
      </Card>
    );
  }

  const a = record.assessment;
  const stats = qualityStats(record);
  const rows = [
    { label: "Rule checks", ...stats.rule },
    { label: "AI review", ...stats.ai },
    { label: "Total", ...stats.total },
  ];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-teal-800">Submitted {formatWhen(record.submittedAt)}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{a.streamName}</h1>
      </div>

      <Card>
        <h2 className="text-lg font-semibold">Summary</h2>
        <p className="mt-1 text-slate-900">{record.summary?.text}</p>
        <p className="mt-2 text-sm text-slate-700">
          {record.summary?.source === "ai"
            ? "Written by the AI review from the answers below. It restates what was recorded and does not rate the stream."
            : "Built directly from the answers below, without AI. It restates what was recorded and does not rate the stream."}
        </p>
        {record.contextNotes.map((note) => (
          <div key={note} className="mt-3">
            <Notice>{note}</Notice>
          </div>
        ))}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">Data quality</h2>
        <p className="mt-1 text-sm text-slate-800">
          How many questions the checks raised and what the volunteer did. This describes the record, not the
          stream: RiffleCheck does not calculate a stream health score.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Flags raised, fixed and kept, by source</caption>
            <thead>
              <tr className="border-b border-slate-300">
                <th scope="col" className="py-2 pr-3 font-semibold">Source</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Raised</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Fixed</th>
                <th scope="col" className="py-2 pl-3 text-right font-semibold">Kept</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b border-slate-200 last:border-0 last:font-semibold">
                  <th scope="row" className="py-2 pr-3 font-medium">{row.label}</th>
                  <td className="px-3 py-2 text-right tabular-nums">{row.raised}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.fixed}</td>
                  <td className="py-2 pl-3 text-right tabular-nums">{row.kept}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {record.ai.notice ? (
          <div className="mt-3">
            <Notice tone={record.ai.mode === "demo" ? "info" : "warn"}>{record.ai.notice}</Notice>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-700">
            AI review: {record.ai.mode === "live" ? `run with ${record.ai.model}` : record.ai.mode ?? "not run"}.
          </p>
        )}
      </Card>

      <Downloads record={record} />

      <section aria-labelledby="audit-heading">
        <h2 id="audit-heading" className="mb-2 text-lg font-semibold">
          Audit trail
        </h2>
        {record.flags.length === 0 ? (
          <Card>
            <p className="text-slate-800">No flags were raised for this assessment.</p>
          </Card>
        ) : (
          <ol className="space-y-3">
            {record.flags.map((flag) => (
              <AuditEntry key={flag.id} flag={flag} />
            ))}
          </ol>
        )}
      </section>

      <Card>
        <h2 className="text-lg font-semibold">Final answers</h2>
        {STEPS.map((step) => (
          <div key={step.id} className="mt-4 first:mt-2">
            <h3 className="font-semibold text-teal-800">{step.title}</h3>
            <dl className="mt-1 divide-y divide-slate-200 text-sm">
              {FIELDS.filter((f) => f.step === step.id && f.type !== "photo").map((f) => (
                <div key={f.key} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 py-1.5">
                  <dt className="text-slate-700">{f.label}</dt>
                  <dd className="font-medium break-words">{displayValue(f.key, a[f.key])}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
        {a.photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- a local data URL, nothing to optimise
          <img src={a.photo} alt={`Photo of ${a.streamName} taken by the volunteer`} className="mt-4 max-h-72 rounded-xl border border-slate-300" />
        ) : null}
      </Card>

      <div className="flex flex-wrap gap-3">
        <Link href="/" className={btnSecondary}>
          Home
        </Link>
        <Link href="/reviewer" className={btnSecondary}>
          Reviewer view
        </Link>
      </div>
    </div>
  );
}
