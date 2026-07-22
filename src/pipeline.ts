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

// Public shape returned by runResearch (same as before).
export type State = {
  query: string;
  subQuestions: string[];
  findings: Finding[];
  draft: string;
  verdict: Verdict;
  retries: number;
  finalReport: string;
};

const MAX_RETRIES = 1;

// LangGraph state: each field is a channel with a default.
const GraphState = Annotation.Root({
  query: Annotation<string>(),
  subQuestions: Annotation<string[]>({ default: () => [] }),
  findings: Annotation<Finding[]>({ default: () => [] }),
  draft: Annotation<string>({ default: () => "" }),
  verdict: Annotation<Verdict>({ default: () => "pass" }),
  retries: Annotation<number>({ default: () => 0 }),
  finalReport: Annotation<string>({ default: () => "" }),
});

type GraphStateType = typeof GraphState.State;

// --- Nodes (return only what changed) ------------------------------------

async function planNode(state: GraphStateType) {
  return { subQuestions: await plan(state.query) };
}

async function researchNode(state: GraphStateType) {
  // If we looped back from verify, count one retry.
  const retries =
    state.verdict === "revise" ? state.retries + 1 : state.retries;

  return {
    findings: await research(state.subQuestions),
    retries,
  };
}

async function normalizeNode(state: GraphStateType) {
  return { draft: await normalizeClaims(state.query, state.findings) };
}

async function verifyNode(state: GraphStateType) {
  return { verdict: await verifyClaims(state.draft, state.findings) };
}

async function finalNode(state: GraphStateType) {
  return { finalReport: await synthesizeFinal(state.query, state.draft) };
}

// --- Conditional edge after verify ---------------------------------------

export function afterVerify(
  state: Pick<State, "verdict" | "retries">,
): "research" | "final" {
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

export async function runResearch(query: string): Promise<State> {
  const result = await graph.invoke({ query });
  return result as State;
}
