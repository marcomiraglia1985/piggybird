import { NextResponse } from "next/server";
import { invalidateInvestmentsHistoryCache } from "@/lib/investments-history";

export const runtime = "nodejs";

/**
 * Invalida la cache della history /investimenti. Chiamato dal sync button
 * dopo aver aggiornato prezzi/posizioni — al prossimo accesso a /investimenti
 * il chart verrà ricalcolato (e poi cached di nuovo).
 *
 * In condizioni normali la cache si auto-invalida via signature hash quando
 * cambia un trade/position. Questo endpoint è per il caso in cui i dati di
 * input non sono cambiati ma vogliamo forzare un refresh (es. retry dopo
 * error temporaneo, debugging).
 */
export async function POST() {
  await invalidateInvestmentsHistoryCache();
  return NextResponse.json({ ok: true });
}
