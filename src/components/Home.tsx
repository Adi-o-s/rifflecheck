"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { newRecord, qualityStats } from "@/lib/audit";
import { formatWhen } from "@/lib/client";
import { REVIEW_STEP, STEPS } from "@/lib/fields";
import { RULES } from "@/lib/rules";
import { SAMPLES, draftFromSample, type Sample } from "@/lib/seed";
import { deleteRecord, newId, saveRecord, useRecords } from "@/lib/storage";
import { SeverityBadge, SourceBadge, btnQuiet, btnSecondary } from "./ui";

const SAMPLE_OUTCOME: Record<string, string> = {
  "sample-clean": "0 flags",
  "sample-contradictory": "3 rule flags · 2 AI flags",
  "sample-unusual": "1 unusual flag",
};

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1 text-sm text-slate-900">
      <span className="text-slate-600">{label}</span>
      <strong>{value}</strong>
    </span>
  );
}

/** A still picture of a flag, used as an illustration. The real ones are on the review screen. */
function FlagPreview() {
  return (
    <div
      role="img"
      aria-label="Example of a check: You marked the water as clear, and also brown. Could you look again? With two choices: Fix it, or Keep my answer."
      className="rise w-full max-w-sm rounded-3xl border border-white/20 bg-white p-4 text-left text-slate-900 shadow-2xl shadow-teal-950/40"
    >
      <div aria-hidden="true">
        <div className="flex flex-wrap gap-2">
          <SeverityBadge severity="check" />
          <SourceBadge source="rule" />
        </div>
        <p className="mt-3 font-semibold">You marked the water as clear, and also brown. Could you look again?</p>
        <p className="mt-1 text-sm text-slate-700">Can you see the stream bed clearly through the water?</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Chip label="Clarity" value="Clear" />
          <Chip label="Colour" value="Brown" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-center text-sm font-semibold">
          <span className="rounded-xl bg-teal-700 px-3 py-2.5 text-white">Fix it</span>
          <span className="rounded-xl border border-slate-300 px-3 py-2.5">Keep my answer</span>
        </div>
        <p className="mt-3 text-center text-xs text-slate-600">Nothing changes unless you change it.</p>
      </div>
    </div>
  );
}

function Chapter({ n, where, title, children }: { n: number; where: string; title: string; children: ReactNode }) {
  return (
    <li className="relative pl-12">
      <span
        aria-hidden="true"
        className="absolute left-0 top-0 flex size-10 items-center justify-center rounded-full border-4 border-[#f3f7f6] bg-teal-700 font-display text-lg font-semibold text-white"
      >
        {n}
      </span>
      <p className="text-sm font-semibold uppercase tracking-wide text-teal-800">{where}</p>
      <h3 className="font-display mt-0.5 text-xl font-semibold text-slate-950">{title}</h3>
      <div className="mt-2 space-y-3 text-slate-800">{children}</div>
    </li>
  );
}

