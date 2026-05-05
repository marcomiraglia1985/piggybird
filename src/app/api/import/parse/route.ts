import { NextRequest, NextResponse } from "next/server";
import { parseAnyWithFallback, xlsxToCsv } from "@/lib/csv-parsers/dispatcher";
import { suggestCategoriesBatch } from "@/lib/categorize";
import { fingerprintBeneficiary } from "@/lib/beneficiary-fingerprint";
import { prisma } from "@/lib/prisma";
import {
  seedLearnedTemplates,
  syncTemplatesFromRegistry,
} from "@/lib/template-sync";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Nessun file" }, { status: 400 });
  }

  // Seed + sync fire-and-forget: non blocca la response. Il template di
  // questa banca specifica è già nel DB (cache) o sarà imparato via AI; il
  // beneficio del seed/sync è per le banche FUTURE non ancora importate.
  void seedLearnedTemplates();
  void syncTemplatesFromRegistry(60 * 60 * 1000);

  // Supporta sia CSV che XLSX (rilevamento per nome o magic bytes)
  const fileName = (file as File).name?.toLowerCase() ?? "";
  const isXlsx =
    fileName.endsWith(".xlsx") ||
    fileName.endsWith(".xls") ||
    (file as File).type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  let content: string;
  if (isXlsx) {
    const buf = await (file as File).arrayBuffer();
    content = xlsxToCsv(buf);
  } else {
    content = await (file as File).text();
  }

  const result = await parseAnyWithFallback(content);
  if (result.format === "unknown") {
    // CSV trading: surface come hint strutturato così il client può
    // auto-rerouting all'endpoint broker (/api/integrations/stock-trades/import)
    // senza chiedere all'utente di andare in Impostazioni.
    const tradingWarning = result.warnings.find((w) =>
      w.toLowerCase().includes("csv trading"),
    );
    if (tradingWarning) {
      return NextResponse.json(
        {
          error: tradingWarning,
          warnings: result.warnings,
          tradingDetected: true,
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Formato non riconosciuto", warnings: result.warnings },
      { status: 400 },
    );
  }

  // Quirk routing: per le righe con `requireSuggestedAccount=true` (es.
  // interessi savings nel CSV Current di Revolut) risolviamo il nome conto
  // suggerito → ID. Se il conto esiste, settiamo `forceAccountId` per
  // overridare la scelta del pair stage. Altrimenti DROP della riga (l'utente
  // non ha quel conto configurato — non vogliamo creare tx fantasma).
  {
    const accountsByName = await prisma.account.findMany({
      where: { active: true },
      select: { id: true, name: true },
    });
    const idByName = new Map(accountsByName.map((a) => [a.name, a.id]));
    let droppedQuirk = 0;
    let redirectedQuirk = 0;
    result.rows = result.rows.flatMap((row) => {
      if (!row.requireSuggestedAccount) return [row];
      const targetId = row.suggestedAccount ? idByName.get(row.suggestedAccount) : null;
      if (!targetId) {
        droppedQuirk++;
        return [];
      }
      redirectedQuirk++;
      return [{ ...row, forceAccountId: targetId }];
    });
    if (droppedQuirk > 0) {
      result.warnings.push(
        `${droppedQuirk} righe interessi del Savings ignorate (nessun conto Revolut Savings configurato)`,
      );
    }
    if (redirectedQuirk > 0) {
      result.warnings.push(
        `${redirectedQuirk} righe interessi del Savings reindirizzate al conto deposito`,
      );
    }
  }

  // Auto-categorize from history
  const descriptions = result.rows.map((r) => r.description);
  const suggestions = await suggestCategoriesBatch(descriptions);
  const categories = await prisma.category.findMany({
    select: { id: true, emoji: true },
  });
  const catEmojiById = new Map(categories.map((c) => [c.id, c.emoji]));

  // Detect duplicates: existing transactions with same date + amount + (similar description)
  const dates = result.rows.map((r) => new Date(r.date));
  if (dates.length > 0) {
    const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));
    maxDate.setDate(maxDate.getDate() + 1);

    const existing = await prisma.transaction.findMany({
      where: {
        date: { gte: minDate, lt: maxDate },
      },
      select: { id: true, date: true, amount: true, beneficiary: true, notes: true, confirmed: true },
    });

    // Dedup index: cerca match su (data, importo) e poi controlla che la
    // descrizione sia simile (prefisso comune di 4+ char, case-insensitive).
    type Candidate = { id: string; description: string; confirmed: boolean };
    const dupeIndex = new Map<string, Candidate[]>();
    for (const e of existing) {
      const key = `${e.date.toISOString().slice(0, 10)}|${e.amount.toFixed(2)}`;
      const desc = ((e.beneficiary ?? "") + " " + (e.notes ?? "")).trim().toLowerCase();
      const arr = dupeIndex.get(key) ?? [];
      arr.push({ id: e.id, description: desc, confirmed: e.confirmed });
      dupeIndex.set(key, arr);
    }

    function descriptionsMatch(a: string, b: string): boolean {
      const aN = a.trim().toLowerCase();
      const bN = b.trim().toLowerCase();
      if (!aN || !bN) return true; // se una manca, accetta solo data+importo
      if (aN === bN) return true;
      if (aN.includes(bN) || bN.includes(aN)) return true;
      const prefix = Math.min(8, Math.min(aN.length, bN.length));
      return prefix >= 4 && aN.slice(0, prefix) === bN.slice(0, prefix);
    }

    // Split-dedup: indicizza tutte le righe DB per data, così possiamo
    // riconoscere quando una riga CSV corrisponde alla somma di 2+ righe DB
    // (es. accredito CashPark = capitale + interessi su righe separate).
    const accounts = await prisma.account.findMany({
      select: { id: true, name: true },
    });
    const accountIdByName = new Map(accounts.map((a) => [a.name, a.id]));

    const existingFull = await prisma.transaction.findMany({
      where: { date: { gte: minDate, lt: maxDate } },
      select: {
        id: true,
        date: true,
        amount: true,
        accountId: true,
        beneficiary: true,
        notes: true,
        categoryId: true,
        category: { select: { id: true, emoji: true, name: true } },
      },
    });
    const byDateAccount = new Map<string, { id: string; amount: number; description: string }[]>();
    for (const e of existingFull) {
      const key = `${e.date.toISOString().slice(0, 10)}|${e.accountId}`;
      const arr = byDateAccount.get(key) ?? [];
      const description = ((e.beneficiary ?? "") + " " + (e.notes ?? "")).trim().toLowerCase();
      arr.push({ id: e.id, amount: e.amount, description });
      byDateAccount.set(key, arr);
    }

    // Fuzzy dedup: range ±15gg per coprire entrate "spuntate" in anticipo
    // (stipendio) E uscite ricorrenti registrate dalla banca con scarto di
    // qualche giorno (Netflix, affitto, bollette).
    const minDateExt = new Date(minDate);
    minDateExt.setDate(minDateExt.getDate() - 15);
    const maxDateExt = new Date(maxDate);
    maxDateExt.setDate(maxDateExt.getDate() + 15);
    const fuzzyDb = await prisma.transaction.findMany({
      where: { date: { gte: minDateExt, lt: maxDateExt } },
      select: { id: true, date: true, amount: true, beneficiary: true, notes: true, confirmed: true },
    });

    // Tx ricorrenti programmate (confirmed=false con recurrenceGroupId): per
    // queste si applica un dedup tollerante su importo — Netflix che alza il
    // prezzo o EDF con bollette variabili devono matchare lo stesso. Il
    // commit aggiornerà date/amount sulla tx programmata col valore CSV.
    const pendingRecurrences = await prisma.transaction.findMany({
      where: {
        confirmed: false,
        recurrenceGroupId: { not: null },
        date: { gte: minDateExt, lt: maxDateExt },
      },
      select: {
        id: true,
        date: true,
        amount: true,
        accountId: true,
        beneficiary: true,
      },
    });

    for (const row of result.rows) {
      const key = `${row.date}|${row.amount.toFixed(2)}`;
      const candidates = dupeIndex.get(key);
      if (candidates) {
        const desc = row.description.toLowerCase();
        const match = candidates.find((c) => descriptionsMatch(desc, c.description));
        if (match) {
          row.duplicateOf = match.id;
          // Se la tx esistente è ancora pending (programmata, non confermata),
          // il commit la confermerà al posto di creare un duplicato nascosto.
          if (!match.confirmed) {
            row.confirmsRecurrence = {
              txId: match.id,
              newDate: row.date,
              newAmount: row.amount,
            };
          }
        }
      }

      // Fuzzy dedup ±N giorni con stesso importo + descrizione simile.
      // ±15gg per le entrate (stipendio anticipato), ±7gg per le uscite
      // (banca registra D+1/D+2 vs data programmata).
      if (!row.duplicateOf) {
        const csvTs = new Date(row.date).getTime();
        const maxDays = row.amount > 0 ? 15 : 7;
        const desc = row.description.toLowerCase();
        const sameSign = (a: number) => (a > 0) === (row.amount > 0);
        const fuzzy = fuzzyDb.find((e) => {
          if (!sameSign(e.amount)) return false;
          if (Math.abs(e.amount - row.amount) > 0.01) return false;
          const dayDiff = Math.abs(e.date.getTime() - csvTs) / 86400000;
          if (dayDiff > maxDays) return false;
          const eDesc = ((e.beneficiary ?? "") + " " + (e.notes ?? "")).trim().toLowerCase();
          return descriptionsMatch(desc, eDesc);
        });
        if (fuzzy) {
          row.duplicateOf = fuzzy.id;
          if (!fuzzy.confirmed) {
            row.confirmsRecurrence = {
              txId: fuzzy.id,
              newDate: row.date,
              newAmount: row.amount,
            };
          }
        }
      }

      // Match TOLLERANTE su importo per ricorrenze programmate: stessa
      // fingerprint beneficiary + stesso accountId/segno + data ±7gg,
      // ignorando l'importo. Se matcha, segnala `confirmsRecurrence` così
      // il commit auto-confermerà la tx programmata e ne aggiornerà
      // amount/date col valore CSV (gestisce Netflix che cambia prezzo).
      if (!row.duplicateOf && row.suggestedAccount && row.description.trim()) {
        const accId = accountIdByName.get(row.suggestedAccount);
        if (accId) {
          const csvTs = new Date(row.date).getTime();
          const csvFp = fingerprintBeneficiary(row.description);
          if (csvFp) {
            const match = pendingRecurrences.find((p) => {
              if (p.accountId !== accId) return false;
              if ((p.amount > 0) !== (row.amount > 0)) return false;
              const dayDiff = Math.abs(p.date.getTime() - csvTs) / 86400000;
              if (dayDiff > 7) return false;
              return fingerprintBeneficiary(p.beneficiary) === csvFp;
            });
            if (match) {
              row.duplicateOf = match.id;
              row.confirmsRecurrence = {
                txId: match.id,
                newDate: row.date,
                newAmount: row.amount,
              };
            }
          }
        }
      }

      // Se non già duplicato, prova split-dedup: la riga CSV corrisponde
      // alla SOMMA di 2 righe DB sullo stesso giorno e stesso account?
      // Per evitare falsi positivi (due spese a caso che sommano per
      // coincidenza all'importo CSV) richiediamo che almeno una delle due
      // tx DB abbia descrizione simile alla riga CSV.
      if (!row.duplicateOf && row.suggestedAccount) {
        const accId = accountIdByName.get(row.suggestedAccount);
        if (accId) {
          const sameDay = byDateAccount.get(`${row.date}|${accId}`) ?? [];
          if (sameDay.length >= 2) {
            const csvDesc = row.description.toLowerCase();
            outer: for (let i = 0; i < sameDay.length; i++) {
              for (let j = i + 1; j < sameDay.length; j++) {
                if (Math.abs(sameDay[i].amount + sameDay[j].amount - row.amount) < 0.01) {
                  const descOk =
                    descriptionsMatch(csvDesc, sameDay[i].description) ||
                    descriptionsMatch(csvDesc, sameDay[j].description);
                  if (!descOk) continue;
                  row.duplicateOf = sameDay[i].id;
                  break outer;
                }
              }
            }
          }
        }
      }

      // SOFT DEDUP: se ancora non duplicato, cerca tx esistente con stessa
      // (data, amount, accountId) ma descrizione diversa. Caso tipico:
      // utente ha aggiunto la tx a mano (beneficiary "Vetreria Cremonese") e
      // ora importa il CSV bancario (description "Bonifico SEPA Italia"). Il
      // dedup esatto/fuzzy non scatta perché le descrizioni differiscono.
      // Marca per decisione utente nel modal di import (merge/replace/keep).
      if (!row.duplicateOf && row.suggestedAccount) {
        const accId = accountIdByName.get(row.suggestedAccount);
        if (accId) {
          const csvDay = row.date;
          const softMatches = existingFull.filter(
            (e) =>
              e.accountId === accId &&
              e.date.toISOString().slice(0, 10) === csvDay &&
              Math.abs(e.amount - row.amount) < 0.01,
          );
          // Solo match unico per evitare ambiguità (più tx stesso giorno/amount)
          if (softMatches.length === 1) {
            const m = softMatches[0];
            row.softDuplicateOf = {
              id: m.id,
              beneficiary: m.beneficiary,
              notes: m.notes,
              categoryId: m.categoryId,
              categoryEmoji: m.category?.emoji ?? null,
              categoryName: m.category?.name ?? null,
            };
          }
        }
      }

      // Auto-categorize dallo storico (solo se le regole del parser non hanno già deciso)
      if (!row.suggestedCategoryEmoji) {
        const sugg = suggestions.get(row.description.trim());
        if (sugg) row.suggestedCategoryEmoji = catEmojiById.get(sugg) ?? null;
      }
    }
  } else {
    for (const row of result.rows) {
      // Le regole del parser (pattern deterministici) hanno priorità
      // sull'auto-categorize dallo storico. Solo se il parser non ha
      // suggerito nulla, usa lo storico.
      if (!row.suggestedCategoryEmoji) {
        const sugg = suggestions.get(row.description.trim());
        if (sugg) row.suggestedCategoryEmoji = catEmojiById.get(sugg) ?? null;
      }
    }
  }

  // Provide accounts/categories/estates for la review UI (CategoryPicker)
  const [accountsList, allCategories, estates] = await Promise.all([
    prisma.account.findMany({
      where: { active: true },
      orderBy: { displayOrder: "asc" },
      select: { id: true, name: true, emoji: true },
    }),
    prisma.category.findMany({
      orderBy: { displayOrder: "asc" },
      select: {
        id: true,
        emoji: true,
        name: true,
        group: true,
        type: true,
        estateId: true,
        displayOrder: true,
      },
    }),
    prisma.realEstate.findMany({
      where: { active: true },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, emoji: true },
    }),
  ]);

  return NextResponse.json({
    format: result.format,
    rows: result.rows,
    warnings: result.warnings,
    accounts: accountsList,
    categories: allCategories,
    estates,
  });
}
