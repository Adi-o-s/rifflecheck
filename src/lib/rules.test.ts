import { describe, expect, it } from "vitest";
import { emptyAssessment } from "./fields";
import { RULES, contextNotes, hasErrors, missingRequired, runRules } from "./rules";
import { TEST_NOW, cleanAssessment } from "./testing";
import type { Assessment } from "./types";

function flagsFor(overrides: Partial<Assessment>) {
  return runRules(cleanAssessment(overrides), TEST_NOW);
}

function find(overrides: Partial<Assessment>, id: string) {
  return flagsFor(overrides).find((f) => f.id === id);
}

describe("rule table", () => {
  it("has unique ids and declares the fields each rule reads", () => {
    const ids = RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const rule of RULES) expect(rule.reads.length).toBeGreaterThan(0);
  });

  it("only ever flags fields that the rule declares it reads", () => {
    const messy = cleanAssessment({
      flow: "dry",
      ph: 15,
      temperatureC: 55,
      dissolvedOxygen: 30,
      colour: "brown",
      odour: "sewage",
      surface: "oil",
      clarity: "clear",
      notes: "very muddy",
      life: ["none", "fish"],
    });
    const flags = runRules(messy, TEST_NOW);
    for (const flag of flags) {
      const rule = RULES.find((r) => r.id === flag.id);
      if (!rule) continue;
      for (const f of flag.fields) expect(rule.reads).toContain(f);
    }
  });

  it("raises nothing for a clean assessment", () => {
    expect(flagsFor({})).toEqual([]);
  });
});

describe("hard limits (error)", () => {
  it.each([
    ["ph-range", { ph: 15 }],
    ["ph-range", { ph: -0.5 }],
    ["temperature-range", { temperatureC: 41 }],
    ["temperature-range", { temperatureC: -2 }],
    ["oxygen-range", { dissolvedOxygen: 20.5 }],
    ["oxygen-range", { dissolvedOxygen: -1 }],
    ["latitude-range", { latitude: 91 }],
    ["longitude-range", { longitude: -181 }],
  ] as [string, Partial<Assessment>][])("%s fires for %o", (id, overrides) => {
    const flag = find(overrides, id);
    expect(flag?.severity).toBe("error");
    expect(flag?.fields).toEqual([Object.keys(overrides)[0]]);
  });

  it.each([
    ["ph-range", { ph: 0 }],
    ["ph-range", { ph: 14 }],
    ["ph-range", { ph: null }],
    ["temperature-range", { temperatureC: -1 }],
    ["temperature-range", { temperatureC: 40 }],
    ["oxygen-range", { dissolvedOxygen: 0 }],
    ["oxygen-range", { dissolvedOxygen: 20 }],
  ] as [string, Partial<Assessment>][])("%s does not fire for %o", (id, overrides) => {
    expect(find(overrides, id)).toBeUndefined();
  });

  it("names the value that was entered", () => {
    expect(find({ ph: 15 }, "ph-range")?.concern).toContain("15");
  });

  it("flags a date in the future", () => {
    const flag = find({ observedAt: "2026-10-02T09:00" }, "date-future");
    expect(flag?.severity).toBe("error");
    expect(flag?.fields).toEqual(["observedAt"]);
  });

  it("accepts a date in the past", () => {
    expect(find({ observedAt: "2026-09-30T09:00" }, "date-future")).toBeUndefined();
  });
});

describe("dry stream with water readings (error)", () => {
  const dry: Partial<Assessment> = {
    flow: "dry",
    colour: "",
    clarity: "",
    surface: "",
    temperatureC: null,
    ph: null,
    dissolvedOxygen: null,
    life: ["none"],
  };

  it("fires and names both fields when a temperature is entered", () => {
    const flag = find({ ...dry, temperatureC: 14 }, "dry-with-water-readings");
    expect(flag?.severity).toBe("error");
    expect(flag?.fields).toEqual(["flow", "temperatureC"]);
    expect(flag?.concern).toContain("Dry");
    expect(flag?.concern).toContain("water temperature");
  });

  it.each(["clarity", "colour", "ph", "dissolvedOxygen"] as const)("fires when %s is entered", (key) => {
    const value = key === "clarity" ? "clear" : key === "colour" ? "brown" : 7;
    const flag = find({ ...dry, [key]: value }, "dry-with-water-readings");
    expect(flag?.fields).toEqual(["flow", key]);
  });

  it("does not fire for a dry stream with no water answers", () => {
    expect(flagsFor(dry)).toEqual([]);
  });

  it("does not fire when there is water", () => {
    expect(find({ flow: "slow" }, "dry-with-water-readings")).toBeUndefined();
  });
});

