import { FIELDS, coerceAssessment, displayValue, field, isEmpty } from "./fields";
import type { Assessment, FieldKey, Flag, Severity } from "./types";

/**
 * Layer 1: deterministic checks. No AI, runs in the browser, always available.
 *
 * Each rule reads a fixed set of fields. `test` returns the fields that are in
 * conflict (so the review screen can highlight them) or null when the rule does
 * not fire. Wording rules: "check" flags ask a question; "unusual" flags say the
 * combination is uncommon and never that it is wrong.
 */
export interface Rule {
  id: string;
  reads: FieldKey[];
  severity: Severity;
  test: (a: Assessment, now: Date) => FieldKey[] | null;
  concern: (a: Assessment) => string;
  why: (a: Assessment) => string;
  question?: string;
}

const SENSITIVE = "mayfly_stonefly";
const WATER_READINGS: FieldKey[] = ["clarity", "colour", "temperatureC", "ph", "dissolvedOxygen"];
const MUD_WORDS = /\b(mud|muddy|silt|silty)\b/i;

function outside(value: number | null, min: number, max: number): boolean {
  return value !== null && (value < min || value > max);
}

function rangeRule(key: FieldKey, id: string, what: string): Rule {
  const def = field(key);
  const min = def.min as number;
  const max = def.max as number;
  const unit = def.unit ? ` ${def.unit}` : "";
  return {
    id,
    reads: [key],
    severity: "error",
    test: (a) => (outside(a[key] as number | null, min, max) ? [key] : null),
    concern: (a) => `${what} must be between ${min} and ${max}${unit}. You entered ${a[key]}.`,
    why: () =>
      `A value outside ${min} to ${max}${unit} is not possible for a stream, so it is most likely a typing slip or a different unit.`,
    question: "Can you read the instrument again and re-enter the number?",
  };
}

function noneMixRule(key: FieldKey, id: string, noneValue: string): Rule {
  const def = field(key);
  const noneLabel = def.options?.find((o) => o.value === noneValue)?.label ?? noneValue;
  return {
    id,
    reads: [key],
    severity: "error",
    test: (a) => {
      const chosen = a[key] as string[];
      return chosen.includes(noneValue) && chosen.length > 1 ? [key] : null;
    },
    concern: () => `"${noneLabel}" is ticked together with other answers under "${def.label}".`,
    why: (a) =>
      `You chose: ${displayValue(key, a[key])}. "${noneLabel}" cannot be true at the same time as the others.`,
    question: `Which is right: "${noneLabel}", or the other answers?`,
  };
}

