import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Riepilogo eventi importati raggruppati per platform.
 */
export async function GET() {
  const grouped = await prisma.stockTrade.groupBy({
    by: ["platform"],
    _count: true,
  });
  return NextResponse.json({
    byPlatform: grouped.map((g) => ({
      platform: g.platform,
      count: g._count,
    })),
  });
}
