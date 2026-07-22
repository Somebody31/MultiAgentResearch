// Full research run. Read this file top to bottom.
//
//   plan → research → normalize → verify → (retry once?) → final
//
// Each step is a function in its own file. This file only picks the order.

import { plan } from "./plan.ts";
import { research, type Finding } from "./research.ts";
import { normalizeClaims } from "./normalize.ts";
import { verifyClaims, type Verdict } from "./verify.ts";
import { synthesizeFinal } from "./final.ts";

// Shared bag of data for one user query. Steps read/write fields on it.
export type State = {
  query: string;
  subQuestions: string[];
  findings: Finding[];
  draft: string;
  verdict: Verdict;
  retries: number; // 0 or 1
  finalReport: string;
};

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

  // 1) Split the big question into smaller ones
  state.subQuestions = await plan(state.query);

  // 2) Search + extract short facts
  state.findings = await research(state.subQuestions);

  // 3) Merge facts into one draft
  state.draft = await normalizeClaims(state.query, state.findings);

  // 4) Check the draft
  state.verdict = await verifyClaims(state.draft, state.findings);

  // 5) If check failed, do research + draft + check one more time
  if (state.verdict === "revise") {
    state.retries = 1;
    state.findings = await research(state.subQuestions);
    state.draft = await normalizeClaims(state.query, state.findings);
    state.verdict = await verifyClaims(state.draft, state.findings);
  }

  // 6) Write the final answer the user sees
  state.finalReport = await synthesizeFinal(state.query, state.draft);

  return state;
}