describe("'none' ticked with other answers (error)", () => {
  it("fires for life", () => {
    expect(find({ life: ["none", "fish"] }, "life-none-with-others")?.severity).toBe("error");
  });
  it("fires for pollution sources", () => {
    expect(
      find({ pollutionSources: ["none_seen", "pipe"] }, "sources-none-with-others")?.severity,
    ).toBe("error");
  });
  it("does not fire for 'none' alone", () => {
    expect(find({ life: ["none"], vegetation: "sparse" }, "life-none-with-others")).toBeUndefined();
    expect(find({ pollutionSources: ["none_seen"] }, "sources-none-with-others")).toBeUndefined();
  });
});

describe("clear water but coloured or muddy (check)", () => {
  it("fires for clear and brown, phrased as a question", () => {
    const flag = find({ colour: "brown" }, "clear-but-coloured");
    expect(flag?.severity).toBe("check");
    expect(flag?.fields).toEqual(["clarity", "colour"]);
    expect(flag?.concern).toMatch(/\?$/);
  });

  it("fires for clear and grey", () => {
    expect(find({ colour: "grey" }, "clear-but-coloured")).toBeDefined();
  });

  it.each(["Lots of mud on the bottom", "Silty water", "Very MUDDY today"])(
    "fires when the notes say: %s",
    (notes) => {
      const flag = find({ notes }, "clear-but-coloured");
      expect(flag?.fields).toEqual(["clarity", "notes"]);
    },
  );

  it("does not fire for cloudy brown water", () => {
    expect(find({ clarity: "cloudy", colour: "brown" }, "clear-but-coloured")).toBeUndefined();
  });

  it("does not match words that only contain 'mud'", () => {
    expect(find({ notes: "Mudlark bird on the bank" }, "clear-but-coloured")).toBeUndefined();
  });
});

describe("pollution signs but no source seen (check)", () => {
  it.each([
    [{ odour: "sewage" }, ["odour", "pollutionSources"]],
    [{ odour: "chemical" }, ["odour", "pollutionSources"]],
    [{ surface: "oil" }, ["surface", "pollutionSources"]],
  ] as [Partial<Assessment>, string[]][])("fires for %o", (overrides, fields) => {
    const flag = find({ ...overrides, life: ["fish"] }, "pollution-signs-no-source");
    expect(flag?.severity).toBe("check");
    expect(flag?.fields).toEqual(fields);
    expect(flag?.concern).toMatch(/\?$/);
  });

  it("does not fire when a source was recorded", () => {
    expect(
      find({ odour: "sewage", pollutionSources: ["pipe"], life: ["fish"] }, "pollution-signs-no-source"),
    ).toBeUndefined();
  });

  it("does not fire for an earthy smell or foam", () => {
    expect(find({ odour: "earthy", surface: "foam" }, "pollution-signs-no-source")).toBeUndefined();
  });
});

describe("sensitive larvae with pollution signs (unusual)", () => {
  it.each([
    [{ odour: "sewage", pollutionSources: ["pipe"] }, ["life", "odour"]],
    [{ clarity: "opaque" }, ["life", "clarity"]],
  ] as [Partial<Assessment>, string[]][])("fires for %o", (overrides, fields) => {
    const flag = find(overrides, "sensitive-life-with-pollution-signs");
    expect(flag?.severity).toBe("unusual");
    expect(flag?.fields).toEqual(fields);
  });

  it("says the combination is uncommon and never that it is wrong", () => {
    const flag = find({ odour: "sewage", pollutionSources: ["pipe"] }, "sensitive-life-with-pollution-signs");
    const text = `${flag?.concern} ${flag?.why}`.toLowerCase();
    expect(text).toContain("uncommon");
    expect(text).toContain("second look");
    expect(text).not.toMatch(/\b(wrong|incorrect|mistake|error|impossible)\b/);
  });

  it("does not fire without the larvae", () => {
    expect(
      find({ odour: "sewage", pollutionSources: ["pipe"], life: ["snails"] }, "sensitive-life-with-pollution-signs"),
    ).toBeUndefined();
  });
});

