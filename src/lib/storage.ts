"use client";

import { useSyncExternalStore } from "react";
import { coerceAssessment } from "./fields";
import { seededRecords } from "./seed";
import type { AssessmentRecord } from "./types";

/**
 * All assessments live in this browser's localStorage. There is no server
 * database and no account. The three sample records are written on first load.
 */
const KEY = "rifflecheck:records:v1";

let cache: AssessmentRecord[] | null = null;
const listeners = new Set<() => void>();

function persist(records: AssessmentRecord[]): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(records));
    return true;
  } catch {
    // Storage full or blocked (private mode). The in-memory copy still works for this visit.
    return false;
  }
}

function read(): AssessmentRecord[] {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        cache = parsed.filter(isUsable).map(repair);
        return cache;
      }
    }
  } catch {
    // Fall through to a fresh seed.
  }
  cache = seededRecords();
  persist(cache);
  return cache;
}

function isUsable(value: unknown): value is AssessmentRecord {
  const r = value as Partial<AssessmentRecord> | null;
  return !!r && typeof r === "object" && typeof r.id === "string" && (r.status === "draft" || r.status === "submitted");
}

/** Saved data can be damaged (a half-written save, an old version). Mend what can be mended. */
function repair(record: AssessmentRecord): AssessmentRecord {
  return {
    ...record,
    step: Number.isInteger(record.step) && record.step >= 1 && record.step <= 5 ? record.step : 1,
    assessment: coerceAssessment(record.assessment),
    flags: Array.isArray(record.flags) ? record.flags.filter((f) => f && typeof f.id === "string" && Array.isArray(f.fields)) : [],
    ai: record.ai && typeof record.ai === "object" ? record.ai : { status: "idle" },
    contextNotes: Array.isArray(record.contextNotes) ? record.contextNotes : [],
  };
}

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== KEY) return;
    cache = null;
    listener();
  };
  listeners.add(listener);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const getServerSnapshot = () => null;

/** Null until the browser has loaded the saved records. */
export function useRecords(): AssessmentRecord[] | null {
  return useSyncExternalStore(subscribe, read, getServerSnapshot);
}

export function useRecord(id: string): AssessmentRecord | null | undefined {
  const records = useRecords();
  if (records === null) return null;
  return records.find((r) => r.id === id);
}

/** Returns false if the browser refused to store it (for example, storage is full). */
export function saveRecord(record: AssessmentRecord): boolean {
  const records = read();
  const exists = records.some((r) => r.id === record.id);
  cache = exists ? records.map((r) => (r.id === record.id ? record : r)) : [record, ...records];
  const ok = persist(cache);
  emit();
  return ok;
}

export function deleteRecord(id: string): void {
  cache = read().filter((r) => r.id !== id);
  persist(cache);
  emit();
}

export function newId(): string {
  return crypto.randomUUID();
}
