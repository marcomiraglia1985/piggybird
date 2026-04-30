import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { extendRecurrence } from "@/lib/recurrence";

export const runtime = "nodejs";

const Schema = z.object({
  months: z.number().int().positive().max(60).default(12),
});

/**
 * POST /api/transactions/recurrence-extend-all
 *
 * Estende automaticamente tutti i gruppi di ricorrenza che NON hanno
 * occorrenze future (cioè la cui ultima tx è già passata). Utile per
 * riparare gruppi marcati prima dell'auto-extend o scaduti da tempo.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }
  const { months } = parsed.data;

  const now = new Date();
  // Trova tutti i gruppi con almeno 2 tx e nessuna tx con date >= now
  const allGroups = await prisma.transaction.groupBy({
    by: ["recurrenceGroupId"],
    where: { recurrenceGroupId: { not: null } },
    _count: { _all: true },
    _max: { date: true },
  });

  const candidates = allGroups
    .filter((g) => g.recurrenceGroupId && g._count._all >= 2)
    .filter((g) => g._max.date && g._max.date < now)
    .map((g) => g.recurrenceGroupId as string);

  const results: Array<{
    groupId: string;
    ok: boolean;
    created?: number;
    error?: string;
  }> = [];

  for (const groupId of candidates) {
    const r = await extendRecurrence(groupId, months);
    if (r.ok) {
      results.push({ groupId, ok: true, created: r.created });
    } else {
      results.push({ groupId, ok: false, error: r.error });
    }
  }

  const totalCreated = results.reduce((s, r) => s + (r.created ?? 0), 0);
  const okGroups = results.filter((r) => r.ok).length;

  return NextResponse.json({
    candidatesScanned: candidates.length,
    extended: okGroups,
    skipped: results.length - okGroups,
    totalCreated,
    results,
  });
}
