import "dotenv/config";
import { PDFParse } from "pdf-parse";
import fs from "node:fs";
import { prisma } from "../src/lib/prisma";
import { suggestCategoryByDescription } from "../src/lib/categorize";

/**
 * Importa i movimenti dei CostSplit dai PDF di Splitwise.
 *
 * Formato PDF (entrambi):
 *   Header: "Description | Date | Paid by | Amount" + nomi delle persone
 *   Righe:  desc \t DD/MM/YY \t paidBy \t amount € \t share1 € \t share2 € [\t share3 €]
 *
 * Marco's net effect on costsplit balance = (amount paid by Marco) - (Marco's share)
 *   Positivo  → Marco è a credito (qualcuno gli deve)
 *   Negativo  → Marco è a debito (lui deve qualcuno)
 */

const COURAGE_PDF = "/Users/marcomiraglia/Progetti/personal-finance/old/Cost Split - COURAGE.pdf";
const SANNIO_PDF = "/Users/marcomiraglia/Progetti/personal-finance/old/Cost Split - SPAZIO SANNIO.pdf";
const MARCO = "Marco Miraglia";

type ParsedRow = {
  description: string;
  date: Date;
  paidBy: string;
  amount: number;
  marcoShare: number;
  marcoNet: number; // ciò che entra/esce dal saldo del CostSplit
  currency: string;
};

function parseAmount(s: string): { value: number; currency: string } {
  const trimmed = s.trim();
  if (trimmed === "-" || trimmed === "" || trimmed === "—") return { value: 0, currency: "EUR" };
  // "1.650,00 €" or "20,00 US$"
  const m = trimmed.match(/^([\d.,]+)\s*(€|US\$|USD|EUR)$/);
  if (!m) return { value: 0, currency: "EUR" };
  const num = m[1].replace(/\./g, "").replace(",", ".");
  const currency = m[2].includes("$") || m[2] === "USD" ? "USD" : "EUR";
  return { value: parseFloat(num), currency };
}

function parseDate(s: string): Date | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  let year = parseInt(m[3], 10);
  if (year < 100) year += 2000;
  return new Date(Date.UTC(year, month - 1, day));
}

async function readPDF(path: string): Promise<string> {
  const buf = fs.readFileSync(path);
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  const r = await parser.getText();
  return r.text;
}

/**
 * Estrae l'ordine delle colonne "Paid for" dal blocco header.
 * Restituisce array di nomi (es. ["Marco Miraglia", "Davide Caselli"])
 */
function extractColumnOrder(text: string): string[] {
  // Cerca "Paid for" + nome persone consecutive su righe separate
  const headerMatch = text.match(/Paid for([\s\S]*?)(?:\d{2}\/\d{2}\/\d{2}|\b[A-Za-z][a-z]+\s+\d{2}\/\d{2}\/\d{2})/);
  if (!headerMatch) return [];
  const headerBlock = headerMatch[1];
  // Persone tipiche: due cognomi su righe diverse
  const lines = headerBlock.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const names: string[] = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (/^[A-Z][a-zA-Zéèìòù]+$/.test(lines[i]) && /^[A-Z][a-zA-Zéèìòù]+$/.test(lines[i + 1])) {
      names.push(`${lines[i]} ${lines[i + 1]}`);
      i++;
    }
  }
  return names;
}

