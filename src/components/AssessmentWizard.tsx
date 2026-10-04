"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { applyAiReview, keepAnswer, reopenFlag, submit, syncFlags, updateAssessment } from "@/lib/audit";
import { requestAiReview } from "@/lib/client";
import { REVIEW_STEP, STEPS, field, fieldsForStep, toLocalInput } from "@/lib/fields";
import { isRequiredFlag, runRules } from "@/lib/rules";
import { saveRecord, useRecord } from "@/lib/storage";
import type { Assessment, AssessmentRecord, FieldKey, Flag } from "@/lib/types";
import { FormField, LocationField } from "./FormField";
import { ReviewScreen } from "./ReviewScreen";
import { Card, Notice, SeverityIcon, btnPrimary, btnSecondary } from "./ui";

function focusField(key: FieldKey): void {
  const wrapper = document.getElementById(`field-${key}`);
  if (!wrapper) return;
  wrapper.scrollIntoView({ block: "center" });
  const control =
    wrapper.querySelector<HTMLElement>("input:checked") ?? wrapper.querySelector<HTMLElement>("input, textarea");
  control?.focus({ preventScroll: true });
}

function stepOf(flag: Flag): number {
  return Math.min(...flag.fields.map((k) => field(k).step));
}

interface Fixing {
  flagId: string;
  concern: string;
  fields: FieldKey[];
}

