import { beforeEach, describe, expect, it } from "vitest";
import { MAX_REQUESTS_PER_WINDOW, allowRequest, resetRateLimit } from "./rateLimit";

describe("AI route rate limit", () => {
  beforeEach(resetRateLimit);

  it("allows a normal burst and then refuses", () => {
    for (let i = 0; i < MAX_REQUESTS_PER_WINDOW; i++) expect(allowRequest("1.2.3.4", 1000 + i)).toBe(true);
    expect(allowRequest("1.2.3.4", 2000)).toBe(false);
  });

  it("counts each caller separately", () => {
    for (let i = 0; i < MAX_REQUESTS_PER_WINDOW; i++) allowRequest("1.2.3.4", 1000);
    expect(allowRequest("5.6.7.8", 1000)).toBe(true);
  });

  it("lets the caller back in after a minute", () => {
    for (let i = 0; i < MAX_REQUESTS_PER_WINDOW; i++) allowRequest("1.2.3.4", 1000);
    expect(allowRequest("1.2.3.4", 62_000)).toBe(true);
  });
});
