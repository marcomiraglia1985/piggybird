import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * DELETE /api/transactions/recurrence/[groupId]?from=YYYY-MM-DD
 *
 * Cancella tutte le occorrenze di una ricorrenza con data >= `from`.
 * Default `from` = oggi (così non si toccano le rate già contabilizzate).
 * Se `from=all` cancella tutte le occorrenze del gruppo.
 */
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ groupId: string }> },
) {
  const { groupId } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const fromParam = searchParams.get("from");

  let where: { recurrenceGroupId: string; date?: { gte: Date } } = {
    recurrenceGroupId: groupId,
  };

  if (fromParam !== "all") {
    let fromDate: Date;
    if (fromParam) {
      fromDate = new Date(fromParam);
      if (!isFinite(fromDate.getTime())) {
        return NextResponse.json({ error: "Data non valida" }, { status: 400 });
      }
    } else {
      fromDate = new Date();
      fromDate.setHours(0, 0, 0, 0);
    }
    where = { ...where, date: { gte: fromDate } };
  }

  const result = await prisma.transaction.deleteMany({ where });
  return NextResponse.json({ deleted: result.count, recurrenceGroupId: groupId });
}
