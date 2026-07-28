// Types for dynamic mode (reasoner + agents).
// Fixed mode does not need these — it uses plan → researchOne in pipeline.ts.

import type { Finding } from "../research.ts";

/** How research work is scheduled. Default is "fixed". */
export type OrchestrationMode = "fixed" | "dynamic";

/** Agents the reasoner is allowed to call. */
export type AgentId = "web_research" | "reason" | "critique";

/** One job for one agent. */
export type AgentCall = {
  agent: AgentId;
  /** Short task text for that agent. */
  input: string;
};

/**
 * What the reasoner returns each step.
 * - call_agents: run these agents next
 * - finish: stop gathering findings
 */
export type ReasonerAction =
  | { type: "call_agents"; calls: AgentCall[]; note?: string }
  | { type: "finish"; rationale: string };

/** Limits so the loop cannot run forever. */
export type ReasoningBudget = {
  /** How many reasoner steps (decide + maybe agents). */
  maxSteps: number;
  /** How many agents in one call_agents step. */
  maxParallelAgents: number;
  /** Max findings we keep. */
  maxFindings: number;
};

export const DEFAULT_REASONING_BUDGET: ReasoningBudget = {
  maxSteps: 8,
  maxParallelAgents: 3,
  maxFindings: 24,
};

/** One step for debugging (what the reasoner chose, what agents returned). */
export type ReasoningStepTrace = {
  step: number;
  action: ReasonerAction;
  agentResults?: Array<{
    agent: AgentId;
    input: string;
    findings: Finding[];
  }>;
};

/** Result of the gather loop (before draft/report). */
export type DynamicGatherResult = {
  findings: Finding[];
  scratchpad: string;
  traces: ReasoningStepTrace[];
  stopReason: "finish" | "max_steps" | "max_findings" | "empty_action";
};
