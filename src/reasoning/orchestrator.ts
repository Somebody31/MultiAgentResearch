// Dynamic gather: a small loop that asks a reasoner what to do next.
//
// Each step the reasoner either:
//   - call_agents  → run web_research / reason / critique
//   - finish       → stop gathering
//
// Then pipeline.ts writes the report (normalize → verify → final).

import type { Finding } from "../research.ts";
import {
  mergeHandlers,
  toAgentId,
  type AgentHandlerOverrides,
  type AgentHandlers,
} from "./agents.ts";
import { decideReasonerAction } from "./decide.ts";
import {
  DEFAULT_REASONING_BUDGET,
  type AgentId,
  type BudgetOverrides,
  type DynamicGatherResult,
  type ReasonerAction,
  type ReasoningBudget,
  type ReasoningStepTrace,
  type StopReason,
} from "./types.ts";

export type DynamicGatherOptions = {
  /** Override step / parallel / findings caps. */
  budget?: BudgetOverrides;
  /** Tests can pass a fake decide instead of the real LLM. */
  decide?: (args: {
    query: string;
    step: number;
    findings: Finding[];
    scratchpad: string;
    budget: ReasoningBudget;
  }) => Promise<ReasonerAction>;
  /** Tests can pass fake agents. */
  handlers?: AgentHandlerOverrides;
};

export type AgentCallInput = {
  agent: string;
  input: string;
};

export type AgentCallResult = {
  agent: AgentId;
  input: string;
  findings: Finding[];
};

export type RunAgentCallsContext = {
  query: string;
  findingsSoFar: Finding[];
  scratchpad: string;
  maxParallel: number;
  handlers?: AgentHandlerOverrides;
};

/** Collect findings with the reasoner + agents (no draft yet). */
export async function gatherWithDynamicAgents(
  query: string,
  options?: DynamicGatherOptions,
): Promise<DynamicGatherResult> {
  const budget = resolveBudget(options?.budget);
  const decide = options?.decide ?? decideReasonerAction;
  const handlers = mergeHandlers(options?.handlers);

  let findings: Finding[] = [];
  let scratchpad = "";
  const traces: ReasoningStepTrace[] = [];

  for (let step = 0; step < budget.maxSteps; step++) {
    // Stop early if we already hit the findings cap.
    if (findings.length >= budget.maxFindings) {
      return stop(findings, scratchpad, traces, "max_findings", budget);
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
        scratchpad = addNote(scratchpad, `finish: ${action.rationale}`);
      }
      traces.push({ step, action });
      return stop(findings, scratchpad, traces, "finish", budget);
    }

    // action.type === "call_agents"
    const calls = action.calls.slice(0, budget.maxParallelAgents);
    if (calls.length === 0) {
      traces.push({ step, action });
      return stop(findings, scratchpad, traces, "empty_action", budget);
    }

    if (action.note) {
      scratchpad = addNote(scratchpad, action.note);
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

    traces.push({ step, action, agentResults });
  }

  return stop(findings, scratchpad, traces, "max_steps", budget);
}

/** Run up to maxParallel agents (in parallel). */
export async function runAgentCalls(
  calls: AgentCallInput[],
  ctx: RunAgentCallsContext,
): Promise<AgentCallResult[]> {
  // Fill in any missing agent functions with the real ones.
  const handlers: AgentHandlers = mergeHandlers(ctx.handlers);

  // Keep only known agents with non-empty input, then cap count.
  const limited: Array<{ agent: AgentId; input: string }> = [];
  for (const c of calls) {
    const agent = toAgentId(c.agent);
    if (!agent) continue;
    if (c.input.trim() === "") continue;
    limited.push({ agent, input: c.input });
    if (limited.length >= Math.max(1, ctx.maxParallel)) break;
  }

  // Run them together (Promise.all).
  const promises: Promise<AgentCallResult>[] = [];
  for (const c of limited) {
    promises.push(runOneAgent(c.agent, c.input, ctx, handlers));
  }
  return Promise.all(promises);
}

async function runOneAgent(
  agent: AgentId,
  input: string,
  ctx: RunAgentCallsContext,
  handlers: AgentHandlers,
): Promise<AgentCallResult> {
  const findings = await handlers[agent](input, {
    query: ctx.query,
    findingsSoFar: ctx.findingsSoFar,
    scratchpad: ctx.scratchpad,
  });
  return { agent, input, findings };
}

/** Fill in missing budget fields with defaults. */
export function resolveBudget(
  overrides?: BudgetOverrides,
): ReasoningBudget {
  return {
    maxSteps: overrides?.maxSteps ?? DEFAULT_REASONING_BUDGET.maxSteps,
    maxParallelAgents:
      overrides?.maxParallelAgents ??
      DEFAULT_REASONING_BUDGET.maxParallelAgents,
    maxFindings:
      overrides?.maxFindings ?? DEFAULT_REASONING_BUDGET.maxFindings,
  };
}

function stop(
  findings: Finding[],
  scratchpad: string,
  traces: ReasoningStepTrace[],
  stopReason: StopReason,
  budget: ReasoningBudget,
): DynamicGatherResult {
  return {
    findings: findings.slice(0, budget.maxFindings),
    scratchpad,
    traces,
    stopReason,
  };
}

function addNote(prev: string, line: string): string {
  const t = line.trim();
  if (!t) return prev;
  if (!prev) return t;
  return `${prev}\n${t}`;
}
