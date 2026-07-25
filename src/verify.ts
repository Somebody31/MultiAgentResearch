// Whole-draft faithfulness gate: draft vs findings only (not world fact-check).
// Returns pass | revise, plus a short reason used on a later re-check.
//
// Layers:
//   1) LLM faithfulness judgment (VERIFY_SYSTEM)
//   2) Deterministic: draft fingerprints not in findings → force revise
//   3) Deterministic (re-check only): prior revise reason fingerprints still
//      in draft and not in findings → force revise

import {
  priorReasonStillInDraft,
  unsupportedFingerprintsInDraft,
} from "./fingerprints.ts";
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

/** Stable system prefix for DeepSeek input cache (do not put findings/draft here). */
export const VERIFY_SYSTEM = `Check a research draft against its findings (faithfulness only, not world truth).

Decide:
- "pass" if the draft is supported by the findings
- "revise" if there are big gaps, contradictions, or unsupported claims

Be especially suspicious of content that does NOT appear in the findings, including:
- Proper nouns, product names, brand names, codenames, or appliance names (e.g. invented systems or wallets)
- Model names / model ids and "compliance rules" that name specific models
- Attributed quotes (someone "said", "announced", "stated") with slogan-like phrases
- Precise statistics, SLAs, prices, version numbers, or form/policy codes not in findings
- Causal claims that sound technical but are not backed by findings

If any such item is in the draft and not clearly supported by a finding, return "revise" and name the unsupported span in the reason (quote brands, model ids, or slogan phrases when present).

When the user message includes a prior revise reason (RE-CHECK):
- Return "pass" ONLY if every issue in the prior reason is clearly gone from the draft
- If the same unsupported claims, names, numbers, quotes, or gaps remain (even rephrased), return "revise"
- Do not pass just because the rest of the draft looks polished or mostly matches findings
- Do not pass if the draft still contains distinctive names, model ids, metrics, or quoted phrases from the prior reason unless those exact strings appear in the findings

Return ONLY JSON (one object), with a short reason naming the main problem or "ok":
{"verdict":"pass","reason":"ok"}
{"verdict":"revise","reason":"unsupported claim about ..."}`;

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
  const allowed = findingsBlob(findings);

  // Dynamic tail: findings, draft, then prior reason last (volatile).
  let user = `Findings (only allowed evidence):\n${listed}\n\nDraft:\n${draft}`;
  if (prior.length > 0) {
    user += `\n\nPrior revise reason (RE-CHECK — must be fixed before pass):\n${prior}`;
  }

  const text = await askLlm({
    stage: "verify",
    system: VERIFY_SYSTEM,
    user,
  });
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

  // Every pass: high-signal tokens in the draft that never appear in findings
  // force revise (catches silent LLM misses and soft second passes).
  if (finalVerdict === "pass") {
    const unsupported = unsupportedFingerprintsInDraft(draft, allowed);
    if (unsupported.length > 0) {
      finalVerdict = "revise";
      reason = `unsupported tokens not in findings: ${unsupported.slice(0, 6).join("; ")}`;
    }
  }

  // Re-check: prior reason leftovers still in draft (and not findings).
  if (finalVerdict === "pass" && prior.length > 0) {
    const leftovers = priorReasonStillInDraft(draft, allowed, prior);
    if (leftovers.length > 0) {
      finalVerdict = "revise";
      reason = `prior issues still present in draft: ${leftovers.slice(0, 4).join("; ")}`;
    }
  }

  return { verdict: finalVerdict, reason };
}
