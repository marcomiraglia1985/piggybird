import Papa from "papaparse";
import type { ParsedRow, ParserResult } from "./types";

/**
 * Revolut CSV parser — supporta versione EN ("Type, Product, Started Date, …")
 * e IT ("Tipo, Prodotto, Data di inizio, …").
 */

type AnyRow = Record<string, string>;

const HEADER_MAP: Record<string, string> = {
  // EN
  Type: "type",
  Product: "product",
  "Started Date": "startedDate",
  "Completed Date": "completedDate",
  Description: "description",
  Amount: "amount",
  Fee: "fee",
  Currency: "currency",
  State: "state",
  Balance: "balance",
  // IT
  Tipo: "type",
  Prodotto: "product",
  "Data di inizio": "startedDate",
  "Data di completamento": "completedDate",
  Descrizione: "description",
  Importo: "amount",
  Costo: "fee",
  Valuta: "currency",
  Stato: "state",
  Saldo: "balance",
};

const SKIP_TYPES = new Set([
  "EXCHANGE",
  "Cambia valuta",
]);

const REVX_TYPES = new Set(["REVX_TRANSFER"]);

const ACCEPT_STATES = new Set([
  "COMPLETED",
  "COMPLETATO",
]);

const PRODUCT_TO_ACCOUNT: Record<string, string> = {
  current: "Revolut",
  attuale: "Revolut",
  savings: "Revolut Savings",
  risparmi: "Revolut Savings",
  deposito: "Revolut Savings", // IT label per Vaults/Savings
  vault: "Revolut Savings",
};

export function isRevolut(headers: string[]): boolean {
  const required = [
    ["Type", "Tipo"],
    ["Description", "Descrizione"],
    ["Amount", "Importo"],
    ["State", "Stato"],
  ];
  return required.every((opts) => opts.some((h) => headers.includes(h)));
}

