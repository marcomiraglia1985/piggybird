/**
 * Normalizza una stringa beneficiary per il MATCHING (ricorrenze, dedup
 * tollerante). Non altera i dati salvati: serve solo a costruire una
 * "fingerprint" più stabile che assorbe le variazioni tipiche delle
 * descrizioni bancarie (date inline, numeri carta, IBAN parziali,
 * suffissi merchant).
 *
 * Esempi:
 *   "PRELEVT CARTE 19/04 SUPERMERCATO 1234XXXX"
 *     → "prelevt carte supermercato xxxx"
 *   "PRELEVT CARTE 24/03 SUPERMERCATO 5678XXXX"
 *     → "prelevt carte supermercato xxxx"
 *   "NETFLIX.COM 2025"
 *     → "netflix com"
 *
 * Non garantito di essere bullet-proof: in casi ambigui può collassare
 * merchant simili. Per questo non sovrascriviamo il `beneficiary`
 * originale, ma usiamo la fingerprint solo come chiave di matching.
 */
export function fingerprintBeneficiary(s: string | null | undefined): string {
  if (!s) return "";
  return (
    s
      .toLowerCase()
      // sequenze ≥4 cifre (numeri carta, IBAN parziali, codici lunghi)
      .replace(/\d{4,}/g, " ")
      // date numeriche dd/mm, dd/mm/yy(yy), dd-mm-yyyy, dd.mm.yy
      .replace(/\d{1,2}[\/.\-]\d{1,2}([\/.\-]\d{2,4})?/g, " ")
      // date testuali EN: "Apr 10, 2026" / "Sep 3 2025" / "Jan 1, 25"
      .replace(
        /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(\s*,?\s*\d{2,4})?/g,
        " ",
      )
      // date testuali IT: "10 aprile 2026" / "3 gen 25"
      .replace(
        /\b\d{1,2}\s+(gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)[a-z]*\.?(\s+\d{2,4})?/g,
        " ",
      )
      // punteggiatura → spazio (mantiene le parole)
      .replace(/[^\w\s]/g, " ")
      // collassa whitespace
      .replace(/\s+/g, " ")
      .trim()
  );
}
