// Dynamic gather: LLM reasoner loop calls registered subagents under budgets.
// After this phase, pipeline runs the same normalize → verify → final path.

import type { Finding } from "../research.ts";
import {
  agentHandlers,
  isAgentId,
  type AgentHandler,
} from "./agents.ts";
import { decideReasonerAction } from "./decide.ts";
import {
  DEFAULT_REASONING_BUDGET,
  type AgentId,
  type DynamicGatherResult,
  type ReasonerAction,
  type ReasoningBudget,
  type ReasoningStepTrace,
} from "./types.ts";

export type DynamicGatherOptions = {
  budget?: Partial<ReasoningBudget>;
  /**
   * Injected decide fn for tests. Production calls the LLM reasoner.
   */
  decide?: (args: {
    query: string;
    step: number;
    findings: Finding[];
    scratchpad: string;
    budget: ReasoningBudget;
  }) => Promise<ReasonerAction>;
  /** Override agent implementations (tests). */
  handlers?: Partial<Record<AgentId, AgentHandler>>;
};

/**
 * Run the dynamic gather phase only (reasoner loop + agents).
 * Caller then runs normalize → verify → final (same as fixed mode).
 */
export async function gatherWithDynamicAgents(
  query: string,
  options?: DynamicGatherOptions,
): Promise<DynamicGatherResult> {
  const budget = resolveBudget(options?.budget);
  const decide = options?.decide ?? decideReasonerAction;
  const handlers: Record<AgentId, AgentHandler> = {
    ...agentHandlers,
    ...options?.handlers,
  };

  let findings: Finding[] = [];
  let scratchpad = "";
  const traces: ReasoningStepTrace[] = [];

  for (let step = 0; step < budget.maxSteps; step++) {
    if (findings.length >= budget.maxFindings) {
      return {
        findings: findings.slice(0, budget.maxFindings),
        scratchpad,
        traces,
        stopReason: "max_findings",
      };
    }

    const action = await decide({
      query,
      step,
      findings,
      scratchpad,
      budget,
    });

    if (action.type === "finish") {
      if (action.rationale) {
        scratchpad = appendScratch(scratchpad, `finish: ${action.rationale}`);
      }
      traces.push({ step, action });
      return { findings, scratchpad, traces, stopReason: "finish" };
    }

    // call_agents
    const calls = action.calls.slice(0, budget.maxParallelAgents);
    if (calls.length === 0) {
      traces.push({ step, action });
      return { findings, scratchpad, traces, stopReason: "empty_action" };
    }

    if (action.note) {
      scratchpad = appendScratch(scratchpad, action.note);
    }

    const agentResults = await runAgentCalls(calls, {
      query,
      findingsSoFar: findings,
      scratchpad,
      maxParallel: budget.maxParallelAgents,
      handlers,
    });

    for (const r of agentResults) {
      findings = findings.concat(r.findings);
    }

    // Soft cap: keep first maxFindings
    if (findings.length > budget.maxFindings) {
      findings = findings.slice(0, budget.maxFindings);
    }

    traces.push({ step, action, agentResults });

    if (findings.length >= budget.maxFindings) {
      return {
        findings,
        scratchpad,
        traces,
        stopReason: "max_findings",
      };
    }
  }

  return {
    findings,
    scratchpad,
    traces,
    stopReason: "max_steps",
  };
}

/**
 * Execute one call_agents action (parallel, budget-capped).
 */
export async function runAgentCalls(
  calls: Array<{ agent: string; input: string }>,
  ctx: {
    query: string;
    findingsSoFar: Finding[];
    scratchpad: string;
    maxParallel: number;
    handlers?: Partial<Record<AgentId, AgentHandler>>;
  },
): Promise<
  Array<{ agent: AgentId; input: string; findings: Finding[] }>
> {
  const limited = calls
    .filter((c) => isAgentId(c.agent) && c.input.trim() !== "")
    .slice(0, Math.max(1, ctx.maxParallel));

  const handlers: Record<AgentId, AgentHandler> = {
    ...agentHandlers,
    ...ctx.handlers,
  };

  const settled = await Promise.all(
    limited.map(async (c) => {
      const agent = c.agent as AgentId;
      const findings = await handlers[agent](c.input, {
        query: ctx.query,
        findingsSoFar: ctx.findingsSoFar,
        scratchpad: ctx.scratchpad,
      });
      return { agent, input: c.input, findings };
    }),
  );

  return settled;
}

/** Merge budget overrides with defaults. */
export function resolveBudget(
  partial?: Partial<ReasoningBudget>,
): ReasoningBudget {
  return { ...DEFAULT_REASONING_BUDGET, ...partial };
}

export function emptyTraces(): ReasoningStepTrace[] {
  return [];
}

function appendScratch(prev: string, line: string): string {
  const t = line.trim();
  if (!t) return prev;
  return prev ? `${prev}\n${t}` : t;
}
