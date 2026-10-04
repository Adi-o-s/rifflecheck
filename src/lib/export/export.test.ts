import { describe, expect, it } from "vitest";
import { seededRecords } from "../seed";
import { CSV_COLUMNS, toCsv } from "./csv";
import {
  OAH_CODE_SYSTEM,
  UCUM,
  buildFhirBundle,
  stableUuid,
  toFhirDateTime,
} from "./fhir";
import { toJsonExport } from "./json";

type Res = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const [clean, contradictory, unusual] = seededRecords();

function resources(record = contradictory): Res[] {
  const bundle = buildFhirBundle(record) as Res;
  return bundle.entry.map((e: Res) => e.resource);
}

function ofType(type: string, record = contradictory): Res[] {
  return resources(record).filter((r) => r.resourceType === type);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

describe("seeded records", () => {
  it("are submitted, with the audit trails the samples describe", () => {
    expect([clean, contradictory, unusual].map((r) => r.status)).toEqual(["submitted", "submitted", "submitted"]);
    expect(clean.flags).toEqual([]);
    expect(contradictory.flags.map((f) => [f.source, f.decision])).toEqual([
      ["rule", "fixed"],
      ["rule", "fixed"],
      ["ai", "fixed"],
      ["ai", "kept"],
    ]);
    expect(unusual.flags.map((f) => [f.severity, f.decision])).toEqual([["unusual", "kept"]]);
  });
});

describe("FHIR bundle", () => {
  it("is an R4 collection Bundle whose entries all have urn:uuid fullUrls matching their ids", () => {
    const bundle = buildFhirBundle(contradictory) as Res;
    expect(bundle.resourceType).toBe("Bundle");
    expect(bundle.type).toBe("collection");
    expect(bundle.timestamp).toMatch(DATE_TIME);
    for (const entry of bundle.entry) {
      expect(entry.resource.id).toMatch(UUID);
      expect(entry.fullUrl).toBe(`urn:uuid:${entry.resource.id}`);
    }
    const urls = bundle.entry.map((e: Res) => e.fullUrl);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("resolves every reference inside the bundle", () => {
    const bundle = buildFhirBundle(contradictory) as Res;
    const urls = new Set(bundle.entry.map((e: Res) => e.fullUrl));
    const refs: string[] = [];
    JSON.stringify(bundle, (key, value) => {
      if (key === "reference") refs.push(value);
      return value;
    });
    expect(refs.length).toBeGreaterThan(5);
    for (const ref of refs) expect(urls).toContain(ref);
  });

  it("has one Location with the name, mode and coordinates", () => {
    const [location, ...rest] = ofType("Location");
    expect(rest).toEqual([]);
    expect(location).toMatchObject({
      name: contradictory.assessment.streamName,
      mode: "instance",
      status: "active",
      position: { latitude: 40.1952, longitude: -8.4571 },
    });
    expect(location.identifier[0].value).toBeTruthy();
  });

  it("has one completed QuestionnaireResponse holding every answered question", () => {
    const [qr, ...rest] = ofType("QuestionnaireResponse");
    expect(rest).toEqual([]);
    expect(qr.status).toBe("completed");
    expect(qr.authored).toMatch(DATE_TIME);
    expect(qr.subject.reference).toMatch(/^urn:uuid:/);
    const items = qr.item.flatMap((group: Res) => group.item);
    const byId = Object.fromEntries(items.map((i: Res) => [i.linkId, i.answer]));
    expect(byId.streamName).toEqual([{ valueString: contradictory.assessment.streamName }]);
    expect(byId.ph).toEqual([{ valueDecimal: 7.9 }]);
    expect(byId.observedAt[0].valueDateTime).toMatch(DATE_TIME);
    expect(byId.clarity[0].valueCoding).toMatchObject({ code: "cloudy", display: "Cloudy" });
    expect(byId.landUse.map((a: Res) => a.valueCoding.code)).toEqual(["commercial", "roads"]);
    expect(byId.photo).toBeUndefined();
    for (const item of items) expect(item.answer.length).toBeGreaterThan(0);
  });

  it("has one final Observation per numeric measurement, with OAH codes and UCUM units", () => {
    const observations = ofType("Observation");
    expect(observations.map((o) => [o.code.coding[0].code, o.valueQuantity.value, o.valueQuantity.code])).toEqual([
      ["waterTemperature", 19, "Cel"],
      ["pH", 7.9, "[pH]"],
      ["dissolvedO2", 4.2, "mg/L"],
    ]);
    for (const o of observations) {
      expect(o.status).toBe("final");
      expect(o.code.coding[0].system).toBe(OAH_CODE_SYSTEM);
      expect(o.code.text).toBeTruthy();
      expect(o.valueQuantity.system).toBe(UCUM);
      expect(o.effectiveDateTime).toMatch(DATE_TIME);
      expect(o.subject.reference).toMatch(/^urn:uuid:/);
      expect(o.performer.length).toBeGreaterThan(0);
    }
  });

  it("leaves out Observations for measurements that were not taken", () => {
    expect(ofType("Observation", unusual).map((o) => o.code.coding[0].code)).toEqual(["waterTemperature"]);
  });

  it("carries the audit trail as Provenance: one for the record and one per flag decision", () => {
    const provenance = ofType("Provenance");
    expect(provenance).toHaveLength(1 + contradictory.flags.length);
    for (const p of provenance) {
      expect(p.target.length).toBeGreaterThan(0);
      expect(p.recorded).toMatch(DATE_TIME);
      expect(p.agent[0].who.display).toContain("volunteer");
    }
    const keptOne = provenance.find((p) => p.reason)!;
    expect(keptOne.reason[0].text).toContain("rain started");
    expect(keptOne.activity.text).toContain("kept");
    expect(keptOne.agent[1].who.display).toContain("AI review");
    expect(keptOne.entity).toBeUndefined();
    expect(keptOne.text.div).toContain("Reason given");

    const fixedClarity = provenance.find((p) => p.agent[1]?.who.display.includes("clear-but-coloured"))!;
    expect(fixedClarity.activity.coding[0].code).toBe("UPDATE");
    expect(fixedClarity.entity).toEqual([
      {
        role: "revision",
        what: {
          identifier: { system: "https://rifflecheck.example/fhir/field", value: "clarity" },
          display: 'Clarity: before "Clear", after "Cloudy"',
        },
      },
    ]);
  });

  it("uses no extensions, so it validates without a custom profile", () => {
    expect(JSON.stringify(buildFhirBundle(contradictory))).not.toContain('"extension"');
  });

  it("still includes a Provenance when no flags were raised", () => {
    expect(ofType("Provenance", clean)).toHaveLength(1);
  });

  it("produces well-formed narrative XHTML even when notes contain markup characters", () => {
    const record = structuredClone(unusual);
    record.flags[0].reason = 'Checked <twice> & it is "right"';
    const kept = ofType("Provenance", record).find((p) => p.reason)!;
    expect(kept.text.div).toContain("&lt;twice&gt; &amp; it is &quot;right&quot;");
    expect(kept.text.div.startsWith('<div xmlns="http://www.w3.org/1999/xhtml">')).toBe(true);
  });

  it("is identical on every download of the same record", () => {
    expect(JSON.stringify(buildFhirBundle(contradictory))).toBe(JSON.stringify(buildFhirBundle(contradictory)));
    expect(stableUuid("a")).toMatch(UUID);
    expect(stableUuid("a")).not.toBe(stableUuid("b"));
  });

  it("writes date-times with seconds and an offset", () => {
    expect(toFhirDateTime("2026-09-22T17:10")).toMatch(/^2026-09-22T17:10:00[+-]\d{2}:\d{2}$/);
  });
});

describe("CSV export", () => {
  function parse(csv: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = "";
    let quoted = false;
    const endCell = () => {
      row.push(cell);
      cell = "";
    };
    for (let i = 0; i < csv.length; i++) {
      const c = csv[i];
      if (quoted) {
        if (c === '"' && csv[i + 1] === '"') {
          cell += '"';
          i++;
        } else if (c === '"') quoted = false;
        else cell += c;
      } else if (c === '"') quoted = true;
      else if (c === ",") endCell();
      else if (c === "\n") {
        endCell();
        rows.push(row);
        row = [];
      } else if (c !== "\r") cell += c;
    }
    return rows;
  }

  it("has a header and exactly one row per assessment, all the same width", () => {
    const rows = parse(toCsv([clean, contradictory, unusual]));
    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual(CSV_COLUMNS);
    for (const row of rows) expect(row).toHaveLength(CSV_COLUMNS.length);
  });

  it("matches the record: labels for choices, bare numbers, flag counts and reasons", () => {
    const rows = parse(toCsv([contradictory]));
    const get = (name: string) => rows[1][CSV_COLUMNS.indexOf(name)];
    expect(get("streamName")).toBe("Ribeira dos Covoes (sample)");
    expect(get("clarity")).toBe("Cloudy");
    expect(get("ph")).toBe("7.9");
    expect(get("landUse")).toBe("Shops or offices; Roads or car parks");
    expect(get("flags_raised")).toBe("4");
    expect(get("flags_fixed")).toBe("3");
    expect(get("flags_kept")).toBe("1");
    expect(get("has_overrides")).toBe("yes");
    expect(get("kept_reasons")).toContain("rain started");
  });

  it("keeps commas, quotes and line breaks in notes inside one cell", () => {
    const record = structuredClone(clean);
    record.assessment.notes = 'Saw "two" fish,\nthen a heron';
    const rows = parse(toCsv([record]));
    expect(rows).toHaveLength(2);
    expect(rows[1][CSV_COLUMNS.indexOf("notes")]).toBe('Saw "two" fish,\nthen a heron');
  });

  it("stops text being run as a spreadsheet formula, but leaves negative numbers alone", () => {
    const record = structuredClone(clean);
    record.assessment.notes = "=HYPERLINK(1)";
    const rows = parse(toCsv([record]));
    expect(rows[1][CSV_COLUMNS.indexOf("notes")]).toBe("'=HYPERLINK(1)");
    expect(rows[1][CSV_COLUMNS.indexOf("longitude")]).toBe("-8.4107");
  });
});

describe("JSON export", () => {
  it("carries answers, labels, audit trail and counts, without the photo data", () => {
    const record = structuredClone(unusual);
    record.assessment.photo = "data:image/jpeg;base64,AAAA";
    const out = toJsonExport(record);
    expect(JSON.stringify(out)).not.toContain("base64");
    expect(out.answers.photoAttached).toBe(true);
    expect(out.answers.odour).toBe("sewage");
    expect(out.labels.odour).toBe("Sewage");
    expect(out.auditTrail).toHaveLength(1);
    expect(out.dataQuality.total).toMatchObject({ raised: 1, kept: 1, fixed: 0 });
  });
});
