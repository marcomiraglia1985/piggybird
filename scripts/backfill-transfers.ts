import { prisma } from "../src/lib/prisma";
import crypto from "node:crypto";

/**
 * Pairs historical "Transfer" transactions: per ogni coppia stesso giorno,
 * importi opposti, conti diversi → assegna lo stesso transferGroupId.
 */
async function main() {
  const transferCat = await prisma.category.findFirst({
    where: { type: "transfer" },
  });
  if (!transferCat) {
    console.log("Nessuna categoria transfer trovata");
    return;
  }

  const transfers = await prisma.transaction.findMany({
    where: { categoryId: transferCat.id, transferGroupId: null },
    orderBy: { date: "asc" },
  });
  console.log(`📥 ${transfers.length} transfer da accoppiare`);

  // Index per giorno
  const byDay = new Map<string, typeof transfers>();
  for (const t of transfers) {
    const key = t.date.toISOString().slice(0, 10);
    const arr = byDay.get(key) ?? [];
    arr.push(t);
    byDay.set(key, arr);
  }

  let pairs = 0;
  let unmatched = 0;
  const used = new Set<string>();

  for (const [, day] of byDay) {
    for (let i = 0; i < day.length; i++) {
      const a = day[i];
      if (used.has(a.id)) continue;
      let matched = false;
      for (let j = i + 1; j < day.length; j++) {
        const b = day[j];
        if (used.has(b.id)) continue;
        if (a.accountId === b.accountId) continue;
        if (Math.abs(a.amount + b.amount) > 0.01) continue;
        // Match!
        const groupId = crypto.randomUUID();
        await prisma.transaction.update({
          where: { id: a.id },
          data: { transferGroupId: groupId },
        });
        await prisma.transaction.update({
          where: { id: b.id },
          data: { transferGroupId: groupId },
        });
        used.add(a.id);
        used.add(b.id);
        pairs++;
        matched = true;
        break;
      }
      if (!matched) unmatched++;
    }
  }

  console.log(`✅ ${pairs} coppie create, ${unmatched} transazioni transfer senza pair (esterni o ambigui)`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
