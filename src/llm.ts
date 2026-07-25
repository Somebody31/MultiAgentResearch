// Call DeepSeek V4 Flash. Needs DEEPSEEK_API_KEY in .env
//
// OpenAI-compatible chat API: https://api.deepseek.com
//
// Prompt layout for automatic input (prefix) cache:
//   messages[0] system = stable stage instructions (same bytes every call)
//   messages[1] user   = dynamic payload only (query, findings, draft, …)
// Cache hits require an identical prefix from token 0; keep system fixed.

export type AskLlmOptions = {
  /** Stable per-stage instructions. Must not include query/findings/draft. */
  system: string;
  /** Variable payload only. Put volatile sections last. */
  user: string;
  /** Optional label for cache hit/miss logs (e.g. "verify"). */
  stage?: string;
};

export type CacheUsage = {
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
  prompt_tokens?: number;
};

/** Running totals for the process (eval / debug). */
export const llmCacheStats = {
  hitTokens: 0,
  missTokens: 0,
  calls: 0,
};

export function resetLlmCacheStats() {
  llmCacheStats.hitTokens = 0;
  llmCacheStats.missTokens = 0;
  llmCacheStats.calls = 0;
}

/**
 * Chat completion with a fixed system prefix for DeepSeek prefix caching.
 *
 * Prefer: askLlm({ system, user, stage? })
 * Legacy: askLlm(userString) — no system (weaker cache); kept for ad-hoc scripts.
 */
export async function askLlm(
  input: AskLlmOptions | string,
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is missing (set it in .env)");
  }

  const system =
    typeof input === "string" ? "" : input.system.trim();
  const user =
    typeof input === "string" ? input : input.user;
  const stage =
    typeof input === "string" ? undefined : input.stage;

  const messages: { role: "system" | "user"; content: string }[] = [];
  if (system.length > 0) {
    messages.push({ role: "system", content: system });
  }
  messages.push({ role: "user", content: user });

  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-v4-flash",
      messages,
    }),
  });

  if (!res.ok) {
    throw new Error(`DeepSeek API error ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: CacheUsage & Record<string, unknown>;
  };

  const usage = data.usage;
  if (usage) {
    const hit = Number(usage.prompt_cache_hit_tokens) || 0;
    const miss = Number(usage.prompt_cache_miss_tokens) || 0;
    llmCacheStats.hitTokens += hit;
    llmCacheStats.missTokens += miss;
    llmCacheStats.calls += 1;
    if (process.env.LLM_LOG_CACHE === "1") {
      const label = stage ?? "llm";
      console.log(
        `[cache ${label}] hit=${hit} miss=${miss} prompt=${usage.prompt_tokens ?? "?"}`,
      );
    }
  }

  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("DeepSeek API returned no message content");
  }

  return content;
}
