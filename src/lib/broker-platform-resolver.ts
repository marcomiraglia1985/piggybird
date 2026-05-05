import { prisma } from "./prisma";

/**
 * Risolve il nome canonico del conto trading associato a un broker noto.
 *
 * Principio universal-app: il nome che l'utente ha scelto in /conti per il
 * suo account deve essere usato OVUNQUE nell'app (widget, dashboard, label).
 * Ogni hardcoded "Revolut" / "Binance" creava confusione perché l'utente
 * vedeva "Revolut" nelle settings investment ma "Revolut Trading" altrove.
 *
 * Strategia di lookup (in ordine):
 *   1. Match per `Account.provider` (set esplicitamente al create/edit)
 *   2. Heuristic per Revolut Trading (no provider dedicato, match per nome)
 *   3. Fallback al label canonico del broker (per utenti che non hanno
 *      ancora creato il conto investimento)
 */
export type BrokerKey = "binance" | "revolut-x" | "revolut-stocks";

const BROKER_FALLBACKS: Record<BrokerKey, string> = {
  binance: "Binance",
  "revolut-x": "Revolut X",
  "revolut-stocks": "Revolut",
};

export async function getBrokerPlatformName(broker: BrokerKey): Promise<string> {
  if (broker === "binance" || broker === "revolut-x") {
    const acc = await prisma.account.findFirst({
      where: { active: true, provider: broker, type: "investment" },
      orderBy: { displayOrder: "asc" },
      select: { name: true },
    });
    if (acc?.name) return acc.name;
  } else {
    // Revolut Trading: nessun provider dedicato — heuristic su nome.
    const candidates = await prisma.account.findMany({
      where: { active: true, type: "investment" },
      orderBy: { displayOrder: "asc" },
      select: { name: true },
    });
    const match = candidates.find(
      (a) =>
        /revolut/i.test(a.name) &&
        !/\bX\b/i.test(a.name) && // esclude "Revolut X"
        !/crypto/i.test(a.name),
    );
    if (match?.name) return match.name;
  }
  return BROKER_FALLBACKS[broker];
}
