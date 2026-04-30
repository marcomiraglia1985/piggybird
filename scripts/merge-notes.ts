/**
 * Recovery script: riempie il campo `notes` per tx esistenti nel DB matchando
 * con le righe del CSV/XLSX originale. NON crea nuove tx, NON modifica altri
 * campi, NON cancella nulla.
 *
 * Uso:
 *   tsx scripts/merge-notes.ts <path-file>           # dry-run, solo report
 *   tsx scripts/merge-notes.ts <path-file> --apply   # applica davvero
 *
 * Sicurezza:
 *   - Default = dry-run, nessuna scrittura
 *   - Update SOLO se tx.notes è null/vuoto (no overwrite di Rettifica/CostSplit)
 *   - Match unico: se più tx matchano, skip e segnala
 *   - Modifica SOLO il campo notes (nient'altro)
 *   - Backup raccomandato: cp dev.db dev.db.backup-YYYY-MM-DD
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/prisma";
import { parseAny, xlsxToCsv } from "../src/lib/csv-parsers/dispatcher";
import type { ParsedRow } from "../src/lib/csv-parsers/types";

const filePath = process.argv[2];
const apply = process.argv.includes("--apply");

if (!filePath) {
  console.error(
    "Uso: tsx scripts/merge-notes.ts <path-file> [--apply]\n" +
      "  Senza --apply esegue dry-run (nessuna scrittura).\n",
  );
  process.exit(1);
}

const absPath = path.resolve(filePath);

async function main() {
  // 1. Leggi il file e converti in CSV se XLSX
  const ext = path.extname(absPath).toLowerCase();
  let content: string;
  if (ext === ".xlsx" || ext === ".xls") {
    const buf = readFileSync(absPath);
    content = xlsxToCsv(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    );
  } else {
    content = readFileSync(absPath, "utf-8");
  }

  // 2. Parse via dispatcher (auto-detect Revolut/Fineco/BNP)
  const parsed = parseAny(content);
  if (parsed.format === "unknown") {
    console.error("⚠️  Formato file non riconosciuto.");
    console.error(parsed.warnings.join("\n"));
    process.exit(1);
  }

  console.log(`✅ Formato rilevato: ${parsed.format}`);
  console.log(`📥 Righe parsate: ${parsed.rows.length}`);
  if (parsed.warnings.length > 0) {
    console.log(`ℹ️  Warning del parser:\n${parsed.warnings.map((w) => "   " + w).join("\n")}`);
  }

  // 3. Filtra solo righe che hanno una causale (notes) da mergiare
  const rowsWithNotes = parsed.rows.filter(
    (r) => r.notes && r.notes.trim().length > 0,
  );
  console.log(`📝 Righe con causale (notes): ${rowsWithNotes.length}`);
  if (rowsWithNotes.length === 0) {
    console.log("Nessuna causale da recuperare. Esco.");
    return;
  }

  // 4. Risolvi gli account candidate (per format → account name suggerito)
  const accounts = await prisma.account.findMany({
    select: { id: true, name: true },
  });
  const accountByName = new Map(accounts.map((a) => [a.name, a.id]));

  // Stat counters
  let matchedAndUpdated = 0;
  let matchedButHasNotes = 0;
  let multipleMatches = 0;
  let noMatch = 0;
  const updates: Array<{
    txId: string;
    date: string;
    amount: number;
    beneficiary: string | null;
    newNotes: string;
  }> = [];

  for (const row of rowsWithNotes) {
    const accountName = row.suggestedAccount ?? null;
    const accountId = accountName ? accountByName.get(accountName) : null;

    // Match: date (giorno) + amount (esatto) + accountId se noto
    const dateStart = new Date(row.date + "T00:00:00.000Z");
    const dateEnd = new Date(row.date + "T23:59:59.999Z");
    const candidates = await prisma.transaction.findMany({
      where: {
        date: { gte: dateStart, lte: dateEnd },
        amount: row.amount,
        ...(accountId ? { accountId } : {}),
      },
      select: { id: true, date: true, amount: true, beneficiary: true, notes: true },
    });

    if (candidates.length === 0) {
      noMatch++;
      continue;
    }
    let tx = candidates[0];
    if (candidates.length > 1) {
      // Match multipli (caso comune: stesso movimento importato 2 volte —
      // una dall'Excel storico con beneficiary "ricco" tipo "Vetreria Cremonese",
      // una dal CSV bancario con beneficiary "generico" tipo "Bonifico SEPA Italia").
      // Strategia: preferiamo la tx Excel-source, cioè quella con beneficiary
      // DIVERSO dalla "description" (short) del CSV. Riempire le notes lì
      // preserva il beneficiary più informativo.
      const excelLike = candidates.filter(
        (c) => c.beneficiary !== row.description,
      );
      if (excelLike.length === 1) {
        tx = excelLike[0];
        // OK, non è un'ambiguità: la CSV-source duplicate sarà gestita dal
        // dedup successivo.
      } else {
        multipleMatches++;
        console.log(
          `   ⚠️  ${candidates.length} match per ${row.date} amount=${row.amount} (${row.description.slice(0, 40)}…) — skip`,
        );
        continue;
      }
    }
    if (tx.notes && tx.notes.trim().length > 0) {
      matchedButHasNotes++;
      continue;
    }
    matchedAndUpdated++;
    updates.push({
      txId: tx.id,
      date: row.date,
      amount: row.amount,
      beneficiary: tx.beneficiary,
      newNotes: row.notes!.trim(),
    });
  }

  // 5. Report
  console.log("\n📊 RISULTATO:");
  console.log(`   ✅ Match unico + notes vuote → da aggiornare: ${matchedAndUpdated}`);
  console.log(`   ⏭️  Match unico ma notes già piene → skip: ${matchedButHasNotes}`);
  console.log(`   ⚠️  Match multipli (ambiguo) → skip: ${multipleMatches}`);
  console.log(`   ❌ Nessun match nel DB: ${noMatch}`);

  if (updates.length > 0 && updates.length <= 30) {
    console.log("\n📋 Anteprima update (max 30):");
    for (const u of updates.slice(0, 30)) {
      console.log(
        `   ${u.date} ${u.amount.toFixed(2).padStart(10)} € · ${(u.beneficiary ?? "(no benef.)").slice(0, 30).padEnd(30)} → ${u.newNotes.slice(0, 80)}`,
      );
    }
  } else if (updates.length > 30) {
    console.log(`\n📋 ${updates.length} update — mostro i primi 5:`);
    for (const u of updates.slice(0, 5)) {
      console.log(
        `   ${u.date} ${u.amount.toFixed(2).padStart(10)} € · ${(u.beneficiary ?? "(no benef.)").slice(0, 30)} → ${u.newNotes.slice(0, 80)}`,
      );
    }
  }

  // 6. Apply (se richiesto)
  if (!apply) {
    console.log("\n🔍 DRY-RUN: nessuna modifica al DB. Aggiungi --apply per eseguire.");
    return;
  }

  if (updates.length === 0) {
    console.log("\nNessun update da applicare.");
    return;
  }

  console.log(`\n✏️  Applicazione di ${updates.length} update…`);
  let done = 0;
  for (const u of updates) {
    await prisma.transaction.update({
      where: { id: u.txId },
      data: { notes: u.newNotes },
    });
    done++;
  }
  console.log(`✅ ${done} tx aggiornate (solo campo notes).`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("❌ Errore:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
