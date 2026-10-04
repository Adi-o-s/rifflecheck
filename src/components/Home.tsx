"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { newRecord, qualityStats } from "@/lib/audit";
import { formatWhen } from "@/lib/client";
import { REVIEW_STEP, STEPS } from "@/lib/fields";
import { SAMPLES, draftFromSample, type Sample } from "@/lib/seed";
import { deleteRecord, newId, saveRecord, useRecords } from "@/lib/storage";
import { Card, btnPrimary, btnQuiet, btnSecondary } from "./ui";

export function Home() {
  const records = useRecords();
  const router = useRouter();

  const start = () => {
    const record = newRecord(newId(), new Date());
    saveRecord(record);
    router.push(`/assess/${record.id}`);
  };

  const trySample = (sample: Sample) => {
    const record = draftFromSample(sample, newId(), new Date());
    saveRecord(record);
    router.push(`/assess/${record.id}`);
  };

  const drafts = records?.filter((r) => r.status === "draft") ?? [];
  const submitted = records?.filter((r) => r.status === "submitted") ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Check a stream, with a second pair of eyes</h1>
        <p className="mt-2 text-lg text-slate-800">
          RiffleCheck guides you through a stream assessment and asks about answers that do not seem to fit
          together. It explains every question, and it never changes an answer for you.
        </p>
        <button type="button" className={`${btnPrimary} mt-4 w-full sm:w-auto`} onClick={start}>
          Start a new assessment
        </button>
        <p className="mt-2 text-sm text-slate-700">
          Four short steps, about four minutes. No account needed; everything stays in this browser.
        </p>
      </div>

      <Card>
        <h2 className="text-lg font-semibold">How it works</h2>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-slate-900">
          <li>You record what you see: site, water, banks, and life.</li>
          <li>
            <strong>Rule checks</strong> catch impossible values and answers that contradict each other.
          </li>
          <li>
            An <strong>AI review</strong> reads your answers and notes and asks about anything else that does
            not fit.
          </li>
          <li>
            For every flag you choose: <strong>fix it</strong>, or <strong>keep your answer</strong> and say
            why. Both are recorded.
          </li>
        </ol>
      </Card>

      {drafts.length > 0 ? (
        <section aria-labelledby="drafts-heading">
          <h2 id="drafts-heading" className="mb-2 text-lg font-semibold">
            Unfinished assessments
          </h2>
          <ul className="space-y-2">
            {drafts.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{r.assessment.streamName || "Unnamed stream"}</p>
                  <p className="text-sm text-slate-700">
                    {r.step === REVIEW_STEP ? "At review" : `Step ${r.step} of ${STEPS.length}`} · last changed{" "}
                    {formatWhen(r.updatedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Link href={`/assess/${r.id}`} className={btnSecondary}>
                    Continue
                  </Link>
                  <button
                    type="button"
                    className={btnQuiet}
                    onClick={() => {
                      if (window.confirm("Delete this unfinished assessment? This cannot be undone.")) deleteRecord(r.id);
                    }}
                  >
                    Delete<span className="sr-only"> {r.assessment.streamName || "unnamed stream"}</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="samples-heading">
        <h2 id="samples-heading" className="text-lg font-semibold">
          Try a sample
        </h2>
        <p className="mb-2 text-sm text-slate-800">
          Three made-up assessments, already filled in. Each opens on the review screen so you can see the
          checks and make the decisions yourself.
        </p>
        <ul className="grid gap-2 sm:grid-cols-3">
          {SAMPLES.map((sample) => (
            <li key={sample.id}>
              <button
                type="button"
                onClick={() => trySample(sample)}
                className="flex h-full min-h-12 w-full flex-col rounded-2xl border border-slate-300 bg-white p-3 text-left hover:bg-slate-50"
              >
                <span className="font-semibold text-teal-800 underline underline-offset-2">{sample.title}</span>
                <span className="mt-1 text-sm text-slate-800">{sample.blurb}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="saved-heading">
        <h2 id="saved-heading" className="mb-2 text-lg font-semibold">
          Submitted assessments
        </h2>
        {records === null ? (
          <p className="text-slate-800">Loading…</p>
        ) : submitted.length === 0 ? (
          <p className="text-slate-800">None yet.</p>
        ) : (
          <ul className="space-y-2">
            {submitted.map((r) => {
              const stats = qualityStats(r).total;
              return (
                <li key={r.id}>
                  <Link
                    href={`/record/${r.id}`}
                    className="block rounded-2xl border border-slate-200 bg-white p-3 hover:bg-slate-50"
                  >
                    <span className="block font-semibold text-teal-800 underline underline-offset-2">
                      {r.assessment.streamName}
                    </span>
                    <span className="block text-sm text-slate-700">
                      {formatWhen(r.submittedAt)} · {stats.raised} flagged, {stats.fixed} fixed, {stats.kept} kept
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <Link href="/reviewer" className={`${btnQuiet} mt-2`}>
          Open the reviewer view
        </Link>
      </section>
    </div>
  );
}
