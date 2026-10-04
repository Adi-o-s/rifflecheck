"use client";

import Link from "next/link";
import { useState } from "react";
import { qualityStats } from "@/lib/audit";
import { download, formatWhen } from "@/lib/client";
import { toCsv } from "@/lib/export/csv";
import { useRecords } from "@/lib/storage";
import { Card, btnSecondary } from "./ui";

export function ReviewerView() {
  const records = useRecords();
  const [onlyOverrides, setOnlyOverrides] = useState(false);

  if (records === null) return <p className="text-slate-800">Loading…</p>;

  const submitted = records
    .filter((r) => r.status === "submitted")
    .sort((x, y) => (y.submittedAt ?? "").localeCompare(x.submittedAt ?? ""));
  const rows = submitted
    .map((record) => ({ record, stats: qualityStats(record) }))
    .filter((row) => !onlyOverrides || row.stats.total.kept > 0);
  const drafts = records.length - submitted.length;
  const withOverrides = submitted.filter((r) => r.flags.some((f) => f.decision === "kept")).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reviewer view</h1>
        <p className="mt-1 text-slate-800">
          For researchers. Every submitted assessment in this browser, with how many flags were raised and
          what the volunteer decided. A record with overrides is one where the volunteer kept an answer that a
          check questioned; open it to read their reason.
        </p>
      </div>

      <Card>
        <p className="text-slate-900">
          <strong>{submitted.length}</strong> submitted · <strong>{withOverrides}</strong> with overrides ·{" "}
          <strong>{drafts}</strong> unfinished (not listed)
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex min-h-11 cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={onlyOverrides}
              onChange={(event) => setOnlyOverrides(event.target.checked)}
              className="size-5 accent-teal-700"
            />
            <span>Only records with overrides</span>
          </label>
          <button
            type="button"
            className={btnSecondary}
            disabled={rows.length === 0}
            onClick={() =>
              download("rifflecheck-assessments.csv", toCsv(rows.map((r) => r.record)), "text/csv;charset=utf-8")
            }
          >
            Download these as CSV
          </button>
        </div>
      </Card>

      {rows.length === 0 ? (
        <Card>
          <p className="text-slate-800">No assessments match.</p>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <caption className="sr-only">Submitted assessments with flag counts and decisions</caption>
            <thead>
              <tr className="border-b border-slate-300 bg-slate-50">
                <th scope="col" className="px-3 py-2.5 font-semibold">Stream</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Rule flags</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">AI flags</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">Fixed</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">Kept</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Overrides</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ record, stats }) => (
                <tr key={record.id} className="border-b border-slate-200 align-top last:border-0">
                  <th scope="row" className="px-3 py-2.5 font-normal">
                    <Link href={`/record/${record.id}`} className="font-semibold text-teal-800 underline underline-offset-2">
                      {record.assessment.streamName}
                    </Link>
                    <span className="block text-slate-700">{formatWhen(record.submittedAt)}</span>
                  </th>
                  <td className="px-3 py-2.5 tabular-nums">{stats.rule.raised}</td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {stats.ai.raised}
                    {record.ai.mode && record.ai.mode !== "live" ? (
                      <span className="block text-slate-700">
                        {record.ai.mode === "demo" ? "demo" : "AI unavailable"}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{stats.total.fixed}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{stats.total.kept}</td>
                  <td className="px-3 py-2.5">
                    {stats.total.kept > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 font-semibold text-amber-950">
                        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 21V4m0 0h11l-2 4 2 4H5" />
                        </svg>
                        Yes
                      </span>
                    ) : (
                      <span className="text-slate-700">No</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
