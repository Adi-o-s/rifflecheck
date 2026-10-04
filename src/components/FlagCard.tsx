"use client";

import { useId, useState } from "react";
import { KEEP_REASONS } from "@/lib/audit";
import { displayValue, field } from "@/lib/fields";
import type { Assessment, FieldKey, Flag, Snapshot, TrackedFlag } from "@/lib/types";
import { SeverityBadge, SourceBadge, btnPrimary, btnQuiet, btnSecondary, severityClasses } from "./ui";

const OTHER = "other";

function isTracked(flag: Flag | TrackedFlag): flag is TrackedFlag {
  return "raisedAt" in flag;
}

function shown(snap: Snapshot | undefined, key: FieldKey): string {
  return displayValue(key, snap && key in snap ? snap[key] : null);
}

/** Before and after values for a decided flag. Also used on the record page. */
export function Changes({ flag }: { flag: TrackedFlag }) {
  const keys = Array.from(new Set([...Object.keys(flag.before), ...Object.keys(flag.after ?? {})])) as FieldKey[];
  return (
    <dl className="mt-2 space-y-1 text-sm">
      {keys.map((key) => {
        const before = shown(flag.before, key);
        const after = shown(flag.after, key);
        return (
          <div key={key}>
            <dt className="inline font-semibold">{field(key).label}: </dt>
            <dd className="inline">
              {before === after ? (
                <>
                  {before} <span className="text-slate-700">(unchanged)</span>
                </>
              ) : (
                <>
                  <span className="sr-only">before </span>
                  <s>{before}</s>
                  <span aria-hidden="true"> → </span>
                  <span className="sr-only"> after </span>
                  <strong>{after}</strong>
                </>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

interface Props {
  flag: Flag | TrackedFlag;
  assessment: Assessment;
  onFix: () => void;
  /** Returns an error message, or null when the reason was accepted. */
  onKeep: (reason: string) => string | null;
  onReopen: () => void;
}

export function FlagCard({ flag, assessment, onFix, onKeep, onReopen }: Props) {
  const formId = useId();
  const [keeping, setKeeping] = useState(false);
  const [choice, setChoice] = useState("");
  const [other, setOther] = useState("");
  const [error, setError] = useState("");

  const decision = isTracked(flag) ? flag.decision : undefined;
  const canKeep = flag.severity !== "error";

  const confirm = () => {
    const reason = choice === OTHER ? other : choice;
    const problem = onKeep(reason);
    if (problem) return setError(problem);
    setKeeping(false);
    setError("");
  };

  return (
    <li className={`rounded-2xl border-2 p-4 ${decision ? "border-slate-300 bg-white" : severityClasses(flag.severity)}`}>
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={flag.severity} />
        <SourceBadge source={flag.source} confidence={flag.confidence} />
      </div>
      <p className="mt-3 text-base font-semibold text-slate-950">{flag.concern}</p>
      {flag.question && !decision ? <p className="mt-1 text-base text-slate-900">{flag.question}</p> : null}

      <details className="mt-2 text-sm text-slate-900">
        <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-lg font-semibold underline underline-offset-2">
          Why am I seeing this?
        </summary>
        <p className="mt-1">{flag.why}</p>
        <p className="mt-2 text-slate-800">
          {flag.source === "ai"
            ? "This came from the AI review. It can only see your answers, not the stream, so it may be mistaken."
            : "This came from a fixed rule that compares the answers named below."}
        </p>
      </details>

      {decision && isTracked(flag) ? (
        <div className="mt-3 rounded-xl border border-slate-300 bg-slate-50 p-3">
          <p className="flex items-center gap-2 font-semibold text-slate-950">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 12 5 5 9-10" />
            </svg>
            {decision === "fixed" ? "Fixed: you changed your answer" : "Kept: you kept your answer"}
          </p>
          {decision === "kept" ? <p className="mt-1 text-sm">Your reason: {flag.reason}</p> : null}
          <Changes flag={flag} />
          {decision === "kept" ? (
            <button type="button" className={`${btnQuiet} mt-1`} onClick={onReopen}>
              Change this decision
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <dl className="mt-2 rounded-xl border border-current/20 bg-white/70 p-3 text-sm">
            <dt className="font-semibold">Your answers this is about</dt>
            {flag.fields.map((key) => (
              <dd key={key} className="mt-1">
                {field(key).label}: <strong>{displayValue(key, assessment[key])}</strong>
              </dd>
            ))}
          </dl>

          {keeping ? (
            <fieldset className="mt-3 rounded-xl border border-slate-300 bg-white p-3">
              <legend className="px-1 text-base font-semibold text-slate-950">Why are you keeping your answer?</legend>
              <div className="space-y-1">
                {[...KEEP_REASONS, OTHER].map((reason) => (
                  <label key={reason} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-1">
                    <input
                      type="radio"
                      name={`${formId}-reason`}
                      value={reason}
                      checked={choice === reason}
                      onChange={() => {
                        setChoice(reason);
                        setError("");
                      }}
                      className="size-5 shrink-0 accent-teal-700"
                    />
                    <span>{reason === OTHER ? "Another reason (type it below)" : reason}</span>
                  </label>
                ))}
              </div>
              {choice === OTHER ? (
                <div className="mt-2">
                  <label htmlFor={`${formId}-other`} className="block text-sm font-semibold">
                    Your reason
                  </label>
                  <input
                    id={`${formId}-other`}
                    type="text"
                    maxLength={200}
                    value={other}
                    onChange={(event) => {
                      setOther(event.target.value);
                      setError("");
                    }}
                    className="mt-1 block min-h-12 w-full rounded-xl border border-slate-400 bg-white px-3 py-2 text-base"
                  />
                </div>
              ) : null}
              {error ? (
                <p role="alert" className="mt-2 text-sm font-semibold text-red-800">
                  {error}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={btnPrimary} onClick={confirm}>
                  Keep my answer
                </button>
                <button type="button" className={btnSecondary} onClick={() => setKeeping(false)}>
                  Cancel
                </button>
              </div>
            </fieldset>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={btnPrimary} onClick={onFix}>
                Fix it
              </button>
              {canKeep ? (
                <button type="button" className={btnSecondary} onClick={() => setKeeping(true)}>
                  Keep my answer
                </button>
              ) : null}
            </div>
          )}
        </>
      )}
    </li>
  );
}
