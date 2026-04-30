import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Lista banche aggiunte dinamicamente via universal parser AI fallback.
 * Mostrate nei chip "banche supportate" della pagina /import accanto ai
 * parser deterministici hardcoded.
 */
export async function GET() {
  const templates = await prisma.parserTemplate.findMany({
    where: { bankName: { not: null } },
    select: { bankName: true, usageCount: true, createdAt: true },
    orderBy: { usageCount: "desc" },
  });
  // Dedupe per nome banca (se più signature mappano alla stessa banca)
  const seen = new Set<string>();
  const banks = templates
    .filter((t) => {
      const key = t.bankName!.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((t) => ({
      name: t.bankName!,
      usageCount: t.usageCount,
      addedAt: t.createdAt.toISOString(),
    }));
  return NextResponse.json({ banks });
}
