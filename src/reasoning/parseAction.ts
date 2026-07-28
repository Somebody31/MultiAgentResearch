// Turn the reasoner's text into a clean action object.
// Models often add extra words around the JSON — we only need the object.

import { parseJsonObject } from "../parseJson.ts";
import { isAgentId } from "./agents.ts";
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
    const rationale =
      typeof obj.rationale === "string" && obj.rationale.trim() !== ""
        ? obj.rationale.trim()
        : "Finished.";
    return { type: "finish", rationale };
  }

  if (obj.type !== "call_agents") return null;
  if (!Array.isArray(obj.calls)) return null;

  const calls: AgentCall[] = [];
  for (const item of obj.calls) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as { agent?: unknown; input?: unknown };
    if (typeof row.agent !== "string" || !isAgentId(row.agent)) continue;
    if (typeof row.input !== "string" || row.input.trim() === "") continue;
    calls.push({ agent: row.agent, input: row.input.trim() });
  }

  if (calls.length === 0) return null;

  const note =
    typeof obj.note === "string" && obj.note.trim() !== ""
      ? obj.note.trim()
      : undefined;

  if (note) return { type: "call_agents", calls, note };
  return { type: "call_agents", calls };
}
