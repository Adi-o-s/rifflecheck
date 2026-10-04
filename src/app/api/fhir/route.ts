import { toTransaction } from "@/lib/export/fhir";
import { allowRequest } from "@/lib/rateLimit";

/**
 * Sends a record to a FHIR server: by default the OneAquaHealth project's
 * public sandbox. The browser cannot post there directly (the sandbox's
 * cross-origin headers are rejected by browsers), so this route relays it.
 * To avoid becoming an open relay it only forwards bundles shaped exactly
 * like the ones this app exports.
 */
const DEFAULT_SERVER = "https://sandbox.hl7europe.eu/oneaquahealth/fhir";
const MAX_BODY_BYTES = 400_000;
const MAX_ENTRIES = 80;
const ALLOWED = new Set(["Questionnaire", "Location", "QuestionnaireResponse", "Observation", "Provenance"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function server(): string | null {
  const configured = process.env.FHIR_SERVER_URL?.trim();
  if (configured?.toLowerCase() === "off") return null;
  return (configured || DEFAULT_SERVER).replace(/\/+$/, "");
}

type Entry = { fullUrl?: unknown; resource?: { resourceType?: unknown; id?: unknown } };

function isExportedBundle(value: unknown): value is { entry: { fullUrl: string; resource: Record<string, unknown> }[] } {
  const bundle = value as { resourceType?: unknown; type?: unknown; entry?: unknown } | null;
  if (!bundle || bundle.resourceType !== "Bundle" || bundle.type !== "collection" || !Array.isArray(bundle.entry)) return false;
  if (bundle.entry.length === 0 || bundle.entry.length > MAX_ENTRIES) return false;
  return (bundle.entry as Entry[]).every(
    (entry) =>
      typeof entry?.resource?.resourceType === "string" &&
      ALLOWED.has(entry.resource.resourceType) &&
      typeof entry.resource.id === "string" &&
      UUID.test(entry.resource.id) &&
      entry.fullUrl === `urn:uuid:${entry.resource.id}`,
  );
}

export async function GET() {
  const target = server();
  return Response.json({ enabled: target !== null, server: target });
}

export async function POST(request: Request) {
  const target = server();
  if (!target) return Response.json({ error: "Sending to a FHIR server is switched off." }, { status: 404 });

  const caller = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allowRequest(`fhir:${caller}`)) {
    return Response.json({ error: "Too many records sent in a short time. Please wait a minute." }, { status: 429 });
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return Response.json({ error: "The record was too large to send." }, { status: 413 });
  }

  let bundle: unknown;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return Response.json({ error: "The record was too large to send." }, { status: 413 });
    bundle = JSON.parse(raw);
  } catch {
    return Response.json({ error: "The request was not valid JSON." }, { status: 400 });
  }
  if (!isExportedBundle(bundle)) {
    return Response.json({ error: "Only records exported by this app can be sent." }, { status: 400 });
  }

  try {
    const response = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/fhir+json", Accept: "application/fhir+json" },
      body: JSON.stringify(toTransaction(bundle)),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      return Response.json({ error: `The FHIR server refused the record (HTTP ${response.status}).` }, { status: 502 });
    }
    const result = (await response.json()) as { entry?: { response?: { status?: string } }[] };
    const stored = (result.entry ?? []).filter((e) => /^20[01]/.test(e.response?.status ?? "")).length;
    const find = (type: string) => bundle.entry.find((e) => e.resource.resourceType === type)?.resource.id;
    return Response.json({
      server: target,
      stored,
      responseUrl: `${target}/QuestionnaireResponse/${find("QuestionnaireResponse")}`,
      locationUrl: `${target}/Location/${find("Location")}`,
    });
  } catch {
    return Response.json({ error: "The FHIR server could not be reached. Try again in a moment." }, { status: 502 });
  }
}
