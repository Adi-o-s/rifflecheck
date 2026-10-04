import type { Assessment, FieldKey, Value } from "./types";

export type FieldType =
  | "text"
  | "longtext"
  | "datetime"
  | "number"
  | "single"
  | "multi"
  | "photo";

export interface Option {
  value: string;
  label: string;
  hint?: string;
}

export interface FieldDef {
  key: FieldKey;
  step: 1 | 2 | 3 | 4;
  label: string;
  /** One plain-language line explaining the term. */
  helper: string;
  type: FieldType;
  options?: Option[];
  required?: boolean;
  /** Required only when there is water to look at (flow is not "dry"). */
  requiredUnlessDry?: boolean;
  unit?: string;
  min?: number;
  max?: number;
  /** OneAquaHealth app category this field corresponds to (see README). */
  oahCategory: string;
}

export const STEPS = [
  { id: 1, key: "site", title: "Site", intro: "Where and when you are looking at the stream." },
  { id: 2, key: "water", title: "Water", intro: "What the water looks and smells like right now." },
  {
    id: 3,
    key: "banks",
    title: "Banks and surroundings",
    intro: "The edges of the stream and the land next to it.",
  },
  { id: 4, key: "life", title: "Life", intro: "Animals and plants you can see in or by the water." },
] as const;

export const REVIEW_STEP = 5;

