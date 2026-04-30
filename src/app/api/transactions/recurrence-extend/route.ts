import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { extendRecurrence } from "@/lib/recurrence";

export const runtime = "nodejs";

const Schema = z.object({
  groupId: z.string(),
  months: z.number().int().positive().max(60).default(12),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dati non validi" }, { status: 400 });
  }
  const { groupId, months } = parsed.data;
  const result = await extendRecurrence(groupId, months);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
