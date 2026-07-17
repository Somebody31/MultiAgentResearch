/**
 * Research pipeline (plain TypeScript, no graph library).
 *
 * Shared state is updated by each step. Order and the verify retry live here;
 * LLM/search work is in the step modules.
 *
 *   plan → research → normalize → verify ⟲ (max 1 re-research) → final
 */

import { plan } from "./plan.ts";
import { research, type Finding } from "./research.ts";
import { normalizeClaims } from "./normalize.ts";
import { verifyClaims, type Verdict } from "./verify.ts";
import { synthesizeFinal } from "./final.ts";

export type State = {
  query: string;
  subQuestions: string[];
  findings: Finding[];
  draft: string;
  verdict: Verdict;
  /** 0 on first pass; 1 if we re-ran research after revise. */
  retries: number;
  finalReport: string;
};

export type ResearchResult = State;

const MAX_RETRIES = 1;

function createState(query: string): State {
  return {
    query,
    subQuestions: [],
    findings: [],
    draft: "",
    verdict: "pass",
    retries: 0,
    finalReport: "",
  };
}

async function stepPlan(state: State): Promise<void> {
  state.subQuestions = await plan(state.query);
}

async function stepResearch(state: State): Promise<void> {
  state.findings = await research(state.subQuestions);
}

async function stepNormalize(state: State): Promise<void> {
  state.draft = await normalizeClaims(state.query, state.findings);
}

async function stepVerify(state: State): Promise<void> {
  state.verdict = await verifyClaims(state.draft, state.findings);
}

async function stepFinal(state: State): Promise<void> {
  state.finalReport = await synthesizeFinal(state.query, state.draft);
}

/** Run the full pipeline for one query. */
export async function runResearch(query: string): Promise<State> {
  const state = createState(query);

  await stepPlan(state);
  await stepResearch(state);
  await stepNormalize(state);
  await stepVerify(state);

  // Code-only gate: on revise, re-research once then continue either way.
  while (state.verdict === "revise" && state.retries < MAX_RETRIES) {
    state.retries += 1;
    await stepResearch(state);
    await stepNormalize(state);
    await stepVerify(state);
  }

  await stepFinal(state);
  return state;
}
