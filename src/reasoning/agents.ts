// Agent registry for dynamic orchestration.
// The reasoner picks agents by id; handlers do the work.

import { askLlm } from "../llm.ts";
import { parseJsonArray } from "../parseJson.ts";
import { researchOne, type Finding } from "../research.ts";
import type { AgentId } from "./types.ts";

export type AgentHandler = (
  input: string,
  context: {
    query: string;
    findingsSoFar: Finding[];
    scratchpad: string;
  },
) => Promise<Finding[]>;

/**
 * Map agent ids → implementations.
 * web_research reuses today's researchOne; reason/critique are LLM helpers.
 */
export const agentHandlers: Record<AgentId, AgentHandler> = {
  async web_research(input) {
    return researchOne(input);
  },

  async reason(input, ctx) {
    const text = await askLlm({
      stage: "reason_agent",
      system: `You are a reasoning subagent. Use only the provided findings and scratchpad.
Return a JSON array of 1-3 short inferential claim strings. No invented brands, URLs, or stats.`,
      user: `User query:\n${ctx.query}\n\nTask:\n${input}\n\nFindings:\n${
        formatFindings(ctx.findingsSoFar)
      }\n\nScratchpad:\n${ctx.scratchpad || "(empty)"}`,
    });
    return claimsToFindings(text, "reason", "agent://reason");
  },

  async critique(input, ctx) {
    const text = await askLlm({
      stage: "critique_agent",
      system: `You critique research for unsupported claims and gaps.
Return a JSON array of short issue strings. No new external facts.`,
      user: `Task:\n${input}\n\nFindings:\n${formatFindings(
        ctx.findingsSoFar,
      )}\n\nScratchpad:\n${ctx.scratchpad || "(empty)"}`,
    });
    return claimsToFindings(text, "critique", "agent://critique");
  },
};

export function isAgentId(s: string): s is AgentId {
  return s === "web_research" || s === "reason" || s === "critique";
}

function formatFindings(findings: Finding[]): string {
  if (findings.length === 0) return "(none)";
  return findings.map((f) => `- ${f.claim}`).join("\n");
}

/** Parse a JSON string array from the LLM, or fall back to one raw finding. */
function claimsToFindings(
  text: string,
  tag: "reason" | "critique",
  sourceUrl: string,
): Finding[] {
  const arr = parseJsonArray(text);
  if (arr && arr.length > 0) {
    const out: Finding[] = [];
    for (const item of arr) {
      if (typeof item !== "string" || item.trim() === "") continue;
      out.push({
        claim: `[${tag}] ${item.trim().slice(0, 2000)}`,
        sourceUrl,
      });
    }
    if (out.length > 0) return out;
  }

  const claim = text.trim();
  if (!claim) return [];
  return [
    {
      claim: `[${tag}] ${claim.slice(0, 2000)}`,
      sourceUrl,
    },
  ];
}
