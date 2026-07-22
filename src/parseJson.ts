// Models often wrap JSON in extra words, e.g.:
//   Sure! Here is the list: ["a", "b"]
//
// These helpers:
//   1. Find the first [ or { and the matching last ] or }
//   2. Run JSON.parse on that slice
//   3. Return null if anything is missing or invalid
//
// Callers decide what to do with null (throw, return [], use a default).

// Pull a JSON array [...] out of messy text.
export function parseJsonArray(text: string): unknown[] | null {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    const value = JSON.parse(text.slice(start, end + 1)) as unknown;
    if (!Array.isArray(value)) return null;
    return value;
  } catch {
    return null;
  }
}

// Pull a JSON object {...} out of messy text.
export function parseJsonObject(
  text: string,
): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    const value = JSON.parse(text.slice(start, end + 1)) as unknown;
    // Must be a plain object (not null, not an array).
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}
