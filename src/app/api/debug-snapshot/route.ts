import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { submitDebugSnapshot } from "@/lib/snapshot";

export const runtime = "nodejs";
// Snapshot upload può richiedere tempo (legge DB + gzip + 2 chiamate GitHub).
export const maxDuration = 60;

const PostSchema = z.object({
  message: z.string().trim().max(4000).default(""),
});

export async function POST(req: NextRequest) {
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {}
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dati non validi" },
      { status: 400 },
    );
  }
  try {
    const result = await submitDebugSnapshot({ userMessage: parsed.data.message });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore sconosciuto";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
