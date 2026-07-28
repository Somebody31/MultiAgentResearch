// The research pipeline — start here to see the whole run.
//
// Two ways to gather findings:
//
//   fixed (default):
//     plan (each sub-q is search or llm) → answer each in parallel → draft → check → report
//
//   dynamic:
//     reasoner picks agents under a budget → draft → check → report
//
// After findings exist, both modes use the same write path:
//   draft (normalize) → verify → maybe rewrite once → final report

import { Annotation, END, Send, START, StateGraph } from "@langchain/langgraph";
import {
  plan,
  plannedQuestionTexts,
  type PlannedSubQuestion,
  type SubQuestionRoute,
} from "./plan.ts";
import { researchOne, type Finding } from "./research.ts";
import { normalizeClaims } from "./normalize.ts";
import { verifyClaims, type Verdict } from "./verify.ts";
import { synthesizeFinal } from "./final.ts";
import {
  gatherWithDynamicAgents,
  type DynamicGatherOptions,
} from "./reasoning/orchestrator.ts";
import type {
  OrchestrationMode,
  ReasoningStepTrace,
  StopReason,
} from "./reasoning/types.ts";

/** How many times we may rewrite the draft after a failed verify. */
const MAX_REWRITES = 1;

/**
 * Eval-only: how often we stick fake unsupported text onto the draft.
 * - every_normalize: stick it on every draft (harder gate)
 * - once: stick it on only the first draft (can the rewrite fix it?)
 */
export type PlantMode = "every_normalize" | "once";

export type { OrchestrationMode };

// ---------------------------------------------------------------------------
// Shared graph state (fixed mode)
// ---------------------------------------------------------------------------

/**
 * Shape of the LangGraph state.
 * Written by hand so node functions do not use `typeof GraphState.State`.
 */
export type GraphStateShape = {
  query: string;
  /** Planner output: question text + search | llm route. */
  planned: PlannedSubQuestion[];
  findings: Finding[];
  /** This branch's sub-question text (set by Send). */
  activeSubQuestion: string;
  /** This branch's route (set by Send). */
  activeRoute: SubQuestionRoute;
  draft: string;
  verdict: Verdict;
  retries: number;
  finalReport: string;
  priorReviseReason: string | null;
  plantUnsupportedClaim: string | null;
  plantMode: PlantMode;
  plantInjected: boolean;
};

const GraphState = Annotation.Root({
  query: Annotation<string>(),
  planned: Annotation<PlannedSubQuestion[]>({ default: () => [] }),
  // Many research branches append here (concat, not replace).
  findings: Annotation<Finding[]>({
    default: () => [],
    reducer: (oldList: Finding[], newList: Finding[]) =>
      oldList.concat(newList),
  }),
  // This branch's sub-question (set by Send for each researchOne).
  activeSubQuestion: Annotation<string>({ default: () => "" }),
  activeRoute: Annotation<SubQuestionRoute>({ default: () => "search" }),
  draft: Annotation<string>({ default: () => "" }),
  verdict: Annotation<Verdict>({ default: () => "pass" }),
  // How many times we already rewrote the draft.
  retries: Annotation<number>({ default: () => 0 }),
  finalReport: Annotation<string>({ default: () => "" }),
  // Why verify said "revise" (used on the rewrite).
  priorReviseReason: Annotation<string | null>({ default: () => null }),
  // Eval-only plant (null in normal runs).
  plantUnsupportedClaim: Annotation<string | null>({ default: () => null }),
  plantMode: Annotation<PlantMode>({ default: () => "every_normalize" }),
  plantInjected: Annotation<boolean>({ default: () => false }),
});

/** retries can be missing after Send — treat that as 0. */
function retryCount(state: { retries?: number | null }): number {
  const n = state.retries;
  if (typeof n === "number" && Number.isFinite(n)) return n;
  return 0;
}

/**
 * Eval helper: optionally append fake text to the draft.
 * Returns the new draft and whether we planted this time.
 */
function maybePlant(
  draft: string,
  plant: string | null | undefined,
  mode: PlantMode,
  alreadyPlanted: boolean,
): { draft: string; plantInjected: boolean } {
  if (typeof plant !== "string" || plant.trim() === "") {
    return { draft, plantInjected: alreadyPlanted };
  }

  const shouldPlant =
    mode === "every_normalize" || (mode === "once" && !alreadyPlanted);

  if (!shouldPlant) {
    return { draft, plantInjected: alreadyPlanted };
  }

  return {
    draft: `${draft}\n\n${plant.trim()}`,
    plantInjected: true,
  };
}

// ---------------------------------------------------------------------------
// Graph nodes (fixed mode)
// ---------------------------------------------------------------------------

async function planNode(
  state: GraphStateShape,
): Promise<{ planned: PlannedSubQuestion[] }> {
  const planned = await plan(state.query);
  return { planned };
}

async function researchOneNode(
  state: GraphStateShape,
): Promise<{ findings: Finding[] }> {
  const route = state.activeRoute === "llm" ? "llm" : "search";
  const findings = await researchOne(state.activeSubQuestion, route);
  return { findings };
}

