import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const runtime = "nodejs";

/**
 * Batch rename: tutte le tx con beneficiary in `from` ricevono `to`.
 * Usato dalla pagina /movimenti/beneficiari per consolidare varianti.
 *
 * Safety:
 *   - cap 5000 tx per call
 *   - non tocca altri campi (categoryId, amount, ecc.)
 */
const Schema = z.object({
  from: z.array(z.string()).min(1).max(50),
  to: z.string().min(1).max(200),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dati non validi" },
      { status: 400 },
    );
  }
  const { from, to } = parsed.data;

  // Conta prima per safety check
  const affected = await prisma.transaction.count({
    where: { beneficiary: { in: from } },
  });
  if (affected > 5000) {
    return NextResponse.json(
      { error: `Troppe tx (${affected} > 5000), spezza in più rename` },
      { status: 400 },
    );
  }

  const result = await prisma.transaction.updateMany({
    where: { beneficiary: { in: from } },
    data: { beneficiary: to },
  });

  return NextResponse.json({ updated: result.count });
}
