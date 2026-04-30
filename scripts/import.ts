import * as XLSX from "xlsx";
import path from "node:path";
import crypto from "node:crypto";
import { prisma } from "../src/lib/prisma";

const XLSX_PATH = path.resolve(
  process.cwd(),
  "../old/_FINANZA PERSONALE.xlsx",
);

type AccountSeed = {
  name: string;
  type: "liquid" | "savings" | "investment" | "credit" | "joint" | "cash";
  emoji: string;
  displayOrder: number;
  active?: boolean;
  ownershipShare?: number;
};

// Active accounts = those in MOVIMENTI 2026 / CONTI 2026 sheet.
// Inactive = closed or migrated (still kept for historical movimenti).
const ACCOUNTS: AccountSeed[] = [
  { name: "Revolut", type: "liquid", emoji: "💳", displayOrder: 1 },
  { name: "Fineco", type: "liquid", emoji: "🏦", displayOrder: 2 },
  { name: "BNP Paribas", type: "liquid", emoji: "🇫🇷", displayOrder: 3 },
  { name: "Paypal", type: "liquid", emoji: "🅿️", displayOrder: 4 },
  { name: "Cointestato", type: "joint", emoji: "👫🏻", displayOrder: 5, ownershipShare: 2 / 3 },
  { name: "CostSplit", type: "liquid", emoji: "🧮", displayOrder: 6 },
  { name: "Contante", type: "cash", emoji: "💶", displayOrder: 7 },
  { name: "Binance", type: "liquid", emoji: "🟡", displayOrder: 8 },
  { name: "Revolut Savings", type: "savings", emoji: "🐖", displayOrder: 9 },
  { name: "Fineco Cash Park", type: "savings", emoji: "🅿", displayOrder: 10 },
  // Closed / migrated — kept inactive for history
  { name: "BNP Livret A", type: "savings", emoji: "🇫🇷", displayOrder: 90, active: false },
  { name: "Crypto Card", type: "liquid", emoji: "🟠", displayOrder: 91, active: false },
];

// Map from how an account appears in the xlsx to canonical name
const ACCOUNT_ALIASES: Record<string, string> = {
  Revolut: "Revolut",
  "Revolut Savings": "Revolut Savings",
  Fineco: "Fineco",
  "Fineco Cash Park": "Fineco Cash Park",
  Cointestato: "Cointestato",
  "Cointestato (3/3)": "Cointestato",
  "Cointestato (2/3)": "Cointestato",
  "BNP Paribas": "BNP Paribas",
  Contante: "Contante",
  "Binance (EUR)": "Binance",
  "Binance Card": "Binance",
  Binance: "Binance",
  Paypal: "Paypal",
  PayPal: "Paypal",
  CostSplit: "CostSplit",
  "Fineco CashPark": "Fineco Cash Park",
  "BNP Livret A": "BNP Livret A",
  "Crypto Card": "Crypto Card",
};

type CatSeed = {
  emoji: string;
  name: string;
  group: string;
  type: "income" | "expense" | "investment" | "transfer";
  order: number;
};