export const FIELDS: FieldDef[] = [
  {
    key: "streamName",
    step: 1,
    label: "Stream name",
    helper: "The name people use for this stream. If it has none, give the nearest street or bridge.",
    type: "text",
    required: true,
    oahCategory: "Site selection",
  },
  {
    key: "latitude",
    step: 1,
    label: "Latitude",
    helper: "How far north or south you are, in decimal degrees (for example 40.2056).",
    type: "number",
    required: true,
    min: -90,
    max: 90,
    oahCategory: "Site selection",
  },
  {
    key: "longitude",
    step: 1,
    label: "Longitude",
    helper: "How far east or west you are, in decimal degrees (for example -8.4196).",
    type: "number",
    required: true,
    min: -180,
    max: 180,
    oahCategory: "Site selection",
  },
  {
    key: "observedAt",
    step: 1,
    label: "Date and time",
    helper: "When you looked at the stream. It starts as the time you opened this form.",
    type: "datetime",
    required: true,
    oahCategory: "Site selection",
  },
  {
    key: "weather",
    step: 1,
    label: "Weather now",
    helper: "The weather while you are standing at the stream.",
    type: "single",
    required: true,
    options: [
      { value: "sunny", label: "Sunny" },
      { value: "cloudy", label: "Cloudy" },
      { value: "light_rain", label: "Light rain" },
      { value: "heavy_rain", label: "Heavy rain" },
      { value: "fog", label: "Fog" },
      { value: "snow", label: "Snow or ice" },
    ],
    oahCategory: "Not in the app (context for checks)",
  },
  {
    key: "rain48h",
    step: 1,
    label: "Rain in the last 48 hours",
    helper: "Has it rained here in the last two days? Rain washes soil into streams and can make them cloudy.",
    type: "single",
    required: true,
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ],
    oahCategory: "Not in the app (context for checks)",
  },
  {
    key: "flow",
    step: 2,
    label: "Flow",
    helper: "How fast the water is moving. Drop a leaf in and watch it if you are unsure.",
    type: "single",
    required: true,
    options: [
      { value: "dry", label: "Dry", hint: "No water at all" },
      { value: "pools", label: "Pools only", hint: "Separate puddles, not flowing" },
      { value: "slow", label: "Slow", hint: "A leaf drifts gently" },
      { value: "moderate", label: "Moderate", hint: "About walking pace" },
      { value: "fast", label: "Fast", hint: "Quicker than walking pace" },
    ],
    oahCategory: "Flow",
  },
  {
    key: "colour",
    step: 2,
    label: "Water colour",
    helper: "The colour of the water itself, not the stream bed. Scoop some in a clear bottle if you can.",
    type: "single",
    requiredUnlessDry: true,
    options: [
      { value: "colourless", label: "No colour" },
      { value: "green", label: "Green" },
      { value: "brown", label: "Brown" },
      { value: "grey", label: "Grey" },
      { value: "milky", label: "Milky or white" },
      { value: "orange", label: "Orange or red" },
      { value: "other", label: "Other", hint: "Describe it in your notes" },
    ],
    oahCategory: "Water aspect",
  },
  {
    key: "clarity",
    step: 2,
    label: "Clarity",
    helper: "How far you can see into the water. Clear water lets you see the bottom.",
    type: "single",
    requiredUnlessDry: true,
    options: [
      { value: "clear", label: "Clear", hint: "You can see the bottom" },
      { value: "slightly_cloudy", label: "Slightly cloudy", hint: "The bottom is hazy" },
      { value: "cloudy", label: "Cloudy", hint: "You can barely see the bottom" },
      { value: "opaque", label: "Opaque", hint: "You cannot see into it at all" },
    ],
    oahCategory: "Water aspect",
  },
  {
    key: "odour",
    step: 2,
    label: "Odour",
    helper: "What the stream smells like when you stand next to it. Odour is another word for smell.",
    type: "single",
    required: true,
    options: [
      { value: "none", label: "None" },
      { value: "earthy", label: "Earthy", hint: "Like soil or wet leaves" },
      { value: "sewage", label: "Sewage", hint: "Like a toilet or drain" },
      { value: "chemical", label: "Chemical", hint: "Like bleach, fuel or paint" },
      { value: "rotten_egg", label: "Rotten egg", hint: "A sulphur smell" },
    ],
    oahCategory: "Water aspect; sewage",
  },
  {
    key: "surface",
    step: 2,
    label: "On the surface",
    helper: "Anything floating on top of the water.",
    type: "single",
    requiredUnlessDry: true,
    options: [
      { value: "none", label: "Nothing" },
      { value: "foam", label: "Foam", hint: "Bubbles that stay" },
      { value: "oil", label: "Oil sheen", hint: "A rainbow-coloured film" },
      { value: "scum", label: "Scum", hint: "A dull, greasy or slimy layer" },
      { value: "litter", label: "Litter", hint: "Floating rubbish" },
    ],
    oahCategory: "Water aspect",
  },
  {
    key: "temperatureC",
    step: 2,
    label: "Water temperature",
    helper: "Only if you have a thermometer. Hold it in the water for a minute.",
    type: "number",
    unit: "°C",
    min: -1,
    max: 40,
    oahCategory: "Optional extra (water temperature)",
  },
  {
    key: "ph",
    step: 2,
    label: "pH",
    helper: "Only if you have a test strip or meter. pH says how acidic the water is, from 0 to 14; 7 is neutral.",
    type: "number",
    min: 0,
    max: 14,
    oahCategory: "Not in the app (optional measurement)",
  },
  {
    key: "dissolvedOxygen",
    step: 2,
    label: "Dissolved oxygen",
    helper: "Only if you have a test kit or meter. This is the oxygen in the water that fish and insects breathe.",
    type: "number",
    unit: "mg/L",
    min: 0,
    max: 20,
    oahCategory: "Not in the app (optional measurement)",
  },
  {
    key: "vegetation",
    step: 3,
    label: "Bank vegetation cover",
    helper: "How much of the banks (the sloping edges of the stream) is covered by grass, bushes or trees.",
    type: "single",
    required: true,
    options: [
      { value: "none", label: "None", hint: "Bare soil, stone or concrete" },
      { value: "sparse", label: "Sparse", hint: "A few patches" },
      { value: "moderate", label: "Moderate", hint: "About half covered" },
      { value: "dense", label: "Dense", hint: "Almost fully covered" },
    ],
    oahCategory: "Left and right margins (plant cover)",
  },
  {
    key: "erosion",
    step: 3,
    label: "Bank erosion",
    helper: "Erosion is soil being worn away, leaving bare, crumbling or collapsed banks.",
    type: "single",
    required: true,
    options: [
      { value: "none", label: "None" },
      { value: "some", label: "Some", hint: "A few bare or crumbling patches" },
      { value: "severe", label: "Severe", hint: "Long stretches collapsed or undercut" },
    ],
    oahCategory: "Bed and banks",
  },
  {
    key: "channel",
    step: 3,
    label: "Channel",
    helper: "The channel is the path the water runs in. Has it been straightened or lined by people?",
    type: "single",
    required: true,
    options: [
      { value: "natural", label: "Natural", hint: "Winding, with earth or stone banks" },
      { value: "partly_modified", label: "Partly modified", hint: "Some walls, straightening or pipes" },
      { value: "concrete", label: "Concrete", hint: "Fully lined or boxed in" },
    ],
    oahCategory: "Channel form",
  },
  {
    key: "landUse",
    step: 3,
    label: "Nearby land use",
    helper: "What the land within about 50 metres of the stream is used for. Choose all that apply.",
    type: "multi",
    required: true,
    options: [
      { value: "housing", label: "Homes" },
      { value: "commercial", label: "Shops or offices" },
      { value: "industry", label: "Industry" },
      { value: "farmland", label: "Farmland" },
      { value: "park", label: "Park or green space" },
      { value: "roads", label: "Roads or car parks" },
      { value: "woodland", label: "Woodland" },
      { value: "construction", label: "Construction site" },
    ],
    oahCategory: "Left and right margins (paving)",
  },
  {
    key: "pollutionSources",
    step: 3,
    label: "Visible pollution sources",
    helper: "Things you can see that could be putting pollution into the stream. Choose all that apply.",
    type: "multi",
    required: true,
    options: [
      { value: "none_seen", label: "None seen" },
      { value: "pipe", label: "Pipe or drain", hint: "Flowing into the stream" },
      { value: "litter", label: "Litter or dumped rubbish" },
      { value: "road_runoff", label: "Road runoff", hint: "Water draining off roads" },
      { value: "farm_runoff", label: "Farm runoff", hint: "Water draining off fields" },
      { value: "construction", label: "Building works" },
      { value: "industrial", label: "Industrial discharge" },
      { value: "animal_waste", label: "Animal waste" },
    ],
    oahCategory: "Polluted pipes; sewage; works",
  },
  {
    key: "life",
    step: 4,
    label: "Animals and plants seen",
    helper: "Everything living you saw in or right next to the water. Choose all that apply.",
    type: "multi",
    required: true,
    options: [
      { value: "fish", label: "Fish" },
      { value: "frogs", label: "Frogs or tadpoles" },
      { value: "water_birds", label: "Water birds", hint: "Ducks, herons, kingfishers" },
      { value: "dragonflies", label: "Dragonflies" },
      {
        value: "mayfly_stonefly",
        label: "Mayfly or stonefly larvae",
        hint: "Small insects under stones with two or three tails. They usually need clean water",
      },
      { value: "snails", label: "Snails" },
      {
        value: "worms_midges",
        label: "Worms or midge larvae",
        hint: "Thin worms or small red larvae in mud. They cope with dirty water",
      },
      { value: "algae_mats", label: "Algae mats", hint: "Green or brown slimy carpets" },
      { value: "none", label: "None" },
    ],
    oahCategory: "Habitats (the app has no wildlife list)",
  },
  {
    key: "overallImpression",
    step: 4,
    label: "Your overall impression",
    helper: "Your own judgement of the stream today. The app never calculates a score for you.",
    type: "single",
    options: [
      { value: "good", label: "Good" },
      { value: "moderate", label: "Moderate" },
      { value: "poor", label: "Poor" },
      { value: "unsure", label: "Not sure" },
    ],
    oahCategory: "Overall rating (Good / Moderate / Poor)",
  },
  {
    key: "photo",
    step: 4,
    label: "Photo",
    helper: "Optional. A photo helps researchers. It stays on this device and is not looked at by the AI.",
    type: "photo",
    oahCategory: "Photos",
  },
  {
    key: "notes",
    step: 4,
    label: "Notes",
    helper: "Anything else you noticed, in your own words.",
    type: "longtext",
    oahCategory: "Free text",
  },
];

