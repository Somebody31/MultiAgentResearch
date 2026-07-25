// Turn one big question into 2–4 smaller questions.

import { askLlm } from "./llm.ts";
import { parseJsonArray } from "./parseJson.ts";

export async function plan(query: string): Promise<string[]> {
  const prompt = `Break this research query into 2-4 short sub-questions.
Return ONLY a JSON array of strings.

Query: ${query}`;

  const text = await askLlm(prompt);
  const parsed = parseJsonArray(text);

  // Need a real list of strings, otherwise we cannot research.
  if (
    !parsed ||
    !parsed.every((item) => typeof item === "string")
  ) {
    throw new Error(`Planner did not return a JSON array of strings: ${text}`);
  }

  return parsed as string[];
}
