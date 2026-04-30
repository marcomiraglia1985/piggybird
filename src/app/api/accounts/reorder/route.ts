import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const runtime = "nodejs";

const Schema = z.object({ ids: z.array(z.string()).min(1) });

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "ids mancanti" }, { status: 400 });
  }
  await prisma.$transaction(
    parsed.data.ids.map((id, i) =>
      prisma.account.update({ where: { id }, data: { displayOrder: i + 1 } }),
    ),
  );
  return NextResponse.json({ ok: true });
}
