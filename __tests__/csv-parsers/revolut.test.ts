import { describe, it, expect } from "vitest";
import { isRevolut, parseRevolutCSV } from "@/lib/csv-parsers/revolut";

const IT_HEADERS =
  "Tipo,Prodotto,Data di inizio,Data di completamento,Descrizione,Importo,Costo,Valuta,Stato,Saldo";
const EN_HEADERS =
  "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance";

describe("Revolut CSV parser", () => {
  it("riconosce header IT (Stato, non State)", () => {
    expect(isRevolut(IT_HEADERS.split(","))).toBe(true);
  });

  it("riconosce header EN", () => {
    expect(isRevolut(EN_HEADERS.split(","))).toBe(true);
  });

  it("interessi passthrough su Current → Revolut Savings con requireSuggestedAccount", () => {
    const csv = `${IT_HEADERS}
Interessi,Attuale,2026-05-07 23:59:59,2026-05-07 23:59:59,"Interessi netti pagati nel conto ""Conto deposito"" in data May 7, 2026",3.66,0,EUR,COMPLETATO,500
`;
    const r = parseRevolutCSV(csv);
    expect(r.format).toBe("revolut");
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].suggestedAccount).toBe("Revolut Savings");
    expect(r.rows[0].requireSuggestedAccount).toBe(true);
  });

  it("righe con Prodotto=Deposito forzano routing a Revolut Savings (anche non-interesse)", () => {
    const csv = `${IT_HEADERS}
TRANSFER,Deposito,2026-05-09 10:00:00,2026-05-09 10:00:00,Prelievo dal conto Conto deposito,-5000,0,EUR,COMPLETATO,75000
`;
    const r = parseRevolutCSV(csv);
    expect(r.rows[0].suggestedAccount).toBe("Revolut Savings");
    expect(r.rows[0].requireSuggestedAccount).toBe(true);
  });

  it("righe con Prodotto=Attuale (cash) NON forzano routing", () => {
    const csv = `${IT_HEADERS}
Pagamento con carta,Attuale,2026-05-08 13:00:00,2026-05-08 13:00:00,Bar Italia,-4,0,EUR,COMPLETATO,496
`;
    const r = parseRevolutCSV(csv);
    expect(r.rows[0].suggestedAccount).toBe("Revolut");
    expect(r.rows[0].requireSuggestedAccount).toBeFalsy();
  });

  it("transfer interno: pair Current/Deposito con stesso timestamp e importi opposti", () => {
    const csv = `${IT_HEADERS}
TRANSFER,Attuale,2026-05-09 10:00:00,2026-05-09 10:00:00,Da EUR Conto deposito,5000,0,EUR,COMPLETATO,5500
TRANSFER,Deposito,2026-05-09 10:00:00,2026-05-09 10:00:00,Prelievo,-5000,0,EUR,COMPLETATO,75000
`;
    const r = parseRevolutCSV(csv);
    const cash = r.rows.find((x) => x.suggestedAccount === "Revolut");
    const sav = r.rows.find((x) => x.suggestedAccount === "Revolut Savings");
    expect(cash?.transferGroupId).toBeTruthy();
    expect(sav?.transferGroupId).toBe(cash?.transferGroupId);
    expect(cash?.isTransfer).toBe(true);
  });

  it("skippa righe non-COMPLETATO e non-EUR", () => {
    const csv = `${IT_HEADERS}
Pagamento con carta,Attuale,2026-05-08 13:00:00,2026-05-08 13:00:00,Pending Merchant,-10,0,EUR,IN_SOSPESO,490
Pagamento con carta,Attuale,2026-05-08 13:00:00,2026-05-08 13:00:00,USD Merchant,-10,0,USD,COMPLETATO,490
Pagamento con carta,Attuale,2026-05-08 13:00:00,2026-05-08 13:00:00,Real EUR,-10,0,EUR,COMPLETATO,490
`;
    const r = parseRevolutCSV(csv);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].description).toBe("Real EUR");
  });
});
