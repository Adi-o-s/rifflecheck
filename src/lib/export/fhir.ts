import { FIELDS, STEPS, displayValue, field, isEmpty, optionLabel } from "../fields";
import type { AssessmentRecord, FieldKey, Snapshot, TrackedFlag } from "../types";

/**
 * FHIR R4 export.
 *
 * Bundle (collection) containing:
 * - Location: the site, with latitude and longitude.
 * - QuestionnaireResponse: every answer, linkId = field key.
 * - Observation: one per numeric measurement that was entered, and one per
 *   qualitative answer that matches a OneAquaHealth indicator (flow, colour,
 *   odour, surface, bank vegetation, channel, land use, and fish / amphibians /
 *   birds seen).
 * - Provenance: one for the record, plus one per flag decision (the audit trail).
 *   Only standard elements are used: the decision in `activity`, the volunteer's
 *   reason in `reason`, who raised the flag in `agent`, and each changed answer
 *   as an `entity` with role "revision". The same detail is in the narrative.
 *
 * Codes: measurements use the OneAquaHealth implementation guide's own code
 * system (hl7-eu/oah, "TemporaryOahSystem"), read from the guide's source. No
 * LOINC code is used because none could be confirmed for stream water; see the
 * README section "Codes to confirm".
 */

export const OAH_IG = "http://hl7.eu/fhir/ig/oah";
export const OAH_CODE_SYSTEM = `${OAH_IG}/CodeSystem/temporarySystem-oah-eu`;
export const OAH_LOCATION_PROFILE = `${OAH_IG}/StructureDefinition/location-oah`;
export const OAH_OBSERVATION_PROFILE = `${OAH_IG}/StructureDefinition/observation-indicators-oah`;
export const UCUM = "http://unitsofmeasure.org";

/** Placeholder namespace for this prototype's own answer codes. */
export const LOCAL_BASE = "https://rifflecheck.example/fhir";

const PARTICIPANT_TYPE = "http://terminology.hl7.org/CodeSystem/provenance-participant-type";
const DATA_OPERATION = "http://terminology.hl7.org/CodeSystem/v3-DataOperation";

interface Measurement {
  key: "temperatureC" | "ph" | "dissolvedOxygen";
  oahCode: string;
  oahDisplay: string;
  unit: string;
  ucum: string;
}

export const MEASUREMENTS: Measurement[] = [
  { key: "temperatureC", oahCode: "waterTemperature", oahDisplay: "Water temperature", unit: "°C", ucum: "Cel" },
  { key: "ph", oahCode: "pH", oahDisplay: "pH", unit: "pH", ucum: "[pH]" },
  { key: "dissolvedOxygen", oahCode: "dissolvedO2", oahDisplay: "Dissolved O2", unit: "mg/L", ucum: "mg/L" },
];

/**
 * Answers that are not numbers but still match a OneAquaHealth indicator. The
 * guide's webinar says citizen reports should share the same Observation
 * profiles as sensor and lab data, so each of these also becomes an Observation
 * (category "survey") coded with the OAH indicator. Codes and displays are
 * copied from the IG's TemporaryOahSystem; "morophology" is its own spelling.
 */
interface Indicator {
  key: FieldKey;
  oahCode: string;
  oahDisplay: string;
}

export const INDICATORS: Indicator[] = [
  { key: "flow", oahCode: "hydrology", oahDisplay: "Hydrology of the stream" },
  { key: "colour", oahCode: "foam", oahDisplay: "Foam/colour/smell" },
  { key: "odour", oahCode: "foam", oahDisplay: "Foam/colour/smell" },
  { key: "surface", oahCode: "foam", oahDisplay: "Foam/colour/smell" },
  { key: "vegetation", oahCode: "riparianVegetation", oahDisplay: "Riparian vegetation" },
  { key: "channel", oahCode: "morophology", oahDisplay: "Morphology of the streams" },
  { key: "landUse", oahCode: "LandUse", oahDisplay: "Land use in the margins" },
];

