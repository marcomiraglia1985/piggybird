/**
 * Re-importa le tx friendsplit dai PDF Splitwise con il modello pool-view:
 *   notes: "Anticipato da: X · Tot. Y€ · Quota mia: Z€ · Per: A, B, C"
 *
 * Wipe SELETTIVO: cancella solo tx con createdAt < cutoff per preservare
 * le tx aggiunte recentemente via dialog "+ Aggiungi → Friendsplit".
 *
 * Uso:
 *   tsx scripts/reimport-friendsplit.ts            # dry-run
 *   tsx scripts/reimport-friendsplit.ts --apply    # applica
 */

import "dotenv/config";
import { PDFParse } from "pdf-parse";
import fs from "node:fs";
import { prisma } from "../src/lib/prisma";
import { suggestCategoryByDescription } from "../src/lib/categorize";
import { getSelfName } from "../src/lib/friendsplit-meta";

const COURAGE_PDF = "/Users/marcomiraglia/Progetti/personal-finance/old/Cost Split - COURAGE.pdf";
const SANNIO_PDF = "/Users/marcomiraglia/Progetti/personal-finance/old/Cost Split - SPAZIO SANNIO.pdf";
const CUTOFF = new Date("2026-04-28T00:00:00Z");

const apply = process.argv.includes("--apply");

type ParsedRow = {
  description: string;
  date: Date;
  paidBy: string;
  amount: number;
  marcoShare: number;
  marcoNet: number;
  participants: string[];
  currency: string;
};

function parseAmount(s: string): { value: number; currency: string } {
  const trimmed = s.trim();
  if (trimmed === "-" || trimmed === "" || trimmed === "—")
    return { value: 0, currency: "EUR" };
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

function extractColumnOrder(text: string): string[] {
  const headerMatch = text.match(
    /Paid for([\s\S]*?)(?:\d{2}\/\d{2}\/\d{2}|\b[A-Za-z][a-z]+\s+\d{2}\/\d{2}\/\d{2})/,
  );
  if (!headerMatch) return [];
  const headerBlock = headerMatch[1];
  const lines = headerBlock.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const names: string[] = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (
      /^[A-Z][a-zA-Zéèìòù]+$/.test(lines[i]) &&
      /^[A-Z][a-zA-Zéèìòù]+$/.test(lines[i + 1])
    ) {
      names.push(`${lines[i]} ${lines[i + 1]}`);
      i++;
    }
  }
  return names;
}

function parseExpenseLines(text: string, columnOrder: string[], selfName: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  const lines = text.split(/\n/).map((l) => l.trim());
  for (const line of lines) {
    if (
      /^(EXPENSES|SUMMARY|PAYBACKS|CURRENCIES|Description|Person|From|Total|Currency)/.test(
        line,
      )
    )
      continue;
    if (line.startsWith("--")) continue;
    if (!line.includes("\t")) continue;
    const cols = line.split("\t").map((c) => c.trim());
    if (cols.length < 4) continue;

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

    const shares: number[] = [];
    for (let i = dateIdx + 3; i < cols.length && shares.length < columnOrder.length; i++) {
      shares.push(parseAmount(cols[i]).value);
    }
    while (shares.length < columnOrder.length) shares.push(0);

    const marcoIdx = columnOrder.findIndex((n) => n === selfName);
    if (marcoIdx === -1) continue;
    const marcoShare = shares[marcoIdx];
    const paidByMarco = paidBy === selfName ? amount : 0;
    const marcoNet = paidByMarco - marcoShare;

    // Partecipanti: chi ha share > 0 (anche se Marco share=0 e altri sì)
    const participants: string[] = [];
    for (let i = 0; i < columnOrder.length; i++) {
      if (shares[i] > 0.001) participants.push(columnOrder[i]);
    }

    rows.push({
      description: desc,
      date,
      paidBy,
      amount,
      marcoShare,
      marcoNet,
      participants,
      currency,
    });
  }
  return rows;
}

