/**
 * Load and abuse test for a running RiffleCheck server.
 *
 *   npm run build && GEMINI_API_KEY= npx next start -p 3100     (demo mode, so no AI quota is used)
 *   node scripts/stress-http.mjs http://localhost:3100
 */
import { readFileSync } from "node:fs";

const base = process.argv[2] || "http://localhost:3100";
const sample = JSON.parse(readFileSync("examples/sample-contradictory.json", "utf8")).answers;
delete sample.photoAttached;
const valid = { ...sample, photo: null, latitude: null, longitude: null };
let failures = 0;
const fail = (message) => {
  failures++;
  console.log(`   !! ${message}`);
};

async function timed(fn) {
  const start = performance.now();
  try {
    const response = await fn();
    await response.arrayBuffer();
    return { status: response.status, ms: performance.now() - start };
  } catch (error) {
    return { status: `error:${error.cause?.code ?? error.name}`, ms: performance.now() - start };
  }
}

async function load(name, total, concurrency, makeRequest) {
  const results = [];
  let next = 0;
  const started = performance.now();
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < total) results.push(await timed(() => makeRequest(next++)));
    }),
  );
  const seconds = (performance.now() - started) / 1000;
  const times = results.map((r) => r.ms).sort((a, b) => a - b);
  const q = (p) => Math.round(times[Math.min(times.length - 1, Math.floor(times.length * p))]);
  const counts = {};
  for (const r of results) counts[r.status] = (counts[r.status] ?? 0) + 1;
  console.log(
    `${name}: ${total} requests, ${concurrency} at a time, ${Math.round(total / seconds)}/s | p50 ${q(0.5)} ms, p95 ${q(0.95)} ms, p99 ${q(0.99)} ms, max ${q(1)} ms | ${JSON.stringify(counts)}`,
  );
  return counts;
}

const post = (body, headers = {}) =>
  fetch(`${base}/api/review`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const ip = (n) => ({ "x-forwarded-for": `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}` });

console.log(`Target: ${base}\n`);

// 1. Pages under load.
const pages = ["/", "/reviewer", "/assess/does-not-exist", "/record/sample-clean", "/no-such-page"];
const pageCounts = await load("pages", 3000, 100, (i) => fetch(base + pages[i % pages.length]));
if (Object.keys(pageCounts).some((s) => !["200", "404"].includes(s))) fail("a page returned something other than 200 or 404");

// 2. API in demo mode under load, each request from a different caller.
const apiCounts = await load("api (demo, distinct callers)", 3000, 100, (i) =>
  post({ seedId: "sample-contradictory", assessment: valid }, ip(i + 1)),
);
if (apiCounts["200"] !== 3000) fail("not every API request succeeded");

// 3. Rate limit: one caller hammering.
const limited = await load("api (one caller hammering)", 200, 20, () => post({ assessment: valid }, ip(999_999)));
if (limited["200"] !== 12 || limited["429"] !== 188) fail(`expected 12 allowed and 188 refused, got ${JSON.stringify(limited)}`);

// 4. Hostile and malformed requests: must be refused cleanly, never a 500.
const deep = JSON.parse("[".repeat(5000) + "]".repeat(5000));
const cases = [
  ["empty body", "", 400],
  ["not JSON", "{oops", 400],
  ["JSON null", "null", 400],
  ["array instead of object", "[]", 400],
  ["deeply nested array", deep, 400],
  ["wrong types", { assessment: { ...valid, ph: "seven", life: "fish" } }, 400],
  ["unknown extra fields only", { assessment: { evil: true } }, 400],
  ["photo smuggled in", { assessment: { ...valid, photo: "data:image/jpeg;base64,AAAA" } }, 400],
  ["prototype pollution attempt", '{"__proto__":{"polluted":true},"assessment":{"__proto__":{"x":1}}}', 400],
  ["notes far too long", { assessment: { ...valid, notes: "x".repeat(4001) } }, 400],
  ["body over the size cap", { assessment: { ...valid, notes: "x".repeat(30_000) } }, 413],
  ["5 MB body", "x".repeat(5_000_000), 413],
  ["rule error present (pH 15)", { assessment: { ...valid, ph: 15 } }, 409],
  ["script tag and control characters in notes", { assessment: { ...valid, notes: "<script>alert(1)</script>\u0000\u001b" } }, 200],
  ["emoji, RTL and CJK in notes", { assessment: { ...valid, streamName: "🐟 العربية 中文", notes: "🦆" } }, 200],
  ["unknown option values", { assessment: { ...valid, flow: "sideways", life: ["dragons"] } }, 200],
];
console.log("\nhostile and malformed requests:");
for (const [i, [name, body, expected]] of cases.entries()) {
  const response = await post(body, ip(2_000_000 + i)).catch((error) => ({ status: `error:${error.name}`, text: async () => "" }));
  const text = await response.text();
  const ok = response.status === expected;
  if (!ok) fail(`${name}: expected ${expected}, got ${response.status} ${text.slice(0, 120)}`);
  else console.log(`   ok  ${String(response.status).padEnd(4)} ${name}`);
  if (/AIza|AQ\.|api[_-]?key/i.test(text)) fail(`${name}: response mentions a key`);
}

// 5. Wrong methods.
for (const method of ["PUT", "DELETE", "PATCH"]) {
  const response = await fetch(`${base}/api/review`, { method });
  if (response.status !== 405) fail(`${method} returned ${response.status}, expected 405`);
}
console.log("   ok  405  PUT, DELETE, PATCH");

// 6. Still healthy afterwards, and nothing was polluted.
const health = await fetch(`${base}/api/review`).then((r) => r.json());
if (typeof health.configured !== "boolean" || ({}).polluted) fail("server unhealthy after the abuse run");
const headers = (await fetch(base)).headers;
for (const name of ["x-content-type-options", "x-frame-options", "referrer-policy"]) {
  if (!headers.get(name)) fail(`missing security header ${name}`);
}
console.log(`\n${failures === 0 ? "All stress checks passed." : `${failures} failure(s).`}`);
process.exit(failures === 0 ? 0 : 1);
