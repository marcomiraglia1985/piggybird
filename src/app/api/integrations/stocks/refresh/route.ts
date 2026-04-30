import { NextResponse } from "next/server";
import { refreshAllStockPrices } from "@/lib/stocks-sync";

export const runtime = "nodejs";

export async function POST() {
  try {
    const platform = "Revolut";
    const updates = await refreshAllStockPrices(platform);
    return NextResponse.json({ updates });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Errore" },
      { status: 500 },
    );
  }
}