/** Animals the volunteer ticked that have their own OAH indicator, recorded as "Present". */
export const LIFE_PRESENT: Record<string, { oahCode: string; oahDisplay: string }> = {
  fish: { oahCode: "fish", oahDisplay: "Fish" },
  frogs: { oahCode: "amphibians", oahDisplay: "Amphibians" },
  water_birds: { oahCode: "birds", oahDisplay: "Birds" },
};

const OBSERVATION_CATEGORY = "http://terminology.hl7.org/CodeSystem/observation-category";

const VOLUNTEER = { display: "Citizen science volunteer (anonymous)" };

type Json = Record<string, unknown>;

/** Deterministic UUID from a seed, so repeated downloads of a record are identical. */
export function stableUuid(seed: string): string {
  const part = (salt: number) => {
    let h = 0x811c9dc5 ^ salt;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, "0");
  };
  const hex = (part(1) + part(2) + part(3) + part(4)).split("");
  hex[12] = "4";
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const s = hex.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

/** "YYYY-MM-DDTHH:mm" in local time -> FHIR dateTime with seconds and a UTC offset. */
export function toFhirDateTime(local: string): string {
  const date = new Date(local);
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const pad = (n: number) => String(Math.abs(n)).padStart(2, "0");
  const base = local.length === 16 ? `${local}:00` : local.slice(0, 19);
  return `${base}${sign}${pad(Math.trunc(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function narrative(lines: string[]): Json {
  return {
    status: "generated",
    div: `<div xmlns="http://www.w3.org/1999/xhtml">${lines.map((l) => `<p>${escapeXml(l)}</p>`).join("")}</div>`,
  };
}

function answersFor(key: FieldKey, record: AssessmentRecord): Json[] {
  const def = field(key);
  const value = record.assessment[key];
  if (isEmpty(value)) return [];
  const coding = (v: string) => ({
    valueCoding: { system: `${LOCAL_BASE}/CodeSystem/${key}`, code: v, display: optionLabel(key, v) },
  });
  switch (def.type) {
    case "number":
      return [{ valueDecimal: value }];
    case "datetime":
      return [{ valueDateTime: toFhirDateTime(value as string) }];
    case "single":
      return [coding(value as string)];
    case "multi":
      return (value as string[]).map(coding);
    case "photo":
      return [];
    default:
      return [{ valueString: value }];
  }
}

function changes(flag: TrackedFlag): { key: FieldKey; before: string; after: string }[] {
  const keys = Array.from(
    new Set([...Object.keys(flag.before), ...Object.keys(flag.after ?? {})]),
  ) as FieldKey[];
  const show = (snap: Snapshot | undefined, key: FieldKey) =>
    snap && key in snap ? displayValue(key, snap[key]) : displayValue(key, null);
  return keys.map((key) => ({ key, before: show(flag.before, key), after: show(flag.after, key) }));
}

function raisedBy(flag: TrackedFlag, record: AssessmentRecord): string {
  if (flag.source === "rule") return `RiffleCheck rule check (${flag.id})`;
  const how = record.ai.mode === "live" ? record.ai.model ?? "language model" : "prepared demo response";
  return `RiffleCheck AI review (${how})`;
}

function decisionProvenance(flag: TrackedFlag, record: AssessmentRecord, responseRef: string): Json {
  const kept = flag.decision === "kept";
  const changed = changes(flag);
  const revised = changed.filter((c) => c.before !== c.after);
  const decidedAt = flag.decidedAt ?? record.submittedAt ?? record.updatedAt;
  return {
    resourceType: "Provenance",
    id: stableUuid(`${record.id}:provenance:${flag.id}`),
    text: narrative([
      `Flag ${flag.id} (${flag.source === "ai" ? "AI review" : "rule check"}, ${flag.severity}${
        flag.confidence ? `, ${flag.confidence} confidence` : ""
      }), raised ${flag.raisedAt}: ${flag.concern}`,
      kept
        ? `The volunteer kept their answer. Reason given: ${flag.reason}`
        : "The volunteer changed their answer.",
      ...changed.map((c) => `${field(c.key).label}: before "${c.before}", after "${c.after}"`),
    ]),
    target: [{ reference: responseRef }],
    occurredDateTime: decidedAt,
    recorded: decidedAt,
    // A fix is a revision of the answers. Keeping an answer has no standard
    // activity code, so it is described in text only.
    activity: kept
      ? { text: "Volunteer kept their answer after a flag" }
      : {
          coding: [{ system: DATA_OPERATION, code: "UPDATE", display: "revise" }],
          text: "Volunteer changed their answer after a flag",
        },
    ...(kept && flag.reason ? { reason: [{ text: flag.reason }] } : {}),
    agent: [
      {
        type: { coding: [{ system: PARTICIPANT_TYPE, code: "author", display: "Author" }] },
        who: VOLUNTEER,
      },
      { role: [{ text: `Raised the flag (${flag.source === "ai" ? "AI review" : "rule check"})` }], who: { display: raisedBy(flag, record) } },
    ],
    // The earlier answers that this decision revised, one entity per changed field.
    ...(revised.length
      ? {
          entity: revised.map((c) => ({
            role: "revision",
            what: {
              identifier: { system: `${LOCAL_BASE}/field`, value: c.key },
              display: `${field(c.key).label}: before "${c.before}", after "${c.after}"`,
            },
          })),
        }
      : {}),
  };
}

export function buildFhirBundle(record: AssessmentRecord): Json {
  const a = record.assessment;
  const authored = record.submittedAt ?? record.updatedAt;
  const effective = toFhirDateTime(a.observedAt);
  const urn = (id: string) => `urn:uuid:${id}`;

  const locationId = stableUuid(`${record.id}:location`);
  const responseId = stableUuid(`${record.id}:response`);
  const locationRef = { reference: urn(locationId), display: a.streamName };

  const location: Json = {
    resourceType: "Location",
    id: locationId,
    meta: { profile: [OAH_LOCATION_PROFILE] },
    text: narrative([
      `Stream assessment site: ${a.streamName}`,
      a.latitude !== null && a.longitude !== null ? `Latitude ${a.latitude}, longitude ${a.longitude}` : "No coordinates recorded",
    ]),
    identifier: [{ system: "urn:ietf:rfc:3986", value: urn(locationId) }],
    status: "active",
    name: a.streamName,
    description: "Citizen stream assessment site",
    mode: "instance",
    ...(a.latitude !== null && a.longitude !== null
      ? { position: { longitude: a.longitude, latitude: a.latitude } }
      : {}),
  };

  const response: Json = {
    resourceType: "QuestionnaireResponse",
    id: responseId,
    text: narrative([
      `Stream assessment of ${a.streamName}, observed ${displayValue("observedAt", a.observedAt)}.`,
      ...FIELDS.filter((f) => f.type !== "photo" && !isEmpty(a[f.key])).map(
        (f) => `${f.label}: ${displayValue(f.key, a[f.key])}`,
      ),
    ]),
    identifier: { system: "urn:ietf:rfc:3986", value: urn(stableUuid(`${record.id}:record`)) },
    status: "completed",
    subject: locationRef,
    authored,
    item: STEPS.map((step) => ({
      linkId: step.key,
      text: step.title,
      item: FIELDS.filter((f) => f.step === step.id)
        .map((f) => ({ linkId: f.key, text: f.label, answer: answersFor(f.key, record) }))
        .filter((item) => item.answer.length > 0),
    })).filter((group) => group.item.length > 0),
  };

  const observations: Json[] = MEASUREMENTS.filter((m) => a[m.key] !== null).map((m) => ({
    resourceType: "Observation",
    id: stableUuid(`${record.id}:observation:${m.key}`),
    meta: { profile: [OAH_OBSERVATION_PROFILE] },
    text: narrative([`${field(m.key).label}: ${displayValue(m.key, a[m.key])}, measured by the volunteer at ${a.streamName}.`]),
    status: "final",
    code: {
      coding: [{ system: OAH_CODE_SYSTEM, code: m.oahCode, display: m.oahDisplay }],
      text: field(m.key).label,
    },
    subject: locationRef,
    effectiveDateTime: effective,
    performer: [VOLUNTEER],
    valueQuantity: { value: a[m.key], unit: m.unit, system: UCUM, code: m.ucum },
    derivedFrom: [{ reference: urn(responseId) }],
  }));

  // Qualitative answers as OAH indicator Observations, one per answer chosen.
  const survey = (key: FieldKey, value: string, oah: { oahCode: string; oahDisplay: string }, present = false): Json => ({
    resourceType: "Observation",
    id: stableUuid(`${record.id}:observation:${key}:${value}`),
    meta: { profile: [OAH_OBSERVATION_PROFILE] },
    text: narrative([`${field(key).label}: ${optionLabel(key, value)}, as seen by the volunteer at ${a.streamName}.`]),
    status: "final",
    category: [{ coding: [{ system: OBSERVATION_CATEGORY, code: "survey", display: "Survey" }] }],
    code: {
      coding: [
        { system: OAH_CODE_SYSTEM, code: oah.oahCode, display: oah.oahDisplay },
        { system: `${LOCAL_BASE}/CodeSystem/question`, code: key, display: field(key).label },
      ],
      text: field(key).label,
    },
    subject: locationRef,
    effectiveDateTime: effective,
    performer: [VOLUNTEER],
    valueCodeableConcept: present
      ? {
          coding: [{ system: OAH_CODE_SYSTEM, code: "present", display: "Present" }],
          text: `${optionLabel(key, value)} seen`,
        }
      : {
          coding: [{ system: `${LOCAL_BASE}/CodeSystem/${key}`, code: value, display: optionLabel(key, value) }],
          text: optionLabel(key, value),
        },
    derivedFrom: [{ reference: urn(responseId) }],
  });
  for (const indicator of INDICATORS) {
    const value = a[indicator.key];
    const chosen = Array.isArray(value) ? value : typeof value === "string" && value ? [value] : [];
    for (const v of chosen) observations.push(survey(indicator.key, v, indicator));
  }
  for (const v of a.life) {
    if (LIFE_PRESENT[v]) observations.push(survey("life", v, LIFE_PRESENT[v], true));
  }

  const decided = record.flags.filter((f) => f.decision);
  const fixed = decided.filter((f) => f.decision === "fixed").length;
  const kept = decided.filter((f) => f.decision === "kept").length;

  const recordProvenance: Json = {
    resourceType: "Provenance",
    id: stableUuid(`${record.id}:provenance`),
    text: narrative([
      `Stream assessment recorded by a volunteer with RiffleCheck.`,
      `Flags raised: ${record.flags.length}. Fixed by the volunteer: ${fixed}. Kept by the volunteer: ${kept}.`,
      `AI review: ${record.ai.mode ?? "not run"}. No answer was changed automatically.`,
    ]),
    target: [{ reference: urn(responseId) }, ...observations.map((o) => ({ reference: urn(o.id as string) }))],
    occurredDateTime: effective,
    recorded: authored,
    location: { reference: urn(locationId) },
    activity: { coding: [{ system: DATA_OPERATION, code: "CREATE", display: "create" }] },
    agent: [
      {
        type: { coding: [{ system: PARTICIPANT_TYPE, code: "author", display: "Author" }] },
        who: VOLUNTEER,
      },
    ],
  };

  const resources = [
    location,
    response,
    ...observations,
    recordProvenance,
    ...decided.map((f) => decisionProvenance(f, record, urn(responseId))),
  ];

  return {
    resourceType: "Bundle",
    identifier: { system: "urn:ietf:rfc:3986", value: urn(stableUuid(`${record.id}:bundle`)) },
    type: "collection",
    timestamp: authored,
    entry: resources.map((resource) => ({ fullUrl: urn(resource.id as string), resource })),
  };
}
