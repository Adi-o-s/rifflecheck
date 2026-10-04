"use client";

import { useState } from "react";
import { downscalePhoto } from "@/lib/client";
import { field, type FieldDef } from "@/lib/fields";
import type { Assessment, FieldKey } from "@/lib/types";
import { SeverityIcon, btnQuiet, btnSecondary } from "./ui";

export interface FieldProps {
  def: FieldDef;
  assessment: Assessment;
  onChange: (patch: Partial<Assessment>) => void;
  /** Error messages to show under this field. */
  errors: string[];
  /** True when "Fix it" sent the volunteer to this field. */
  target: boolean;
  maxDateTime: string;
}

const inputClass =
  "block min-h-12 w-full rounded-xl border border-slate-400 bg-white px-3 py-2 text-base text-slate-900 placeholder:text-slate-500 aria-[invalid=true]:border-red-600";

function isOptional(def: FieldDef): boolean {
  return !def.required && !def.requiredUnlessDry;
}

function LabelText({ def }: { def: FieldDef }) {
  return (
    <>
      {def.label}
      {def.unit ? <span className="font-normal text-slate-700"> ({def.unit})</span> : null}
      {isOptional(def) ? <span className="font-normal text-slate-600"> · optional</span> : null}
    </>
  );
}

function Errors({ id, errors }: { id: string; errors: string[] }) {
  if (errors.length === 0) return null;
  return (
    <ul id={id} className="mt-2 space-y-1">
      {errors.map((message) => (
        <li key={message} className="flex gap-1.5 text-sm font-medium text-red-800">
          <SeverityIcon severity="error" className="mt-0.5 size-4" />
          <span>
            <span className="sr-only">Error: </span>
            {message}
          </span>
        </li>
      ))}
    </ul>
  );
}

function describedBy(key: FieldKey, hasErrors: boolean): string {
  return hasErrors ? `help-${key} error-${key}` : `help-${key}`;
}

function NumberInput({
  def,
  value,
  onChange,
  invalid,
}: {
  def: FieldDef;
  value: number | null;
  onChange: (value: number | null) => void;
  invalid: boolean;
}) {
  // Keep the typed text locally so "7." or "-" is not wiped while typing.
  const [text, setText] = useState(value === null ? "" : String(value));
  return (
    <input
      id={`input-${def.key}`}
      type="number"
      inputMode="decimal"
      step="any"
      className={inputClass}
      value={text}
      aria-invalid={invalid}
      aria-describedby={describedBy(def.key, invalid)}
      onChange={(event) => {
        const next = event.target.value;
        setText(next);
        const parsed = next.trim() === "" ? null : Number(next);
        onChange(parsed !== null && Number.isFinite(parsed) ? parsed : null);
      }}
    />
  );
}

function Shell({ def, target, errors, children }: Pick<FieldProps, "def" | "target" | "errors"> & { children: React.ReactNode }) {
  return (
    <div id={`field-${def.key}`} className={`scroll-mt-24 p-2 -m-1 ${target ? "field-target" : ""}`}>
      <label htmlFor={`input-${def.key}`} className="block text-base font-semibold text-slate-900">
        <LabelText def={def} />
      </label>
      <p id={`help-${def.key}`} className="mb-2 mt-0.5 text-sm text-slate-700">
        {def.helper}
      </p>
      {children}
      <Errors id={`error-${def.key}`} errors={errors} />
    </div>
  );
}

function ChoiceGroup({ def, assessment, onChange, errors, target }: FieldProps) {
  const multi = def.type === "multi";
  const value = assessment[def.key];
  const selected = multi ? (value as string[]) : value ? [value as string] : [];
  // Short answers with no explanation sit two to a row, to save scrolling on a phone.
  const compact = (def.options ?? []).every((o) => !o.hint && o.label.length <= 16);
  const toggle = (option: string) => {
    if (!multi) return onChange({ [def.key]: option });
    const next = selected.includes(option) ? selected.filter((v) => v !== option) : [...selected, option];
    // Keep the order of the options list, so exports are stable.
    const ordered = (def.options ?? []).map((o) => o.value).filter((v) => next.includes(v));
    onChange({ [def.key]: ordered });
  };
  return (
    <div id={`field-${def.key}`} className={`scroll-mt-24 p-2 -m-1 ${target ? "field-target" : ""}`}>
    <fieldset aria-describedby={describedBy(def.key, errors.length > 0)}>
      <legend className="text-base font-semibold text-slate-900">
        <LabelText def={def} />
      </legend>
      <p id={`help-${def.key}`} className="mb-2 mt-0.5 text-sm text-slate-700">
        {def.helper}
      </p>
      <div className={`grid gap-2 ${compact ? "grid-cols-2" : "sm:grid-cols-2"}`}>
        {(def.options ?? []).map((option) => (
          <label
            key={option.value}
            className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-slate-300 bg-white px-3 py-2.5 has-[:checked]:border-teal-700 has-[:checked]:bg-teal-50 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-teal-700"
          >
            <input
              type={multi ? "checkbox" : "radio"}
              name={def.key}
              value={option.value}
              checked={selected.includes(option.value)}
              onChange={() => toggle(option.value)}
              className="mt-0.5 size-5 shrink-0 accent-teal-700 focus-visible:outline-none"
            />
            <span>
              <span className="block font-medium text-slate-900">{option.label}</span>
              {option.hint ? <span className="block text-sm text-slate-700">{option.hint}</span> : null}
            </span>
          </label>
        ))}
      </div>
      {!multi && selected.length > 0 ? (
        <button type="button" className={`${btnQuiet} mt-1`} onClick={() => onChange({ [def.key]: "" })}>
          Clear this answer
        </button>
      ) : null}
      <Errors id={`error-${def.key}`} errors={errors} />
    </fieldset>
    </div>
  );
}

