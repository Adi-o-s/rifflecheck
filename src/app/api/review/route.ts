import { DEFAULT_MODEL, reviewAssessment } from "@/lib/ai/review";
import { ReviewRequestSchema } from "@/lib/ai/schema";
import { hasErrors, runRules } from "@/lib/rules";

function settings() {
  return {
    apiKey: process.env.GEMINI_API_KEY?.trim() || undefined,
    model: process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL,
  };
}

/** Lets the page say "demo mode" on screen. Never reveals the key. */
export async function GET() {
  const { apiKey, model } = settings();
  return Response.json({ configured: Boolean(apiKey), model: apiKey ? model : null });
}

/** Layer 2: AI review. Returns flags and a summary; never a changed assessment. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "The request was not valid JSON." }, { status: 400 });
  }
  const parsed = ReviewRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "The assessment was not in the expected shape." }, { status: 400 });
  }
  const { assessment, seedId } = parsed.data;

  // The location is withheld from the AI, so its "required" errors do not count here.
  const blocking = runRules(assessment).filter(
    (f) => f.severity === "error" && !f.fields.every((k) => k === "latitude" || k === "longitude"),
  );
  if (hasErrors(blocking)) {
    return Response.json(
      { error: "Fix the errors found by the rule checks before asking for an AI review." },
      { status: 409 },
    );
  }

  const result = await reviewAssessment({ assessment, seedId }, settings());
  return Response.json(result);
}
