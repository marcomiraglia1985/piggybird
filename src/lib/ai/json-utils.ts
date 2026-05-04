/**
 * Utility per output JSON da Claude — il modello a volte ritorna fence
 * markdown anche con istruzioni esplicite di non farlo. Funzioni difensive
 * usate da tutti i parser AI (categorize, import-review, universal-parser).
 */

export function stripJsonFence(raw: string): string {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();
  }
  return s;
}

/**
 * `JSON.parse` con fence stripping + try/catch. Mai throw — peggio caso
 * ritorna `null`. Il caller decide il fallback.
 */
export function parseJsonLoose<T = unknown>(raw: string): T | null {
  try {
    return JSON.parse(stripJsonFence(raw)) as T;
  } catch {
    return null;
  }
}
