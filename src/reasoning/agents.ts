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

/** All three agent functions, keyed by agent id. */
export type AgentHandlers = {
  web_research: AgentHandler;
  reason: AgentHandler;
  critique: AgentHandler;
};

/**
 * Optional overrides for tests (only set the agents you want to fake).
 * Missing keys keep the real handlers from agentHandlers.
 */
export type AgentHandlerOverrides = {
  web_research?: AgentHandler;
  reason?: AgentHandler;
  critique?: AgentHandler;
};

/** agent id → function that does the work */
export const agentHandlers: AgentHandlers = {
  // Same research path as fixed mode (search + extract).
  async web_research(input: string, _ctx: AgentContext): Promise<Finding[]> {
    return researchOne(input);
  },

  // Think using only what we already have (no new web search).
  async reason(input: string, ctx: AgentContext): Promise<Finding[]> {
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
  async critique(input: string, ctx: AgentContext): Promise<Finding[]> {
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

/** True when s is one of the three known agent ids. */
export function isAgentId(s: string): boolean {
  return s === "web_research" || s === "reason" || s === "critique";
}

/**
 * Turn a string into AgentId, or null if unknown.
 * Prefer this over casting after isAgentId.
 */
export function toAgentId(s: string): AgentId | null {
  if (s === "web_research" || s === "reason" || s === "critique") {
    return s;
  }
  return null;
}

/** Merge real handlers with optional test overrides. */
export function mergeHandlers(
  overrides?: AgentHandlerOverrides,
): AgentHandlers {
  return {
    web_research: overrides?.web_research ?? agentHandlers.web_research,
    reason: overrides?.reason ?? agentHandlers.reason,
    critique: overrides?.critique ?? agentHandlers.critique,
  };
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
