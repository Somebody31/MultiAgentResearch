// Dynamic orchestration types.
// Fixed mode still uses plan → N researchOne in pipeline.ts.

import type { Finding } from "../research.ts";

/** Production default is "fixed" (plan → N researchOne). */
export type OrchestrationMode = "fixed" | "dynamic";

/** Registered worker the reasoner may call. */
export type AgentId = "web_research" | "reason" | "critique";

export type AgentCall = {
  agent: AgentId;
  /** Free-text task for that agent. */
  input: string;
};

/**
 * Structured decision from the reasoning LLM each step.
 * Either spawn agent work or finish the gather phase.
 */
export type ReasonerAction =
  | { type: "call_agents"; calls: AgentCall[]; note?: string }
  | { type: "finish"; rationale: string };

export type ReasoningBudget = {
  /** Max reasoner steps (each step = one LLM decide + optional agent fan-out). */
  maxSteps: number;
  /** Max agents started in a single call_agents action. */
  maxParallelAgents: number;
  /** Soft cap on total findings collected. */
  maxFindings: number;
};

export const DEFAULT_REASONING_BUDGET: ReasoningBudget = {
  maxSteps: 8,
  maxParallelAgents: 3,
  maxFindings: 24,
};

/** One step of the dynamic loop (for debug / traces). */
export type ReasoningStepTrace = {
  step: number;
  action: ReasonerAction;
  agentResults?: Array<{ agent: AgentId; input: string; findings: Finding[] }>;
};

export type DynamicGatherResult = {
  findings: Finding[];
  scratchpad: string;
  traces: ReasoningStepTrace[];
  /** Why the loop stopped. */
  stopReason: "finish" | "max_steps" | "max_findings" | "empty_action";
};