export function parseRevolutCSV(content: string): ParserResult {
  const parsed = Papa.parse<AnyRow>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (parsed.errors.length > 0) {
    console.warn("CSV parse warnings:", parsed.errors.slice(0, 5));
  }

  const headers = parsed.meta.fields ?? [];
  if (!isRevolut(headers)) {
    return {
      format: "unknown",
      rows: [],
      warnings: [
        `Formato non riconosciuto. Header trovati: ${headers.slice(0, 6).join(", ")}…`,
      ],
    };
  }

  // Normalizza header EN/IT → chiavi interne
  const normalize = (r: AnyRow): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) {
      const target = HEADER_MAP[k];
      if (target) out[target] = v;
    }
    return out;
  };

  const warnings: string[] = [];
  const rows: (ParsedRow & { _ts: string; _product: string; _amountRaw: number })[] = [];
  let skippedPending = 0;
  let skippedExchange = 0;
  let skippedNonEur = 0;

  for (const raw of parsed.data) {
    const r = normalize(raw);
    if (!r.startedDate) continue;

    if (!ACCEPT_STATES.has(r.state)) {
      if (r.state && r.state !== "EUR") skippedPending++;
      continue;
    }

    const type = r.type?.trim() ?? "";
    if (SKIP_TYPES.has(type)) {
      skippedExchange++;
      continue;
    }

    const amount = parseFloat(r.amount?.replace(",", ".") ?? "0");
    if (!isFinite(amount) || amount === 0) continue;

    const fee = parseFloat(r.fee?.replace(",", ".") ?? "0");
    const netAmount = isFinite(fee) && fee !== 0 ? amount - Math.abs(fee) : amount;

    const startedTs = (r.startedDate || "").trim();
    const date = (r.completedDate || r.startedDate).slice(0, 10);
    const description = (r.description ?? "").trim();
    const currency = r.currency ?? "EUR";

    if (currency !== "EUR") {
      skippedNonEur++;
      continue;
    }

    const product = (r.product ?? "").trim().toLowerCase();
    let suggestedAccount = PRODUCT_TO_ACCOUNT[product] ?? "Revolut";
    // Se il product mappa esplicitamente a un account non-default (Savings,
    // Vault, ecc.) il parser è sicuro della destinazione — forza il routing
    // così la riga non finisce sul file-level account a maggioranza.
    let requireSuggestedAccount = product in PRODUCT_TO_ACCOUNT && suggestedAccount !== "Revolut";

    // REVX = Revolut Stocks/Crypto trasferimento
    let suggestedCategoryEmoji: string | null = null;
    if (REVX_TYPES.has(type)) {
      suggestedCategoryEmoji = "📈"; // Stocks Revolut by default
    }

    // Quirk Revolut: gli interessi pagati sul conto deposito (Savings vault)
    // appaiono ANCHE nel CSV del Current account (passthrough tecnico). Sappiamo
    // per certo che sono il "lato Savings" di un evento — vanno sul conto
    // savings, non sul current. Match sul testo IT/EN tipico di Revolut.
    const isSavingsInterestPassthrough =
      amount > 0 &&
      /interessi netti pagati nel conto|interest paid (?:to|in) (?:the )?(?:saving|vault|conto deposito)/i.test(
        description,
      );
    if (isSavingsInterestPassthrough && suggestedAccount !== "Revolut Savings") {
      suggestedAccount = "Revolut Savings";
      requireSuggestedAccount = true; // → drop se l'utente non ha Savings
      suggestedCategoryEmoji = "💰";
    } else if (
      suggestedAccount === "Revolut Savings" &&
      amount > 0 &&
      /\b(interest|interesse|interessi)\b/i.test(description)
    ) {
      // Match prudente — solo su prodotto savings/vault per evitare falsi
      // positivi (es. "Internet…" su conto corrente).
      suggestedCategoryEmoji = "💰";
    }

    const externalId = [startedTs, netAmount.toFixed(2), description.slice(0, 24)].join("|");

    const balRaw = parseFloat(r.balance?.replace(",", ".") ?? "");
    const bankBalance = isFinite(balRaw) ? balRaw : null;

    rows.push({
      _ts: startedTs,
      _product: product,
      _amountRaw: amount,
      externalId,
      date,
      amount: netAmount,
      description,
      rawType: type,
      suggestedAccount,
      requireSuggestedAccount: requireSuggestedAccount || undefined,
      suggestedCategoryEmoji,
      bankBalance,
      rawLine: JSON.stringify(raw),
      currency,
    });
  }

  // Pairing pass: due righe con stesso timestamp, importi opposti e prodotti
  // diversi → transfer interno (Revolut emette entrambi i lati per "A/Da EUR Conto deposito").
  let pairs = 0;
  const byTs = new Map<string, typeof rows>();
  for (const r of rows) {
    const arr = byTs.get(r._ts) ?? [];
    arr.push(r);
    byTs.set(r._ts, arr);
  }
  for (const [, group] of byTs) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      const a = group[i];
      if (a.transferGroupId) continue;
      for (let j = i + 1; j < group.length; j++) {
        const b = group[j];
        if (b.transferGroupId) continue;
        // Pairing su amount raw (pre-fee): Revolut può applicare fee sui lati
        // del transfer, quindi i netAmount possono non compensarsi al centesimo.
        const opposite = Math.abs(a._amountRaw + b._amountRaw) < 0.01;
        const sameProduct = a._product === b._product;
        const looksLikeTransfer =
          /conto deposito|saving|vault|deposito|transfer/i.test(a.description) ||
          /conto deposito|saving|vault|deposito|transfer/i.test(b.description);
        if (opposite && !sameProduct && looksLikeTransfer) {
          const groupId = `csv-${a._ts}-${Math.abs(a._amountRaw).toFixed(2)}-${pairs}`;
          a.transferGroupId = groupId;
          b.transferGroupId = groupId;
          a.isTransfer = true;
          b.isTransfer = true;
          a.suggestedCategoryEmoji = "↔️";
          b.suggestedCategoryEmoji = "↔️";
          pairs++;
          break;
        }
      }
    }
  }

  if (skippedPending > 0) warnings.push(`${skippedPending} righe in sospeso/annullate ignorate`);
  if (skippedExchange > 0) warnings.push(`${skippedExchange} righe di cambio valuta ignorate`);
  if (skippedNonEur > 0) warnings.push(`${skippedNonEur} righe in valuta non-EUR ignorate`);
  if (pairs > 0) warnings.push(`${pairs} transfer interni rilevati`);

  // Strip i campi privati prima di restituire
  const cleanRows: ParsedRow[] = rows.map(({ _ts, _product, _amountRaw, ...rest }) => rest);
  return { format: "revolut", rows: cleanRows, warnings };
}
