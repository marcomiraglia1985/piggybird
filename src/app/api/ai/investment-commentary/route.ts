import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildPortfolioInput } from "@/lib/insights/portfolio-detector";
import {
  generateInvestmentCommentary,
  type InvestmentCommentary,
} from "@/lib/ai/investment-commentary";

export const runtime = "nodejs";

const SETTING_KEY = "investments.commentary";

/**
 * Investment Commentary on-demand. GET ritorna l'ultima generata. POST forza
 * nuova generazione (sostituisce il cached). Niente trigger automatici —
 * manuale al click "Aggiorna analisi".
 */
export async function GET() {
  const setting = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
  if (!setting) {
    return NextResponse.json({ commentary: null });
  }
  try {
    const commentary = JSON.parse(setting.value) as InvestmentCommentary;
    return NextResponse.json({ commentary });
  } catch {
    return NextResponse.json({ commentary: null });
  }
}

export async function POST() {
  try {
    const input = await buildPortfolioInput();
    if (!input) {
      return NextResponse.json(
        { error: "Nessun dato di investimento sufficiente per l'analisi." },
        { status: 400 },
      );
    }
    const result = await generateInvestmentCommentary(input);
    await prisma.setting.upsert({
      where: { key: SETTING_KEY },
      create: { key: SETTING_KEY, value: JSON.stringify(result.commentary) },
      update: { value: JSON.stringify(result.commentary) },
    });
    return NextResponse.json({
      commentary: result.commentary,
      cost: result.costEur,
      tokens: result.inputTokens + result.outputTokens,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore generazione analisi";
    const status = msg.includes("Nessuna API key") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
