import { createHash } from "node:crypto";
import type { BrokerParser, ParseResult, StockEvent } from "./types";
import { revolutParser } from "./revolut";

/**
 * Registry dei parser broker supportati.
 * Per aggiungerne uno nuovo:
 *   1. Crea `./<broker>.ts` esportando un BrokerParser
 *   2. Aggiungilo a `BROKER_PARSERS` qui sotto
 *   3. Il sistema farà auto-detect e import senza altre modifiche
 */
export const BROKER_PARSERS: BrokerParser[] = [revolutParser];

export type { BrokerParser, ParseResult, StockEvent };

/**
 * Auto-detect del formato CSV provando ogni parser in ordine.
 * Ritorna il primo parser che riconosce il file, o null se nessuno.
 */
export function detectBroker(csv: string): BrokerParser | null {
  for (const p of BROKER_PARSERS) {
    if (p.detect(csv)) return p;
  }
  return null;
}

/**
 * Lista user-facing dei broker supportati (per UI).
 */
export function listSupportedBrokers(): Array<{ name: string; platform: string }> {
  return BROKER_PARSERS.map((p) => ({ name: p.name, platform: p.platform }));
}

/**
 * Hash deterministico e STABILE di un evento per dedup su re-import.
 *
 * Stabile = lo stesso evento reale produce sempre lo stesso hash, anche se il
 * CSV viene riesportato con micro-variazioni. Per questo normalizziamo i campi
 * rumorosi PRIMA di hashare:
 *   - date  → troncata al SECONDO (i millisecondi/offset variano tra export)
 *   - amountEur → 2 decimali (gli spread FR producono drift sul 4° decimale)
 *   - quantity/pricePerUnit → precisione fissa (rumore float)
 * Senza questa normalizzazione lo stesso trade rientrava 2 volte (hash diversi)
 * gonfiando le posizioni. Granularità al secondo: due fill reali allo stesso
 * secondo con identici qty+importo sono trattati come lo stesso evento.
 */
export function hashStockEvent(e: StockEvent): string {
  const key = [
    e.platform,
    e.type,
    String(e.date).slice(0, 19), // YYYY-MM-DDTHH:MM:SS — niente millisecondi/Z
    e.ticker ?? "",
    e.quantity != null ? Number(e.quantity).toFixed(6) : "",
    e.pricePerUnit != null ? Number(e.pricePerUnit).toFixed(4) : "",
    e.amountEur.toFixed(2),
    e.currency,
  ].join("|");
  return createHash("sha256").update(key).digest("hex").slice(0, 32);
}

/**
 * Helper alto livello: dato un CSV, detectBroker + parse.
 */
export function parseAnyBroker(csv: string): ParseResult {
  const parser = detectBroker(csv);
  if (!parser) {
    return {
      ok: false,
      error:
        "Formato CSV non riconosciuto. Broker supportati: " +
        BROKER_PARSERS.map((p) => p.name).join(", "),
    };
  }
  return parser.parse(csv);
}
