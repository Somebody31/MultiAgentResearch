// The agents the dynamic reasoner can call.
// Each agent takes a short task string and returns findings.

import { askLlm } from "../llm.ts";
import { parseJsonArray } from "../parseJson.ts";
import { researchOne, type Finding } from "../research.ts";
import type { AgentId } from "./types.ts";

export type AgentContext = {
  query: string;
  findingsSoFar: Finding[];
  scratchpad: string;
};

export type AgentHandler = (
  input: string,
  context: AgentContext,
) => Promise<Finding[]>;

/** agent id → function that does the work */
export const agentHandlers: Record<AgentId, AgentHandler> = {
  // Same research path as fixed mode (search + extract).
  async web_research(input) {
    return researchOne(input);
  },

  // Think using only what we already have (no new web search).
  async reason(input, ctx) {
    const text = await askLlm({
      stage: "reason_agent",
      system: `You are a reasoning subagent. Use only the provided findings and scratchpad.
Return a JSON array of 1-3 short claim strings. No invented brands, URLs, or stats.`,
      user: `User query:\n${ctx.query}\n\nTask:\n${input}\n\nFindings:\n${
        listClaims(ctx.findingsSoFar)
      }\n\nScratchpad:\n${ctx.scratchpad || "(empty)"}`,
    });
    return textToFindings(text, input, "reason");
  },

  // Point out gaps — still no new external facts.
  async critique(input, ctx) {
    const text = await askLlm({
      stage: "critique_agent",
      system: `You critique research for unsupported claims and gaps.
Return a JSON array of short issue strings. No new external facts.`,
      user: `Task:\n${input}\n\nFindings:\n${listClaims(
        ctx.findingsSoFar,
      )}\n\nScratchpad:\n${ctx.scratchpad || "(empty)"}`,
    });
    return textToFindings(text, input, "critique");
  },
};

export function isAgentId(s: string): s is AgentId {
  return s === "web_research" || s === "reason" || s === "critique";
}

function listClaims(findings: Finding[]): string {
  if (findings.length === 0) return "(none)";
  return findings.map((f) => `- ${f.claim}`).join("\n");
}

/** Parse a JSON string array, or keep the whole reply as one finding. */
function textToFindings(
  text: string,
  subQuestion: string,
  tag: "reason" | "critique",
): Finding[] {
  const arr = parseJsonArray(text);
  if (arr && arr.length > 0) {
    const out: Finding[] = [];
    for (const item of arr) {
      if (typeof item !== "string" || item.trim() === "") continue;
      out.push({
        subQuestion,
        claim: `[${tag}] ${item.trim().slice(0, 2000)}`,
        sourceUrl: `agent://${tag}`,
      });
    }
    if (out.length > 0) return out;
  }

  const claim = text.trim();
  if (!claim) return [];
  return [
    {
      subQuestion,
      claim: `[${tag}] ${claim.slice(0, 2000)}`,
      sourceUrl: `agent://${tag}`,
    },
  ];
}
