// Check the draft against findings only (not world fact-checking).
// Returns "pass" or "revise", plus a short reason.
//
// Checks:
//   1) LLM judgment
//   2) Extra safety: brand-like tokens in the draft that never appear in findings
//   3) On a re-check: leftovers from the prior revise reason

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
  reason: string;
};

export type VerifyOptions = {
  /** If set, this is a re-check after an earlier "revise". */
  priorReviseReason?: string | null;
};

export const VERIFY_SYSTEM = `Check a research draft against its findings (faithfulness only, not world truth).

Decide:
- "pass" if the draft is reasonably supported by the findings (paraphrase and merging are OK)
- "revise" only for material unsupported claims — not for style, structure, or minor gaps already implied by findings

Return "revise" when the draft introduces content that does NOT appear in the findings, especially:
- Invented product/brand/codenames or appliance names not in findings
- Model names / model ids and fake "compliance rules" naming specific models
- Attributed quotes (someone "said", "announced", "stated") with slogan-like phrases not in findings
- Precise statistics, SLAs, prices, version numbers, or form/policy codes not in findings

Do NOT revise merely because:
- The draft omits some findings
- Wording differs from findings while meaning matches
- Structure or tone is imperfect

If you revise, name the unsupported span in the reason (quote brands, model ids, or slogan phrases when present).

When the user message includes a prior revise reason (RE-CHECK):
- Return "pass" ONLY if every issue in the prior reason is clearly gone from the draft
- If the same unsupported claims, names, numbers, quotes, or gaps remain (even rephrased), return "revise"
- Do not pass just because the rest of the draft looks polished

Return ONLY JSON (one object), with a short reason naming the main problem or "ok":
{"verdict":"pass","reason":"ok"}
{"verdict":"revise","reason":"unsupported claim about ..."}`;

export async function verifyClaims(
  draft: string,
  findings: Finding[],
  options?: VerifyOptions,
): Promise<VerifyResult> {
  const listed = findings
    .map((f, i) => `[${i + 1}] ${f.claim} (${f.sourceUrl})`)
    .join("\n");

  const prior = options?.priorReviseReason?.trim() ?? "";
  const findingsText = findings
    .map((f) => `${f.claim}\n${f.sourceUrl}`)
    .join("\n");

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
  const rawVerdict = parsed?.verdict;
  const rawReason = parsed?.reason;

  // Bad JSON → ask for a rewrite rather than pretending we passed.
  if (rawVerdict !== "pass" && rawVerdict !== "revise") {
    return {
      verdict: "revise",
      reason: "verifier returned unusable JSON",
    };
  }

  let verdict: Verdict = rawVerdict;
  let reason =
    typeof rawReason === "string" && rawReason.trim() !== ""
      ? rawReason.trim()
      : rawVerdict === "pass"
        ? "ok"
        : "unspecified faithfulness problem";

  // Safety net: invent-y tokens in the draft that are not in findings.
  if (verdict === "pass") {
    const bad = unsupportedFingerprintsInDraft(draft, findingsText);
    if (bad.length > 0) {
      verdict = "revise";
      reason = `unsupported tokens not in findings: ${bad.slice(0, 6).join("; ")}`;
    }
  }

  // Re-check: prior problems still visible in the draft.
  if (verdict === "pass" && prior.length > 0) {
    const leftovers = priorReasonStillInDraft(draft, findingsText, prior);
    if (leftovers.length > 0) {
      verdict = "revise";
      reason = `prior issues still present in draft: ${leftovers.slice(0, 4).join("; ")}`;
    }
  }

  return { verdict, reason };
}
