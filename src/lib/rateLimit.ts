/**
 * A small in-memory limiter for the AI route, so a public deployment cannot be
 * used to burn through the API quota. It is per server instance, which is
 * enough to blunt abuse on a prototype; a shared store would be needed at scale.
 */
const WINDOW_MS = 60_000;
export const MAX_REQUESTS_PER_WINDOW = 12;

const hits = new Map<string, number[]>();

export function allowRequest(key: string, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    for (const [k, times] of hits) if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
  }
  return true;
}

export function resetRateLimit(): void {
  hits.clear();
}
