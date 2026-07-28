// Ask the LLM: what should we do next — call agents, or finish?

import { askLlm } from "../llm.ts";
import type { Finding } from "../research.ts";
import { parseReasonerAction } from "./parseAction.ts";
import type { ReasonerAction, ReasoningBudget } from "./types.ts";

// Fixed instructions (same every call) so the model can cache this prefix.
export const REASONER_SYSTEM = `You are the research reasoner. You choose the next action.

Reply with ONE JSON object only (no markdown):

Call agents:
{"type":"call_agents","calls":[{"agent":"web_research","input":"focused sub-question"}],"note":"optional note"}

Or finish:
{"type":"finish","rationale":"why we can stop"}

Agents:
- web_research: search the web for one focused question
- reason: infer only from findings + scratchpad (no new web facts)
- critique: list gaps or unsupported claims (no new facts)

Rules:
- Prefer web_research when evidence is thin
- Prefer finish when findings are enough for a draft
- Keep each agent input short
- Do not invent URLs, brands, or stats in the JSON`;

export type DecideArgs = {
  query: string;
  step: number;
  findings: Finding[];
  scratchpad: string;
  budget: ReasoningBudget;
};

/** Build the user message (useful in tests without calling the LLM). */
export function buildReasonerUserMessage(args: DecideArgs): string {
  const listed =
    args.findings.length === 0
      ? "(none yet)"
      : args.findings
          .map((f, i) => `${i + 1}. ${f.claim} (${f.sourceUrl})`)
          .join("\n");

  return `User query:
${args.query}

Step: ${args.step + 1} of ${args.budget.maxSteps}
Findings so far: ${args.findings.length} / max ${args.budget.maxFindings}
Max agents this step: ${args.budget.maxParallelAgents}

Scratchpad:
${args.scratchpad || "(empty)"}

Findings:
${listed}

Return one JSON action object now.`;
}

/** One reasoner step. If JSON is bad, finish so the loop cannot spin forever. */
export async function decideReasonerAction(
  args: DecideArgs,
): Promise<ReasonerAction> {
  const text = await askLlm({
    stage: "reasoner",
    system: REASONER_SYSTEM,
    user: buildReasonerUserMessage(args),
  });

  const action = parseReasonerAction(text);
  if (action) return action;

  return {
    type: "finish",
    rationale:
      "Reasoner reply was not valid JSON; finishing with evidence so far.",
  };
}
