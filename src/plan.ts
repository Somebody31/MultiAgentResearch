// Break one big question into 2–4 smaller questions.
// Each sub-question gets a route:
//   search → web research
//   llm    → answer from model knowledge (not a good web-search query)

import { askLlm } from "./llm.ts";
import { parseJsonArray } from "./parseJson.ts";

/** How we answer this sub-question. */
export type SubQuestionRoute = "search" | "llm";

export type PlannedSubQuestion = {
  question: string;
  route: SubQuestionRoute;
};

export const PLAN_SYSTEM = `Break the research query into 2-4 short sub-questions.
For each one, choose a route:

- "search": needs the web (facts, products, news, docs, current info, citations)
- "llm": better answered from general knowledge (definitions, concepts, tradeoffs, how something works in principle, structuring an answer) — NOT a good keyword web search

Return ONLY a JSON array of objects:
[{"question":"short sub-question","route":"search"},{"question":"another","route":"llm"}]

Rules:
- Prefer "search" when a real source would help
- Use "llm" when search would add little (pure definitions, generic comparisons, reasoning steps)
- No commentary outside the JSON array`;

export async function plan(query: string): Promise<PlannedSubQuestion[]> {
  const text = await askLlm({
    stage: "plan",
    system: PLAN_SYSTEM,
    user: `Query:\n${query}`,
  });

  const parsed = parseJsonArray(text);
  if (!parsed) {
    throw new Error(`Planner did not return a JSON array: ${text}`);
  }

  const out = parsePlannedSubQuestions(parsed);
  if (out.length === 0) {
    throw new Error(`Planner did not return usable sub-questions: ${text}`);
  }
  return out;
}

/**
 * Turn messy planner JSON into clean { question, route } rows.
 * Plain strings (old format) default to route "search".
 */
export function parsePlannedSubQuestions(
  parsed: unknown[],
): PlannedSubQuestion[] {
  const out: PlannedSubQuestion[] = [];

  for (const item of parsed) {
    // Old style: just a string
    if (typeof item === "string") {
      const question = item.trim();
      if (question === "") continue;
      out.push({ question, route: "search" });
      continue;
    }

    if (typeof item !== "object" || item === null) continue;

    const row = item as {
      question?: unknown;
      q?: unknown;
      text?: unknown;
      route?: unknown;
      mode?: unknown;
    };

    let questionText = "";
    if (typeof row.question === "string") questionText = row.question;
    else if (typeof row.q === "string") questionText = row.q;
    else if (typeof row.text === "string") questionText = row.text;

    const question = questionText.trim();
    if (question === "") continue;

    let route: SubQuestionRoute = "search";
    const rawRoute = row.route ?? row.mode;
    if (rawRoute === "llm") route = "llm";
    else if (rawRoute === "search") route = "search";

    out.push({ question, route });
  }

  return out;
}

/** Just the question strings (handy for APIs / display). */
export function plannedQuestionTexts(
  planned: PlannedSubQuestion[],
): string[] {
  const texts: string[] = [];
  for (const p of planned) {
    texts.push(p.question);
  }
  return texts;
}
