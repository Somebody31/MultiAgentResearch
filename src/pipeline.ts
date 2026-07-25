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

/** Eval-only: how often unsupported plant text is appended after normalize. */
export type PlantMode = "every_normalize" | "once";

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
  // Eval-only plant seam (production leaves claim null).
  plantUnsupportedClaim: Annotation<string | null>({ default: () => null }),
  plantMode: Annotation<PlantMode>({ default: () => "every_normalize" }),
  /** True after plant was applied at least once (for plantMode "once"). */
  plantInjected: Annotation<boolean>({ default: () => false }),
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

  // Eval seam: optional unsupported text after normalize, before verify.
  // every_normalize: re-inject every pass (gate toughness).
  // once: inject only the first time (self-correct measurement).
  const plant = state.plantUnsupportedClaim;
  const mode = state.plantMode ?? "every_normalize";
  let plantInjected = state.plantInjected === true;

  if (typeof plant === "string" && plant.trim() !== "") {
    const shouldPlant =
      mode === "every_normalize" || (mode === "once" && !plantInjected);
    if (shouldPlant) {
      draft = `${draft}\n\n${plant.trim()}`;
      plantInjected = true;
    }
  }

  return { draft, plantInjected };
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

function sendPayload(state: typeof GraphState.State, activeSubQuestion: string) {
  return {
    query: state.query,
    subQuestions: state.subQuestions,
    findings: state.findings,
    activeSubQuestion,
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

// Start one researchOne branch per sub-question (LangGraph Send).
export function fanOutResearch(state: typeof GraphState.State) {
  if (state.subQuestions.length === 0) return "normalize";

  return state.subQuestions.map(
    (q) => new Send("researchOne", sendPayload(state, q)),
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
   * Eval only: unsupported draft text injected after normalize.
   * See plantMode for re-injection policy.
   */
  plantUnsupportedClaim?: string | null;
  /**
   * every_normalize: re-inject after every normalize (gate toughness eval).
   * once: inject only on first normalize (self-correct eval).
   * Default every_normalize when a plant is set.
   */
  plantMode?: PlantMode;
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
    plantMode: options?.plantMode ?? "every_normalize",
    plantInjected: false,
  });
}