export function AssessmentWizard({ id }: { id: string }) {
  const record = useRecord(id);
  const router = useRouter();
  const [now, setNow] = useState(() => new Date());
  const [attempted, setAttempted] = useState<number[]>([]);
  const [fixing, setFixing] = useState<Fixing | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const errorSummary = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<FieldKey | "heading" | "errors" | null>(null);
  const latest = useRef<AssessmentRecord | null>(null);

  useEffect(() => {
    latest.current = record ?? null;
  }, [record]);

  // After a step change, move keyboard and screen-reader focus to the right place.
  useEffect(() => {
    const target = pendingFocus.current;
    pendingFocus.current = null;
    if (target === "heading") heading.current?.focus();
    else if (target === "errors") errorSummary.current?.focus();
    else if (target) focusField(target);
  });

  if (record === null) return <p className="text-slate-800">Loading…</p>;
  if (record === undefined) {
    return (
      <Card>
        <h1 className="text-xl font-semibold">Assessment not found</h1>
        <p className="mt-2 text-slate-800">It may have been saved in a different browser.</p>
        <Link href="/" className={`${btnPrimary} mt-4`}>
          Back to home
        </Link>
      </Card>
    );
  }
  if (record.status === "submitted") {
    return (
      <Card>
        <h1 className="text-xl font-semibold">This assessment has been submitted</h1>
        <Link href={`/record/${record.id}`} className={`${btnPrimary} mt-4`}>
          Open the record
        </Link>
      </Card>
    );
  }

  const a = record.assessment;
  const step = record.step;
  const onReview = step === REVIEW_STEP;
  const errors = runRules(a, now).filter((f) => f.severity === "error");
  const stepErrors = (s: number) => errors.filter((f) => f.fields.some((k) => field(k).step === s));
  const showRequired = attempted.includes(step);

  const commit = (next: AssessmentRecord) => {
    const time = new Date();
    setNow(time);
    setSaveFailed(!saveRecord({ ...next, updatedAt: time.toISOString() }));
  };

  const change = (patch: Partial<Assessment>) => commit(updateAssessment(record, patch, new Date()));

  const goTo = (target: number) => {
    const time = new Date();
    if (target === REVIEW_STEP) {
      if (errors.length > 0) {
        const first = Math.min(...errors.map(stepOf));
        setAttempted(STEPS.map((s) => s.id));
        pendingFocus.current = "errors";
        return commit({ ...syncFlags(record, time, "errors"), step: first });
      }
      setFixing(null);
      pendingFocus.current = "heading";
      return commit(syncFlags({ ...record, step: REVIEW_STEP }, time, "all"));
    }
    pendingFocus.current = "heading";
    commit({ ...record, step: target });
  };

  const next = () => {
    if (stepErrors(step).length > 0) {
      setAttempted((steps) => (steps.includes(step) ? steps : [...steps, step]));
      pendingFocus.current = "errors";
      return commit(syncFlags(record, new Date(), "errors"));
    }
    goTo(step + 1);
  };

  const jump = (key: FieldKey) => {
    pendingFocus.current = key;
    commit({ ...record, step: field(key).step });
  };

  const fix = (flag: Flag) => {
    setFixing({ flagId: flag.id, concern: flag.concern, fields: flag.fields });
    setAttempted(STEPS.map((s) => s.id));
    jump(flag.fields[0]);
  };

  const keep = (flagId: string, reason: string): string | null => {
    const result = keepAnswer(record, flagId, reason, new Date());
    if (!result.ok) return result.error;
    commit(result.record);
    return null;
  };

  const aiReview = async () => {
    setBusy(true);
    const result = await requestAiReview(record);
    const current = latest.current ?? record;
    const time = new Date();
    commit(applyAiReview(syncFlags(current, time, "all"), result, time));
    setBusy(false);
  };

  const send = () => {
    const result = submit(record, new Date());
    if (!result.ok) return commit(syncFlags(record, new Date(), "all"));
    setSaveFailed(!saveRecord(result.record));
    router.push(`/record/${record.id}`);
  };

  const fieldErrors = (key: FieldKey): string[] =>
    errors
      .filter((f) => f.fields.includes(key) && (showRequired || !isRequiredFlag(f)))
      .map((f) => f.concern);

  const fixingFlag = fixing ? record.flags.find((f) => f.id === fixing.flagId) : undefined;
  const fixingDone = fixing
    ? fixingFlag
      ? fixingFlag.decision === "fixed"
      : !errors.some((f) => f.id === fixing.flagId)
    : false;
  const targets = fixing && !fixingDone ? fixing.fields : [];
  const visibleErrors = stepErrors(step).filter((f) => showRequired || !isRequiredFlag(f));
  const current = STEPS.find((s) => s.id === step);

  return (
    <div>
      <div
        role="progressbar"
        aria-label="Progress through the assessment"
        aria-valuemin={1}
        aria-valuemax={REVIEW_STEP}
        aria-valuenow={step}
        className="mb-3 h-1.5 overflow-hidden rounded-full bg-slate-200"
      >
        <div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: `${(step / REVIEW_STEP) * 100}%` }} />
      </div>
      <nav aria-label="Steps" className="mb-5">
        <ol className="flex gap-1.5">
          {[...STEPS, { id: REVIEW_STEP, title: "Review" }].map((s) => {
            const active = s.id === step;
            const hasError = s.id !== REVIEW_STEP && attempted.includes(s.id) && stepErrors(s.id).length > 0;
            return (
              <li key={s.id} className="flex-1">
                <button
                  type="button"
                  onClick={() => goTo(s.id)}
                  aria-current={active ? "step" : undefined}
                  aria-label={`${s.id === REVIEW_STEP ? "Review" : `Step ${s.id}: ${s.title}`}${hasError ? " (has errors)" : ""}`}
                  className={`flex min-h-12 w-full flex-col items-center justify-center rounded-xl border px-1 py-1 text-xs font-semibold ${
                    active
                      ? "border-teal-700 bg-teal-700 text-white"
                      : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                  }`}
                >
                  <span className="text-base leading-5">{s.id === REVIEW_STEP ? "✓" : s.id}</span>
                  <span className="max-w-full truncate">{s.id === 3 ? "Banks" : s.title}</span>
                  {hasError ? (
                    <span aria-hidden="true" className="text-[0.65rem] leading-3">
                      fix
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <p className="text-sm font-semibold uppercase tracking-wide text-teal-800">
        {onReview ? a.streamName || "Your assessment" : `Step ${step} of ${STEPS.length}`}
      </p>
      <h1 ref={heading} tabIndex={-1} className="font-display mt-0.5 text-3xl font-semibold tracking-tight focus-visible:outline-none">
        {onReview ? "A second look before you send it" : current?.title}
      </h1>
      <p className="mb-5 mt-1 text-slate-800">
        {onReview ? "Check, decide, then submit. Nothing is changed for you." : current?.intro}
      </p>

      {saveFailed ? (
        <div className="mb-4">
          <Notice tone="warn">
            This browser would not save your latest change (storage may be full). Removing the photo usually
            fixes it.
          </Notice>
        </div>
      ) : null}

      {fixing && !onReview ? (
        <div role="status" className="mb-4 rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 text-amber-950">
          <p className="font-semibold">{fixingDone ? "Thanks, that answer has changed." : "You are looking again at:"}</p>
          <p className="mt-1">{fixing.concern}</p>
          <p className="mt-1 text-sm">
            {fixingDone
              ? "Your change is recorded."
              : "The answers involved are outlined. Change whichever one is not right."}
          </p>
          {!fixingDone ? (
            <ul className="mt-2 flex flex-wrap gap-2">
              {fixing.fields.map((key) => (
                <li key={key}>
                  <button
                    type="button"
                    className="min-h-11 rounded-lg border border-amber-500 bg-white px-3 text-sm font-semibold underline underline-offset-2"
                    onClick={() => jump(key)}
                  >
                    Go to {field(key).label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <button type="button" className={`${btnSecondary} mt-3`} onClick={() => goTo(REVIEW_STEP)}>
            Back to review
          </button>
        </div>
      ) : null}

      {onReview ? (
        <ReviewScreen
          record={record}
          now={now}
          busy={busy}
          onFix={fix}
          onKeep={keep}
          onReopen={(flagId) => commit(reopenFlag(record, flagId, new Date()))}
          onAiReview={aiReview}
          onSubmit={send}
        />
      ) : (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            next();
          }}
        >
          {visibleErrors.length > 0 ? (
            <div
              ref={errorSummary}
              tabIndex={-1}
              role="alert"
              className="mb-4 rounded-2xl border-2 border-red-300 bg-red-50 p-4 text-red-900 focus-visible:outline-none"
            >
              <p className="flex items-center gap-2 font-semibold">
                <SeverityIcon severity="error" />
                {visibleErrors.length === 1 ? "1 thing to fix on this step" : `${visibleErrors.length} things to fix on this step`}
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-6 text-sm">
                {visibleErrors.map((f) => (
                  <li key={f.id}>
                    <button type="button" className="min-h-8 text-left underline underline-offset-2" onClick={() => focusField(f.fields[f.fields.length - 1])}>
                      {f.concern}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {step === 1 && !fixing ? (
            <div className="mb-4">
              <Notice>
                <strong>How this works:</strong> fill in four short screens about the stream. At the end,
                RiffleCheck asks about any answers that do not fit together. You decide what to do about each
                one; nothing is changed for you.
              </Notice>
            </div>
          ) : null}

          {step === 2 && a.flow === "dry" ? (
            <div className="mb-4">
              <Notice>
                You marked the stream as dry, so colour, clarity, surface and the measurements should be left
                empty.
              </Notice>
            </div>
          ) : null}

          <Card className="space-y-6">
            {fieldsForStep(step).map((def) => {
              if (def.key === "longitude") return null;
              if (def.key === "latitude") {
                return (
                  <LocationField key="location" assessment={a} onChange={change} errorsFor={fieldErrors} targets={targets} />
                );
              }
              return (
                <FormField
                  key={def.key}
                  def={def}
                  assessment={a}
                  onChange={change}
                  errors={fieldErrors(def.key)}
                  target={targets.includes(def.key)}
                  maxDateTime={toLocalInput(now)}
                />
              );
            })}
          </Card>

          <div className="sticky bottom-0 z-20 -mx-4 mt-5 border-t border-slate-200 bg-[#f3f7f6]/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
            <div className="flex gap-3">
              {step > 1 ? (
                <button type="button" className={`${btnSecondary} flex-1`} onClick={() => goTo(step - 1)}>
                  Back
                </button>
              ) : null}
              <button type="submit" className={`${btnPrimary} flex-[2]`}>
                {step === STEPS.length ? "Go to review" : `Next: ${STEPS[step]?.title}`}
              </button>
            </div>
            <p className="mt-2 text-center text-xs text-slate-700">Saved on this device as you go.</p>
          </div>
        </form>
      )}
    </div>
  );
}
