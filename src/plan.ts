// Break one big question into 2–4 smaller questions.

import { askLlm } from "./llm.ts";
import { parseJsonArray } from "./parseJson.ts";

export const PLAN_SYSTEM = `Break the research query into 2-4 short sub-questions.
Return ONLY a JSON array of strings.
Do not include any other text.`;

export async function plan(query: string): Promise<string[]> {
  const text = await askLlm({
    stage: "plan",
    system: PLAN_SYSTEM,
    user: `Query:\n${query}`,
  });

  const parsed = parseJsonArray(text);
  if (!parsed || !parsed.every((item) => typeof item === "string")) {
    throw new Error(`Planner did not return a JSON array of strings: ${text}`);
  }

  return parsed as string[];
}
