import { prisma } from "../src/lib/prisma";
import crypto from "node:crypto";

/**
 * Accoppia i transfer fra conti diversi (es. Revolut → Cointestato) che
 * non sono stati rilevati al momento dell'import perché i due lati erano
 * in CSV diversi.
 *
 * Strategia: per ogni transazione senza transferGroupId, cerca un'altra
 * senza transferGroupId con stessa data, importo opposto, account diverso.
 * Filtra ulteriormente per evitare falsi positivi: serve che almeno una
 * delle due descrizioni contenga keyword di transfer (es. "MARCO MIRAGLIA",
 * "COINTESTATO", "YAYA", "YINLI ZENG", "transfer", "deposito").
 */
async function main() {
  const transferCat = await prisma.category.findFirst({ where: { type: "transfer" } });
  if (!transferCat) {
    console.log("Categoria transfer non trovata");
    return;
  }

  const candidates = await prisma.transaction.findMany({
    where: { transferGroupId: null },
    orderBy: { date: "asc" },
    include: { account: true },
  });
  console.log(`📥 ${candidates.length} candidati senza transferGroupId`);

  // Group by date
  const byDay = new Map<string, typeof candidates>();
  for (const t of candidates) {
    const key = t.date.toISOString().slice(0, 10);
    const arr = byDay.get(key) ?? [];
    arr.push(t);
    byDay.set(key, arr);
  }

  const TRANSFER_KEYWORDS =
    /(MARCO MIRAGLIA|COINTESTATO|YAYA|YINLI|MIRAGLIA & YINLI|conto deposito|saving|vault|transfer)/i;

  let pairs = 0;
  const used = new Set<string>();

  for (const [, day] of byDay) {
    if (day.length < 2) continue;
    for (let i = 0; i < day.length; i++) {
      const a = day[i];
      if (used.has(a.id)) continue;
      for (let j = i + 1; j < day.length; j++) {
        const b = day[j];
        if (used.has(b.id)) continue;
        if (a.accountId === b.accountId) continue;
        if (Math.abs(a.amount + b.amount) > 0.01) continue;

        const aText = `${a.beneficiary ?? ""} ${a.notes ?? ""}`;
        const bText = `${b.beneficiary ?? ""} ${b.notes ?? ""}`;
        const looksLikeTransfer = TRANSFER_KEYWORDS.test(aText) || TRANSFER_KEYWORDS.test(bText);
        if (!looksLikeTransfer) continue;

        const groupId = crypto.randomUUID();
        await prisma.transaction.update({
          where: { id: a.id },
          data: { transferGroupId: groupId, categoryId: transferCat.id },
        });
        await prisma.transaction.update({
          where: { id: b.id },
          data: { transferGroupId: groupId, categoryId: transferCat.id },
        });
        used.add(a.id);
        used.add(b.id);
        pairs++;
        console.log(`  ↔ ${a.date.toISOString().slice(0, 10)} ${Math.abs(a.amount).toFixed(2)}€ ${a.account.name} ↔ ${b.account.name}`);
        break;
      }
    }
  }

  console.log(`\n✅ ${pairs} coppie cross-account create`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
