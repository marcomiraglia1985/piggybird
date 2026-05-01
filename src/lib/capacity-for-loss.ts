import { prisma } from "./prisma";
import { getCurrentNetWorth } from "./queries/networth";
import { getUserProfile } from "./user-profile";
import type { UserProfile } from "./profile-options";

/**
 * Capacity-for-Loss — Layer 3.5 del personality model (computed, no Q).
 *
 * Concetto regolatorio MiFID II: distingue *willingness* (psicologica, dal
 * personality test → behavioral.lossAversion) da *ability* (finanziaria, qui).
 * ESMA Guidelines on Suitability lo richiedono esplicitamente.
 *
 * Definizione: euros che l'utente può perdere senza impattare lo stile di
 * vita / obblighi. Calcolato come `NetWorth - safetyReserve`, dove safety
 * reserve è N mesi di spesa essenziale, con N che cresce con dipendenti /
 * mutuo / freelance.
 *
 * Stima del monthly burn:
 *   - Preferito: income proxy (`monthlyIncome` × ASSUMED_EXPENSE_RATIO).
 *     Più stabile della tx-based (vedi memo `feedback_cashflow_widgets`:
 *     savings rate / FIRE non affidabili da tx perché capex + categorie
 *     miste rumorose).
 *   - Fallback: media tx ultimi 90 giorni (negative, no transfer, confirmed).
 *
 * Output usato come input AI advisor (STEP 4) per non proporre asset volatili
 * a chi non li può assorbire.
 */

export type CapacityForLoss = {
  netWorth: number;
  /** Euros di safety reserve raccomandata (N mesi × monthly burn) */
  safetyReserve: number;
  /** Mesi di reserve target, basato su familyStatus / children / mortgage / profession */
  monthsReserveTarget: number;
  /** Spesa mensile stimata. null se né income né tx disponibili */
  monthlyBurn: number | null;
  burnSource: "income-proxy" | "tx-90d" | null;
  /** Euros oltre la safety reserve — quota che può essere persa senza danno */
  excessAboveReserve: number;
  /** % del NW totale che eccede la safety reserve (≈ capacity for loss qualitativa) */
  capacityPctOfNW: number;
  level: "low" | "moderate" | "high" | "unknown";
};

const INCOME_MIDPOINTS: Record<string, number> = {
  "<2k": 1500,
  "2-3k": 2500,
  "3-5k": 4000,
  "5-8k": 6500,
  "8-12k": 10000,
  "12k+": 15000,
};

const CHILDREN_NUM: Record<string, number> = {
  "0": 0,
  "1": 1,
  "2": 2,
  "3+": 3,
};

/** % di income tipicamente spesa. 0.7 = utente medio spende 70% del lordo. */
const ASSUMED_EXPENSE_RATIO = 0.7;

function computeMonthsReserveTarget(profile: UserProfile): number {
  let months = 3;
  if (profile.familyStatus === "couple") months += 1;
  if (profile.familyStatus === "family") months += 3;
  months += CHILDREN_NUM[profile.childrenCount] ?? 0;
  if (profile.housingType === "own-mortgage") months += 1;
  if (
    profile.profession === "freelance" ||
    profile.profession === "entrepreneur"
  ) {
    months += 2;
  }
  return Math.min(12, months);
}

async function computeTxBasedMonthlyBurn(): Promise<number | null> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const txs = await prisma.transaction.findMany({
    where: {
      date: { gte: cutoff },
      amount: { lt: 0 },
      transferGroupId: null,
      confirmed: true,
    },
    select: { amount: true },
  });
  if (txs.length === 0) return null;
  const total = txs.reduce((s, t) => s + Math.abs(t.amount), 0);
  return total / 3;
}

export async function computeCapacityForLoss(): Promise<CapacityForLoss> {
  const [profile, nw] = await Promise.all([
    getUserProfile(),
    getCurrentNetWorth(),
  ]);
  const monthsReserveTarget = computeMonthsReserveTarget(profile);

  const incomeMidpoint = INCOME_MIDPOINTS[profile.monthlyIncome];
  let monthlyBurn: number | null = null;
  let burnSource: "income-proxy" | "tx-90d" | null = null;
  if (incomeMidpoint != null) {
    monthlyBurn = incomeMidpoint * ASSUMED_EXPENSE_RATIO;
    burnSource = "income-proxy";
  } else {
    monthlyBurn = await computeTxBasedMonthlyBurn();
    if (monthlyBurn != null) burnSource = "tx-90d";
  }

  if (monthlyBurn == null || nw.total <= 0) {
    return {
      netWorth: nw.total,
      safetyReserve: 0,
      monthsReserveTarget,
      monthlyBurn,
      burnSource,
      excessAboveReserve: 0,
      capacityPctOfNW: 0,
      level: "unknown",
    };
  }

  const safetyReserve = monthsReserveTarget * monthlyBurn;
  const excessAboveReserve = Math.max(0, nw.total - safetyReserve);
  const capacityPctOfNW = (excessAboveReserve / nw.total) * 100;

  let level: CapacityForLoss["level"];
  if (capacityPctOfNW >= 60) level = "high";
  else if (capacityPctOfNW >= 25) level = "moderate";
  else level = "low";

  return {
    netWorth: nw.total,
    safetyReserve,
    monthsReserveTarget,
    monthlyBurn,
    burnSource,
    excessAboveReserve,
    capacityPctOfNW,
    level,
  };
}