async function normalizeNode(
  state: GraphStateShape,
): Promise<{ draft: string; plantInjected: boolean }> {
  let draft = await normalizeClaims(state.query, state.findings, {
    priorReviseReason: state.priorReviseReason,
  });

  const planted = maybePlant(
    draft,
    state.plantUnsupportedClaim,
    state.plantMode ?? "every_normalize",
    state.plantInjected === true,
  );

  return { draft: planted.draft, plantInjected: planted.plantInjected };
}

async function verifyNode(
  state: GraphStateShape,
): Promise<{ verdict: Verdict; priorReviseReason: string | null }> {
  const result = await verifyClaims(state.draft, state.findings, {
    priorReviseReason: state.priorReviseReason,
  });

  return {
    verdict: result.verdict,
    // Keep the reason only when we must rewrite; clear it on pass.
    priorReviseReason: result.verdict === "revise" ? result.reason : null,
  };
}

async function reviseBumpNode(
  state: GraphStateShape,
): Promise<{ retries: number }> {
  // Count one rewrite. Do not clear findings — we only rewrite the draft.
  return { retries: retryCount(state) + 1 };
}

async function finalNode(
  state: GraphStateShape,
): Promise<{ finalReport: string }> {
  if (state.verdict === "revise") {
    // Gate still failed — do not polish a bad draft into a normal report.
    return {
      finalReport: unfaithfulFallbackReport(state.query, state.findings),
    };
  }
  const finalReport = await synthesizeFinal(state.query, state.draft);
  return { finalReport };
}

