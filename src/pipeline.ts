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
  // Set when verify returns revise; next verify must re-check these issues.
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
  const result = await verifyClaims(state.draft, state.findings, {
    priorReviseReason: state.priorReviseReason,
  });

  // Keep the latest revise reason so a second check cannot ignore what failed.
  // Clear on pass so a clean draft does not carry stale blame.
  return {
    verdict: result.verdict,
    priorReviseReason:
      result.verdict === "revise" ? result.reason : null,
  };
}

async function retryKickoffNode(state: typeof GraphState.State) {
  // Clear old findings, count the retry, then fan-out runs again via edges.
  return {
    findings: "RESET" as const,
    retries: retryCount(state) + 1,
  };
}

async function finalNode(state: typeof GraphState.State) {
  // Faithfulness gate still says revise after any allowed retries:
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
}): "retryKickoff" | "final" {
  // Coerce retries: `undefined < 1` is false in JS and skipped the revise path.
  const retries = retryCount(state);
  if (state.verdict === "revise" && retries < MAX_RETRIES) {
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
  .addConditionalEdges("plan", fanOutResearch, {
    normalize: "normalize",
    researchOne: "researchOne",
  })
  .addEdge("researchOne", "normalize")
  .addEdge("normalize", "verify")
  .addConditionalEdges("verify", afterVerify, {
    retryKickoff: "retryKickoff",
    final: "final",
  })
  .addConditionalEdges("retryKickoff", fanOutResearch, {
    normalize: "normalize",
    researchOne: "researchOne",
  })
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
