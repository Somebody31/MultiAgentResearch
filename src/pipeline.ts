// Research graph powered by LangGraph.
//
//   START → plan ─┬─ Send(researchOne) × N ─┬→ normalize → verify → final → END
//                 │                         │                 │
//                 │                         │  revise once    │
//                 │                         │  (same findings)│
//                 │                         │        ▼        │
//                 │                    reviseBump ───┘        │
//                 │                    → normalize again      │
//                 │                    (sees priorReviseReason│
//                 │                     — no re-research)     │
//
// Fan-out uses LangGraph Send() (not Promise.all).
// findings use a concat reducer.

import { Annotation, END, Send, START, StateGraph } from "@langchain/langgraph";
import { plan } from "./plan.ts";
import { researchOne, type Finding } from "./research.ts";
import { normalizeClaims } from "./normalize.ts";
import { verifyClaims, type Verdict } from "./verify.ts";
import { synthesizeFinal } from "./final.ts";

const MAX_RETRIES = 1;

const GraphState = Annotation.Root({
  query: Annotation<string>(),
  subQuestions: Annotation<string[]>({ default: () => [] }),
  findings: Annotation<Finding[]>({
    default: () => [],
    reducer: (left: Finding[], right: Finding[]) => left.concat(right),
  }),
  // Which sub-question this researchOne branch is working on (Send payload).
  activeSubQuestion: Annotation<string>({ default: () => "" }),
  draft: Annotation<string>({ default: () => "" }),
  verdict: Annotation<Verdict>({ default: () => "pass" }),
  /** How many draft rewrites after a failed verify (not research retries). */
  retries: Annotation<number>({ default: () => 0 }),
  finalReport: Annotation<string>({ default: () => "" }),
  // Set when verify returns revise; rewrite normalize + re-check use this.
  priorReviseReason: Annotation<string | null>({ default: () => null }),
  // Eval-only: optional text appended after normalize (every pass, including
  // after revise). Production leaves this null. Not claim-level fact-check —
  // used to score the whole-draft faithfulness gate (draft vs findings).
  plantUnsupportedClaim: Annotation<string | null>({ default: () => null }),
});

/** Always a number — LangGraph / Send can leave channels undefined. */
function retryCount(state: { retries?: number | null }): number {
  const n = state.retries;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

// --- Nodes ----------------------------------------------------------------

async function planNode(state: typeof GraphState.State) {
  return { subQuestions: await plan(state.query) };
}

async function researchOneNode(state: typeof GraphState.State) {
  const findings = await researchOne(state.activeSubQuestion);
  return { findings };
}

async function normalizeNode(state: typeof GraphState.State) {
  // On a rewrite, priorReviseReason is set so normalize targets what failed.
  let draft = await normalizeClaims(state.query, state.findings, {
    priorReviseReason: state.priorReviseReason,
  });

  // Eval seam only: plant text that is not in findings, right before verify.
  // Re-applied on every normalize (including after a revise rewrite).
  const plant = state.plantUnsupportedClaim;
  if (typeof plant === "string" && plant.trim() !== "") {
    draft = `${draft}\n\n${plant.trim()}`;
  }

  return { draft };
}

async function verifyNode(state: typeof GraphState.State) {
  const result = await verifyClaims(state.draft, state.findings, {
    priorReviseReason: state.priorReviseReason,
  });

  // Keep the latest revise reason so rewrite + second check cannot ignore it.
  // Clear on pass so a clean draft does not carry stale blame.
  return {
    verdict: result.verdict,
    priorReviseReason:
      result.verdict === "revise" ? result.reason : null,
  };
}

/** Count one rewrite; keep findings — do not re-research. */
async function reviseBumpNode(state: typeof GraphState.State) {
  return {
    retries: retryCount(state) + 1,
  };
}

async function finalNode(state: typeof GraphState.State) {
  // Faithfulness gate still says revise after any allowed rewrites:
  // do not polish the unfaithful draft into a normal user report.
  // List only findings so unsupported draft text (including eval plants) cannot leak.
  if (state.verdict === "revise") {
    return {
      finalReport: unfaithfulFallbackReport(state.query, state.findings),
    };
  }

  return { finalReport: await synthesizeFinal(state.query, state.draft) };
}

/** User-facing fallback when the draft failed the faithfulness gate. */
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

// --- Edges ----------------------------------------------------------------

// Start one researchOne branch per sub-question (LangGraph Send).
export function fanOutResearch(state: typeof GraphState.State) {
  if (state.subQuestions.length === 0) return "normalize";

  const retries = retryCount(state);

  return state.subQuestions.map(
    (q) =>
      new Send("researchOne", {
        query: state.query,
        subQuestions: state.subQuestions,
        findings: state.findings,
        activeSubQuestion: q,
        draft: state.draft,
        verdict: state.verdict,
        retries,
        finalReport: state.finalReport,
        priorReviseReason: state.priorReviseReason ?? null,
        plantUnsupportedClaim: state.plantUnsupportedClaim ?? null,
      }),
  );
}

export function afterVerify(state: {
  verdict: Verdict;
  retries?: number | null;
}): "reviseBump" | "final" {
  // Coerce retries: `undefined < 1` is false in JS and skipped the revise path.
  const retries = retryCount(state);
  if (state.verdict === "revise" && retries < MAX_RETRIES) {
    return "reviseBump";
  }
  return "final";
}

// --- Build graph ----------------------------------------------------------

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
  // Rewrite only: same findings, normalize with priorReviseReason, re-verify.
  .addEdge("reviseBump", "normalize")
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
    retries: 0,
    verdict: "pass" as Verdict,
    priorReviseReason: null,
    plantUnsupportedClaim: options?.plantUnsupportedClaim ?? null,
  });
}
