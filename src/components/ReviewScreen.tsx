"use client";

import { fingerprint, submitCheck } from "@/lib/audit";
import { FIELDS, STEPS, displayValue } from "@/lib/fields";
import { contextNotes } from "@/lib/rules";
import type { AssessmentRecord, Flag, TrackedFlag } from "@/lib/types";
import { FlagCard } from "./FlagCard";
import { Card, Notice, btnPrimary, btnSecondary } from "./ui";

interface Props {
  record: AssessmentRecord;
  now: Date;
  busy: boolean;
  onFix: (flag: Flag) => void;
  onKeep: (flagId: string, reason: string) => string | null;
  onReopen: (flagId: string) => void;
  onAiReview: () => void;
  onSubmit: () => void;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function ReviewScreen({ record, now, busy, onFix, onKeep, onReopen, onAiReview, onSubmit }: Props) {
  const check = submitCheck(record, now);
  const tracked = record.flags.filter((f) => f.severity !== "error" || !f.decision);
  const open = tracked.filter((f) => !f.decision && f.severity !== "error");
  const decided = record.flags.filter((f) => f.decision);
  const total = decided.length + open.length;
  const notes = contextNotes(record.assessment);
  const aiDone = record.ai.status === "done";
  const aiStale = aiDone && record.ai.inputHash !== fingerprint(record.assessment);
  const aiRan = record.ai.mode === "live" || record.ai.mode === "demo";
  const aiFlagCount = record.flags.filter((f) => f.source === "ai").length;

  const card = (flag: Flag | TrackedFlag) => (
    <FlagCard
      key={flag.id}
      flag={flag}
      assessment={record.assessment}
      onFix={() => onFix(flag)}
      onKeep={(reason) => onKeep(flag.id, reason)}
      onReopen={() => onReopen(flag.id)}
    />
  );

  const blockers: string[] = [];
  if (check.errors.length) blockers.push(`${plural(check.errors.length, "error", "errors")} to fix`);
  if (check.aiPending) blockers.push('tap "Review my assessment"');
  if (check.undecided.length) blockers.push(`${plural(check.undecided.length, "flag needs", "flags need")} a decision`);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">
            {total === 0 ? "Nothing to decide so far" : `${decided.length} of ${total} decided`}
          </h2>
          <p className="text-sm text-slate-700">Fix it or keep it. Both are fine.</p>
        </div>
        <div
          role="progressbar"
          aria-label="Flags decided"
          aria-valuemin={0}
          aria-valuemax={Math.max(total, 1)}
          aria-valuenow={decided.length}
          className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-200"
        >
          <div
            className="h-full rounded-full bg-teal-600 transition-all"
            style={{ width: `${total === 0 ? 0 : (decided.length / total) * 100}%` }}
          />
        </div>
        <p className="mt-3 text-slate-800">
          The checks below only ask questions. For each one, either fix your answer or keep it and say why.
          Your decision and your reason go into the record.
        </p>
      </Card>

      {check.errors.length > 0 ? (
        <section aria-labelledby="errors-heading">
          <h3 id="errors-heading" className="mb-2 text-lg font-semibold">
            Must fix before you can continue
          </h3>
          <ul className="space-y-3">{check.errors.map(card)}</ul>
        </section>
      ) : null}

      <section aria-labelledby="ai-heading">
        <Card>
          <h3 id="ai-heading" className="flex items-center gap-2 text-lg font-semibold">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 text-teal-700" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z" />
            </svg>
            AI review
          </h3>
          {!aiDone ? (
            <p className="mt-1 text-slate-800">
              An AI reads your answers and notes and asks about anything that does not seem to fit together.
              It cannot see the stream, cannot change your answers, and does not see your photo or exact
              location.
            </p>
          ) : (
            <p className="mt-1 text-slate-800">
              {!aiRan
                ? "The AI review did not run this time. The rule checks above and below still apply, and you can submit without it."
                : aiFlagCount === 0
                  ? "The AI review had nothing more to ask about."
                : `The AI review asked about ${plural(aiFlagCount, "thing", "things")}. They are in the list below, marked "AI review".`}
            </p>
          )}
          {aiDone && record.ai.notice ? (
            <div className="mt-3">
              <Notice tone={record.ai.mode === "demo" ? "info" : "warn"}>{record.ai.notice}</Notice>
            </div>
          ) : null}
          {aiStale ? (
            <div className="mt-3">
              <Notice>You have changed answers since the AI review. You can run it again if you like.</Notice>
            </div>
          ) : null}
          <div aria-live="polite" className="mt-3">
            {busy ? (
              <p className="font-semibold text-slate-900">Reviewing your assessment…</p>
            ) : (
              <button
                type="button"
                className={aiDone ? btnSecondary : btnPrimary}
                onClick={onAiReview}
                disabled={check.errors.length > 0}
              >
                {!aiDone ? "Review my assessment" : aiRan ? "Review again" : "Try the AI review again"}
              </button>
            )}
            {check.errors.length > 0 ? (
              <p className="mt-2 text-sm text-slate-800">Fix the errors above first.</p>
            ) : null}
          </div>
        </Card>
      </section>

      <section aria-labelledby="flags-heading">
        <h3 id="flags-heading" className="mb-2 text-lg font-semibold">
          {open.length > 0
            ? `${plural(open.length, "flag needs", "flags need")} your decision`
            : aiDone
              ? "No flags need a decision"
              : "No rule flags so far"}
        </h3>
        {open.length > 0 ? <ul className="space-y-3">{open.map(card)}</ul> : null}
        {open.length === 0 && record.flags.length === 0 ? (
          <p className="text-slate-800">The rule checks found nothing to ask about.</p>
        ) : null}
      </section>

      {decided.length > 0 ? (
        <section aria-labelledby="decided-heading">
          <h3 id="decided-heading" className="mb-2 text-lg font-semibold">
            Decided ({decided.length})
          </h3>
          <ul className="space-y-3">{decided.map(card)}</ul>
        </section>
      ) : null}

      {notes.length > 0 ? (
        <section aria-labelledby="notes-heading">
          <h3 id="notes-heading" className="mb-2 text-lg font-semibold">
            Note added to your record
          </h3>
          <div className="space-y-2">
            {notes.map((note) => (
              <Notice key={note}>{note} This is not a flag; you do not need to do anything.</Notice>
            ))}
          </div>
        </section>
      ) : null}

      <Card>
        <details>
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-base font-semibold underline underline-offset-2">
            Look over all your answers
          </summary>
          {STEPS.map((step) => (
            <div key={step.id} className="mt-3">
              <h4 className="font-semibold">{step.title}</h4>
              <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                {FIELDS.filter((f) => f.step === step.id).map((f) => (
                  <div key={f.key} className="contents">
                    <dt className="text-slate-700">{f.label}</dt>
                    <dd className="font-medium break-words">{displayValue(f.key, record.assessment[f.key])}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </details>
      </Card>

      <Card>
        <button type="button" className={`${btnPrimary} w-full`} onClick={onSubmit} disabled={!check.ok || busy}>
          Submit assessment
        </button>
        <p role="status" className="mt-2 text-center text-sm text-slate-800">
          {check.ok ? "Every flag has a decision. Ready to submit." : `Before you can submit: ${blockers.join("; ")}.`}
        </p>
      </Card>
    </div>
  );
}
