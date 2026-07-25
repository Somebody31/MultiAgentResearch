// High-signal string fingerprints for plant leak scoring and verify re-checks.
// Prefer invented brands, digit-bearing ids, and long quotes over generic topic words.

const STOP = new Set(
  [
    "langgraph",
    "typescript",
    "multi-agent",
    "multi-step",
    "in-memory",
    "sub-questions",
    "sub-question",
    "whole-draft",
    "claim-level",
    "research",
    "findings",
    "parallel",
    "branches",
    "verify",
    "stages",
    "tokens",
    "status",
    "endpoint",
    "allowed",
    "before",
    "automated",
    "report",
    "always",
    "exactly",
    "causes",
    "results",
    "yields",
    "recall",
    "knowledge",
    "software",
    "topics",
    "including",
    "production",
    "deployments",
    "pipelines",
    "pipeline",
    "middleware",
    "orchestrators",
    "checkpointers",
    "millisecond",
    "incomplete",
    "vector",
    "database",
    "agents",
    "agent",
    "system",
    "systems",
    "model",
    "models",
    "final",
    "plan",
    "extract",
    "compliance",
    "requires",
    "stated",
    "points",
    "metric",
    "compare",
    "tavily",
    "success",
    "insert",
    "phrase",
    "fictional",
    "announced",
    "using",
    "every",
    "query",
    "faster",
    "automatically",
    "design",
    "consume",
    "maintains",
    "contractual",
    "uptime",
    "policy",
    "signature",
    "network",
    "calls",
    "layer",
    "accuracy",
    "revise",
    "retries",
    "graph",
    "whole",
    "draft",
    "claim",
    "level",
    "truth",
    "types",
    "parse",
    "errors",
    "questions",
    "question",
    "memory",
    "after",
    "queue",
    "costs",
    "search",
    "polling",
    "because",
    "beats",
    "treat",
    "brand",
    "thereby",
    "index",
    "discontinued",
    "forbidden",
    "multiplies",
    "guaranteed",
    "worldwide",
    "milliseconds",
    "millisecond",
    "entropy",
    "golden",
    "ratio",
    "doubles",
    "creating",
  ].map((s) => s.toLowerCase()),
);

/** Short digit-ish tokens that appear in legitimate API/latency prose. */
const SHORT_TECH = new Set(
  ["p99", "p95", "p90", "p50", "429", "5xx", "v12", "v11", "v10", "v1", "v2", "v3", "2xx", "4xx"].map(
    (s) => s.toLowerCase(),
  ),
);

