// Agent registry for dynamic orchestration (roadmap).
// Production path does not call this yet.

import { researchOne, type Finding } from "../research.ts";
import { askLlm } from "../llm.ts";
import type { AgentId } from "./types.ts";

export type AgentHandler = (input: string, context: {
  query: string;
  findingsSoFar: Finding[];
  scratchpad: string;
}) => Promise<Finding[]>;

/**
 * Map agent ids → implementations.
 * web_research reuses today's researchOne; reason/critique are LLM stubs.
 */
export const agentHandlers: Record<AgentId, AgentHandler> = {
  async web_research(input) {
    return researchOne(input);
  },

  async reason(input, ctx) {
    // Future: structured inference claims with kind/source tags.
    const text = await askLlm({
      stage: "reason_agent",
      system: `You are a reasoning subagent. Use only the provided findings and scratchpad.
Return 1-3 short inferential claims as a JSON array of strings. No invented brands or stats.`,
      user: `User query:\n${ctx.query}\n\nTask:\n${input}\n\nFindings:\n${
        ctx.findingsSoFar.map((f) => `- ${f.claim}`).join("\n") || "(none)"
      }\n\nScratchpad:\n${ctx.scratchpad || "(empty)"}`,
    });
    // Minimal parsing later; for now surface raw as one finding if non-empty.
    const claim = text.trim();
    if (!claim) return [];
    return [
      {
        claim: `[inference] ${claim.slice(0, 2000)}`,
        sourceUrl: "agent://reason",
      },
    ];
  },

  async critique(input, ctx) {
    const text = await askLlm({
      stage: "critique_agent",
      system: `You critique research for unsupported claims and gaps.
Return a JSON array of short issue strings. No new facts.`,
      user: `Task:\n${input}\n\nFindings:\n${
        ctx.findingsSoFar.map((f) => `- ${f.claim}`).join("\n") || "(none)"
      }\n\nScratchpad:\n${ctx.scratchpad || "(empty)"}`,
    });
    const claim = text.trim();
    if (!claim) return [];
    return [
      {
        claim: `[critique] ${claim.slice(0, 2000)}`,
        sourceUrl: "agent://critique",
      },
    ];
  },
};

export function isAgentId(s: string): s is AgentId {
  return s === "web_research" || s === "reason" || s === "critique";
}
