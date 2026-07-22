// Turn the draft into the final report the user reads.

import { askMimo } from "./mimo.ts";

export async function synthesizeFinal(
  query: string,
  draft: string,
): Promise<string> {
  const prompt = `Write the final research report.

Original query:
${query}

Draft (use only these facts):
${draft}

Rules:
- Answer the query directly
- Do not invent new facts
- Clear structure, easy to read

Return ONLY the report text.`;

  return await askMimo(prompt);
}
