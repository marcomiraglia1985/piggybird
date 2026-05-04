import { NextResponse } from "next/server";
import { syncTemplatesFromRegistry } from "@/lib/template-sync";

export const runtime = "nodejs";

/**
 * Trigger manuale di un sync con il registry condiviso (Impostazioni → AI
 * Features → "Sincronizza ora"). Scavalca il throttling, scarica subito i
 * template aggiunti dopo l'ultimo sync.
 */
export async function POST() {
  const inserted = await syncTemplatesFromRegistry(0);
  return NextResponse.json({ ok: true, inserted });
}
