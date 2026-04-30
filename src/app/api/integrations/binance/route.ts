import { NextRequest, NextResponse } from "next/server";
import { saveCredential, getCredentialStatus, deleteCredential } from "@/lib/credentials";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET() {
  const status = await getCredentialStatus("binance");
  return NextResponse.json({ connected: !!status, status });
}

const PostSchema = z.object({
  apiKey: z.string().trim().min(10, "API Key troppo corta (min 10 caratteri)"),
  apiSecret: z.string().trim().min(10, "API Secret troppo corto (min 10 caratteri)"),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload JSON non valido" }, { status: 400 });
  }
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => i.message).join(", ");
    return NextResponse.json({ error: issues || "Credenziali non valide" }, { status: 400 });
  }
  await saveCredential("binance", parsed.data.apiKey, parsed.data.apiSecret);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await deleteCredential("binance");
  return NextResponse.json({ ok: true });
}
