"use client";

import { useEffect, useState } from "react";
import { UNAVAILABLE } from "./ai/review";
import type { AiReviewResult, AssessmentRecord } from "./types";

export interface AiStatus {
  configured: boolean;
  model: string | null;
}

/** Whether the server has an AI key. Null while loading or if the server cannot be reached. */
export function useAiStatus(): AiStatus | null {
  const [status, setStatus] = useState<AiStatus | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/review")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: AiStatus | null) => {
        if (!cancelled) setStatus(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return status;
}

/**
 * Ask the server for an AI review. Never throws: if the network is down or the
 * server misbehaves, the volunteer gets rule checks only, with a notice.
 */
export async function requestAiReview(record: AssessmentRecord): Promise<AiReviewResult> {
  const offline: AiReviewResult = {
    mode: "failed",
    flags: [],
    summary: null,
    notice: `${UNAVAILABLE} The review service could not be reached. You can try again, or carry on without it.`,
  };
  try {
    const response = await fetch("/api/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(40_000),
      // The photo and the exact location are not needed to check consistency, so they stay on the device.
      body: JSON.stringify({
        seedId: record.seedId,
        assessment: { ...record.assessment, photo: null, latitude: null, longitude: null },
      }),
    });
    if (!response.ok) return offline;
    const data = (await response.json()) as AiReviewResult;
    if (!data || !Array.isArray(data.flags)) return offline;
    return data;
  } catch {
    return offline;
  }
}

export function download(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function fileSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "assessment"
  );
}

/** Shrink a photo so it fits in localStorage. Returns a JPEG data URL. */
export async function downscalePhoto(file: File, maxSide = 800): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is not available");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.7);
}

export function formatWhen(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
