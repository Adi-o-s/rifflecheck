"use client";

import { useState } from "react";
import { emptyAssessment, optionLabel } from "@/lib/fields";
import { RULES } from "@/lib/rules";
import { SeverityBadge, SourceBadge } from "./ui";

/**
 * A ten-second version of the whole app, on the home page. Two real questions
 * from the form and the real "clear but coloured" rule, so a visitor sees what
 * RiffleCheck does by doing it. As in the real form, nothing is changed for you:
 * "Fix it" asks you to change an answer yourself.
 */
const RULE = RULES.find((r) => r.id === "clear-but-coloured")!;

const CLARITY = ["clear", "cloudy"] as const;
const COLOUR = ["colourless", "brown"] as const;
const REASONS = ["It is stained brown, but I can see the bottom", "I double-checked on site"];

function Pills({
  legend,
  name,
  field,
  options,
  value,
  onChange,
  highlight,
}: {
  legend: string;
  name: string;
  field: "clarity" | "colour";
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  highlight: boolean;
}) {
  return (
    <fieldset className={`rounded-xl p-2 ${highlight ? "field-target" : ""}`}>
      <legend className="px-1 text-sm font-semibold text-slate-900">{legend}</legend>
      <div className="mt-1 grid grid-cols-2 gap-2">
        {options.map((option) => (
          <label
            key={option}
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium has-[:checked]:border-teal-700 has-[:checked]:bg-teal-50 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-teal-700"
          >
            <input
              type="radio"
              name={name}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
              className="size-4 shrink-0 accent-teal-700 focus-visible:outline-none"
            />
            {optionLabel(field, option)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function HeroDemo() {
  const [clarity, setClarity] = useState("clear");
  const [colour, setColour] = useState("");
  const [asked, setAsked] = useState<{ clarity: string; colour: string } | null>(null);
  const [mode, setMode] = useState<"none" | "fixing" | "keeping">("none");
  const [kept, setKept] = useState<string | null>(null);

  const answers = { ...emptyAssessment(), clarity, colour };
  const fires = RULE.test(answers, new Date()) !== null;

  const change = (next: { clarity: string; colour: string }) => {
    setClarity(next.clarity);
    setColour(next.colour);
    setKept(null);
    const willFire = RULE.test({ ...emptyAssessment(), ...next }, new Date()) !== null;
    if (willFire && !asked) setAsked(next);
    if (!willFire) setMode("none");
  };

  const reset = () => {
    setClarity("clear");
    setColour("");
    setAsked(null);
    setMode("none");
    setKept(null);
  };

  const done = (fires && kept !== null) || (!fires && asked !== null);

  return (
    <div className="rise w-full max-w-md rounded-3xl bg-white p-4 text-left text-slate-900 shadow-2xl shadow-teal-950/40 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">Try it here · 10 seconds</p>
      <p className="font-display mt-1 text-xl font-semibold">You are at a stream. What do you see?</p>

      <div className="mt-2 space-y-1">
        <Pills
          legend="How clear is the water?"
          name="demo-clarity"
          field="clarity"
          options={CLARITY}
          value={clarity}
          onChange={(v) => change({ clarity: v, colour })}
          highlight={mode === "fixing"}
        />
        <Pills
          legend="What colour is the water?"
          name="demo-colour"
          field="colour"
          options={COLOUR}
          value={colour}
          onChange={(v) => change({ clarity, colour: v })}
          highlight={mode === "fixing"}
        />
      </div>

      <div aria-live="polite" className="mt-3">
        {!fires && !asked ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-800">
            {colour === "" ? (
              <>
                Now pick <strong>Brown</strong> and watch what happens.
              </>
            ) : (
              <>
                These two answers fit together, so nothing is asked. Try <strong>Clear</strong> with{" "}
                <strong>Brown</strong>.
              </>
            )}
          </p>
        ) : null}

        {fires && kept === null ? (
          <div className="rise rounded-2xl border-2 border-amber-300 bg-amber-50 p-3 text-amber-950">
            <div className="flex flex-wrap gap-2">
              <SeverityBadge severity="check" />
              <SourceBadge source="rule" />
            </div>
            <p className="mt-2 font-semibold">{RULE.concern(answers)}</p>
            {mode === "none" ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode("fixing")}
                  className="min-h-11 rounded-xl bg-teal-700 px-3 text-sm font-semibold text-white hover:bg-teal-800"
                >
                  Fix it
                </button>
                <button
                  type="button"
                  onClick={() => setMode("keeping")}
                  className="min-h-11 rounded-xl border border-slate-400 bg-white px-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                >
                  Keep my answer
                </button>
              </div>
            ) : null}
            {mode === "fixing" ? (
              <p className="mt-2 text-sm">
                Change whichever answer above is not right. RiffleCheck never changes it for you.
              </p>
            ) : null}
            {mode === "keeping" ? (
              <div className="mt-2">
                <p className="text-sm font-semibold">Why are you keeping it?</p>
                <div className="mt-1 space-y-1.5">
                  {REASONS.map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => {
                        setKept(reason);
                        setMode("none");
                      }}
                      className="block min-h-11 w-full rounded-xl border border-slate-400 bg-white px-3 py-2 text-left text-sm font-medium text-slate-900 hover:bg-slate-50"
                    >
                      {reason}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {done ? (
          <div className="rise rounded-2xl border-2 border-teal-300 bg-teal-50 p-3 text-teal-950">
            <p className="flex items-center gap-2 font-semibold">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 12 5 5 9-10" />
              </svg>
              {kept !== null ? "Kept, with your reason" : "Fixed by you"}
            </p>
            <p className="mt-1 text-sm">
              {kept !== null ? (
                <>“{kept}.” Your answers stay exactly as you gave them.</>
              ) : (
                <>
                  {asked && asked.clarity !== clarity
                    ? `Clarity: ${optionLabel("clarity", asked.clarity)} → ${optionLabel("clarity", clarity)}.`
                    : asked && asked.colour !== colour
                      ? `Colour: ${optionLabel("colour", asked.colour)} → ${optionLabel("colour", colour)}.`
                      : ""}{" "}
                  You changed it, not the app.
                </>
              )}
            </p>
            <p className="mt-2 text-sm">
              <strong>That is the whole idea.</strong> The researcher who reads this record later sees the
              question, your decision and your reason. The real form has more questions, {RULES.length} checks
              like this one, and an AI that reads your notes.
            </p>
            <button type="button" onClick={reset} className="mt-1 min-h-11 text-sm font-semibold text-teal-900 underline underline-offset-2">
              Try again
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