async function reimport(accountName: string, rows: ParsedRow[]) {
  const account = await prisma.account.findUnique({
    where: { name: accountName },
  });
  if (!account) {
    console.error(`❌ Account "${accountName}" non trovato`);
    return;
  }

  // Filter EUR. Manteniamo ANCHE le spese dove Marco non è coinvolto
  // (marcoNet = 0): vengono salvate con amount=0 ma le notes contengono
  // payer + tot + partecipanti, necessari per il calcolo pool-view
  // di balance per altri membri (es. Davide paga per Angelo, no Marco).
  const eligible = rows.filter((r) => r.currency === "EUR");

  // Wipe TUTTE le tx friendsplit eccetto quelle con beneficiary nella
  // PRESERVE_LIST (recenti aggiunte via dialog che non sono nel PDF).
  const PRESERVE_BENEFICIARIES = new Set(["Dj festa", "Claudia Zalla"]);
  const allExisting = await prisma.transaction.findMany({
    where: { accountId: account.id },
    select: { id: true, beneficiary: true },
  });
  const toDeleteIds = allExisting
    .filter((t) => !PRESERVE_BENEFICIARIES.has(t.beneficiary ?? ""))
    .map((t) => t.id);
  const toPreserve = allExisting.length - toDeleteIds.length;

  console.log(
    `\n📦 ${accountName}: ${eligible.length} righe da PDF · ${toDeleteIds.length} da wipe · ${toPreserve} recenti da preservare`,
  );

  if (!apply) {
    console.log("   🔍 dry-run, mostro prime 3 righe da inserire:");
    for (const r of eligible.slice(0, 3)) {
      console.log(
        `      ${r.date.toISOString().slice(0, 10)} ${r.description.slice(0, 30)} · paidBy=${r.paidBy} · tot=${r.amount.toFixed(2)} · per=[${r.participants.join(",")}]`,
      );
    }
    return;
  }

  // Wipe selettivo: solo le tx NON nella preserve list
  if (toDeleteIds.length > 0) {
    await prisma.transaction.deleteMany({
      where: { id: { in: toDeleteIds } },
    });
  }
  console.log(`   🗑️  ${toDeleteIds.length} tx wipeate`);

  // Re-insert con nuovo modello
  let imported = 0;
  for (const r of eligible) {
    const suggestedCatId = await suggestCategoryByDescription(r.description);
    const notes = `Anticipato da: ${r.paidBy} · Tot. ${r.amount.toFixed(2)}€ · Quota mia: ${r.marcoShare.toFixed(2)}€ · Per: ${r.participants.join(", ")}`;
    await prisma.transaction.create({
      data: {
        date: r.date,
        amount: r.marcoNet,
        accountId: account.id,
        categoryId: suggestedCatId ?? null,
        beneficiary: r.description,
        notes,
        isJoint: false,
        confirmed: true,
        confirmedAt: new Date(),
        year: r.date.getFullYear(),
        month: r.date.getMonth() + 1,
      },
    });
    imported++;
  }

  // Aggiorna currentBalance = sum amount di tutte le tx
  const sum = await prisma.transaction.aggregate({
    where: { accountId: account.id },
    _sum: { amount: true },
  });
  const newBalance = sum._sum.amount ?? 0;
  await prisma.account.update({
    where: { id: account.id },
    data: { currentBalance: newBalance },
  });
  console.log(
    `   ✅ ${imported} tx inserite · saldo Marco: ${newBalance >= 0 ? "+" : ""}${newBalance.toFixed(2)}€`,
  );
}

async function main() {
  const selfName = await getSelfName();
  if (!selfName) {
    console.error("❌ Setting 'user.name' non configurato. Imposta da Impostazioni.");
    process.exit(1);
  }
  console.log(`👤 Self: ${selfName}`);
  console.log("📥 Parsing Courage PDF…");
  const courageText = await readPDF(COURAGE_PDF);
  const courageCols = extractColumnOrder(courageText);
  console.log(`   colonne: ${courageCols.join(", ")}`);
  const courageRows = parseExpenseLines(courageText, courageCols, selfName);
  await reimport("Friendsplit Courage", courageRows);

  console.log("\n📥 Parsing Spazio Sannio PDF…");
  const sannioText = await readPDF(SANNIO_PDF);
  const sannioCols = extractColumnOrder(sannioText);
  console.log(`   colonne: ${sannioCols.join(", ")}`);
  const sannioRows = parseExpenseLines(sannioText, sannioCols, selfName);
  await reimport("Friendsplit Spazio Sannio", sannioRows);

  if (!apply) {
    console.log("\n🔍 DRY-RUN — niente modificato. Aggiungi --apply per eseguire.");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("❌ Errore:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