function Principle({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className="flex size-10 items-center justify-center rounded-xl bg-teal-50 text-teal-800">
        <Icon>{icon}</Icon>
      </span>
      <h3 className="mt-3 font-semibold text-slate-950">{title}</h3>
      <p className="mt-1 text-sm text-slate-800">{children}</p>
    </li>
  );
}

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
  const section = "mx-auto w-full max-w-5xl px-4";

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-teal-950 via-teal-900 to-teal-700 text-white">
        <div className={`${section} grid items-center gap-8 pb-20 pt-10 md:grid-cols-[1.1fr_1fr] md:pb-28 md:pt-16`}>
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-teal-200">
              OneAquaHealth · citizen stream assessment
            </p>
            <h1 className="font-display mt-3 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              Every stream check deserves a second look.
            </h1>
            <p className="mt-4 max-w-xl text-lg text-teal-50">
              You are the one standing at the stream. RiffleCheck asks a question when two of your answers do not
              fit together, explains why, and then leaves the decision to you.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={start}
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-white px-6 py-3 text-base font-semibold text-teal-900 shadow-lg shadow-teal-950/30 hover:bg-teal-50 focus-visible:outline-white"
              >
                Start a stream check
              </button>
              <a
                href="#samples"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/50 px-6 py-3 text-base font-semibold text-white hover:bg-white/10 focus-visible:outline-white"
              >
                See it on a sample
              </a>
            </div>
            <p className="mt-3 text-sm text-teal-100">Four short steps, about four minutes. No account.</p>
          </div>
          <div className="flex justify-center md:justify-end">
            <FlagPreview />
          </div>
        </div>
        <svg aria-hidden="true" viewBox="0 0 1440 80" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-10 w-full text-[#f3f7f6] md:h-16">
          <path fill="currentColor" d="M0 40c120-30 240-30 360 0s240 30 360 0 240-30 360 0 240 30 360 0v40H0z" />
        </svg>
      </section>

      {/* Returning volunteers pick up where they left off */}
      {drafts.length > 0 ? (
        <section aria-labelledby="drafts-heading" className={`${section} pt-8`}>
          <h2 id="drafts-heading" className="font-display text-2xl font-semibold">
            Pick up where you left off
          </h2>
          <ul className="mt-3 grid gap-2 md:grid-cols-2">
            {drafts.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{r.assessment.streamName || "Unnamed stream"}</p>
                  <p className="text-sm text-slate-700">
                    {r.step === REVIEW_STEP ? "At review" : `Step ${r.step} of ${STEPS.length}`} · {formatWhen(r.updatedAt)}
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

      {/* The story */}
      <section aria-labelledby="story-heading" className={`${section} pt-12`}>
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-800">Why this exists</p>
        <h2 id="story-heading" className="font-display mt-1 max-w-2xl text-3xl font-semibold tracking-tight">
          A record is only useful if someone can trust it later.
        </h2>
        <ol className="streamline mt-8 max-w-2xl space-y-10">
          <Chapter n={1} where="At the stream" title="A volunteer writes down what they see.">
            <p>
              It is drizzling, the bank is slippery, and the form has twenty questions. They tick{" "}
              <strong>Clear</strong> for clarity, then <strong>Brown</strong> for colour, and move on.
            </p>
            <div className="flex flex-wrap gap-2">
              <Chip label="Clarity" value="Clear" />
              <Chip label="Colour" value="Brown" />
              <Chip label="Notes" value="“lots of mud”" />
            </div>
          </Chapter>
          <Chapter n={2} where="Months later, at a desk" title="A researcher cannot tell what happened.">
            <p>
              Clear <em>and</em> brown? A slip of the thumb, or peat-stained water you really can see through?
              Nobody can ask the volunteer now. The record is set aside, and one more stream goes unmonitored.
            </p>
          </Chapter>
          <Chapter n={3} where="With RiffleCheck" title="The question is asked while they are still there.">
            <p>
              The volunteer looks at the water again. They either <strong>fix the answer</strong>, or{" "}
              <strong>keep it and say why</strong>. The researcher gets the answer, the reason, and a record
              they can use.
            </p>
            <p className="rounded-2xl border border-teal-200 bg-teal-50 p-3 text-sm text-teal-950">
              <strong>Kept:</strong> “Peat-stained but I can see the bottom.” · Clarity: Clear (unchanged) ·
              Colour: Brown (unchanged)
            </p>
          </Chapter>
        </ol>
      </section>

      {/* How the second look works */}
      <section aria-labelledby="how-heading" className={`${section} pt-14`}>
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-800">How the second look works</p>
        <h2 id="how-heading" className="font-display mt-1 max-w-2xl text-3xl font-semibold tracking-tight">
          It asks. You decide. Both are recorded.
        </h2>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Principle title="Rules come first" icon={<path d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" />}>
            {RULES.length} fixed checks catch impossible values and answers that contradict each other. They run on
            your phone, with no AI.
          </Principle>
          <Principle
            title="The AI only asks"
            icon={<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z" />}
          >
            It reads your notes for things rules cannot see. It never scores the stream, and anything it says
            that is not in your answers is thrown away.
          </Principle>
          <Principle title="You decide" icon={<path d="M7 11V6a2 2 0 1 1 4 0v5m0-2a2 2 0 1 1 4 0v2m0-1a2 2 0 1 1 4 0v4a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-3l-3-5a2 2 0 0 1 3-2l1 1" />}>
            Fix it, or keep your answer and say why. No answer is ever changed for you, and you cannot be
            overruled.
          </Principle>
          <Principle title="Everything is recorded" icon={<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h6" />}>
            Each record carries its own history: what was asked, what you did, before and after. It exports as
            FHIR for health and research systems.
          </Principle>
        </ul>
      </section>

      {/* Samples */}
      <section id="samples" aria-labelledby="samples-heading" className={`${section} scroll-mt-28 pt-14`}>
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-800">Try it now</p>
        <h2 id="samples-heading" className="font-display mt-1 text-3xl font-semibold tracking-tight">
          Three streams, already filled in.
        </h2>
        <p className="mt-2 max-w-2xl text-slate-800">
          Each opens on the review screen, so you can see the checks and make the decisions yourself. They are
          made-up assessments.
        </p>
        <ul className="mt-5 grid gap-3 md:grid-cols-3">
          {SAMPLES.map((sample) => (
            <li key={sample.id}>
              <button
                type="button"
                onClick={() => trySample(sample)}
                className="group flex h-full w-full flex-col rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-teal-600 hover:shadow-md"
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-teal-800">
                  {SAMPLE_OUTCOME[sample.id]}
                </span>
                <span className="font-display mt-1 text-xl font-semibold text-slate-950">{sample.title}</span>
                <span className="mt-1 flex-1 text-sm text-slate-800">{sample.blurb}</span>
                <span className="mt-3 inline-flex items-center gap-1 font-semibold text-teal-800 underline underline-offset-2">
                  Open this sample
                  <span aria-hidden="true" className="transition group-hover:translate-x-0.5">→</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* What researchers get */}
      <section aria-labelledby="saved-heading" className={`${section} pt-14`}>
        <div className="grid gap-6 md:grid-cols-[1fr_1.1fr] md:items-start">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-teal-800">For researchers</p>
            <h2 id="saved-heading" className="font-display mt-1 text-3xl font-semibold tracking-tight">
              Records that explain themselves.
            </h2>
            <p className="mt-2 text-slate-800">
              Every submitted assessment shows which questions were raised, which answers the volunteer changed,
              and which they stood by. The reviewer view also shows which checks volunteers keep overriding, so
              the checks themselves can be improved.
            </p>
            <Link href="/reviewer" className={`${btnSecondary} mt-4`}>
              Open the reviewer view
            </Link>
          </div>
          <div>
            {records === null ? (
              <p className="text-slate-800">Loading…</p>
            ) : submitted.length === 0 ? (
              <p className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-800">No submitted assessments yet.</p>
            ) : (
              <ul className="space-y-2">
                {submitted.slice(0, 5).map((r) => {
                  const stats = qualityStats(r).total;
                  return (
                    <li key={r.id}>
                      <Link
                        href={`/record/${r.id}`}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm hover:border-teal-600"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-teal-900 underline underline-offset-2">
                            {r.assessment.streamName}
                          </span>
                          <span className="block text-sm text-slate-700">{formatWhen(r.submittedAt)}</span>
                        </span>
                        <span className="shrink-0 text-right text-sm text-slate-800">
                          <span className="block">{stats.raised} asked</span>
                          <span className="block">
                            {stats.fixed} fixed · {stats.kept} kept
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* Why it matters */}
      <section aria-labelledby="why-heading" className={`${section} pb-16 pt-14`}>
        <div className="rounded-3xl bg-teal-950 p-6 text-teal-50 sm:p-8">
          <h2 id="why-heading" className="font-display text-2xl font-semibold text-white">
            Healthy streams, healthy people.
          </h2>
          <p className="mt-2 max-w-3xl">
            OneAquaHealth studies how the health of urban streams is tied to the health of the people and
            animals living beside them. Volunteers cover far more streams than researchers ever could, but only
            if their observations can be relied on. RiffleCheck makes each observation a little more reliable
            without taking the judgement away from the person who was there.
          </p>
          <button
            type="button"
            onClick={start}
            className="mt-5 inline-flex min-h-12 items-center justify-center rounded-xl bg-white px-6 py-3 font-semibold text-teal-900 hover:bg-teal-50 focus-visible:outline-white"
          >
            Start a stream check
          </button>
        </div>
      </section>
    </div>
  );
}