const CATEGORIES: CatSeed[] = [
  // Income
  { emoji: "💼", name: "Courage Stipendio", group: "income", type: "income", order: 1 },
  { emoji: "🎩", name: "Courage Bonus", group: "income", type: "income", order: 2 },
  { emoji: "💎", name: "Stacking, Interessi, Vendite", group: "income", type: "income", order: 3 },
  { emoji: "💶", name: "Altre entrate, Rimborsi, Regali, Gain", group: "income", type: "income", order: 4 },
  { emoji: "🏠🇫🇷", name: "Affitto Parigi", group: "income", type: "income", order: 5 },
  // Investments
  { emoji: "📈", name: "Stocks (Revolut)", group: "investments", type: "investment", order: 10 },
  { emoji: "💰", name: "Gold & Metals (Revolut)", group: "investments", type: "investment", order: 11 },
  { emoji: "📊", name: "ETF (Revolut Robo-Advisor)", group: "investments", type: "investment", order: 12 },
  { emoji: "🚀", name: "Crypto (Binance or Revolut)", group: "investments", type: "investment", order: 13 },
  // Paris
  { emoji: "⚖️🇫🇷", name: "Tasse e Spese condominiali Parigi", group: "paris", type: "expense", order: 20 },
  { emoji: "☎️🇫🇷", name: "Telefonia Parigi", group: "paris", type: "expense", order: 21 },
  { emoji: "💡🇫🇷", name: "Elettricità Parigi", group: "paris", type: "expense", order: 22 },
  { emoji: "🪑🇫🇷", name: "Arredamento e Manutenzione Parigi", group: "paris", type: "expense", order: 23 },
  { emoji: "🏦🇫🇷", name: "Banca e Assicurazione Parigi", group: "paris", type: "expense", order: 24 },
  // Casa Italia
  { emoji: "🏗️", name: "Spazio Sannio 20", group: "casa", type: "expense", order: 30 },
  { emoji: "🔑", name: "Acquisto Tirana 24", group: "casa", type: "expense", order: 31 },
  { emoji: "🏡", name: "Spese condominiali e utenze Tirana 24", group: "casa", type: "expense", order: 32 },
  { emoji: "🏚️", name: "Affitto Malaga 6", group: "casa", type: "expense", order: 33 },
  { emoji: "🏠", name: "Casa, Manutenzione, Spese", group: "casa", type: "expense", order: 34 },
  // Utenze
  { emoji: "☎️", name: "Telefonia Milano", group: "utenze", type: "expense", order: 40 },
  { emoji: "💡", name: "Elettricità Milano", group: "utenze", type: "expense", order: 41 },
  { emoji: "🔥", name: "Gas Milano", group: "utenze", type: "expense", order: 42 },
  { emoji: "🪑", name: "Arredamento e Manutenzione Milano", group: "utenze", type: "expense", order: 43 },
  // Banca
  { emoji: "⚖️", name: "Tasse Italiane", group: "banca", type: "expense", order: 50 },
  { emoji: "🏦", name: "Banca, Commissioni e Assicurazione", group: "banca", type: "expense", order: 51 },
  // Vita quotidiana
  { emoji: "☕", name: "Colazione", group: "food", type: "expense", order: 60 },
  { emoji: "🍝", name: "Pranzi e Cene", group: "food", type: "expense", order: 61 },
  { emoji: "🍺", name: "Bar", group: "food", type: "expense", order: 62 },
  { emoji: "🛵", name: "Pranzi e Cene Delivery", group: "food", type: "expense", order: 63 },
  { emoji: "🍎", name: "Alimentari", group: "food", type: "expense", order: 64 },
  // Lifestyle
  { emoji: "🎮", name: "Tech & Games", group: "lifestyle", type: "expense", order: 70 },
  { emoji: "📷", name: "Fotografia", group: "lifestyle", type: "expense", order: 71 },
  { emoji: "🎟️", name: "Netflix, Spotify, Subscriptions", group: "lifestyle", type: "expense", order: 72 },
  { emoji: "👕", name: "Vestiti e Accessori", group: "lifestyle", type: "expense", order: 73 },
  { emoji: "💊", name: "Farmacia, Palestra e Cura personale", group: "lifestyle", type: "expense", order: 74 },
  { emoji: "✈️", name: "Viaggi e vacanze", group: "lifestyle", type: "expense", order: 75 },
  { emoji: "🐱", name: "Pets", group: "lifestyle", type: "expense", order: 76 },
  { emoji: "📚", name: "Istruzione", group: "lifestyle", type: "expense", order: 77 },
  { emoji: "🎁", name: "Regali e Charity", group: "lifestyle", type: "expense", order: 78 },
  { emoji: "🛍️", name: "Shopping", group: "lifestyle", type: "expense", order: 79 },
  // Trasporti
  { emoji: "🛢️", name: "Benzina, Autostrade, Parcheggi", group: "transport", type: "expense", order: 80 },
  { emoji: "🚗", name: "Automobile e Manutenzione", group: "transport", type: "expense", order: 81 },
  { emoji: "🚌", name: "Trasporto pubblico e Car Sharing", group: "transport", type: "expense", order: 82 },
  // Promo
  { emoji: "🚀💥", name: "Promozione social networks", group: "lifestyle", type: "expense", order: 90 },
  // Altri
  { emoji: "🧯", name: "Imprevisti, multe", group: "altri", type: "expense", order: 100 },
  { emoji: "💸", name: "Unknown", group: "altri", type: "expense", order: 101 },
  { emoji: "👫🏻", name: "Yaya / Cointestato deposit", group: "income", type: "income", order: 102 },
  // Transfer (special)
  { emoji: "↔️", name: "Transfer", group: "transfer", type: "transfer", order: 200 },
];

