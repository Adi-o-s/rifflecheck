export interface Assessment {
  streamName: string;
  latitude: number | null;
  longitude: number | null;
  /** Local date and time as entered, "YYYY-MM-DDTHH:mm". */
  observedAt: string;
  weather: string;
  rain48h: string;
  flow: string;
  colour: string;
  clarity: string;
  odour: string;
  surface: string;
  temperatureC: number | null;
  ph: number | null;
  dissolvedOxygen: number | null;
  vegetation: string;
  erosion: string;
  channel: string;
  landUse: string[];
  pollutionSources: string[];
  life: string[];
  overallImpression: string;
  /** Downscaled JPEG data URL. Shown on the record page only; never sent to the AI. */
  photo: string | null;
  notes: string;
}

export type FieldKey = keyof Assessment;
export type Value = string | number | string[] | null;

export type Severity = "error" | "check" | "unusual";
export type Source = "rule" | "ai";
export type Confidence = "low" | "medium" | "high";
export type Decision = "fixed" | "kept";

export interface Flag {
  id: string;
  source: Source;
  severity: Severity;
  fields: FieldKey[];
  /** One plain sentence. */
  concern: string;
  /** The reasoning, naming the entries that conflict. */
  why: string;
  /** A question that helps the volunteer re-check on site. */
  question?: string;
  confidence?: Confidence;
}

export type Snapshot = Partial<Record<FieldKey, Value>>;

/** A flag that was shown to the volunteer, with what they did about it. */
export interface TrackedFlag extends Flag {
  raisedAt: string;
  before: Snapshot;
  decision?: Decision;
  reason?: string;
  decidedAt?: string;
  after?: Snapshot;
}

export type AiMode = "live" | "demo" | "unavailable" | "failed";

export interface AiState {
  status: "idle" | "done";
  mode?: AiMode;
  notice?: string;
  model?: string;
  reviewedAt?: string;
  /** Fingerprint of the answers the AI saw, to tell the volunteer when it is out of date. */
  inputHash?: string;
}

export interface Summary {
  text: string;
  source: "ai" | "answers";
}

export interface AssessmentRecord {
  id: string;
  /** Set when the record was started from one of the built-in samples. */
  seedId?: string;
  status: "draft" | "submitted";
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  /** 1 to 4 are form steps, 5 is the review screen. */
  step: number;
  assessment: Assessment;
  flags: TrackedFlag[];
  ai: AiState;
  summary?: Summary;
  contextNotes: string[];
}

export interface AiFlagPayload {
  fields: FieldKey[];
  concern: string;
  why: string;
  question: string;
  confidence: Confidence;
}

export interface AiReviewResult {
  mode: AiMode;
  flags: AiFlagPayload[];
  summary: string | null;
  notice?: string;
  model?: string;
  /** Flags the model produced that the server-side guards removed. */
  dropped?: number;
}
