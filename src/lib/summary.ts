import { displayValue, isEmpty } from "./fields";
import type { Assessment, FieldKey } from "./types";

/**
 * A two-sentence summary built directly from the answers, with no AI. Used
 * whenever an AI summary is unavailable or out of date. It only restates what
 * was recorded; it never rates the stream.
 */
export function summariseAnswers(a: Assessment): string {
  const lower = (key: FieldKey) => displayValue(key, a[key]).toLowerCase();
  const where = a.streamName.trim() || "the stream";
  const when = a.observedAt ? ` on ${displayValue("observedAt", a.observedAt)}` : "";

  let water: string;
  if (a.flow === "dry") {
    water = `${where} was dry${when}`;
  } else {
    const looks = [
      !isEmpty(a.clarity) ? `${lower("clarity")}` : "",
      !isEmpty(a.colour) ? (a.colour === "colourless" ? "colourless" : lower("colour")) : "",
    ]
      .filter(Boolean)
      .join(" and ");
    water = `At ${where}${when} the flow was ${lower("flow")}${looks ? ` and the water was ${looks}` : ""}`;
  }
  const extras: string[] = [];
  if (!isEmpty(a.odour)) extras.push(a.odour === "none" ? "no smell" : `a ${lower("odour")} smell`);
  if (!isEmpty(a.surface) && a.surface !== "none") extras.push(`${lower("surface")} on the surface`);
  const first = `${water}${extras.length ? `, with ${extras.join(" and ")}` : ""}.`;

  const banks = `Bank vegetation cover was ${lower("vegetation")}, erosion ${lower("erosion")} and the channel ${lower("channel")}`;
  const seen = a.life.length === 1 && a.life[0] === "none" ? "no animals or plants were seen" : `life seen: ${lower("life")}`;
  return `${first} ${banks}; ${seen}.`;
}
