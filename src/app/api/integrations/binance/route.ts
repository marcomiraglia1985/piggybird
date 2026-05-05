import { NextRequest, NextResponse } from "next/server";
import { saveCredential, getCredentialStatus, deleteCredential } from "@/lib/credentials";
import { ensureMasterKey } from "@/lib/crypto";
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
  // Defense-in-depth: garantisce che APP_MASTER_KEY sia disponibile.
  // L'instrumentation hook dovrebbe averlo fatto al boot, ma se il primo
  // tentativo era fallito (es. DB non ancora migrato) lo riproviamo qui.
  try {
    await ensureMasterKey();
  } catch (e) {
    console.error("[binance/credential] ensureMasterKey failed:", e);
    return NextResponse.json(
      {
        error:
          "Master key non disponibile. Riavvia l'app: la chiave viene generata al primo boot.",
      },
      { status: 500 },
    );
  }
  try {
    await saveCredential("binance", parsed.data.apiKey, parsed.data.apiSecret);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[binance/credential] saveCredential failed:", e);
    const msg = e instanceof Error ? e.message : "Errore salvataggio credenziali";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE() {
  await deleteCredential("binance");
  return NextResponse.json({ ok: true });
}
