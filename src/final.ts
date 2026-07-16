// Draft → final report.

import { askMimo } from "./mimo.ts";

export async function synthesizeFinal(
  query: string,
  draft: string,
): Promise<string> {
  const prompt = `You are the orchestrator writing the final research report.

Original query:
${query}

Verified research draft (use this as your only source of facts):
${draft}

Write a clear final report that:
- Directly answers the query
- Uses only facts present in the draft (do not invent new claims)
- Is well structured (short sections or paragraphs as needed)
- Is readable for a non-expert

Return ONLY the final report text. No JSON, no preamble like "Here is the report".`;

  return await askMimo(prompt);
}
