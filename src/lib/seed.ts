import { applyAiReview, keepAnswer, newRecord, submit, syncFlags, updateAssessment } from "./audit";
import { cannedReview } from "./ai/canned";
import { REVIEW_STEP, emptyAssessment } from "./fields";
import type { Assessment, AssessmentRecord } from "./types";

export interface Sample {
  id: string;
  title: string;
  blurb: string;
  assessment: Assessment;
}

/**
 * Three made-up assessments for trying the app. Stream names are real streams
 * in Coimbra, Portugal (a OneAquaHealth research city); every answer is invented.
 */
export const SAMPLES: Sample[] = [
  {
    id: "sample-clean",
    title: "Clean",
    blurb: "Every answer fits together. Expect zero flags.",
    assessment: {
      ...emptyAssessment("2026-09-20T10:30"),
      streamName: "Ribeira de Coselhas (sample)",
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
      vegetation: "dense",
      erosion: "none",
      channel: "natural",
      landUse: ["park", "housing"],
      pollutionSources: ["none_seen"],
      life: ["fish", "dragonflies", "mayfly_stonefly"],
      overallImpression: "good",
      notes: "Water running over stones. Saw two small fish near the footbridge.",
    },
  },
  {
    id: "sample-contradictory",
    title: "Contradictory",
    blurb: "Several answers disagree. Expect rule flags and AI flags.",
    assessment: {
      ...emptyAssessment("2026-09-22T17:10"),
      streamName: "Ribeira dos Covoes (sample)",
      latitude: 40.1952,
      longitude: -8.4571,
      weather: "heavy_rain",
      rain48h: "no",
      flow: "fast",
      colour: "brown",
      clarity: "clear",
      odour: "sewage",
      surface: "foam",
      temperatureC: 19,
      ph: 7.9,
      dissolvedOxygen: 4.2,
      vegetation: "sparse",
      erosion: "some",
      channel: "partly_modified",
      landUse: ["commercial", "roads"],
      pollutionSources: ["none_seen"],
      life: ["worms_midges", "algae_mats"],
      overallImpression: "poor",
      notes: "Water barely moving today. Lots of mud on the bottom. A pipe on the far bank was dripping into the stream.",
    },
  },
  {
    id: "sample-unusual",
    title: "Unusual but plausible",
    blurb: "An uncommon combination that the volunteer can explain and keep.",
    assessment: {
      ...emptyAssessment("2026-09-25T09:15"),
      streamName: "Ribeira de Eiras (sample)",
      latitude: 40.2431,
      longitude: -8.4302,
      weather: "cloudy",
      rain48h: "no",
      flow: "moderate",
      colour: "colourless",
      clarity: "clear",
      odour: "sewage",
      surface: "none",
      temperatureC: 14,
      ph: null,
      dissolvedOxygen: null,
      vegetation: "moderate",
      erosion: "none",
      channel: "natural",
      landUse: ["housing", "park"],
      pollutionSources: ["pipe"],
      life: ["mayfly_stonefly", "snails", "water_birds"],
      overallImpression: "moderate",
      notes:
        "Sewage smell comes from a manhole on the footpath, not from the water. Found three larvae with three tails under stones in the fast part.",
    },
  },
];

export function sample(id: string): Sample | undefined {
  return SAMPLES.find((s) => s.id === id);
}

/** A fresh draft of a sample, opened on the review screen so it can be replayed. */
export function draftFromSample(s: Sample, id: string, now: Date): AssessmentRecord {
  const draft = {
    ...newRecord(id, now, s.id),
    step: REVIEW_STEP,
    assessment: structuredClone(s.assessment),
  };
  return syncFlags(draft, now, "all");
}

function minutesAfter(local: string, minutes: number): Date {
  return new Date(new Date(local).getTime() + minutes * 60_000);
}

function must<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  if (!result.ok) throw new Error("Seed data is inconsistent");
  return result as Extract<T, { ok: true }>;
}

/**
 * Finished records for the reviewer view on first load. They are produced by
 * running the same functions the app uses, so their audit trails are real.
 */
function seededRecord(s: Sample, play: (r: AssessmentRecord, at: (m: number) => Date) => AssessmentRecord): AssessmentRecord {
  const at = (m: number) => minutesAfter(s.assessment.observedAt, m);
  let r = draftFromSample(s, s.id, at(4));
  r = applyAiReview(
    r,
    {
      mode: "demo",
      ...cannedReview(s.id, r.assessment),
      notice: "Demo mode: no AI key is set, so this is a prepared example response for the built-in sample.",
    },
    at(5),
  );
  r = play(r, at);
  return must(submit(r, at(9))).record;
}

export function seededRecords(): AssessmentRecord[] {
  const [clean, contradictory, unusual] = SAMPLES;
  return [
    seededRecord(clean, (r) => r),
    seededRecord(contradictory, (r, at) => {
      r = updateAssessment(r, { clarity: "cloudy" }, at(6));
      r = updateAssessment(r, { pollutionSources: ["pipe"] }, at(6));
      r = updateAssessment(r, { flow: "slow" }, at(7));
      return must(
        keepAnswer(
          r,
          "raining-now-no-recent-rain",
          "The rain started just as I arrived. It had been dry for the two days before.",
          at(8),
        ),
      ).record;
    }),
    seededRecord(unusual, (r, at) =>
      must(keepAnswer(r, "sensitive-life-with-pollution-signs", "I double-checked on site and it is correct", at(7)))
        .record,
    ),
  ];
}
