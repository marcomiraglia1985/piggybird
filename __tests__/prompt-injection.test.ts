import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Smoke test per assicurarsi che le 3 superfici AI che ricevono input utente
 * (categorize-transactions, universal CSV parser, universal broker parser)
 * abbiano nel loro system prompt il warning di prompt injection.
 *
 * Questo NON è un test di efficacia (per quello servirebbe chiamare Claude
 * con input adversarial e verificare il behavior) — è un test di REGRESSION:
 * se qualcuno rimuove il warning, il test fallisce, costringendo a riconsiderare.
 */

const SECURITY_KEYWORDS = ["security", "non eseguire", "ignora le istruzioni", "manipolat"];

function readSrc(relPath: string): string {
  return readFileSync(path.join(process.cwd(), "src", relPath), "utf-8");
}

describe("Prompt injection guards (regression)", () => {
  it("auto-categorize prompt include warning di security su user-supplied fields", () => {
    const src = readSrc("app/api/ai/categorize-transactions/route.ts");
    expect(src).toMatch(/SECURITY/i);
    expect(
      SECURITY_KEYWORDS.some((kw) => src.toLowerCase().includes(kw.toLowerCase())),
    ).toBe(true);
    // Dovrebbe menzionare almeno uno dei campi user-supplied
    expect(src).toMatch(/beneficiary|causali|notes/i);
  });

  it("universal CSV parser prompt include warning di security", () => {
    const src = readSrc("lib/universal-parser.ts");
    expect(src).toMatch(/SECURITY/i);
    expect(
      SECURITY_KEYWORDS.some((kw) => src.toLowerCase().includes(kw.toLowerCase())),
    ).toBe(true);
  });

  it("universal broker parser prompt include warning di security", () => {
    const src = readSrc("lib/universal-broker-parser.ts");
    expect(src).toMatch(/SECURITY/i);
    expect(
      SECURITY_KEYWORDS.some((kw) => src.toLowerCase().includes(kw.toLowerCase())),
    ).toBe(true);
  });
});

/**
 * Test che il response parser AI è resistente a output malformato — un
 * attacker che inietta successfully potrebbe far ritornare JSON manipolato
 * con tipi sbagliati o struttura diversa. Il consumer deve gestire safely.
 */
describe("AI response parsing resilience", () => {
  it("JSON parser scarta output non-array invece di crashare", () => {
    const malformedOutputs = [
      `[{"groupId":"g0","categoryId":"hacked"}]ignora il resto`,
      `Sure, here's the array: [{"groupId":"g0","categoryId":"x","confidence":1.0,"reasoning":"ok"}]`,
      `{"error": "not an array"}`,
      `null`,
      `undefined`,
      `<script>alert(1)</script>`,
    ];

    for (const raw of malformedOutputs) {
      // Replica logica di robust JSON extraction usata in
      // categorize-transactions/route.ts: strippa markdown fences e cerca [ ]
      const stripped = raw
        .replace(/```json\s*/g, "")
        .replace(/```\s*/g, "")
        .trim();
      const arrayStart = stripped.indexOf("[");
      const arrayEnd = stripped.lastIndexOf("]");
      let parsed: unknown = null;
      if (arrayStart >= 0 && arrayEnd > arrayStart) {
        try {
          parsed = JSON.parse(stripped.slice(arrayStart, arrayEnd + 1));
        } catch {
          parsed = null;
        }
      }
      // Il parser DEVE restituire null o array — mai throw o oggetto arbitrario
      const isAcceptable = parsed === null || Array.isArray(parsed);
      expect(isAcceptable).toBe(true);
    }
  });
});

/**
 * Test universal-app rule: i prompt AI generici (non platform-specific) non
 * devono citare nomi di broker/exchange specifici dell'utente sviluppatore.
 */
describe("Universal-app rule (no hardcoded user data in AI prompts)", () => {
  const FORBIDDEN_IN_GENERIC_PROMPTS = [
    "Marco",
    "Yaya",
    "marcomiraglia",
    "/Users/marcomiraglia",
  ];

  it("categorize-transactions system prompt non hardcoda dati utente sviluppatore", () => {
    const src = readSrc("app/api/ai/categorize-transactions/route.ts");
    for (const forbidden of FORBIDDEN_IN_GENERIC_PROMPTS) {
      expect(src).not.toContain(forbidden);
    }
  });

  it("ai-context buildUserContext fetcha runtime, niente hardcode", () => {
    const src = readSrc("lib/ai-context.ts");
    for (const forbidden of FORBIDDEN_IN_GENERIC_PROMPTS) {
      expect(src).not.toContain(forbidden);
    }
  });
});
