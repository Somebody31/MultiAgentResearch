// Turn the draft into the final report the user reads.

import { askLlm } from "./llm.ts";

/** Stable system prefix for DeepSeek input cache. */
export const FINAL_SYSTEM = `Write the final research report.

Rules:
- Answer the query directly
- Do not invent new facts — use only the draft in the user message
- Clear structure, easy to read
- Return ONLY the report text`;

export async function synthesizeFinal(
  query: string,
  draft: string,
): Promise<string> {
  return await askLlm({
    stage: "final",
    system: FINAL_SYSTEM,
    user: `Original query:\n${query}\n\nDraft (use only these facts):\n${draft}`,
  });
}
