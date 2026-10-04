import { describe, expect, it, vi } from "vitest";
import { runRules } from "../rules";
import { SAMPLES } from "../seed";
import { cleanAssessment } from "../testing";
import { SYSTEM_PROMPT, buildPayload, buildUserMessage } from "./prompt";
import { isGrounded, parseResponse, reviewAssessment, sanitise, violatesPolicy } from "./review";

const GOOD = {
  flags: [
    {
      fields: ["flow", "notes"],
      concern: "Your notes and flow answer seem to differ. Could you look again?",
      why: 'Flow is "Fast" but the notes say the water is barely moving.',
      question: "How quickly does a leaf move downstream?",
      confidence: "high",
    },
  ],
  summary: "The flow was recorded as fast with clear water. Fish and dragonflies were seen.",
};

function geminiReply(text: string, status = 200): Response {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status });
}

function fetchReturning(...replies: (Response | Error)[]) {
  const mock = vi.fn(async () => {
    const next = replies.shift();
    if (!next) throw new Error("unexpected extra call");
    if (next instanceof Error) throw next;
    return next;
  });
  return mock as unknown as typeof fetch & typeof mock;
}

const assessment = cleanAssessment({ flow: "fast", notes: "Water barely moving" });

describe("live AI review", () => {
  it("returns validated flags and the summary", async () => {
    const fetchImpl = fetchReturning(geminiReply(JSON.stringify(GOOD)));
    const result = await reviewAssessment({ assessment }, { apiKey: "k", fetchImpl });
    expect(result.mode).toBe("live");
    expect(result.flags).toHaveLength(1);
    expect(result.flags[0].fields).toEqual(["flow", "notes"]);
    expect(result.summary).toBe(GOOD.summary);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("sends the key in a header, never in the URL", async () => {
    const fetchImpl = fetchReturning(geminiReply(JSON.stringify(GOOD)));
    await reviewAssessment({ assessment }, { apiKey: "secret-key", fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain("secret-key");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("secret-key");
  });

  it("retries once when the output is broken, then succeeds", async () => {
    const fetchImpl = fetchReturning(geminiReply("{ not json"), geminiReply(JSON.stringify(GOOD)));
    const result = await reviewAssessment({ assessment }, { apiKey: "k", fetchImpl });
    expect(result.mode).toBe("live");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries once when the output has the wrong shape", async () => {
    const wrong = JSON.stringify({ flags: [{ fields: ["flow"], concern: "x" }], summary: "s" });
    const fetchImpl = fetchReturning(geminiReply(wrong), geminiReply(JSON.stringify(GOOD)));
    const result = await reviewAssessment({ assessment }, { apiKey: "k", fetchImpl });
    expect(result.mode).toBe("live");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("falls back to rule checks with a notice after two broken outputs, without throwing", async () => {
    const fetchImpl = fetchReturning(geminiReply("garbage"), geminiReply("more garbage"));
    const result = await reviewAssessment({ assessment }, { apiKey: "k", fetchImpl });
    expect(result).toMatchObject({ mode: "failed", flags: [], summary: null });
    expect(result.notice).toContain("AI review unavailable, rule checks only");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries on a different model when the first one is rate limited", async () => {
    const fetchImpl = fetchReturning(geminiReply("{}", 429), geminiReply(JSON.stringify(GOOD)));
    const result = await reviewAssessment(
      { assessment },
      { apiKey: "k", model: "main-model", fallbackModel: "other-model", fetchImpl },
    );
    expect(result).toMatchObject({ mode: "live", model: "other-model" });
    const urls = fetchImpl.mock.calls.map((call) => (call as unknown as [string])[0]);
    expect(urls[0]).toContain("main-model");
    expect(urls[1]).toContain("other-model");
  });

  it("falls back when the network fails or the service errors", async () => {
    const fetchImpl = fetchReturning(new Error("network down"), geminiReply("{}", 429));
    const result = await reviewAssessment({ assessment }, { apiKey: "k", fetchImpl });
    expect(result.mode).toBe("failed");
    expect(result.flags).toEqual([]);
  });
});

describe("demo mode (no key)", () => {
  it("gives a prepared response for a built-in sample, and says so", async () => {
    const sample = SAMPLES.find((s) => s.id === "sample-contradictory")!;
    const result = await reviewAssessment({ assessment: sample.assessment, seedId: sample.id });
    expect(result.mode).toBe("demo");
    expect(result.flags.map((f) => f.fields)).toEqual([
      ["flow", "notes"],
      ["notes", "pollutionSources"],
    ]);
    expect(result.notice).toContain("Demo mode");
  });

  it("returns no flags for the clean sample", async () => {
    const sample = SAMPLES.find((s) => s.id === "sample-clean")!;
    const result = await reviewAssessment({ assessment: sample.assessment, seedId: sample.id });
    expect(result.flags).toEqual([]);
    expect(runRules(sample.assessment, new Date("2026-10-01T12:00:00"))).toEqual([]);
  });

  it("drops a prepared flag once the answers it refers to have changed", async () => {
    const sample = SAMPLES.find((s) => s.id === "sample-contradictory")!;
    const edited = { ...sample.assessment, flow: "slow" };
    const result = await reviewAssessment({ assessment: edited, seedId: sample.id });
    expect(result.flags.map((f) => f.fields)).toEqual([["notes", "pollutionSources"]]);
  });

  it("says AI review is unavailable for anything else", async () => {
    const result = await reviewAssessment({ assessment });
    expect(result).toMatchObject({ mode: "unavailable", flags: [], summary: null });
    expect(result.notice).toContain("AI review unavailable, rule checks only");
  });

  it("only ever quotes text that is in the sample's answers", async () => {
    const sample = SAMPLES.find((s) => s.id === "sample-contradictory")!;
    const result = await reviewAssessment({ assessment: sample.assessment, seedId: sample.id });
    const shown = JSON.stringify(buildPayload(sample.assessment, [], []));
    for (const flag of result.flags) {
      for (const quoted of flag.why.match(/"[^"]+"/g) ?? []) {
        expect(shown).toContain(quoted.slice(1, -1));
      }
    }
  });
});

describe("output guards", () => {
  it("accepts JSON wrapped in a code fence", () => {
    expect(parseResponse("```json\n" + JSON.stringify(GOOD) + "\n```").flags).toHaveLength(1);
  });

  it("rejects an unknown confidence value", () => {
    const bad = { ...GOOD, flags: [{ ...GOOD.flags[0], confidence: "certain" }] };
    expect(() => parseResponse(JSON.stringify(bad))).toThrow();
  });

  it("drops flags that name fields which do not exist or were never shown to the AI", () => {
    const response = parseResponse(
      JSON.stringify({
        ...GOOD,
        flags: [
          { ...GOOD.flags[0], fields: ["turbidityNTU"] },
          { ...GOOD.flags[0], fields: ["latitude"] },
          { ...GOOD.flags[0], fields: ["flow", "madeUp"] },
        ],
      }),
    );
    expect(sanitise(response, []).flags.map((f) => f.fields)).toEqual([["flow"]]);
  });

  it("drops a flag that repeats a rule flag", () => {
    const rules = runRules(cleanAssessment({ colour: "brown" }));
    const response = parseResponse(
      JSON.stringify({ ...GOOD, flags: [{ ...GOOD.flags[0], fields: ["colour", "clarity"] }] }),
    );
    expect(sanitise(response, rules).flags).toEqual([]);
  });

  it.each([
    "This stream has a health score of 4 out of 10.",
    "I would rate it 3/10.",
    "It is not safe to swim here.",
    "You should not let children paddle in it.",
    "The water is contaminated by sewage.",
    "Your clarity answer is wrong.",
  ])("drops text that breaks the rules: %s", (text) => {
    expect(violatesPolicy(text)).toBe(true);
    const response = parseResponse(JSON.stringify({ flags: [{ ...GOOD.flags[0], why: text }], summary: text }));
    expect(sanitise(response, [])).toEqual({ flags: [], summary: null, dropped: 1 });
  });

  it("lets ordinary questions through", () => {
    expect(violatesPolicy(GOOD.flags[0].concern)).toBe(false);
    expect(violatesPolicy("Is there a pipe nearby that you may have missed?")).toBe(false);
  });
});

describe("grounding guard", () => {
  const payload = buildPayload(cleanAssessment({ flow: "fast", notes: "Water barely moving", temperatureC: 15.5 }), [], []);

  it("accepts text that only quotes and counts what was submitted", () => {
    expect(isGrounded('Flow is "Fast" but the notes say "Water barely moving".', payload)).toBe(true);
    expect(isGrounded("Water temperature is 15.5 and rain in the last 48 hours is No.", payload)).toBe(true);
  });

  it("rejects a quoted value that was never entered", () => {
    expect(isGrounded('Odour is "Sewage" but the notes say nothing about a smell.', payload)).toBe(false);
  });

  it("rejects a number that was never entered", () => {
    expect(isGrounded("A temperature of 31 seems high for this flow.", payload)).toBe(false);
  });

  it("drops an invented flag from a live reply and reports how many were dropped", async () => {
    const invented = {
      ...GOOD,
      flags: [
        GOOD.flags[0],
        { ...GOOD.flags[0], fields: ["odour", "notes"], why: 'Odour is "Rotten egg" but the notes do not mention a smell.' },
      ],
    };
    const fetchImpl = fetchReturning(geminiReply(JSON.stringify(invented)));
    const result = await reviewAssessment({ assessment }, { apiKey: "k", fetchImpl });
    expect(result.flags.map((f) => f.fields)).toEqual([["flow", "notes"]]);
    expect(result.dropped).toBe(1);
  });

  it("discards a summary that mentions something not in the answers", async () => {
    const reply = { flags: [], summary: 'The volunteer saw "otters" and measured a pH of 3.' };
    const fetchImpl = fetchReturning(geminiReply(JSON.stringify(reply)));
    const result = await reviewAssessment({ assessment }, { apiKey: "k", fetchImpl });
    expect(result.summary).toBeNull();
  });
});

describe("prompt", () => {
  it("forbids scores, stated causes, health advice and corrections", () => {
    expect(SYSTEM_PROMPT).toMatch(/Never give a stream health score/);
    expect(SYSTEM_PROMPT).toMatch(/Never state a cause of pollution as fact/);
    expect(SYSTEM_PROMPT).toMatch(/Never give health, safety or medical advice/);
    expect(SYSTEM_PROMPT).toMatch(/Never tell the volunteer an answer is wrong/);
    expect(SYSTEM_PROMPT).toMatch(/return an empty "flags" list/);
  });

  it("does not send the photo or exact coordinates", () => {
    const a = cleanAssessment({ photo: "data:image/jpeg;base64,AAAA" });
    const message = buildUserMessage(buildPayload(a, [], []));
    expect(message).not.toContain("base64");
    expect(message).not.toContain("40.2203");
    expect(message).not.toContain("latitude");
  });

  it("tells the model what the rules already flagged", () => {
    const a = cleanAssessment({ colour: "brown" });
    const payload = buildPayload(a, runRules(a), []);
    expect(payload.already_flagged_by_rules[0].fields).toEqual(["clarity", "colour"]);
  });
});
