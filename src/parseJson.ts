// Models often wrap JSON in extra words, e.g.:
//   Sure! Here is the list: ["a", "b"]
//
// These helpers find the first [ or { and the matching last ] or },
// then JSON.parse that slice. Return null if it fails.

/**
 * A plain object from JSON.
 * Values can be anything the model put there (string, number, array, …).
 * Callers check the fields they care about with typeof.
 */
export type JsonObject = {
  [key: string]: any;
};

/** Pull a JSON array [...] out of messy text. */
export function parseJsonArray(text: string): any[] | null {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    const value = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(value)) return null;
    return value;
  } catch {
    return null;
  }
}

/** Pull a JSON object {...} out of messy text. */
export function parseJsonObject(text: string): JsonObject | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    const value = JSON.parse(text.slice(start, end + 1));
    // Reject null, arrays, and primitives — we only want a plain object.
    if (value === null) return null;
    if (typeof value !== "object") return null;
    if (Array.isArray(value)) return null;
    return value as JsonObject;
  } catch {
    return null;
  }
}
