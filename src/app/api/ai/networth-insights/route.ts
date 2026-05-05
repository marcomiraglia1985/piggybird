import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildIssueInput } from "@/lib/insights/detector";
import {
  generateMonthlyIssue,
  type GeneratedIssue,
} from "@/lib/ai/networth-insights";
import { monthKey, NOTIFY_SETTING_KEY } from "@/lib/piggybird-finance";

export const runtime = "nodejs";

/**
 * "Piggybird Finance" — editoriale mensile AI.
 *
 * Cache: chiave Setting `insights.networth.YYYY-MM`. Una sola generazione
 * al mese: il bottone "Apri il numero" scompare dopo il primo click finché
 * non cambia il mese.
 *
 * Costo: ~€0,01 per numero con Sonnet → €0,12/anno per utente. Trascurabile.
 */

export async function GET() {
  const key = monthKey();
  const [setting, notifySetting] = await Promise.all([
    prisma.setting.findUnique({ where: { key } }),
    prisma.setting.findUnique({ where: { key: NOTIFY_SETTING_KEY } }),
  ]);
  const notifyEnabled = notifySetting?.value === "true";
  if (!setting) {
    return NextResponse.json({ issue: null, key, notifyEnabled });
  }
  try {
    const issue = JSON.parse(setting.value) as GeneratedIssue;
    return NextResponse.json({ issue, key, notifyEnabled });
  } catch {
    return NextResponse.json({ issue: null, key, notifyEnabled });
  }
}


export async function POST() {
  try {
    const input = await buildIssueInput();
    if (!input) {
      return NextResponse.json(
        {
          error:
            "Servono almeno 2 mesi di NetWorthSnapshot per pubblicare un numero.",
        },
        { status: 400 },
      );
    }
    const result = await generateMonthlyIssue(input);
    const key = monthKey();
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: JSON.stringify(result.issue) },
      update: { value: JSON.stringify(result.issue) },
    });
    return NextResponse.json({
      issue: result.issue,
      key,
      monthLabel: input.monthLabel,
      cost: result.costEur,
      tokens: result.inputTokens + result.outputTokens,
      debug: input,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore generazione numero";
    const status = msg.includes("Nessuna API key") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
