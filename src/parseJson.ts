// Models often wrap JSON in extra words, e.g.:
//   Sure! Here is the list: ["a", "b"]
//
// These helpers find the first [ or { and the matching last ] or },
// then JSON.parse that slice. Return null if it fails.

/** Pull a JSON array [...] out of messy text. */
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

/** Pull a JSON object {...} out of messy text. */
export function parseJsonObject(
  text: string,
): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    const value = JSON.parse(text.slice(start, end + 1)) as unknown;
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}
