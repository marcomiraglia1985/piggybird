import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getFreezeState,
  setFreezeState,
  snapshotAndFreeze,
} from "@/lib/account-freeze";

export const runtime = "nodejs";

const Schema = z.object({
  frozen: z.boolean(),
});

/**
 * POST /api/accounts/freeze
 * Body: { frozen: boolean }
 *
 * - frozen=true → snapshot dei saldi live correnti come currentBalance,
 *   imposta frozenAt=now. Da quel momento i saldi mostrati sono quelli
 *   manuali, le tx non li toccano fino al prossimo unfreeze.
 * - frozen=false → sblocca: i saldi diventano "live" (currentBalance +
 *   tx confermate dopo frozenAt). frozenAt viene impostato a now così
 *   ricomincia il conteggio da ora in poi.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }
  const { frozen: nextFrozen } = parsed.data;
  const { frozen: currentFrozen } = await getFreezeState();

  if (nextFrozen === currentFrozen) {
    return NextResponse.json({ ok: true, unchanged: true, frozen: currentFrozen });
  }

  const now = new Date();
  if (nextFrozen) {
    // Stiamo congelando: snapshot dei saldi live → currentBalance
    await snapshotAndFreeze(now);
  } else {
    // Stiamo scongelando: imposta frozenAt=now per partire fresco con tx future
    await setFreezeState(false, now);
  }
  return NextResponse.json({ ok: true, frozen: nextFrozen });
}

export async function GET() {
  const state = await getFreezeState();
  return NextResponse.json(state);
}
