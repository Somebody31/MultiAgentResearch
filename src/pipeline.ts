// Full research run — a small graph, without LangGraph.
//
//   Nodes  = steps (plan, research, normalize, verify, final)
//   Edges  = nextNode() decides what runs next from state
//   Runner = while loop: run node → pick next → repeat until stop
//
// Same flow as before:
//   plan → research → normalize → verify → (retry research once?) → final
//
// Parallel fan-out still lives inside research.ts (Promise.all).

import { plan } from "./plan.ts";
import { research, type Finding } from "./research.ts";
import { normalizeClaims } from "./normalize.ts";
import { verifyClaims, type Verdict } from "./verify.ts";
import { synthesizeFinal } from "./final.ts";

// Shared bag of data for one user query. Nodes read/write fields on it.
export type State = {
  query: string;
  subQuestions: string[];
  findings: Finding[];
  draft: string;
  verdict: Verdict;
  retries: number; // 0 or 1
  finalReport: string;
};

// Names of every step in the graph.
export type NodeName =
  | "plan"
  | "research"
  | "normalize"
  | "verify"
  | "final";

// How many times we may loop verify → research.
const MAX_RETRIES = 1;

// --- Nodes: each one does its job and updates State -----------------------

type NodeFn = (state: State) => Promise<void>;

const nodes: Record<NodeName, NodeFn> = {
  async plan(state) {
    state.subQuestions = await plan(state.query);
  },

  async research(state) {
    // Sub-questions run in parallel inside research().
    state.findings = await research(state.subQuestions);
  },

  async normalize(state) {
    state.draft = await normalizeClaims(state.query, state.findings);
  },

  async verify(state) {
    state.verdict = await verifyClaims(state.draft, state.findings);
  },

  async final(state) {
    state.finalReport = await synthesizeFinal(state.query, state.draft);
  },
};

// --- Edges: given where we are + state, where do we go next? --------------
// Return null to stop the graph.

export function nextNode(current: NodeName, state: State): NodeName | null {
  if (current === "plan") return "research";
  if (current === "research") return "normalize";
  if (current === "normalize") return "verify";

  if (current === "verify") {
    // Conditional edge: fail once → research again; else → final report.
    if (state.verdict === "revise" && state.retries < MAX_RETRIES) {
      return "research";
    }
    return "final";
  }

  // final (or unknown) → stop
  return null;
}

// --- Runner ---------------------------------------------------------------

export async function runResearch(query: string): Promise<State> {
  const state: State = {
    query,
    subQuestions: [],
    findings: [],
    draft: "",
    verdict: "pass",
    retries: 0,
    finalReport: "",
  };

  let current: NodeName | null = "plan";

  while (current !== null) {
    // 1) Run this node
    await nodes[current](state);

    // 2) Decide the next node
    const next = nextNode(current, state);

    // 3) If we are looping back to research after a failed verify, count a retry
    if (current === "verify" && next === "research") {
      state.retries += 1;
    }

    current = next;
  }

  return state;
}
