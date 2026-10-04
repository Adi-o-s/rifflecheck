import { emptyAssessment } from "./fields";
import type { Assessment } from "./types";

/** A complete, internally consistent assessment that raises no flags. Test fixture. */
export function cleanAssessment(overrides: Partial<Assessment> = {}): Assessment {
  return {
    ...emptyAssessment("2026-09-20T10:30"),
    streamName: "Ribeira de Coselhas",
    latitude: 40.2203,
    longitude: -8.4107,
    weather: "sunny",
    rain48h: "no",
    flow: "moderate",
    colour: "colourless",
    clarity: "clear",
    odour: "none",
    surface: "none",
    temperatureC: 15.5,
    ph: 7.4,
    dissolvedOxygen: 9.1,
    vegetation: "81-100-percent",
    erosion: "none",
    channel: "natural",
    landUse: ["park", "housing"],
    pollutionSources: ["none_seen"],
    life: ["fish", "dragonflies", "mayfly_stonefly"],
    overallImpression: "good",
    notes: "Water running over stones. Saw two small fish near the footbridge.",
    ...overrides,
  };
}

export const TEST_NOW = new Date("2026-10-01T12:00:00");
