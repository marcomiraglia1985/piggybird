import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Smoke test sul rebuilder posizioni: il file `stock-positions-rebuilder.ts`
 * dipende da Prisma + Yahoo (non isolabili in unit test puro), quindi qui
 * facciamo regression check su INVARIANTI strutturali del file: la presenza
 * di tutti i tipi di evento gestiti + l'ordinamento cronologico.
 *
 * Un test di integrazione con un DB di prova sarebbe più potente ma richiede
 * setup Prisma; questo è il livello giusto per un fix puntuale.
 */

const SRC = readFileSync(
  path.join(process.cwd(), "src/lib/stock-positions-rebuilder.ts"),
  "utf-8",
);

describe("stock-positions-rebuilder regression", () => {
  it("gestisce tutti i tipi di evento StockTrade noti", () => {
    for (const t of ["TOP-UP", "WITHDRAWAL", "DIVIDEND", "DIVIDEND_TAX", "BUY", "SELL", "STOCK_SPLIT"]) {
      expect(SRC).toContain(`"${t}"`);
    }
  });

  it("ordina i trade per data ascendente prima di applicarli", () => {
    expect(SRC).toMatch(/orderBy:\s*\{\s*date:\s*"asc"\s*\}/);
  });

  it("usa FIFO per le SELL (consuma lots dalla testa)", () => {
    expect(SRC).toMatch(/lots\.shift\(\)/);
  });

  it("preserva posizioni manuali (ticker NON nei trade) durante cleanup", () => {
    expect(SRC).toMatch(/tickersInTrades\.has\(p\.ticker\)/);
  });

  it("upsert TradingCash con currency=EUR alla fine", () => {
    expect(SRC).toMatch(/tradingCash\.upsert/);
    expect(SRC).toMatch(/currency:\s*"EUR"/);
  });
});