/** Safe report when the draft failed the faithfulness check. */
export function unfaithfulFallbackReport(
  query: string,
  findings: Finding[],
): string {
  const lines = [
    "Research could not be verified as faithful to the gathered findings.",
    "The draft was not published as a normal report.",
    "",
    `Query: ${query}`,
    "",
    "Findings only (allowed evidence):",
  ];

  if (findings.length === 0) {
    lines.push("- (no findings)");
  } else {
    for (const f of findings) {
      lines.push(`- ${f.claim} (${f.sourceUrl})`);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Edges (fixed mode)
// ---------------------------------------------------------------------------

/** Copy state into a researchOne branch, with one active sub-question + route. */
function researchBranch(
  state: GraphStateShape,
  plannedItem: PlannedSubQuestion,
): GraphStateShape {
  return {
    query: state.query,
    planned: state.planned,
    findings: state.findings,
    activeSubQuestion: plannedItem.question,
    activeRoute: plannedItem.route === "llm" ? "llm" : "search",
    draft: state.draft,
    verdict: state.verdict,
    retries: retryCount(state),
    finalReport: state.finalReport,
    priorReviseReason: state.priorReviseReason ?? null,
    plantUnsupportedClaim: state.plantUnsupportedClaim ?? null,
    plantMode: state.plantMode ?? "every_normalize",
    plantInjected: state.plantInjected === true,
  };
}

/** After plan: one researchOne Send per planned sub-question (or skip to draft). */
export function fanOutResearch(
  state: GraphStateShape,
): "normalize" | Send[] {
  const planned = state.planned ?? [];
  if (planned.length === 0) return "normalize";

  const sends: Send[] = [];
  for (const item of planned) {
    sends.push(new Send("researchOne", researchBranch(state, item)));
  }
  return sends;
}

/** After verify: rewrite once if needed, else go to final. */
export function afterVerify(state: {
  verdict: Verdict;
  retries?: number | null;
}): "reviseBump" | "final" {
  const retries = retryCount(state);
  if (state.verdict === "revise" && retries < MAX_REWRITES) {
    return "reviseBump";
  }
  return "final";
}

const graph = new StateGraph(GraphState)
  .addNode("plan", planNode)
  .addNode("researchOne", researchOneNode)
  .addNode("normalize", normalizeNode)
  .addNode("verify", verifyNode)
  .addNode("reviseBump", reviseBumpNode)
  .addNode("final", finalNode)
  .addEdge(START, "plan")
  .addConditionalEdges("plan", fanOutResearch, {
    normalize: "normalize",
    researchOne: "researchOne",
  })
  .addEdge("researchOne", "normalize")
  .addEdge("normalize", "verify")
  .addConditionalEdges("verify", afterVerify, {
    reviseBump: "reviseBump",
    final: "final",
  })
  .addEdge("reviseBump", "normalize")
  .addEdge("final", END)
  .compile();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type RunResearchOptions = {
  /** Eval only: fake unsupported text stuck onto the draft. */
  plantUnsupportedClaim?: string | null;
  /** Eval only: when to stick the plant on (see PlantMode). */
  plantMode?: PlantMode;
  /** "fixed" (default) or "dynamic". */
  orchestration?: OrchestrationMode;
  /** Dynamic mode only: budgets and test hooks. */
  dynamic?: DynamicGatherOptions;
};

/** What writeReportFromFindings returns (draft + gate + report fields). */
export type WrittenReport = {
  findings: Finding[];
  draft: string;
  verdict: Verdict;
  retries: number;
  finalReport: string;
  priorReviseReason: string | null;
  plantUnsupportedClaim: string | null;
  plantMode: PlantMode;
  plantInjected: boolean;
};

/** What runResearch returns (both modes). */
export type ResearchResult = {
  query: string;
  /** Question texts only (easy to display). */
  subQuestions: string[];
  /** Full planner rows with search | llm routes (fixed mode). */
  plannedSubQuestions?: PlannedSubQuestion[];
  findings: Finding[];
  activeSubQuestion: string;
  draft: string;
  verdict: Verdict;
  retries: number;
  finalReport: string;
  priorReviseReason: string | null;
  plantUnsupportedClaim: string | null;
  plantMode: PlantMode;
  plantInjected: boolean;
  orchestration: OrchestrationMode;
  // Dynamic-only extras:
  scratchpad?: string;
  reasoningTraces?: ReasoningStepTrace[];
  stopReason?: StopReason;
};

/** Main entry: run fixed or dynamic research. */
export async function runResearch(
  query: string,
  options?: RunResearchOptions,
): Promise<ResearchResult> {
  const mode = options?.orchestration ?? "fixed";
  if (mode === "dynamic") {
    return runDynamic(query, options);
  }
  return runFixed(query, options);
}

async function runFixed(
  query: string,
  options?: RunResearchOptions,
): Promise<ResearchResult> {
  const state = await graph.invoke({
    query,
    retries: 0,
    verdict: "pass" as Verdict,
    priorReviseReason: null,
    plantUnsupportedClaim: options?.plantUnsupportedClaim ?? null,
    plantMode: options?.plantMode ?? "every_normalize",
    plantInjected: false,
  });

  const planned = state.planned ?? [];

  return {
    query: state.query,
    subQuestions: plannedQuestionTexts(planned),
    plannedSubQuestions: planned,
    findings: state.findings,
    activeSubQuestion: state.activeSubQuestion,
    draft: state.draft,
    verdict: state.verdict,
    retries: retryCount(state),
    finalReport: state.finalReport,
    priorReviseReason: state.priorReviseReason ?? null,
    plantUnsupportedClaim: state.plantUnsupportedClaim ?? null,
    plantMode: state.plantMode ?? "every_normalize",
    plantInjected: state.plantInjected === true,
    orchestration: "fixed",
  };
}

async function runDynamic(
  query: string,
  options?: RunResearchOptions,
): Promise<ResearchResult> {
  // 1) Gather findings with the reasoner + agents.
  const gather = await gatherWithDynamicAgents(query, options?.dynamic);

  // 2) Same write path as fixed mode (draft → verify → report).
  const written = await writeReportFromFindings(query, gather.findings, {
    plantUnsupportedClaim: options?.plantUnsupportedClaim,
    plantMode: options?.plantMode,
  });

  return {
    query,
    subQuestions: [],
    findings: written.findings,
    activeSubQuestion: "",
    draft: written.draft,
    verdict: written.verdict,
    retries: written.retries,
    finalReport: written.finalReport,
    priorReviseReason: written.priorReviseReason,
    plantUnsupportedClaim: written.plantUnsupportedClaim,
    plantMode: written.plantMode,
    plantInjected: written.plantInjected,
    orchestration: "dynamic",
    scratchpad: gather.scratchpad,
    reasoningTraces: gather.traces,
    stopReason: gather.stopReason,
  };
}

/**
 * Draft → verify → (one rewrite) → final report.
 * Used by dynamic mode. Fixed mode does the same steps as graph nodes.
 */
export async function writeReportFromFindings(
  query: string,
  findings: Finding[],
  options?: {
    plantUnsupportedClaim?: string | null;
    plantMode?: PlantMode;
  },
): Promise<WrittenReport> {
  const plantClaim = options?.plantUnsupportedClaim ?? null;
  const plantMode = options?.plantMode ?? "every_normalize";
  let plantInjected = false;
  let priorReviseReason: string | null = null;
  let retries = 0;

  async function makeDraft(): Promise<string> {
    let draft = await normalizeClaims(query, findings, { priorReviseReason });
    const planted = maybePlant(draft, plantClaim, plantMode, plantInjected);
    plantInjected = planted.plantInjected;
    return planted.draft;
  }

  // First draft + check
  let draft = await makeDraft();
  let check = await verifyClaims(draft, findings, { priorReviseReason });
  let verdict = check.verdict;
  priorReviseReason = verdict === "revise" ? check.reason : null;

  // One rewrite if needed (same findings, new draft)
  if (verdict === "revise" && retries < MAX_REWRITES) {
    retries += 1;
    draft = await makeDraft();
    check = await verifyClaims(draft, findings, { priorReviseReason });
    verdict = check.verdict;
    priorReviseReason = verdict === "revise" ? check.reason : null;
  }

  let finalReport: string;
  if (verdict === "revise") {
    finalReport = unfaithfulFallbackReport(query, findings);
  } else {
    finalReport = await synthesizeFinal(query, draft);
  }

  return {
    findings,
    draft,
    verdict,
    retries,
    finalReport,
    priorReviseReason,
    plantUnsupportedClaim: plantClaim,
    plantMode,
    plantInjected,
  };
}
