import { z } from "zod";
import { FIELD_KEYS } from "../fields";

/** Fields the AI is never shown, so it can never legitimately refer to them. */
export const HIDDEN_FROM_AI = ["photo", "latitude", "longitude"] as const;

export const AI_FIELD_KEYS = FIELD_KEYS.filter(
  (k) => !(HIDDEN_FROM_AI as readonly string[]).includes(k),
);

export const AiFlagSchema = z.object({
  fields: z.array(z.string()).min(1).max(6),
  concern: z.string().trim().min(1).max(300),
  why: z.string().trim().min(1).max(600),
  question: z.string().trim().min(1).max(300),
  confidence: z.enum(["low", "medium", "high"]),
});

export const AiResponseSchema = z.object({
  flags: z.array(AiFlagSchema).max(8),
  summary: z.string().trim().min(1).max(700),
});

export type AiResponse = z.infer<typeof AiResponseSchema>;

/** The same shape, in the OpenAPI subset that Gemini's structured output accepts. */
export const GEMINI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    flags: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          fields: { type: "ARRAY", items: { type: "STRING", enum: AI_FIELD_KEYS } },
          concern: { type: "STRING" },
          why: { type: "STRING" },
          question: { type: "STRING" },
          confidence: { type: "STRING", enum: ["low", "medium", "high"] },
        },
        required: ["fields", "concern", "why", "question", "confidence"],
      },
    },
    summary: { type: "STRING" },
  },
  required: ["flags", "summary"],
} as const;

const nullableNumber = z.number().finite().nullable();
const choice = z.string().max(40);
const choices = z.array(choice).max(20);

/** What the browser sends to /api/review. The photo and exact location are stripped first. */
export const ReviewRequestSchema = z.object({
  seedId: z.string().max(60).optional(),
  assessment: z.object({
    streamName: z.string().max(200),
    latitude: nullableNumber,
    longitude: nullableNumber,
    observedAt: z.string().max(40),
    weather: choice,
    rain48h: choice,
    flow: choice,
    colour: choice,
    clarity: choice,
    odour: choice,
    surface: choice,
    temperatureC: nullableNumber,
    ph: nullableNumber,
    dissolvedOxygen: nullableNumber,
    vegetation: choice,
    erosion: choice,
    channel: choice,
    invasivePlants: choice.default(""),
    landUse: choices,
    pollutionSources: choices,
    life: choices,
    overallImpression: choice,
    photo: z.null(),
    notes: z.string().max(4000),
  }),
});
