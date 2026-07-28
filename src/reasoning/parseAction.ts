// Parse the reasoner's JSON into a ReasonerAction.
// Models often wrap JSON in extra words — we slice the first object.

import { parseJsonObject } from "../parseJson.ts";
import { isAgentId } from "./agents.ts";
import type { AgentCall, AgentId, ReasonerAction } from "./types.ts";

/**
 * Turn messy LLM text into a ReasonerAction, or null if unusable.
 *
 * Accepted shapes:
 *   { "type": "finish", "rationale": "..." }
 *   { "type": "call_agents", "calls": [{ "agent": "web_research", "input": "..." }], "note": "..." }
 */
export function parseReasonerAction(text: string): ReasonerAction | null {
  const obj = parseJsonObject(text);
  if (!obj) return null;

  const type = obj.type;
  if (type === "finish") {
    const rationale =
      typeof obj.rationale === "string" && obj.rationale.trim() !== ""
        ? obj.rationale.trim()
        : "Finished.";
    return { type: "finish", rationale };
  }

  if (type === "call_agents") {
    const rawCalls = obj.calls;
    if (!Array.isArray(rawCalls)) return null;

    const calls: AgentCall[] = [];
    for (const item of rawCalls) {
      if (item === null || typeof item !== "object" || Array.isArray(item)) {
        continue;
      }
      const row = item as Record<string, unknown>;
      const agent = row.agent;
      const input = row.input;
      if (typeof agent !== "string" || !isAgentId(agent)) continue;
      if (typeof input !== "string" || input.trim() === "") continue;
      calls.push({ agent: agent as AgentId, input: input.trim() });
    }

    if (calls.length === 0) return null;

    const note =
      typeof obj.note === "string" && obj.note.trim() !== ""
        ? obj.note.trim()
        : undefined;

    return note
      ? { type: "call_agents", calls, note }
      : { type: "call_agents", calls };
  }

  return null;
}