function parseExpenseLines(text: string, columnOrder: string[]): ParsedRow[] {
  const rows: ParsedRow[] = [];
  const lines = text.split(/\n/).map((l) => l.trim());
  for (const line of lines) {
    // Skip header e summary
    if (/^(EXPENSES|SUMMARY|PAYBACKS|CURRENCIES|Description|Person|From|Total|Currency)/.test(line)) continue;
    if (line.startsWith("--")) continue;
    if (!line.includes("\t")) continue;
    // Pattern: desc \t DD/MM/YY \t paidBy \t amount € \t shares...
    const cols = line.split("\t").map((c) => c.trim());
    if (cols.length < 4) continue;

    // Trova la colonna data
    let dateIdx = -1;
    for (let i = 0; i < cols.length; i++) {
      if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(cols[i])) {
        dateIdx = i;
        break;
      }
    }
    if (dateIdx === -1) continue;
    const date = parseDate(cols[dateIdx]);
    if (!date) continue;

    const desc = cols.slice(0, dateIdx).join(" ").trim();
    const paidBy = cols[dateIdx + 1];
    const amountCell = cols[dateIdx + 2];
    const { value: amount, currency } = parseAmount(amountCell);
    if (amount <= 0) continue;

    // Le shares sono le colonne dopo amount, una per persona nell'ordine columnOrder
    const shares: number[] = [];
    for (let i = dateIdx + 3; i < cols.length && shares.length < columnOrder.length; i++) {
      shares.push(parseAmount(cols[i]).value);
    }
    while (shares.length < columnOrder.length) shares.push(0);

    const marcoIdx = columnOrder.findIndex((n) => n === MARCO);
    if (marcoIdx === -1) continue;
    const marcoShare = shares[marcoIdx];
    const paidByMarco = paidBy === MARCO ? amount : 0;
    const marcoNet = paidByMarco - marcoShare;

    rows.push({
      description: desc,
      date,
      paidBy,
      amount,
      marcoShare,
      marcoNet,
      currency,
    });
  }
  return rows;
}

async function importToAccount(accountName: string, rows: ParsedRow[]) {
  const account = await prisma.account.findUnique({ where: { name: accountName } });
  if (!account) throw new Error(`Account ${accountName} non trovato`);

  // Wipe esistenti
  const deleted = await prisma.transaction.deleteMany({ where: { accountId: account.id } });
  console.log(`  🗑️  ${deleted.count} movimenti precedenti eliminati`);

  // Auto-categorize based on description
  const categories = await prisma.category.findMany();
  const catById = new Map(categories.map((c) => [c.id, c]));

  let imported = 0;
  let skippedNonEur = 0;
  for (const r of rows) {
    if (r.currency !== "EUR") {
      skippedNonEur++;
      continue;
    }
    if (r.marcoNet === 0) continue;

    const suggestedCatId = await suggestCategoryByDescription(r.description);

    await prisma.transaction.create({
      data: {
        date: r.date,
        amount: r.marcoNet,
        accountId: account.id,
        categoryId: suggestedCatId ?? null,
        beneficiary: r.description,
        notes: `Anticipato da: ${r.paidBy} · Tot. ${r.amount.toFixed(2)}€ · Quota mia: ${r.marcoShare.toFixed(2)}€`,
        isJoint: false,
        year: r.date.getFullYear(),
        month: r.date.getMonth() + 1,
      },
    });
    imported++;
  }

  // Aggiorna currentBalance = somma di tutte le transazioni
  const balance = rows.reduce(
    (s, r) => (r.currency === "EUR" ? s + r.marcoNet : s),
    0,
  );
  await prisma.account.update({
    where: { id: account.id },
    data: { currentBalance: balance },
  });

  console.log(`  ✅ ${imported} importati, ${skippedNonEur} non-EUR ignorati`);
  console.log(`  💰 Saldo: ${balance >= 0 ? "+" : ""}${balance.toFixed(2)} € (${balance > 0 ? "credito" : balance < 0 ? "debito" : "in pari"})`);
}

async function main() {
  console.log("📥 Parsing PDF Courage...");
  const courageText = await readPDF(COURAGE_PDF);
  const courageCols = extractColumnOrder(courageText);
  console.log("  Colonne:", courageCols.join(", "));
  const courageRows = parseExpenseLines(courageText, courageCols);
  console.log(`  ${courageRows.length} righe parsate`);
  console.log("\n💾 Import su CostSplit Courage...");
  await importToAccount("CostSplit Courage", courageRows);

  console.log("\n📥 Parsing PDF Spazio Sannio...");
  const sannioText = await readPDF(SANNIO_PDF);
  const sannioCols = extractColumnOrder(sannioText);
  console.log("  Colonne:", sannioCols.join(", "));
  const sannioRows = parseExpenseLines(sannioText, sannioCols);
  console.log(`  ${sannioRows.length} righe parsate`);
  console.log("\n💾 Import su CostSplit Spazio Sannio...");
  await importToAccount("CostSplit Spazio Sannio", sannioRows);

  await prisma.$disconnect();
  console.log("\n✅ Done!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
