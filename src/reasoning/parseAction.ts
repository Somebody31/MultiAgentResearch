// Turn the reasoner's text into a clean action object.
// Models often add extra words around the JSON — we only need the object.

import { parseJsonObject } from "../parseJson.ts";
import { toAgentId } from "./agents.ts";
import type { AgentCall, ReasonerAction } from "./types.ts";

/**
 * Read a ReasonerAction from messy LLM text.
 * Returns null if the text is not a usable action.
 *
 * Valid shapes:
 *   { "type": "finish", "rationale": "..." }
 *   { "type": "call_agents", "calls": [{ "agent": "web_research", "input": "..." }] }
 */
export function parseReasonerAction(text: string): ReasonerAction | null {
  const obj = parseJsonObject(text);
  if (!obj) return null;

  if (obj.type === "finish") {
    let rationale = "Finished.";
    if (typeof obj.rationale === "string" && obj.rationale.trim() !== "") {
      rationale = obj.rationale.trim();
    }
    return { type: "finish", rationale };
  }

  if (obj.type !== "call_agents") return null;
  if (!Array.isArray(obj.calls)) return null;

  const calls: AgentCall[] = [];
  for (const item of obj.calls) {
    // Each call must be a plain object with agent + input strings.
    if (!item || typeof item !== "object") continue;
    if (Array.isArray(item)) continue;

    const row = item as { agent?: unknown; input?: unknown };
    if (typeof row.agent !== "string") continue;
    if (typeof row.input !== "string") continue;

    const agent = toAgentId(row.agent);
    if (!agent) continue;

    const input = row.input.trim();
    if (input === "") continue;

    calls.push({ agent, input });
  }

  if (calls.length === 0) return null;

  if (typeof obj.note === "string" && obj.note.trim() !== "") {
    return { type: "call_agents", calls, note: obj.note.trim() };
  }
  return { type: "call_agents", calls };
}