const TRANSFER_LABELS = new Set(["Transfer", "transfer", "TRANSFER", "Trasferimento"]);

function findCategoryByEmoji(emoji: string | null | undefined): CatSeed | null {
  if (!emoji) return null;
  const e = String(emoji).trim();
  // Exact match first
  let c = CATEGORIES.find((c) => c.emoji === e);
  if (c) return c;
  // Try matching the first emoji (in case of multi-emoji like 🚀💥)
  c = CATEGORIES.find((c) => c.emoji.startsWith(e) || e.startsWith(c.emoji));
  return c ?? null;
}

function canonicalAccount(name: string | null | undefined): string | null {
  if (!name) return null;
  const trimmed = String(name).trim();
  return ACCOUNT_ALIASES[trimmed] ?? trimmed;
}

function parseDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === "number") {
    // Excel date serial
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(excelEpoch.getTime() + v * 86400000);
  }
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

function asNumber(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace(",", "."));
  return isNaN(n) ? 0 : n;
}

async function main() {
  console.log(`📂 Reading ${XLSX_PATH}`);
  const wb = XLSX.readFile(XLSX_PATH);

  console.log("🧹 Clearing existing data...");
  await prisma.transaction.deleteMany();
  await prisma.netWorthSnapshot.deleteMany();
  await prisma.investment.deleteMany();
  await prisma.accountBalance.deleteMany();
  await prisma.category.deleteMany();
  await prisma.account.deleteMany();

  console.log("🏦 Seeding accounts...");
  for (const a of ACCOUNTS) {
    await prisma.account.create({
      data: {
        name: a.name,
        type: a.type,
        emoji: a.emoji,
        displayOrder: a.displayOrder,
        currency: "EUR",
        active: a.active ?? true,
        ownershipShare: a.ownershipShare ?? 1,
      },
    });
  }
  const accountByName = new Map(
    (await prisma.account.findMany()).map((a) => [a.name, a]),
  );

  console.log("🏷️  Seeding categories...");
  for (const c of CATEGORIES) {
    await prisma.category.create({
      data: {
        emoji: c.emoji,
        name: c.name,
        group: c.group,
        type: c.type,
        displayOrder: c.order,
      },
    });
  }
  const categoryByEmoji = new Map(
    (await prisma.category.findMany()).map((c) => [c.emoji, c]),
  );

  // Process MOVIMENTI sheets for years 2022..2026
  const years = [2022, 2023, 2024, 2025, 2026];
  let totalMovimenti = 0;

  for (const year of years) {
    const sheetName = wb.SheetNames.find((s) => s.startsWith(`MOVIMENTI ${year} - MOVIMENTI ${year}`));
    if (!sheetName) {
      console.log(`⚠️  Sheet for ${year} not found`);
      continue;
    }
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
      header: 1,
      raw: true,
      defval: null,
    }) as unknown as unknown[][];

    // Determine columns: header row 2 has labels
    // Layout (from observation):
    // Col A: month number / blank, B: Data, C: bool? (excluded), D: Entrata, E: Uscita,
    // F: Conto, G: Categoria, H: Beneficiario / Operatore, I: Note
    let imported = 0;
    for (let i = 2; i < rows.length; i++) {
      const r = rows[i];
      if (!r) continue;
      const date = parseDate(r[1]);
      if (!date) continue;
      const entrata = asNumber(r[3]);
      const uscita = asNumber(r[4]);
      const amount = entrata !== 0 ? entrata : uscita;
      if (amount === 0) continue;
      const accRaw = r[5] as string | null;
      const accName = canonicalAccount(accRaw);
      if (!accName) continue;
      const account = accountByName.get(accName);
      if (!account) {
        console.warn(`  ⚠️  Unknown account "${accRaw}" → skipping row`);
        continue;
      }
      const catEmoji = r[6] as string | null;
      const benef = (r[7] as string | null) ?? null;
      const note = (r[8] as string | null) ?? null;

      // Skip "Inizio conto …" snapshot rows — fotografie inizio anno, non movimenti reali
      if (!catEmoji && benef && /^inizio\s/i.test(benef)) continue;

      // Detect transfer
      const isTransfer = catEmoji && TRANSFER_LABELS.has(String(catEmoji).trim());
      let categoryId: string | null = null;
      if (isTransfer) {
        categoryId = categoryByEmoji.get("↔️")?.id ?? null;
      } else if (catEmoji) {
        const e = String(catEmoji).trim();
        const found = categoryByEmoji.get(e) ??
          [...categoryByEmoji.entries()].find(([k]) => k.startsWith(e) || e.startsWith(k))?.[1];
        if (found) categoryId = found.id;
      }

      await prisma.transaction.create({
        data: {
          date,
          amount,
          accountId: account.id,
          categoryId,
          beneficiary: benef,
          notes: note,
          isJoint: false,
          year: date.getFullYear(),
          month: date.getMonth() + 1,
        },
      });
      imported++;
    }
    totalMovimenti += imported;
    console.log(`  ✓ ${year}: ${imported} movimenti`);
  }

  // Cointestato sheet (only 2026 in current xlsx)
  const coinSheet = wb.SheetNames.find((s) => s.startsWith("MOVIMENTI 2026 - MOVIMENTI COIN"));
  if (coinSheet) {
    const ws = wb.Sheets[coinSheet];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      raw: true,
      defval: null,
    }) as unknown as unknown[][];
    let imported = 0;
    for (let i = 2; i < rows.length; i++) {
      const r = rows[i];
      if (!r) continue;
      const date = parseDate(r[1]);
      if (!date) continue;
      const entrata = asNumber(r[3]);
      const uscita = asNumber(r[4]);
      const amount = entrata !== 0 ? entrata : uscita;
      if (amount === 0) continue;
      const accName = canonicalAccount(r[5] as string | null) ?? "Cointestato";
      const account = accountByName.get(accName);
      if (!account) continue;
      const catEmoji = r[6] as string | null;
      const benef = (r[7] as string | null) ?? null;
      const note = (r[8] as string | null) ?? null;

      // Skip "Inizio …" snapshot rows
      if (!catEmoji && benef && /^inizio\s/i.test(benef)) continue;

      let categoryId: string | null = null;
      if (catEmoji) {
        const e = String(catEmoji).trim();
        const found = categoryByEmoji.get(e) ??
          [...categoryByEmoji.entries()].find(([k]) => k.startsWith(e) || e.startsWith(k))?.[1];
        if (found) categoryId = found.id;
      }

      await prisma.transaction.create({
        data: {
          date,
          amount,
          accountId: account.id,
          categoryId,
          beneficiary: benef,
          notes: note,
          isJoint: true,
          year: date.getFullYear(),
          month: date.getMonth() + 1,
        },
      });
      imported++;
    }
    console.log(`  ✓ Cointestato 2026: ${imported} movimenti`);
    totalMovimenti += imported;
  }

  console.log(`\n📊 Total transactions: ${totalMovimenti}`);

  // NET WORTH HISTORY
  console.log("\n📈 Importing Net Worth History...");
  const nwSheet = wb.SheetNames.find((s) => s.startsWith("BILANCIO CASSA - NET WORTH HIST"));
  if (nwSheet) {
    const ws = wb.Sheets[nwSheet];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null }) as unknown as unknown[][];
    let imported = 0;
    for (let i = 2; i < rows.length; i++) {
      const r = rows[i];
      if (!r) continue;
      const month = parseDate(r[0]);
      const total = asNumber(r[1]);
      if (!month || total === 0) continue;
      // Set to first day of month
      const firstDay = new Date(Date.UTC(month.getFullYear(), month.getMonth(), 1));
      try {
        await prisma.netWorthSnapshot.create({
          data: { month: firstDay, total, source: "history" },
        });
        imported++;
      } catch {
        // duplicate month
      }
    }
    console.log(`  ✓ ${imported} snapshots`);
  }

  // Current balances from MOVIMENTI 2026 - CONTI 2026 (the "Actual" row).
  // This is the source of truth as of import date — full account balance,
  // ownership share is applied at query time for net worth calculations.
  console.log("\n💰 Importing current account balances from CONTI 2026...");
  const contiSheet = wb.SheetNames.find((s) => s.startsWith("MOVIMENTI 2026 - CONTI 2026"));
  if (contiSheet) {
    const ws = wb.Sheets[contiSheet];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      raw: true,
      defval: null,
    }) as unknown as unknown[][];
    // Locate "Actual" row; header row is the one immediately above it.
    const actualIdx = rows.findIndex((r) => r && String(r[0] ?? "").trim() === "Actual");
    const headerRow = actualIdx > 0 ? rows[actualIdx - 1] ?? [] : [];
    const actualRow = actualIdx >= 0 ? rows[actualIdx] : null;
    if (actualRow) {
      const today = new Date();
      let updated = 0;
      for (let c = 1; c < headerRow.length; c++) {
        const label = headerRow[c];
        if (!label) continue;
        const value = asNumber(actualRow[c]);
        const accName = canonicalAccount(label as string);
        if (!accName) continue;
        const account = accountByName.get(accName);
        if (!account) {
          console.warn(`  ⚠️  CONTI 2026 unknown account "${label}"`);
          continue;
        }
        await prisma.account.update({
          where: { id: account.id },
          data: { currentBalance: value },
        });
        await prisma.accountBalance.create({
          data: { accountId: account.id, date: today, balance: value },
        });
        updated++;
      }
      console.log(`  ✓ ${updated} account balances updated from CONTI 2026 Actual row`);
    } else {
      console.warn("  ⚠️  CONTI 2026 Actual row not found");
    }
  }

  // Investments snapshot
  console.log("\n📊 Importing investments snapshot...");
  const investments = [
    { name: "Stocks Revolut", type: "stocks", platform: "Revolut", value: 60780 },
    { name: "Metals Revolut", type: "metals", platform: "Revolut", value: 7860 },
    { name: "Crypto Revolut", type: "crypto", platform: "Revolut", value: 3870 },
    { name: "Crypto Binance", type: "crypto", platform: "Binance", value: 71700 },
    { name: "Crypto USD/EUR", type: "crypto", platform: "Other", value: 61145.76 },
  ];
  for (const inv of investments) {
    await prisma.investment.create({
      data: {
        name: inv.name,
        type: inv.type,
        platform: inv.platform,
        currentValue: inv.value,
        currency: "EUR",
      },
    });
  }
  console.log(`  ✓ ${investments.length} investments`);

  // Pair historical transfers
  console.log("\n🔁 Pairing historical transfers...");
  const transferCat = await prisma.category.findFirst({ where: { type: "transfer" } });
  if (transferCat) {
    const allTransfers = await prisma.transaction.findMany({
      where: { categoryId: transferCat.id, transferGroupId: null },
      orderBy: { date: "asc" },
    });
    const byDay = new Map<string, typeof allTransfers>();
    for (const t of allTransfers) {
      const key = t.date.toISOString().slice(0, 10);
      const arr = byDay.get(key) ?? [];
      arr.push(t);
      byDay.set(key, arr);
    }
    let pairs = 0;
    const used = new Set<string>();
    for (const [, day] of byDay) {
      for (let i = 0; i < day.length; i++) {
        const a = day[i];
        if (used.has(a.id)) continue;
        for (let j = i + 1; j < day.length; j++) {
          const b = day[j];
          if (used.has(b.id)) continue;
          if (a.accountId === b.accountId) continue;
          if (Math.abs(a.amount + b.amount) > 0.01) continue;
          const groupId = crypto.randomUUID();
          await prisma.transaction.update({ where: { id: a.id }, data: { transferGroupId: groupId } });
          await prisma.transaction.update({ where: { id: b.id }, data: { transferGroupId: groupId } });
          used.add(a.id);
          used.add(b.id);
          pairs++;
          break;
        }
      }
    }
    console.log(`  ✓ ${pairs} transfer pairs created`);
  }

  console.log("\n✅ Import complete!");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
