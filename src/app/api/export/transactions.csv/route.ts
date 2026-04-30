import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function csvEscape(s: string | null | undefined): string {
  if (s == null) return "";
  const str = String(s);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export async function GET() {
  const txs = await prisma.transaction.findMany({
    orderBy: { date: "desc" },
    include: { account: true, category: true },
  });
  const header = [
    "date",
    "amount",
    "currency",
    "account",
    "category",
    "beneficiary",
    "notes",
    "isJoint",
    "confirmed",
    "transferGroupId",
    "recurrenceGroupId",
  ];
  const lines = [header.join(",")];
  for (const t of txs) {
    lines.push(
      [
        t.date.toISOString().slice(0, 10),
        t.amount.toFixed(2),
        t.account.currency,
        csvEscape(t.account.name),
        csvEscape(t.category ? `${t.category.emoji} ${t.category.name}` : ""),
        csvEscape(t.beneficiary),
        csvEscape(t.notes),
        t.isJoint ? "1" : "0",
        t.confirmed ? "1" : "0",
        csvEscape(t.transferGroupId),
        csvEscape(t.recurrenceGroupId),
      ].join(","),
    );
  }
  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="movimenti-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
