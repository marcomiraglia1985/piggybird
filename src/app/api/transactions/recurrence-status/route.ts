import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Stato di TUTTE le ricorrenze esistenti (con ≥2 occorrenze):
 *   - "expired"  → ultima occorrenza già passata, nessuna futura
 *   - "expiring" → ultima occorrenza entro 45 giorni
 *   - "active"   → ultima occorrenza > 45 giorni nel futuro
 *
 * Il banner /movimenti filtra solo expired+expiring (richiamo all'azione).
 * La pagina /movimenti/ricorrenze mostra tutte e tre per dare l'overview.
 */
export async function GET() {
  const txs = await prisma.transaction.findMany({
    where: { recurrenceGroupId: { not: null } },
    select: {
      id: true,
      recurrenceGroupId: true,
      date: true,
      amount: true,
      beneficiary: true,
      accountId: true,
      categoryId: true,
      estateId: true,
    },
    orderBy: { date: "asc" },
  });

  // Mappa estateId → name per riscrivere i beneficiary delle ricorrenze
  // collegate a un immobile (es. "Affitto Dicembre 2026" → "Affitto Casa Roma").
  // L'utente labelliza le tx storiche col mese; come label di gruppo serve un
  // nome stabile.
  const estates = await prisma.realEstate.findMany({ select: { id: true, name: true } });
  const estateNameById = new Map(estates.map((e) => [e.id, e.name]));

  // Group by recurrenceGroupId
  const byGroup = new Map<string, typeof txs>();
  for (const t of txs) {
    if (!t.recurrenceGroupId) continue;
    const arr = byGroup.get(t.recurrenceGroupId) ?? [];
    arr.push(t);
    byGroup.set(t.recurrenceGroupId, arr);
  }

  const now = new Date();
  const limit = new Date();
  limit.setDate(limit.getDate() + 45);

  type Status = "expired" | "expiring" | "active";
  const groups: Array<{
    groupId: string;
    status: Status;
    beneficiary: string | null;
    occurrences: number;
    medianAmount: number;
    medianDays: number;
    firstDate: string;
    lastDate: string;
    daysUntilLast: number;
    /** Prima occorrenza con data ≥ oggi (null se tutte sono passate). */
    nextDate: string | null;
  }> = [];

  for (const [groupId, items] of byGroup) {
    if (items.length < 2) continue;
    const last = items[items.length - 1];
    const first = items[0];
    const next = items.find((t) => t.date >= now) ?? null;
    // Se tutte le tx del gruppo sono collegate allo stesso immobile, usa
    // "Affitto {nome immobile}" come label canonica invece del beneficiary
    // dell'ultima tx (che spesso include il mese, "Affitto Dicembre 2026").
    const estateIds = new Set(items.map((t) => t.estateId).filter((x): x is string => !!x));
    const sharedEstateName =
      estateIds.size === 1 && items.every((t) => t.estateId === [...estateIds][0])
        ? estateNameById.get([...estateIds][0])
        : null;
    const direction = last.amount > 0 ? "Affitto da" : "Affitto";
    const label = sharedEstateName ? `${direction} ${sharedEstateName}` : last.beneficiary;
    const amounts = items.map((i) => i.amount).sort((a, b) => a - b);
    const medianAmount = amounts[Math.floor(amounts.length / 2)];
    const intervals: number[] = [];
    for (let i = 1; i < items.length; i++) {
      intervals.push(
        (items[i].date.getTime() - items[i - 1].date.getTime()) / 86400000,
      );
    }
    intervals.sort((a, b) => a - b);
    const medianDays = intervals[Math.floor(intervals.length / 2)];
    const daysUntilLast = (last.date.getTime() - now.getTime()) / 86400000;
    let status: Status = "active";
    if (last.date < now) status = "expired";
    else if (last.date < limit) status = "expiring";
    groups.push({
      groupId,
      status,
      beneficiary: label,
      occurrences: items.length,
      medianAmount,
      medianDays,
      firstDate: first.date.toISOString(),
      lastDate: last.date.toISOString(),
      daysUntilLast: Math.round(daysUntilLast),
      nextDate: next ? next.date.toISOString() : null,
    });
  }
  groups.sort((a, b) => a.daysUntilLast - b.daysUntilLast);
  return NextResponse.json({ groups });
}
