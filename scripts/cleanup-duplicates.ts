import { prisma } from "../src/lib/prisma";

/**
 * Cleanup di duplicati creati da import CSV multipli.
 *
 * Strategia:
 * 1. Trova gruppi (accountId, date, amount) con più di 1 riga
 * 2. Classifica:
 *    - SURE: 2 righe con descrizione identica o sovrapposta (prefisso 4+ char,
 *      o una contiene l'altra) → duplicato sicuro
 *    - MAYBE: stesso amount/date/account ma descrizioni distinte → potrebbe
 *      essere coincidenza (es. 2 caffè da 4€ stesso giorno)
 * 3. Per i "SURE": tieni il più vecchio (createdAt minore), elimina il più recente
 * 4. Output report. --apply per eseguire le delete.
 */

const APPLY = process.argv.includes("--apply");

function normalize(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function descriptionsLikelyMatch(a: string, b: string): boolean {
  if (!a || !b) return true; // se uno manca, non possiamo distinguere → conservativo
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const prefix = Math.min(8, Math.min(a.length, b.length));
  if (prefix >= 4 && a.slice(0, prefix) === b.slice(0, prefix)) return true;
  // Soft match: stessa parola chiave (es. "Bonifico SEPA" contiene "Bonifico")
  const aWords = new Set(a.split(/\s+/).filter((w) => w.length >= 4));
  const bWords = new Set(b.split(/\s+/).filter((w) => w.length >= 4));
  for (const w of aWords) if (bWords.has(w)) return true;
  return false;
}

async function main() {
  console.log("📥 Carico tutte le transazioni...");
  const all = await prisma.transaction.findMany({
    where: { transferGroupId: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      date: true,
      amount: true,
      accountId: true,
      beneficiary: true,
      notes: true,
      createdAt: true,
    },
  });

  // Group by accountId|date|amount
  const groups = new Map<string, typeof all>();
  for (const t of all) {
    const key = `${t.accountId}|${t.date.toISOString().slice(0, 10)}|${t.amount.toFixed(2)}`;
    const arr = groups.get(key) ?? [];
    arr.push(t);
    groups.set(key, arr);
  }

  let sureGroups = 0;
  let maybeGroups = 0;
  const toDelete: string[] = [];
  const maybes: typeof all[] = [];

  for (const [, items] of groups) {
    if (items.length < 2) continue;
    // Per ogni coppia (i, j), testa se descrizioni "match" → duplicato sicuro
    const used = new Set<string>();
    for (let i = 0; i < items.length; i++) {
      const a = items[i];
      if (used.has(a.id)) continue;
      for (let j = i + 1; j < items.length; j++) {
        const b = items[j];
        if (used.has(b.id)) continue;
        const aDesc = normalize((a.beneficiary ?? "") + " " + (a.notes ?? ""));
        const bDesc = normalize((b.beneficiary ?? "") + " " + (b.notes ?? ""));
        if (descriptionsLikelyMatch(aDesc, bDesc)) {
          // Sure duplicate. Mantieni il più vecchio.
          const older = a.createdAt <= b.createdAt ? a : b;
          const newer = older.id === a.id ? b : a;
          toDelete.push(newer.id);
          used.add(a.id);
          used.add(b.id);
          sureGroups++;
        }
      }
    }
    // Quelli rimasti senza match nello stesso gruppo → maybe
    const unmatched = items.filter((t) => !used.has(t.id));
    if (unmatched.length > 1) {
      maybes.push(unmatched);
      maybeGroups++;
    }
  }

  console.log(`\n📊 Risultati:`);
  console.log(`  ✅ Duplicati sicuri da eliminare: ${toDelete.length} righe (in ${sureGroups} gruppi)`);
  console.log(`  ⚠️  Potenziali coincidenze (NON tocco): ${maybeGroups} gruppi`);

  if (maybes.length > 0) {
    console.log(`\n🔍 Esempi di "maybe" (stesso giorno+conto+importo ma descrizioni diverse):`);
    for (const grp of maybes.slice(0, 8)) {
      console.log(`\n  ${grp[0].date.toISOString().slice(0, 10)} ${grp[0].amount}€:`);
      for (const t of grp) {
        console.log(`    - ${t.beneficiary ?? "(no beneficiary)"} | ${(t.notes ?? "").slice(0, 50)}`);
      }
    }
  }

  if (!APPLY) {
    console.log(`\n⚠️  DRY RUN — nessuna modifica. Aggiungi --apply per eseguire le delete.`);
  } else {
    console.log(`\n🗑️  Eliminazione in corso...`);
    // Batch delete
    const batchSize = 100;
    for (let i = 0; i < toDelete.length; i += batchSize) {
      const batch = toDelete.slice(i, i + batchSize);
      await prisma.transaction.deleteMany({ where: { id: { in: batch } } });
    }
    console.log(`  ✓ ${toDelete.length} righe eliminate`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