describe("no life in a healthy-looking stream (unusual)", () => {
  it("fires for none + dense vegetation + clear water", () => {
    const flag = find({ life: ["none"] }, "no-life-in-healthy-looking-stream");
    expect(flag?.severity).toBe("unusual");
    expect(flag?.concern.toLowerCase()).toContain("uncommon");
    expect(`${flag?.concern} ${flag?.why}`.toLowerCase()).not.toMatch(/\b(wrong|incorrect|mistake)\b/);
  });

  it.each([{ vegetation: "sparse" }, { clarity: "cloudy" }] as Partial<Assessment>[])(
    "does not fire when %o",
    (overrides) => {
      expect(find({ life: ["none"], ...overrides }, "no-life-in-healthy-looking-stream")).toBeUndefined();
    },
  );
});

describe("raining now but no rain in 48 hours (check)", () => {
  it.each(["light_rain", "heavy_rain"])("fires for %s with rain48h 'no', phrased as a question", (weather) => {
    const flag = find({ weather, rain48h: "no" }, "raining-now-no-recent-rain");
    expect(flag?.severity).toBe("check");
    expect(flag?.fields).toEqual(["weather", "rain48h"]);
    expect(flag?.concern).toMatch(/\?$/);
  });

  it("does not fire when rain was recorded, or when it is dry now", () => {
    expect(find({ weather: "heavy_rain", rain48h: "yes" }, "raining-now-no-recent-rain")).toBeUndefined();
    expect(find({ weather: "cloudy", rain48h: "no" }, "raining-now-no-recent-rain")).toBeUndefined();
  });
});

describe("overall impression 'Good' with pollution signs (unusual)", () => {
  it.each([
    [{ odour: "sewage", pollutionSources: ["pipe"], life: ["snails"] }, ["overallImpression", "odour"]],
    [{ surface: "oil", pollutionSources: ["pipe"] }, ["overallImpression", "surface"]],
    [{ clarity: "opaque", life: ["snails"] }, ["overallImpression", "clarity"]],
  ] as [Partial<Assessment>, string[]][])("fires for %o", (overrides, fields) => {
    const flag = find(overrides, "good-impression-with-pollution-signs");
    expect(flag?.severity).toBe("unusual");
    expect(flag?.fields).toEqual(fields);
    const text = `${flag?.concern} ${flag?.why}`.toLowerCase();
    expect(text).toContain("uncommon");
    expect(text).not.toMatch(/\b(wrong|incorrect|mistake)\b/);
  });

  it.each(["moderate", "poor", "unsure", ""])("does not fire when the impression is %j", (overallImpression) => {
    expect(
      find({ overallImpression, odour: "sewage", pollutionSources: ["pipe"], life: ["snails"] }, "good-impression-with-pollution-signs"),
    ).toBeUndefined();
  });
});

describe("required fields (error)", () => {
  it("lists every required field on an empty form", () => {
    const missing = missingRequired(emptyAssessment());
    expect(missing).toEqual(
      expect.arrayContaining(["streamName", "latitude", "longitude", "observedAt", "flow", "clarity", "life"]),
    );
    expect(missing).not.toContain("ph");
    expect(missing).not.toContain("notes");
    expect(missing).not.toContain("photo");
  });

  it("raises one error per missing field", () => {
    const flags = flagsFor({ streamName: "", weather: "" });
    expect(flags.map((f) => f.id)).toEqual(["required:streamName", "required:weather"]);
    expect(hasErrors(flags)).toBe(true);
  });

  it("does not ask for water appearance when the stream is dry", () => {
    const missing = missingRequired(cleanAssessment({ flow: "dry", colour: "", clarity: "", surface: "" }));
    expect(missing).toEqual([]);
  });
});

describe("recent rain and cloudy water (context note, not a flag)", () => {
  it.each(["cloudy", "opaque"])("attaches a note for %s water after rain", (clarity) => {
    const a = cleanAssessment({ rain48h: "yes", clarity, life: ["fish"], overallImpression: "moderate" });
    expect(contextNotes(a)).toHaveLength(1);
    expect(contextNotes(a)[0]).toContain("rain");
    expect(runRules(a, TEST_NOW)).toEqual([]);
  });

  it("attaches nothing when the water is clear or there was no rain", () => {
    expect(contextNotes(cleanAssessment({ rain48h: "yes" }))).toEqual([]);
    expect(contextNotes(cleanAssessment({ rain48h: "no", clarity: "cloudy" }))).toEqual([]);
  });
});
