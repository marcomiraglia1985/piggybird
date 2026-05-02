import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Master key backup/restore.
 *
 * Privacy: la master key cifra le API credentials (Anthropic, Binance, ecc.)
 * salvate in DB. Se l'utente perde il DB, le credenziali API sono illegibili.
 * Questo endpoint permette di:
 *   - GET: esportare la chiave per salvarla in password manager
 *   - POST: importare una chiave da backup (sovrascrive l'esistente)
 *
 * Sicurezza: l'app è local-only (Tauri sidecar su localhost). Chi accede
 * alla porta 13371 ha già pieno accesso al filesystem dell'utente — nessuna
 * autenticazione aggiuntiva necessaria oltre il fatto che l'app gira sulla
 * macchina dell'utente.
 */

const MASTER_KEY_SETTING = "system.masterKey";

export async function GET() {
  const setting = await prisma.setting.findUnique({
    where: { key: MASTER_KEY_SETTING },
  });
  if (!setting?.value) {
    return NextResponse.json(
      { error: "Master key non trovata. Riavvia l'app per generarla." },
      { status: 404 },
    );
  }
  return NextResponse.json({ key: setting.value });
}

const PostSchema = z.object({
  key: z.string().regex(/^[0-9a-f]{64}$/, "Chiave deve essere 64 caratteri hex"),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Chiave invalida" },
      { status: 400 },
    );
  }
  await prisma.setting.upsert({
    where: { key: MASTER_KEY_SETTING },
    create: { key: MASTER_KEY_SETTING, value: parsed.data.key },
    update: { value: parsed.data.key },
  });
  // Aggiorna anche env var per il process corrente (no riavvio richiesto
  // per le call AI immediatamente successive)
  process.env.APP_MASTER_KEY = parsed.data.key;
  return NextResponse.json({ ok: true });
}
