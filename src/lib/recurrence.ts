import { prisma } from "@/lib/prisma";

type Frequency = "monthly" | "weekly" | "yearly";

function advance(base: Date, step: number, freq: Frequency): Date {
  if (freq === "weekly") {
    const d = new Date(base);
    d.setDate(d.getDate() + 7 * step);
    return d;
  }
  if (freq === "yearly") {
    const d = new Date(base);
    d.setFullYear(d.getFullYear() + step);
    return d;
  }
  const targetMonth = base.getMonth() + step;
  const targetYear = base.getFullYear() + Math.floor(targetMonth / 12);
  const targetMonthNorm = ((targetMonth % 12) + 12) % 12;
  const lastDayOfTarget = new Date(targetYear, targetMonthNorm + 1, 0).getDate();
  const day = Math.min(base.getDate(), lastDayOfTarget);
  return new Date(
    targetYear,
    targetMonthNorm,
    day,
    base.getHours(),
    base.getMinutes(),
    base.getSeconds(),
  );
}

export type ExtendResult =
  | { ok: true; created: number; frequency: Frequency; medianAmount: number; from: string; to: string }
  | { ok: false; error: string };

/**
 * Genera occorrenze future (confirmed=false) per il gruppo di ricorrenza,
 * partendo dall'ultima tx del gruppo. Skippa se ci sono già abbastanza
 * occorrenze future entro l'orizzonte richiesto.
 */
export async function extendRecurrence(groupId: string, months = 12): Promise<ExtendResult> {
  const txs = await prisma.transaction.findMany({
    where: { recurrenceGroupId: groupId },
    orderBy: { date: "asc" },
  });
  if (txs.length < 2) return { ok: false, error: "Pattern non riconoscibile (servono ≥2 occorrenze)" };

  const last = txs[txs.length - 1];

  // Frequenza dalla mediana degli intervalli (in giorni).
  const intervals: number[] = [];
  for (let i = 1; i < txs.length; i++) {
    intervals.push((txs[i].date.getTime() - txs[i - 1].date.getTime()) / 86400000);
  }
  intervals.sort((a, b) => a - b);
  const medianInterval = intervals[Math.floor(intervals.length / 2)];

  let frequency: Frequency = "monthly";
  if (medianInterval >= 6 && medianInterval <= 8) frequency = "weekly";
  else if (medianInterval >= 27 && medianInterval <= 33) frequency = "monthly";
  else if (medianInterval >= 358 && medianInterval <= 372) frequency = "yearly";

  const amounts = txs.map((t) => t.amount).sort((a, b) => a - b);
  const medianAmount = amounts[Math.floor(amounts.length / 2)];

  let count = months;
  if (frequency === "weekly") count = Math.round(months * 4.345);
  if (frequency === "yearly") count = Math.max(1, Math.floor(months / 12));

  // Set delle date già esistenti nel gruppo (chiave YYYY-MM-DD locale): serve a
  // evitare che extend sovrapponga occorrenze a tx che l'utente ha già creato
  // a mano o importato da CSV con `confirmsRecurrence`.
  const dayKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const existingDays = new Set(txs.map((t) => dayKey(t.date)));

  const created: Date[] = [];
  let skipped = 0;
  for (let i = 1; i <= count; i++) {
    const d = advance(last.date, i, frequency);
    if (existingDays.has(dayKey(d))) {
      skipped++;
      continue;
    }
    existingDays.add(dayKey(d));
    created.push(d);
    await prisma.transaction.create({
      data: {
        date: d,
        amount: medianAmount,
        accountId: last.accountId,
        categoryId: last.categoryId,
        beneficiary: last.beneficiary,
        notes: last.notes,
        isJoint: last.isJoint,
        confirmed: false,
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        recurrenceGroupId: groupId,
        estateId: last.estateId,
      },
    });
  }

  return {
    ok: true,
    created: created.length,
    frequency,
    medianAmount,
    from: last.date.toISOString(),
    to: created.length > 0 ? created[created.length - 1].toISOString() : last.date.toISOString(),
  };
}
