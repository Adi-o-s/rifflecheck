import type { ReactNode } from "react";
import type { Confidence, Severity, Source } from "@/lib/types";

export const btn =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 py-3 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60";
export const btnPrimary = `${btn} bg-teal-700 text-white hover:bg-teal-800`;
export const btnSecondary = `${btn} border border-slate-300 bg-white text-slate-900 hover:bg-slate-50`;
export const btnQuiet =
  "inline-flex min-h-11 items-center rounded-lg px-3 py-2 text-sm font-semibold text-teal-800 underline underline-offset-2 hover:bg-teal-50";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}>{children}</section>;
}

/**
 * Severity is always shown three ways: an icon with its own shape, a text
 * label, and a colour. Colour is never the only signal.
 */
const SEVERITY: Record<Severity, { label: string; classes: string; icon: ReactNode }> = {
  error: {
    label: "Must fix",
    classes: "border-red-300 bg-red-50 text-red-900",
    icon: (
      <>
        <path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z" />
        <path d="m9.5 9.5 5 5m0-5-5 5" />
      </>
    ),
  },
  check: {
    label: "Please check",
    classes: "border-amber-300 bg-amber-50 text-amber-950",
    icon: (
      <>
        <path d="M12 3 2 20h20z" />
        <path d="M12 10v4m0 3v.01" />
      </>
    ),
  },
  unusual: {
    label: "Unusual",
    classes: "border-sky-300 bg-sky-50 text-sky-950",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7m0 3v.01" />
      </>
    ),
  },
};

export function severityClasses(severity: Severity): string {
  return SEVERITY[severity].classes;
}

export function SeverityIcon({ severity, className = "size-5" }: { severity: Severity; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={`shrink-0 ${className}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {SEVERITY[severity].icon}
    </svg>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm font-semibold ${SEVERITY[severity].classes}`}>
      <SeverityIcon severity={severity} className="size-4" />
      {SEVERITY[severity].label}
    </span>
  );
}

export function SourceBadge({ source, confidence }: { source: Source; confidence?: Confidence }) {
  const ai = source === "ai";
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-sm font-medium text-slate-800">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {ai ? (
          <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z" />
        ) : (
          <path d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" />
        )}
      </svg>
      {ai ? "AI review" : "Rule check"}
      {ai && confidence ? <span className="text-slate-600">· {confidence} confidence</span> : null}
    </span>
  );
}

export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" }) {
  const classes =
    tone === "warn" ? "border-amber-300 bg-amber-50 text-amber-950" : "border-slate-300 bg-slate-50 text-slate-800";
  return (
    <p className={`flex gap-2 rounded-xl border px-3 py-2.5 text-sm ${classes}`}>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="mt-0.5 size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5m0-8v.01" />
      </svg>
      <span>{children}</span>
    </p>
  );
}