export const RULES: Rule[] = [
  rangeRule("ph", "ph-range", "pH"),
  rangeRule("temperatureC", "temperature-range", "Water temperature"),
  rangeRule("dissolvedOxygen", "oxygen-range", "Dissolved oxygen"),
  rangeRule("latitude", "latitude-range", "Latitude"),
  rangeRule("longitude", "longitude-range", "Longitude"),
  {
    id: "date-invalid",
    reads: ["observedAt"],
    severity: "error",
    test: (a) => (a.observedAt && !isValidLocalDateTime(a.observedAt) ? ["observedAt"] : null),
    concern: () => "The date and time could not be understood.",
    why: () => "The record needs a real calendar date and time so researchers know when the stream was visited.",
    question: "Can you pick the date and time again?",
  },
  {
    id: "date-future",
    reads: ["observedAt"],
    severity: "error",
    test: (a, now) => {
      if (!a.observedAt) return null;
      const t = new Date(a.observedAt).getTime();
      return Number.isFinite(t) && t > now.getTime() ? ["observedAt"] : null;
    },
    concern: () => "The date and time are in the future.",
    why: (a) =>
      `You entered ${displayValue("observedAt", a.observedAt)}, which has not happened yet. An observation can only be recorded for now or earlier.`,
    question: "What was the actual date and time of your visit?",
  },
  {
    id: "dry-with-water-readings",
    reads: ["flow", ...WATER_READINGS],
    severity: "error",
    test: (a) => {
      if (a.flow !== "dry") return null;
      const entered = WATER_READINGS.filter((k) => !isEmpty(a[k]));
      return entered.length ? ["flow", ...entered] : null;
    },
    concern: (a) => {
      const entered = WATER_READINGS.filter((k) => !isEmpty(a[k])).map((k) => inSentence(field(k).label));
      return `Flow is "Dry", but you also recorded ${listOf(entered)}.`;
    },
    why: () =>
      "A dry stream has no water to look at or measure, so these answers cannot both be right.",
    question: "Is there water in the stream? If yes, change the flow. If no, clear the water answers.",
  },
  noneMixRule("life", "life-none-with-others", "none"),
  noneMixRule("pollutionSources", "sources-none-with-others", "none_seen"),
  {
    id: "clear-but-coloured",
    reads: ["clarity", "colour", "notes"],
    severity: "check",
    test: (a) => {
      if (a.clarity !== "clear") return null;
      const fields: FieldKey[] = ["clarity"];
      if (a.colour === "brown" || a.colour === "grey") fields.push("colour");
      if (MUD_WORDS.test(a.notes)) fields.push("notes");
      return fields.length > 1 ? fields : null;
    },
    concern: (a) => {
      const parts: string[] = [];
      if (a.colour === "brown" || a.colour === "grey")
        parts.push(`the colour as ${displayValue("colour", a.colour).toLowerCase()}`);
      if (MUD_WORDS.test(a.notes)) parts.push("mud or silt in your notes");
      return `You marked the water as clear, and also recorded ${parts.join(" and ")}. Could you look again?`;
    },
    why: () =>
      "Brown or grey water, or water carrying mud or silt, is usually at least a little cloudy. Clear means you can see the bottom.",
    question: "Can you see the stream bed clearly through the water?",
  },
  {
    id: "pollution-signs-no-source",
    reads: ["odour", "surface", "pollutionSources"],
    severity: "check",
    test: (a) => {
      if (!a.pollutionSources.includes("none_seen")) return null;
      const fields: FieldKey[] = [];
      if (a.odour === "sewage" || a.odour === "chemical") fields.push("odour");
      if (a.surface === "oil") fields.push("surface");
      return fields.length ? [...fields, "pollutionSources"] : null;
    },
    concern: (a) => {
      const signs: string[] = [];
      if (a.odour === "sewage" || a.odour === "chemical")
        signs.push(`a ${displayValue("odour", a.odour).toLowerCase()} smell`);
      if (a.surface === "oil") signs.push("an oil sheen");
      return `You recorded ${signs.join(" and ")}, but no visible pollution source. Is there a pipe, drain or dumping nearby that you may have missed?`;
    },
    why: () =>
      "These signs usually come from somewhere close by. It is fine if you cannot see the source; the question is only whether you had a chance to look.",
    question: "Looking up and down the bank, can you see a pipe, drain, or anything dumped?",
  },
  {
    id: "sensitive-life-with-pollution-signs",
    reads: ["life", "odour", "clarity"],
    severity: "unusual",
    test: (a) => {
      if (!a.life.includes(SENSITIVE)) return null;
      const fields: FieldKey[] = ["life"];
      if (a.odour === "sewage") fields.push("odour");
      if (a.clarity === "opaque") fields.push("clarity");
      return fields.length > 1 ? fields : null;
    },
    concern: (a) => {
      const signs: string[] = [];
      if (a.odour === "sewage") signs.push("a sewage smell");
      if (a.clarity === "opaque") signs.push("opaque water");
      return `Mayfly or stonefly larvae together with ${signs.join(" and ")} is uncommon and worth a second look.`;
    },
    why: () =>
      "These larvae usually live in clean water, so finding them where the water smells of sewage or cannot be seen into does not happen often. It can happen, for example just after a spill or where the smell comes from somewhere else.",
    question: "Did the larvae have two or three tails, and where is the smell coming from?",
  },
  {
    id: "no-life-in-healthy-looking-stream",
    reads: ["life", "vegetation", "clarity"],
    severity: "unusual",
    test: (a) =>
      a.life.length === 1 && a.life[0] === "none" && a.vegetation === "dense" && a.clarity === "clear"
        ? ["life", "vegetation", "clarity"]
        : null,
    concern: () =>
      "No animals or plants in clear water with dense bank vegetation is uncommon and worth a second look.",
    why: () =>
      "Clear water with well-covered banks usually has at least some visible life, such as snails, insects or birds. Small animals are easy to miss on a short visit.",
    question: "Did you have a chance to look under a stone or along the water's edge?",
  },
  {
    id: "raining-now-no-recent-rain",
    reads: ["weather", "rain48h"],
    severity: "check",
    test: (a) =>
      (a.weather === "light_rain" || a.weather === "heavy_rain") && a.rain48h === "no" ? ["weather", "rain48h"] : null,
    concern: (a) =>
      `Weather now is "${displayValue("weather", a.weather)}", but rain in the last 48 hours is "No". Does that answer include today?`,
    why: () => "The last 48 hours include right now, so rain falling during your visit counts as recent rain.",
    question: "Has any rain fallen here today or in the two days before?",
  },
  {
    id: "good-impression-with-pollution-signs",
    reads: ["overallImpression", "odour", "surface", "clarity"],
    severity: "unusual",
    test: (a) => {
      if (a.overallImpression !== "good") return null;
      const fields: FieldKey[] = [];
      if (a.odour === "sewage" || a.odour === "chemical") fields.push("odour");
      if (a.surface === "oil") fields.push("surface");
      if (a.clarity === "opaque") fields.push("clarity");
      return fields.length ? ["overallImpression", ...fields] : null;
    },
    concern: (a) => {
      const signs: string[] = [];
      if (a.odour === "sewage" || a.odour === "chemical") signs.push(`a ${displayValue("odour", a.odour).toLowerCase()} smell`);
      if (a.surface === "oil") signs.push("an oil sheen");
      if (a.clarity === "opaque") signs.push("opaque water");
      return `An overall impression of "Good" together with ${listOf(signs)} is uncommon and worth a second look.`;
    },
    why: () =>
      "Your overall impression is your own judgement and stays yours. These signs are usually recorded at streams that people rate lower, so it helps researchers to know you weighed them.",
    question: "Thinking about the smell and look of the water, is Good still your overall impression?",
  },
];

