import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Riepilogo utilizzo AI lifetime: totali aggregati + breakdown per feature.
 */
export async function GET() {
  const [lifetimeAgg, byFeatureRaw] = await Promise.all([
    prisma.aIUsage.aggregate({
      _sum: { inputTokens: true, outputTokens: true, costEur: true },
      _count: true,
    }),
    prisma.aIUsage.groupBy({
      by: ["feature"],
      _sum: { costEur: true, inputTokens: true, outputTokens: true },
      _count: true,
      orderBy: { _sum: { costEur: "desc" } },
      take: 5,
    }),
  ]);

  return NextResponse.json({
    lifetime: {
      calls: lifetimeAgg._count ?? 0,
      inputTokens: lifetimeAgg._sum.inputTokens ?? 0,
      outputTokens: lifetimeAgg._sum.outputTokens ?? 0,
      costEur: lifetimeAgg._sum.costEur ?? 0,
    },
    byFeature: byFeatureRaw.map((f) => ({
      feature: f.feature,
      calls: f._count,
      inputTokens: f._sum.inputTokens ?? 0,
      outputTokens: f._sum.outputTokens ?? 0,
      costEur: f._sum.costEur ?? 0,
    })),
  });
}
