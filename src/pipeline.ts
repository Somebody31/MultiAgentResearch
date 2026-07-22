// Research graph powered by LangGraph.
//
//   START → plan → research → normalize → verify → final → END
//                              ↑              │
//                              └── revise once ┘
//
// Nodes return partial state updates. LangGraph merges them.
// Parallel research is still Promise.all inside research.ts (not Send).

import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { plan } from "./plan.ts";
import { research, type Finding } from "./research.ts";
import { normalizeClaims } from "./normalize.ts";
import { verifyClaims, type Verdict } from "./verify.ts";
import { synthesizeFinal } from "./final.ts";

const MAX_RETRIES = 1;

// LangGraph state: each field is a channel with a default.
// Type of a full state value = typeof GraphState.State
const GraphState = Annotation.Root({
  query: Annotation<string>(),
  subQuestions: Annotation<string[]>({ default: () => [] }),
  findings: Annotation<Finding[]>({ default: () => [] }),
  draft: Annotation<string>({ default: () => "" }),
  verdict: Annotation<Verdict>({ default: () => "pass" }),
  retries: Annotation<number>({ default: () => 0 }),
  finalReport: Annotation<string>({ default: () => "" }),
});

// --- Nodes (return only what changed) ------------------------------------

async function planNode(state: typeof GraphState.State) {
  return { subQuestions: await plan(state.query) };
}

async function researchNode(state: typeof GraphState.State) {
  // If we looped back from verify, count one retry.
  const retries =
    state.verdict === "revise" ? state.retries + 1 : state.retries;

  return {
    findings: await research(state.subQuestions),
    retries,
  };
}

async function normalizeNode(state: typeof GraphState.State) {
  return { draft: await normalizeClaims(state.query, state.findings) };
}

async function verifyNode(state: typeof GraphState.State) {
  return { verdict: await verifyClaims(state.draft, state.findings) };
}

async function finalNode(state: typeof GraphState.State) {
  return { finalReport: await synthesizeFinal(state.query, state.draft) };
}

// --- Conditional edge after verify ---------------------------------------

export function afterVerify(state: {
  verdict: Verdict;
  retries: number;
}): "research" | "final" {
  if (state.verdict === "revise" && state.retries < MAX_RETRIES) {
    return "research";
  }
  return "final";
}

// --- Build graph ---------------------------------------------------------

const graph = new StateGraph(GraphState)
  .addNode("plan", planNode)
  .addNode("research", researchNode)
  .addNode("normalize", normalizeNode)
  .addNode("verify", verifyNode)
  .addNode("final", finalNode)
  .addEdge(START, "plan")
  .addEdge("plan", "research")
  .addEdge("research", "normalize")
  .addEdge("normalize", "verify")
  .addConditionalEdges("verify", afterVerify)
  .addEdge("final", END)
  .compile();

export async function runResearch(query: string) {
  return graph.invoke({ query });
}
