"use client";

import Link from "next/link";
import { useAiStatus } from "@/lib/client";

export function SiteHeader() {
  const ai = useAiStatus();
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold text-teal-800">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M2 8c3-3 5 3 8 0s5 3 8 0 3 1 4 0M2 15c3-3 5 3 8 0s5 3 8 0 3 1 4 0" />
          </svg>
          RiffleCheck
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 text-sm font-medium">
          <Link href="/" className="rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-100">
            Home
          </Link>
          <Link href="/reviewer" className="rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-100">
            Reviewer view
          </Link>
        </nav>
      </div>
      {ai && !ai.configured && (
        <p role="status" className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-950">
          <strong>Demo mode.</strong> No AI key is set. Rule checks run in full; AI review uses prepared
          responses for the three samples only.
        </p>
      )}
    </header>
  );
}