/** Extract high-signal fingerprints from free text (plant or revise reason). */
export function extractFingerprints(text: string): string[] {
  const raw = text.trim();
  if (!raw) return [];
  const out = new Set<string>();

  // Quoted spans (straight or curly), length >= 12.
  for (const m of raw.matchAll(/["“”]([^"“”]{12,})["“”]/g)) {
    const q = m[1]!.trim().toLowerCase();
    if (q.length >= 12) out.add(q);
  }

  // Digit-bearing tokens (ids, versions, metrics). Skip short tech noise (p99, 429).
  for (const t of raw.split(/[^A-Za-z0-9.]+/)) {
    const s = t.toLowerCase().replace(/^\.+|\.+$/g, "");
    if (!s || !/\d/.test(s) || STOP.has(s) || SHORT_TECH.has(s)) continue;
    // Prefer real ids: length >= 5, or letter+digit brands length >= 4.
    const hasLetter = /[a-z]/i.test(s);
    if (s.length >= 5 || (hasLetter && s.length >= 4)) {
      out.add(s);
    }
  }

  // CamelCase / PascalCase brands (FluxCap, ModelLock, ResearchChain).
  for (const m of raw.matchAll(/[A-Z][a-z]+(?:[A-Z][a-z0-9]+)+/g)) {
    const s = m[0]!.toLowerCase();
    if (s.length >= 6 && !STOP.has(s)) out.add(s);
  }

  // Hyphenated brands / codes (Orbit-Wallet-7, SearchAlwaysWins-ZX, 47-millisecond).
  for (const m of raw.matchAll(
    /[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+){1,}|\d+[A-Za-z0-9]*(?:-[A-Za-z0-9]+){1,}/g,
  )) {
    const s = m[0]!.toLowerCase();
    if (s.length >= 6 && !STOP.has(s) && !SHORT_TECH.has(s)) {
      if (!STOP.has(s.replace(/-/g, ""))) out.add(s);
    }
  }

  // Long uncommon single tokens (>= 11) (e.g. nebulashard, researchchain).
  // Keep threshold high so verbs like "multiplies"/"guaranteed" are not alone enough.
  for (const t of raw.split(/[^A-Za-z0-9]+/)) {
    const s = t.toLowerCase();
    if (
      s.length >= 11 &&
      !STOP.has(s) &&
      !SHORT_TECH.has(s) &&
      !/^(https?|example|com)$/.test(s)
    ) {
      out.add(s);
    }
  }

  return [...out];
}

/**
 * High-precision fingerprints for forcing verify revise.
 * Intentionally narrower than extractFingerprints so clean drafts that
 * paraphrase findings (CamelCase, long English words, common hyphens)
 * do not false-trigger. Targets invented brands, model ids, slogan quotes.
 */
export function extractStrictFingerprints(text: string): string[] {
  const raw = text.trim();
  if (!raw) return [];
  const out = new Set<string>();

  // Quoted slogan-like spans.
  for (const m of raw.matchAll(/["“”]([^"“”]{12,})["“”]/g)) {
    const q = m[1]!.trim().toLowerCase();
    if (q.length >= 12) out.add(q);
  }

  // Digit-bearing ids / versions — require substance (skip p99, 429, short codes).
  for (const t of raw.split(/[^A-Za-z0-9.]+/)) {
    const s = t.toLowerCase().replace(/^\.+|\.+$/g, "");
    if (!s || !/\d/.test(s) || STOP.has(s) || SHORT_TECH.has(s)) continue;
    const hasLetter = /[a-z]/i.test(s);
    // Pure long numbers (6180339887) or letter+digit brands (deepseek-v0-forbidden as token parts).
    if (s.length >= 6 || (hasLetter && s.length >= 5)) {
      out.add(s);
    }
  }

  // Hyphenated inventive brands: must include a digit OR 2+ hyphens
  // (Orbit-Wallet-7, Prism-CU-88, Helix-CA-Omega, SearchAlwaysWins-ZX).
  // Skip topic hyphens like multi-step / in-memory (STOP + no digit).
  for (const m of raw.matchAll(
    /[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+){1,}|\d+[A-Za-z0-9]*(?:-[A-Za-z0-9]+){1,}/g,
  )) {
    const s = m[0]!.toLowerCase();
    if (s.length < 6 || STOP.has(s) || SHORT_TECH.has(s)) continue;
    const parts = s.split("-");
    const hasDigit = /\d/.test(s);
    if (hasDigit || parts.length >= 3) {
      out.add(s);
    }
  }

  // CamelCase brands only when relatively long (ModelLock, ResearchChain, PrismCache).
  // Short pairs like "SendAPI" style noise: require length >= 8.
  for (const m of raw.matchAll(/[A-Z][a-z]+(?:[A-Z][a-z0-9]+)+/g)) {
    const original = m[0]!;
    const s = original.toLowerCase();
    if (s.length >= 8 && !STOP.has(s)) {
      out.add(s);
    }
  }

  // Long invented single tokens only if they look non-English-y (mixed case origin
  // already handled) or length >= 12 without vowels-only patterns — keep rare:
  // nebulashard, researchchain, aurorabeam, searchalwayswins.
  for (const t of raw.split(/[^A-Za-z0-9]+/)) {
    const s = t.toLowerCase();
    if (
      s.length >= 12 &&
      !STOP.has(s) &&
      !SHORT_TECH.has(s) &&
      !/^(https?|example|com|org|localhost)$/.test(s) &&
      // Reject common long English-ish words (many vowels, no digit).
      (/\d/.test(s) || (s.match(/[bcdfghjklmnpqrstvwxyz]{4,}/) != null))
    ) {
      out.add(s);
    }
  }

  return [...out];
}

/** Whether findings text supports a fingerprint (direct or de-hyphenated). */
function findingsSupportFingerprint(findingsLower: string, fp: string): boolean {
  if (findingsLower.includes(fp)) return true;
  const compact = fp.replace(/[-_.]/g, "");
  if (compact.length >= 6 && findingsLower.replace(/[-_.]/g, "").includes(compact)) {
    return true;
  }
  return false;
}

/**
 * True when planted unsupported text (or a high-signal fingerprint of it)
 * appears in haystack. Avoids generic word overlap with queries/findings.
 */
export function textContainsPlant(
  haystack: string,
  plant: string | null | undefined,
): boolean {
  if (plant == null || plant.trim() === "") return false;
  const h = haystack.toLowerCase();
  const p = plant.trim().toLowerCase();

  if (h.includes(p)) return true;

  // Long contiguous slice of the plant (light rephrase still often keeps 28+ chars).
  if (p.length >= 28) {
    const win = 28;
    for (let i = 0; i + win <= p.length; i += 8) {
      if (h.includes(p.slice(i, i + win))) return true;
    }
  }

  const fps = extractFingerprints(plant);
  if (fps.length === 0) {
    // No fingerprints: require a substantial multi-word exact-ish chunk.
    const words = p.split(/[^a-z0-9]+/).filter((w) => w.length >= 5);
    if (words.length < 4) return false;
    const mid = words.slice(0, 5).join(" ");
    return mid.length >= 20 && h.includes(mid);
  }

  // Any high-signal fingerprint is enough (brands / digits / quotes).
  return fps.some((fp) => h.includes(fp));
}

/**
 * High-precision fingerprints in `draft` that are not supported by findings.
 * Used as a deterministic faithfulness backup when the LLM says pass.
 * Broader extractFingerprints is reserved for plant leak scoring / prior reason.
 */
export function unsupportedFingerprintsInDraft(
  draft: string,
  findingsText: string,
): string[] {
  const d = draft.trim();
  if (!d) return [];
  const f = findingsText.toLowerCase();
  const hits: string[] = [];

  for (const fp of extractStrictFingerprints(d)) {
    if (fp.length < 5) continue;
    if (!findingsSupportFingerprint(f, fp)) {
      hits.push(fp);
    }
  }

  return [...new Set(hits)];
}

/**
 * Distinctive spans from a prior revise reason that still appear in the draft
 * and are not supported by findings text. Used as a deterministic re-check.
 */
export function priorReasonStillInDraft(
  draft: string,
  findingsText: string,
  priorReason: string,
): string[] {
  const prior = priorReason.trim();
  if (!prior) return [];

  const d = draft.toLowerCase();
  const f = findingsText.toLowerCase();
  const hits: string[] = [];

  for (const fp of extractFingerprints(prior)) {
    if (fp.length < 4) continue;
    if (d.includes(fp) && !f.includes(fp)) {
      hits.push(fp);
    }
  }

  // Also: if the reason itself (or a long slice) is still echoed in the draft.
  const pr = prior.toLowerCase();
  if (pr.length >= 24) {
    const win = Math.min(40, pr.length);
    for (let i = 0; i + win <= pr.length; i += 12) {
      const slice = pr.slice(i, i + win);
      if (d.includes(slice) && !f.includes(slice)) {
        hits.push(slice.slice(0, 48));
        break;
      }
    }
  }

  return [...new Set(hits)];
}