function PhotoField({ def, assessment, onChange, errors, target }: FieldProps) {
  const [problem, setProblem] = useState("");
  return (
    <Shell def={def} target={target} errors={problem ? [...errors, problem] : errors}>
      {assessment.photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- a local data URL, nothing to optimise
        <img src={assessment.photo} alt="The photo you attached" className="mb-2 max-h-56 rounded-xl border border-slate-300" />
      ) : null}
      <input
        id={`input-${def.key}`}
        type="file"
        accept="image/*"
        capture="environment"
        aria-describedby={`help-${def.key}`}
        className="block w-full text-sm text-slate-800 file:mr-3 file:min-h-12 file:rounded-xl file:border file:border-slate-300 file:bg-white file:px-4 file:font-semibold file:text-slate-900"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          try {
            setProblem("");
            onChange({ photo: await downscalePhoto(file) });
          } catch {
            setProblem("That file could not be read as a photo.");
          }
        }}
      />
      {assessment.photo ? (
        <button type="button" className={`${btnQuiet} mt-1`} onClick={() => onChange({ photo: null })}>
          Remove photo
        </button>
      ) : null}
    </Shell>
  );
}

/** Latitude and longitude together, with a button to read them from the device. */
export function LocationField({
  assessment,
  onChange,
  errorsFor,
  targets,
}: {
  assessment: Assessment;
  onChange: (patch: Partial<Assessment>) => void;
  errorsFor: (key: FieldKey) => string[];
  targets: FieldKey[];
}) {
  const [status, setStatus] = useState("");
  // Bumped when the device fills the boxes, so the inputs pick up the new numbers.
  const [version, setVersion] = useState(0);

  const locate = () => {
    if (!("geolocation" in navigator)) {
      setStatus("This device cannot share its location. Please type the numbers in.");
      return;
    }
    setStatus("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onChange({
          latitude: Number(position.coords.latitude.toFixed(5)),
          longitude: Number(position.coords.longitude.toFixed(5)),
        });
        setVersion((v) => v + 1);
        setStatus("Location filled in from your device. Check it looks right.");
      },
      () => setStatus("Could not get your location. Please type the numbers in, or try again."),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  return (
    <fieldset className="p-1">
      <legend className="text-base font-semibold text-slate-900">Location</legend>
      <p className="mb-2 mt-0.5 text-sm text-slate-700">
        Where you are standing. Use the button, or type the numbers from a map app.
      </p>
      <button type="button" className={btnSecondary} onClick={locate}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
        </svg>
        Use my current location
      </button>
      <p role="status" className="mt-2 min-h-5 text-sm text-slate-700">
        {status}
      </p>
      <div className="mt-1 grid grid-cols-2 gap-3">
        {(["latitude", "longitude"] as const).map((key) => {
          const def = field(key);
          const errors = errorsFor(key);
          return (
            <div key={key} id={`field-${key}`} className={`scroll-mt-24 ${targets.includes(key) ? "field-target" : ""}`}>
              <label htmlFor={`input-${key}`} className="block text-sm font-semibold text-slate-900">
                {def.label}
              </label>
              <p id={`help-${key}`} className="sr-only">
                {def.helper}
              </p>
              <NumberInput
                key={version}
                def={def}
                value={assessment[key]}
                invalid={errors.length > 0}
                onChange={(value) => onChange({ [key]: value })}
              />
              <Errors id={`error-${key}`} errors={errors} />
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

export function FormField(props: FieldProps) {
  const { def, assessment, onChange, errors, target, maxDateTime } = props;
  const invalid = errors.length > 0;
  const common = {
    id: `input-${def.key}`,
    className: inputClass,
    "aria-invalid": invalid,
    "aria-describedby": describedBy(def.key, invalid),
  };

  switch (def.type) {
    case "single":
    case "multi":
      return <ChoiceGroup {...props} />;
    case "photo":
      return <PhotoField {...props} />;
    case "number":
      return (
        <Shell def={def} target={target} errors={errors}>
          <NumberInput
            def={def}
            value={assessment[def.key] as number | null}
            invalid={invalid}
            onChange={(value) => onChange({ [def.key]: value })}
          />
        </Shell>
      );
    case "datetime":
      return (
        <Shell def={def} target={target} errors={errors}>
          <input
            {...common}
            type="datetime-local"
            max={maxDateTime}
            value={assessment[def.key] as string}
            onChange={(event) => onChange({ [def.key]: event.target.value })}
          />
        </Shell>
      );
    case "longtext":
      return (
        <Shell def={def} target={target} errors={errors}>
          <textarea
            {...common}
            rows={4}
            maxLength={2000}
            value={assessment[def.key] as string}
            onChange={(event) => onChange({ [def.key]: event.target.value })}
          />
        </Shell>
      );
    default:
      return (
        <Shell def={def} target={target} errors={errors}>
          <input
            {...common}
            type="text"
            maxLength={120}
            autoComplete="off"
            value={assessment[def.key] as string}
            onChange={(event) => onChange({ [def.key]: event.target.value })}
          />
        </Shell>
      );
  }
}
