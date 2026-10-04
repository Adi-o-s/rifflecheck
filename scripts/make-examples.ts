/**
 * Writes the FHIR, JSON and CSV exports of the three built-in sample records to
 * examples/, so they can be inspected or validated without running the app.
 * Run with: npm run examples
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { toCsv } from "../src/lib/export/csv";
import { buildFhirBundle } from "../src/lib/export/fhir";
import { toJsonExport } from "../src/lib/export/json";
import { seededRecords } from "../src/lib/seed";

const records = seededRecords();
mkdirSync("examples", { recursive: true });
for (const record of records) {
  writeFileSync(`examples/${record.id}.fhir.json`, JSON.stringify(buildFhirBundle(record), null, 2) + "\n");
  writeFileSync(`examples/${record.id}.json`, JSON.stringify(toJsonExport(record), null, 2) + "\n");
}
writeFileSync("examples/samples.csv", toCsv(records));
console.log(`Wrote exports for ${records.length} sample records to examples/`);
