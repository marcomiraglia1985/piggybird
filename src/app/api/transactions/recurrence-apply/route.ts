import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { extendRecurrence } from "@/lib/recurrence";

export const runtime = "nodejs";

const ApplySchema = z.object({
  txIds: z.array(z.string()).min(2),
  // Quando true (default) genera anche le occorrenze future per popolare
  // subito il cashflow futuro. L'utente non deve cliccare "Estendi" a mano.
  extendMonths: z.number().int().positive().max(60).default(12),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = ApplySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "ids mancanti" }, { status: 400 });
  }
  const groupId = `rec_auto_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const r = await prisma.transaction.updateMany({
    where: { id: { in: parsed.data.txIds }, recurrenceGroupId: null },
    data: { recurrenceGroupId: groupId },
  });

  const ext = await extendRecurrence(groupId, parsed.data.extendMonths);
  return NextResponse.json({
    updated: r.count,
    recurrenceGroupId: groupId,
    extended: ext.ok ? ext.created : 0,
    extendError: ext.ok ? undefined : ext.error,
  });
}
