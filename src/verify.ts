// Whole-draft faithfulness gate: draft vs findings only (not world fact-check).
// Returns pass | revise, plus a short reason used on a later re-check.

import { priorReasonStillInDraft } from "./fingerprints.ts";
import { askLlm } from "./llm.ts";
import { parseJsonObject } from "./parseJson.ts";
import type { Finding } from "./research.ts";

export type Verdict = "pass" | "revise";

export type VerifyResult = {
  verdict: Verdict;
  /** Short note for humans and for a second verify after revise. */
  reason: string;
};

export type VerifyOptions = {
  /**
   * If set, this draft is a re-check after an earlier "revise".
   * The model must not casually pass while the same problems remain.
   * A deterministic fingerprint check also runs when this is set.
   */
  priorReviseReason?: string | null;
};

function findingsBlob(findings: Finding[]): string {
  return findings.map((f) => `${f.claim}\n${f.sourceUrl}`).join("\n");
}

export async function verifyClaims(
  draft: string,
  findings: Finding[],
  options?: VerifyOptions,
): Promise<VerifyResult> {
  const listed = findings
    .map((f, i) => `[${i + 1}] ${f.claim} (${f.sourceUrl})`)
    .join("\n");

  const prior = options?.priorReviseReason?.trim() ?? "";
  const priorBlock =
    prior.length > 0
      ? `
This is a RE-CHECK after an earlier faithfulness failure.
Prior revise reason (must be fixed before pass):
${prior}

Rules for this re-check:
- Return "pass" ONLY if every issue in the prior reason is clearly gone from the draft.
- If the same unsupported claims, names, numbers, quotes, or gaps remain (even rephrased), return "revise".
- Do not pass just because the rest of the draft looks polished or mostly matches findings.
- Do not pass if the draft still contains distinctive names, model ids, metrics, or quoted phrases from the prior reason unless those exact strings appear in the findings.
`
      : "";

  const prompt = `Check a research draft against its findings (faithfulness only, not world truth).

Findings (only allowed evidence):
${listed}

Draft:
${draft}
${priorBlock}
Decide:
- "pass" if the draft is supported by the findings${prior ? " AND the prior revise issues are fixed" : ""}
- "revise" if there are big gaps, contradictions, or unsupported claims${prior ? ", or prior issues remain" : ""}

Be especially suspicious of content that does NOT appear in the findings, including:
- Proper nouns, product names, brand names, codenames, or appliance names (e.g. invented systems or wallets)
- Model names / model ids and "compliance rules" that name specific models
- Attributed quotes (someone "said", "announced", "stated") with slogan-like phrases
- Precise statistics, SLAs, prices, version numbers, or form/policy codes not in findings
- Causal claims that sound technical but are not backed by findings

If any such item is in the draft and not clearly supported by a finding, return "revise" and name it in the reason.

Return ONLY JSON (one object), with a short reason naming the main problem or "ok":
{"verdict":"pass","reason":"ok"}
{"verdict":"revise","reason":"unsupported claim about ..."}`;

  const text = await askLlm(prompt);
  const parsed = parseJsonObject(text);
  const verdict = parsed?.verdict;
  const reasonRaw = parsed?.reason;
  let reason =
    typeof reasonRaw === "string" && reasonRaw.trim() !== ""
      ? reasonRaw.trim()
      : verdict === "pass"
        ? "ok"
        : "unspecified faithfulness problem";

  if (verdict !== "pass" && verdict !== "revise") {
    return {
      verdict: "revise",
      reason: "verifier returned unusable JSON",
    };
  }

  let finalVerdict: Verdict = verdict;

  // Deterministic backup on re-check: if the LLM says pass but distinctive
  // tokens from the prior reason still appear in the draft (and not findings),
  // force revise so a soft second pass cannot ship the same plant.
  if (finalVerdict === "pass" && prior.length > 0) {
    const leftovers = priorReasonStillInDraft(
      draft,
      findingsBlob(findings),
      prior,
    );
    if (leftovers.length > 0) {
      finalVerdict = "revise";
      reason = `prior issues still present in draft: ${leftovers.slice(0, 4).join("; ")}`;
    }
  }

  return { verdict: finalVerdict, reason };
}
