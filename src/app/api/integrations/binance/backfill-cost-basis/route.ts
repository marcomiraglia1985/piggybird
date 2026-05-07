import { NextResponse } from "next/server";
import { backfillBinanceCostBasis } from "@/lib/binance-cost-basis";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST() {
  try {
    const result = await backfillBinanceCostBasis();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Errore backfill" },
      { status: 500 },
    );
  }
}
