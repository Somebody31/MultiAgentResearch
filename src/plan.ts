// Turn one big question into 2–4 smaller questions.

import { askMimo } from "./mimo.ts";

export async function plan(query: string): Promise<string[]> {
  const prompt = `Break this research query into 2-4 short sub-questions.
Return ONLY a JSON array of strings.

Query: ${query}`;

  const text = await askMimo(prompt);

  // Pull the JSON array out of the model text.
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Planner did not return a JSON array: ${text}`);
  }

  const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
  if (
    !Array.isArray(parsed) ||
    !parsed.every((item) => typeof item === "string")
  ) {
    throw new Error("Planner returned invalid shape");
  }

  return parsed as string[];
}
