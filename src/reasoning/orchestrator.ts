// Dynamic gather loop stubs: LLM reasoner calls subagents (variable fan-out).
// NOT wired into runResearch / HTTP yet — throws if invoked.
// See docs/ROADMAP.md.

import type { Finding } from "../research.ts";
import { agentHandlers, isAgentId } from "./agents.ts";
import {
  DEFAULT_REASONING_BUDGET,
  type DynamicGatherResult,
  type ReasonerAction,
  type ReasoningBudget,
  type ReasoningStepTrace,
} from "./types.ts";

export type DynamicGatherOptions = {
  budget?: Partial<ReasoningBudget>;
  /**
   * Injected decide fn for tests. Production will call the LLM with a stable
   * system prompt and parse JSON into ReasonerAction.
   */
  decide?: (args: {
    query: string;
    step: number;
    findings: Finding[];
    scratchpad: string;
    budget: ReasoningBudget;
  }) => Promise<ReasonerAction>;
};

/**
 * Run the dynamic gather phase only (reasoner loop + agents).
 * Caller would then normalize → verify → final (same as fixed mode).
 *
 * @throws until the reasoner LLM + LangGraph wiring ship.
 */
export async function gatherWithDynamicAgents(
  _query: string,
  _options?: DynamicGatherOptions,
): Promise<DynamicGatherResult> {
  throw new Error(
    "Dynamic orchestration is not implemented yet. " +
      "Use fixed mode (default runResearch). See docs/ROADMAP.md",
  );
}

/**
 * Execute one call_agents action (parallel pool, budget-capped).
 * Exported for unit tests when the loop is implemented.
 */
export async function runAgentCalls(
  calls: Array<{ agent: string; input: string }>,
  ctx: {
    query: string;
    findingsSoFar: Finding[];
    scratchpad: string;
    maxParallel: number;
  },
): Promise<Array<{ agent: import("./types.ts").AgentId; input: string; findings: Finding[] }>> {
  const limited = calls.slice(0, Math.max(1, ctx.maxParallel));
  const out: Array<{
    agent: import("./types.ts").AgentId;
    input: string;
    findings: Finding[];
  }> = [];

  // Sequential for predictable tests; production can Promise.all with a pool.
  for (const c of limited) {
    if (!isAgentId(c.agent)) continue;
    const findings = await agentHandlers[c.agent](c.input, {
      query: ctx.query,
      findingsSoFar: ctx.findingsSoFar,
      scratchpad: ctx.scratchpad,
    });
    out.push({ agent: c.agent, input: c.input, findings });
  }
  return out;
}

/** Merge budget overrides with defaults (for when the loop ships). */
export function resolveBudget(
  partial?: Partial<ReasoningBudget>,
): ReasoningBudget {
  return { ...DEFAULT_REASONING_BUDGET, ...partial };
}

/** Placeholder for future step-trace helpers. */
export function emptyTraces(): ReasoningStepTrace[] {
  return [];
}
