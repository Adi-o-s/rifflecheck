"use client";

import Link from "next/link";
import { useAiStatus } from "@/lib/client";

export function SiteHeader() {
  const ai = useAiStatus();
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-2.5">
        <Link href="/" className="font-display flex items-center gap-2 text-xl font-semibold text-teal-900">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M2 8c3-3 5 3 8 0s5 3 8 0 3 1 4 0M2 15c3-3 5 3 8 0s5 3 8 0 3 1 4 0" />
          </svg>
          RiffleCheck
          <span className="ml-1 hidden font-sans text-sm font-normal text-slate-600 md:inline">
            stream surveys with a built-in second look
          </span>
        </Link>
        <nav aria-label="Main" className="flex items-center text-sm font-medium">
          <Link href="/" className="whitespace-nowrap rounded-lg px-2.5 py-2 text-slate-700 hover:bg-slate-100">
            Home
          </Link>
          <Link href="/reviewer" className="whitespace-nowrap rounded-lg px-2.5 py-2 text-slate-700 hover:bg-slate-100">
            Reviewer view
          </Link>
        </nav>
      </div>
      {ai && !ai.configured && (
        <p role="status" className="border-t border-amber-200 bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-950 sm:text-sm">
          <strong>Demo mode.</strong> Rule checks run in full. AI review uses prepared responses for the three
          samples.
        </p>
      )}
    </header>
  );
}
