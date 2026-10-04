/**
 * Live check of the AI review, for the "run it five times" validation step.
 *
 * Runs the real model several times on each built-in sample and prints every
 * flag that survives the server-side guards, plus how many the guards dropped.
 * Needs GEMINI_API_KEY in .env.local or the environment.
 *
 *   npm run eval:ai            (5 runs per sample)
 *   npm run eval:ai -- 3       (3 runs per sample)
 */
import { existsSync, readFileSync } from "node:fs";
import { buildPayload } from "../src/lib/ai/prompt";
import { isGrounded, reviewAssessment, violatesPolicy } from "../src/lib/ai/review";
import { runRules } from "../src/lib/rules";
import { SAMPLES } from "../src/lib/seed";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const apiKey = process.env.GEMINI_API_KEY?.trim();
if (!apiKey) {
  console.error("No GEMINI_API_KEY found. Add it to .env.local first (see .env.example).");
  process.exit(1);
}
const model = process.env.GEMINI_MODEL?.trim() || undefined;
const runs = Number(process.argv[2]) || 5;

let problems = 0;
for (const sample of SAMPLES) {
  const rules = runRules(sample.assessment);
  const payload = buildPayload(sample.assessment, rules, []);
  console.log(`\n=== ${sample.title} (${rules.length} rule flags) ===`);
  for (let run = 1; run <= runs; run++) {
    // The free tier allows roughly ten calls a minute, so leave a gap between runs.
    await new Promise((resolve) => setTimeout(resolve, 7000));
    const result = await reviewAssessment({ assessment: sample.assessment }, { apiKey, model });
    console.log(`  run ${run}: mode=${result.mode}, flags=${result.flags.length}, dropped by guards=${result.dropped ?? 0}`);
    if (result.mode !== "live") {
      problems++;
      console.log(`    ! ${result.notice}`);
    }
    for (const flag of result.flags) {
      const text = `${flag.concern} ${flag.why} ${flag.question}`;
      // The guards already ran on the server path; this re-check makes the result visible here.
      const ok = isGrounded(text, payload) && !violatesPolicy(text);
      if (!ok) problems++;
      console.log(`    ${ok ? "ok" : "!!"} [${flag.confidence}] (${flag.fields.join(", ")}) ${flag.concern}`);
      console.log(`       why: ${flag.why}`);
    }
    if (result.summary) console.log(`    summary: ${result.summary}`);
    if (sample.id === "sample-clean" && result.flags.length > 0) {
      problems++;
      console.log("    ! the clean sample should have no flags");
    }
  }
}
console.log(problems === 0 ? "\nAll runs passed." : `\n${problems} problem(s) found. Read the lines marked "!" above.`);
process.exit(problems === 0 ? 0 : 1);
