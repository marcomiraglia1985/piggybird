/**
 * Stato del valore stimato di un immobile.
 *
 *   value:       valore effettivo da usare (currentValue se presente,
 *                altrimenti fallback su purchasePrice)
 *   isFallback:  true se stiamo usando purchasePrice perché currentValue
 *                non è settato → mostra etichetta "stimato dal prezzo
 *                d'acquisto"
 *   needsAlert:  true se il dato è obsoleto (>5 anni dall'ultima conferma
 *                o non è mai stato impostato un valore attuale)
 */
const FIVE_YEARS_MS = 5 * 365 * 86_400 * 1000;

type EstateValueInput = {
  currentValue: number | null;
  currentValueUpdatedAt: Date | string | null;
  purchasePrice: number | null;
  purchaseDate: Date | string | null;
};

export type EstateValueStatus = {
  value: number;
  isFallback: boolean;
  needsAlert: boolean;
  /** Età in giorni del dato corrente. null se non si può calcolare. */
  ageDays: number | null;
};

function toDate(d: Date | string | null): Date | null {
  if (!d) return null;
  return d instanceof Date ? d : new Date(d);
}

export function estateValueStatus(e: EstateValueInput): EstateValueStatus {
  const now = Date.now();
  const updatedAt = toDate(e.currentValueUpdatedAt);
  const purchase = toDate(e.purchaseDate);

  if (e.currentValue == null) {
    // Fallback al prezzo d'acquisto. Età = età dell'acquisto.
    const ageDays = purchase ? Math.floor((now - purchase.getTime()) / 86_400_000) : null;
    const value = e.purchasePrice ?? 0;
    const needsAlert =
      e.purchasePrice == null ||
      (purchase != null && now - purchase.getTime() > FIVE_YEARS_MS) ||
      purchase == null;
    return { value, isFallback: true, needsAlert, ageDays };
  }

  // currentValue presente. Età dall'ultimo aggiornamento (o dal purchase se
  // updatedAt non era ancora settato in passato — pre-feature).
  const reference = updatedAt ?? purchase;
  const ageDays = reference ? Math.floor((now - reference.getTime()) / 86_400_000) : null;
  const needsAlert = reference == null || now - reference.getTime() > FIVE_YEARS_MS;
  return { value: e.currentValue, isFallback: false, needsAlert, ageDays };
}
