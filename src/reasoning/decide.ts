// One reasoner step: ask the LLM what to do next (call agents or finish).

import { askLlm } from "../llm.ts";
import type { Finding } from "../research.ts";
import { parseReasonerAction } from "./parseAction.ts";
import type { ReasonerAction, ReasoningBudget } from "./types.ts";

/** Stable system prefix for DeepSeek input cache. */
export const REASONER_SYSTEM = `You are the research reasoner. You choose the next action for a multi-agent research system.

You may only reply with ONE JSON object (no markdown fences, no extra prose outside the object):

1) Call subagents (1 or more, in parallel):
{"type":"call_agents","calls":[{"agent":"web_research","input":"focused sub-question"}],"note":"optional short plan note"}

2) Finish gathering (enough evidence to write a draft):
{"type":"finish","rationale":"why we can stop"}

Agents you may use:
- web_research: search the web and extract findings for one focused question (best for facts, numbers, sources)
- reason: infer only from findings + scratchpad already gathered (no new external facts)
- critique: list gaps or unsupported claims from findings (no new facts)

Rules:
- Prefer web_research early when evidence is thin
- Prefer finish when findings cover the user query well enough for a draft
- Keep each agent input short and specific
- Do not invent URLs, brands, or stats in the JSON itself
- Stay inside budgets listed in the user message`;

export type DecideArgs = {
  query: string;
  step: number;
  findings: Finding[];
  scratchpad: string;
  budget: ReasoningBudget;
};

/** Build the user message for the reasoner (testable without an LLM). */
export function buildReasonerUserMessage(args: DecideArgs): string {
  const listed =
    args.findings.length === 0
      ? "(none yet)"
      : args.findings
          .map((f, i) => `${i + 1}. ${f.claim} (${f.sourceUrl})`)
          .join("\n");

  return `User query:
${args.query}

Step: ${args.step + 1} of ${args.budget.maxSteps} (0-based step index ${args.step})
Findings so far: ${args.findings.length} / max ${args.budget.maxFindings}
Max agents this step: ${args.budget.maxParallelAgents}

Scratchpad:
${args.scratchpad || "(empty)"}

Findings:
${listed}

Return one JSON action object now.`;
}

/**
 * Ask the LLM for the next ReasonerAction.
 * On parse failure, finish so the loop cannot spin forever.
 */
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
      "Reasoner reply was not valid JSON action; finishing with evidence so far.",
  };
}