/** Lower-case a label for use mid-sentence, leaving "pH" as it is. */
function inSentence(label: string): string {
  return label.startsWith("pH") ? label : label.charAt(0).toLowerCase() + label.slice(1);
}

function listOf(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function missingRequired(a: Assessment): FieldKey[] {
  return FIELDS.filter((f) => {
    const needed = f.required || (f.requiredUnlessDry && a.flow !== "dry");
    return needed && isEmpty(a[f.key]);
  }).map((f) => f.key);
}

/** One flag per missing required field, so each can be shown next to its input. */
function requiredFlags(a: Assessment): Flag[] {
  return missingRequired(a).map((key) => ({
    id: `required:${key}`,
    source: "rule",
    severity: "error",
    fields: [key],
    concern: `"${field(key).label}" needs an answer.`,
    why: "This answer is needed for the record to be usable by researchers.",
  }));
}

export function isRequiredFlag(flag: Pick<Flag, "id">): boolean {
  return flag.id.startsWith("required:");
}

/** True for "YYYY-MM-DDTHH:mm" (optionally with seconds) that names a real moment. */
export function isValidLocalDateTime(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (!match) return false;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day, hour, minute);
  return (
    year >= 1900 &&
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    hour < 24 &&
    minute < 60
  );
}

export function runRules(input: Assessment, now: Date = new Date()): Flag[] {
  // Never trust the shape of what comes in: it may be from damaged storage.
  const a = coerceAssessment(input);
  const flags: Flag[] = [];
  for (const rule of RULES) {
    const fields = rule.test(a, now);
    if (!fields) continue;
    flags.push({
      id: rule.id,
      source: "rule",
      severity: rule.severity,
      fields,
      concern: rule.concern(a),
      why: rule.why(a),
      question: rule.question,
    });
  }
  return [...requiredFlags(a), ...flags];
}

export function hasErrors(flags: Flag[]): boolean {
  return flags.some((f) => f.severity === "error");
}

/**
 * Context that explains an answer without questioning it. Stored on the record,
 * never shown as a flag.
 */
export function contextNotes(a: Assessment): string[] {
  const notes: string[] = [];
  if (a.rain48h === "yes" && (a.clarity === "cloudy" || a.clarity === "opaque")) {
    notes.push(
      `Rain was recorded in the last 48 hours. Recent rain can explain why the water is ${displayValue(
        "clarity",
        a.clarity,
      ).toLowerCase()}.`,
    );
  }
  return notes;
}
