import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const runtime = "nodejs";

/**
 * Setting che è OK esporre via /api/settings GET (UI generica, telemetry,
 * tutorial state, preferences). Tutto il resto va letto via endpoint dedicato
 * per rispettare il principle of least exposure (es. personality test passa
 * per /api/personality, AI insights cache per /api/ai/* ognuno con la sua
 * logica di stale/cache).
 */
const PUBLIC_KEY_PREFIXES = [
  "telemetry.",
  "tutorial.",
  "ui.",
  "system.",
  "user.", // profile fields (no PII heavy beyond email/name che user inserisce)
  "preferences.",
  "widget.",
  "dashboard.",
  "import.",
  "fp-", // fp-dashboard-*, fp-beneficiaries-*, ecc — UI prefs locali
  "pf-notify-", // toggle notifica + dismissal Piggybird Finance
  "csv.",
  "stockTrades.",
  "templates.",
  "balance.", // tracking timestamps
];
const PUBLIC_KEY_EXACT = new Set<string>([
  "onboarding.completed",
  "backupAuto",
  "backupLastRun",
]);

function isPublicSettingKey(key: string): boolean {
  if (PUBLIC_KEY_EXACT.has(key)) return true;
  return PUBLIC_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export async function GET() {
  const rows = await prisma.setting.findMany();
  const settings: Record<string, string> = {};
  for (const r of rows) {
    if (isPublicSettingKey(r.key)) settings[r.key] = r.value;
  }
  return NextResponse.json({ settings });
}

const PostSchema = z.object({
  key: z.string().trim().min(1),
  value: z.string(),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dati non validi" }, { status: 400 });
  }
  const { key, value } = parsed.data;
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
  return NextResponse.json({ ok: true });
}
