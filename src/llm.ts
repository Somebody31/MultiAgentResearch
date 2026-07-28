// Call DeepSeek V4 Flash. Needs DEEPSEEK_API_KEY in .env
//
// We always send:
//   system = fixed instructions for this stage (same every time → cache friendly)
//   user   = the changing part (query, findings, draft, …)

export type AskLlmOptions = {
  /** Fixed stage instructions (do not put the query here). */
  system: string;
  /** Changing content for this call. */
  user: string;
  /** Optional label for cache logs, e.g. "verify". */
  stage?: string;
};

/** Totals for the process (used by evals). */
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

/** Ask the model and return its text reply. */
export async function askLlm(input: AskLlmOptions): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is missing (set it in .env)");
  }

  const system = input.system.trim();
  const messages: { role: "system" | "user"; content: string }[] = [];
  if (system.length > 0) {
    messages.push({ role: "system", content: system });
  }
  messages.push({ role: "user", content: input.user });

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
    usage?: {
      prompt_cache_hit_tokens?: number;
      prompt_cache_miss_tokens?: number;
      prompt_tokens?: number;
    };
  };

  // Optional cache stats (evals / debug).
  const usage = data.usage;
  if (usage) {
    const hit = Number(usage.prompt_cache_hit_tokens) || 0;
    const miss = Number(usage.prompt_cache_miss_tokens) || 0;
    llmCacheStats.hitTokens += hit;
    llmCacheStats.missTokens += miss;
    llmCacheStats.calls += 1;
    if (process.env.LLM_LOG_CACHE === "1") {
      const label = input.stage ?? "llm";
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