const BY_KEY = new Map<FieldKey, FieldDef>(FIELDS.map((f) => [f.key, f]));

export const FIELD_KEYS = FIELDS.map((f) => f.key);

export function isFieldKey(key: string): key is FieldKey {
  return BY_KEY.has(key as FieldKey);
}

export function field(key: FieldKey): FieldDef {
  const def = BY_KEY.get(key);
  if (!def) throw new Error(`Unknown field: ${key}`);
  return def;
}

export function fieldsForStep(step: number): FieldDef[] {
  return FIELDS.filter((f) => f.step === step);
}

export function optionLabel(key: FieldKey, value: string): string {
  return field(key).options?.find((o) => o.value === value)?.label ?? value;
}

export function isEmpty(value: Value | undefined): boolean {
  return (
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

export const NOT_RECORDED = "Not recorded";

/** The value as shown on screen and in the CSV export. */
export function displayValue(key: FieldKey, value: Value | undefined): string {
  if (isEmpty(value)) return NOT_RECORDED;
  const def = field(key);
  if (def.type === "photo") return "Photo attached";
  if (def.type === "datetime") return String(value).replace("T", " ");
  if (def.type === "multi") return (value as string[]).map((v) => optionLabel(key, v)).join(", ");
  if (def.type === "single") return optionLabel(key, value as string);
  if (def.type === "number") return def.unit ? `${value} ${def.unit}` : String(value);
  return String(value);
}

export function emptyAssessment(observedAt = ""): Assessment {
  return {
    streamName: "",
    latitude: null,
    longitude: null,
    observedAt,
    weather: "",
    rain48h: "",
    flow: "",
    colour: "",
    clarity: "",
    odour: "",
    surface: "",
    temperatureC: null,
    ph: null,
    dissolvedOxygen: null,
    vegetation: "",
    erosion: "",
    channel: "",
    landUse: [],
    pollutionSources: [],
    life: [],
    overallImpression: "",
    photo: null,
    notes: "",
  };
}

/** "YYYY-MM-DDTHH:mm" in the device's own time zone, as a datetime-local input expects. */
export function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}
