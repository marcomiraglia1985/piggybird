import { prisma } from "@/lib/prisma";
import { CreditiClient } from "@/components/crediti/crediti-client";

export const dynamic = "force-dynamic";

export default async function CreditiPage() {
  const credits = await prisma.credit.findMany({
    orderBy: [{ status: "asc" }, { displayOrder: "asc" }, { createdAt: "asc" }],
  });
  const serialized = credits.map((c) => ({
    ...c,
    date: c.date?.toISOString() ?? null,
    expectedReturn: c.expectedReturn?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }));
  return <CreditiClient credits={serialized} />;
}
