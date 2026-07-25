// Research graph powered by LangGraph.
//
//   START → plan ─┬─ Send(researchOne) × N ─┬→ normalize → verify → final → END
//                 │                         │                 │
//                 │                         │    revise once  │
//                 │                         │        ▼        │
//                 │                    retryKickoff ─┘        │
//                 │                    (RESET findings,       │
//                 │                     Send again)           │
//
// Fan-out uses LangGraph Send() (not Promise.all).
// findings use a concat reducer; retry sends "RESET" first.

import { Annotation, END, Send, START, StateGraph } from "@langchain/langgraph";
import { plan } from "./plan.ts";
import { researchOne, type Finding } from "./research.ts";
import { normalizeClaims } from "./normalize.ts";
import { verifyClaims, type Verdict } from "./verify.ts";
import { synthesizeFinal } from "./final.ts";

const MAX_RETRIES = 1;

// Special update: clear findings before a research retry.
type FindingsUpdate = Finding[] | "RESET";

const GraphState = Annotation.Root({
  query: Annotation<string>(),
  subQuestions: Annotation<string[]>({ default: () => [] }),
  // Concat when branches return lists; "RESET" wipes for a retry pass.
  findings: Annotation<Finding[]>({
    default: () => [],
    reducer: (left: Finding[], right: FindingsUpdate) => {
      if (right === "RESET") return [];
      return left.concat(right);
    },
  }),
  // Which sub-question this researchOne branch is working on (Send payload).
  activeSubQuestion: Annotation<string>({ default: () => "" }),
  draft: Annotation<string>({ default: () => "" }),
  verdict: Annotation<Verdict>({ default: () => "pass" }),
  retries: Annotation<number>({ default: () => 0 }),
  finalReport: Annotation<string>({ default: () => "" }),
  // Eval-only: optional text appended after normalize (every pass, including
  // after revise). Production leaves this null. Not claim-level fact-check —
  // used to score the whole-draft faithfulness gate (draft vs findings).
  plantUnsupportedClaim: Annotation<string | null>({ default: () => null }),
});

// --- Nodes ----------------------------------------------------------------

async function planNode(state: typeof GraphState.State) {
  return { subQuestions: await plan(state.query) };
}

async function researchOneNode(state: typeof GraphState.State) {
  const findings = await researchOne(state.activeSubQuestion);
  return { findings };
}

async function normalizeNode(state: typeof GraphState.State) {
  let draft = await normalizeClaims(state.query, state.findings);

  // Eval seam only: plant text that is not in findings, right before verify.
  // Re-applied on every normalize (including after a revise retry).
  const plant = state.plantUnsupportedClaim;
  if (typeof plant === "string" && plant.trim() !== "") {
    draft = `${draft}\n\n${plant.trim()}`;
  }

  return { draft };
}

async function verifyNode(state: typeof GraphState.State) {
  return { verdict: await verifyClaims(state.draft, state.findings) };
}

async function retryKickoffNode(state: typeof GraphState.State) {
  // Clear old findings, count the retry, then fan-out runs again via edges.
  return {
    findings: "RESET" as const,
    retries: state.retries + 1,
  };
}

async function finalNode(state: typeof GraphState.State) {
  return { finalReport: await synthesizeFinal(state.query, state.draft) };
}

// --- Edges ----------------------------------------------------------------

// Start one researchOne branch per sub-question (LangGraph Send).
export function fanOutResearch(state: typeof GraphState.State) {
  if (state.subQuestions.length === 0) return "normalize";

  return state.subQuestions.map(
    (q) =>
      new Send("researchOne", {
        query: state.query,
        subQuestions: state.subQuestions,
        findings: state.findings,
        activeSubQuestion: q,
        draft: state.draft,
        verdict: state.verdict,
        retries: state.retries,
        finalReport: state.finalReport,
        plantUnsupportedClaim: state.plantUnsupportedClaim,
      }),
  );
}

export function afterVerify(state: {
  verdict: Verdict;
  retries: number;
}): "retryKickoff" | "final" {
  if (state.verdict === "revise" && state.retries < MAX_RETRIES) {
    return "retryKickoff";
  }
  return "final";
}

// --- Build graph ----------------------------------------------------------

const graph = new StateGraph(GraphState)
  .addNode("plan", planNode)
  .addNode("researchOne", researchOneNode)
  .addNode("normalize", normalizeNode)
  .addNode("verify", verifyNode)
  .addNode("retryKickoff", retryKickoffNode)
  .addNode("final", finalNode)
  .addEdge(START, "plan")
  .addConditionalEdges("plan", fanOutResearch)
  .addEdge("researchOne", "normalize")
  .addEdge("normalize", "verify")
  .addConditionalEdges("verify", afterVerify)
  .addConditionalEdges("retryKickoff", fanOutResearch)
  .addEdge("final", END)
  .compile();

/** Optional eval inputs. Production callers omit this. */
export type RunResearchOptions = {
  /**
   * Eval only: append this text to the draft after every normalize, before
   * the faithfulness gate (verify). Use to plant unsupported draft content.
   */
  plantUnsupportedClaim?: string | null;
};

export async function runResearch(
  query: string,
  options?: RunResearchOptions,
) {
  return graph.invoke({
    query,
    plantUnsupportedClaim: options?.plantUnsupportedClaim ?? null,
  });
}
