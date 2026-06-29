import { createHash } from "node:crypto";

/**
 * Identità deterministica di una riga di estratto conto, per dedup esatto e
 * IDEMPOTENTE sui re-import di periodi sovrapposti.
 *
 * Principio chiave: l'hash è costruito SOLO da campi persistiti su Transaction
 * (data, importo, beneficiary, notes), così il backfill delle tx storiche e il
 * commit delle righe CSV nuove producono lo STESSO hash per lo stesso movimento.
 * L'account NON entra nell'hash: lo scoping per conto avviene a valle, via
 * @@index([accountId, sourceHash]) e contando le occorrenze per (account, hash).
 */

/** Normalizzazione leggera: lowercase, whitespace collassato, trim. Volutamente
 *  minimale per non fondere movimenti diversi (es. due bonifici a beneficiari
 *  con prefisso simile restano distinti se il testo differisce). */
export function normalizeDesc(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function toDay(date: string | Date): string {
  if (typeof date === "string") return date.slice(0, 10);
  return date.toISOString().slice(0, 10);
}

export type SourceFields = {
  date: string | Date;
  amount: number;
  beneficiary?: string | null;
  notes?: string | null;
};

/** Descrittore canonico leggibile: `yyyy-mm-dd|importo|descrizione`. */
export function sourceDescriptor(input: SourceFields): string {
  const desc = normalizeDesc(`${input.beneficiary ?? ""} ${input.notes ?? ""}`);
  return `${toDay(input.date)}|${input.amount.toFixed(2)}|${desc}`;
}

/** Hash stabile e compatto (sha1 troncato a 24 hex) del descrittore canonico. */
export function computeSourceHash(input: SourceFields): string {
  return createHash("sha1").update(sourceDescriptor(input)).digest("hex").slice(0, 24);
}
