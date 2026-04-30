import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { formatEUR, formatDate } from "@/lib/utils";
import { Building2, MapPin, Calendar, ArrowLeft, TrendingUp, TrendingDown, AlertTriangle, Landmark, ChevronRight } from "lucide-react";
import { EstateDetailActions } from "@/components/estates/estate-detail-actions";
import { RentRecurrenceCard } from "@/components/estates/rent-recurrence-card";
import { estateValueStatus } from "@/lib/estate-value";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  apartment: "Appartamento",
  house: "Casa",
  commercial: "Commerciale",
  land: "Terreno",
  other: "Altro",
};

export default async function EstateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const estate = await prisma.realEstate.findUnique({
    where: { id },
  });
  if (!estate || !estate.active) notFound();

  const transactions = await prisma.transaction.findMany({
    where: {
      OR: [
        { estateId: id },
        { category: { estateId: id } },
      ],
    },
    orderBy: { date: "desc" },
    include: { account: true, category: true },
    take: 200,
  });

  // Operating tx vs capex: la cat con type="investment" (es. Acquisto, Mutuo
  // capitale) è capex. Esclusa dal "Cashflow netto tracciato" perché è un
  // costo strutturale una-tantum che distorcerebbe le statistiche mensili.
  // Resta visibile nella lista movimenti e nel breakdown per categoria.
  const isCapex = (t: (typeof transactions)[number]) =>
    t.category?.type === "investment";
  const operatingTxs = transactions.filter((t) => !isCapex(t));
  const capexTotal = transactions
    .filter((t) => isCapex(t))
    .reduce((s, t) => s + t.amount, 0);
  const totalIn = operatingTxs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalOut = operatingTxs.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);
  const net = totalIn + totalOut;

  // === Affitto: deriva la cifra reale dai movimenti, non dal valore statico ===
  // "Rent tx" = transazione con categoria che contiene "Affitto" (case-insensitive).
  // Per estate "owned" sono entrate (+), per "rented" sono uscite (-).
  const rentTxs = transactions.filter((t) =>
    t.category?.name?.toLowerCase().includes("affitto"),
  );
  const now = new Date();
  const yearAgo = new Date(now);
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const recentConfirmedRent = rentTxs.filter(
    (t) => t.confirmed && t.date.getTime() >= yearAgo.getTime() && t.date.getTime() <= now.getTime(),
  );
  // Mediana degli importi (assoluti) come "actual" rent
  let actualMonthlyRent: number | null = null;
  if (recentConfirmedRent.length > 0) {
    const amounts = recentConfirmedRent
      .map((t) => Math.abs(t.amount))
      .sort((a, b) => a - b);
    actualMonthlyRent = amounts[Math.floor(amounts.length / 2)];
  }
  // Status ricorrenza: una rent tx fa parte di un recurrenceGroup?
  const rentRecurrenceGroupId =
    rentTxs.find((t) => !!t.recurrenceGroupId)?.recurrenceGroupId ?? null;
  const futureRentTxs = rentTxs
    .filter(
      (t) => !!t.recurrenceGroupId && !t.confirmed && t.date.getTime() > now.getTime(),
    )
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const nextRentDate = futureRentTxs[0]?.date ?? null;

  // Candidati: tx confirmate con cat "Affitto" non ancora in ricorrenza.
  // Usate dalla CTA "Marca come ricorrente".
  const rentCandidates = rentTxs
    .filter((t) => t.confirmed && !t.recurrenceGroupId)
    .slice(0, 12)
    .map((t) => ({
      id: t.id,
      date: t.date.toISOString(),
      amount: t.amount,
      beneficiary: t.beneficiary,
      categoryName: t.category?.name ?? null,
      categoryEmoji: t.category?.emoji ?? null,
    }));

  // Per categoria
  const byCategory = new Map<string, { emoji: string; name: string; sum: number; count: number }>();
  for (const t of transactions) {
    if (t.amount >= 0) continue; // solo uscite per breakdown spese
    const k = t.category?.name ?? "—";
    const cur = byCategory.get(k) ?? { emoji: t.category?.emoji ?? "•", name: k, sum: 0, count: 0 };
    cur.sum += t.amount;
    cur.count += 1;
    byCategory.set(k, cur);
  }
  const categoryRows = [...byCategory.values()].sort((a, b) => a.sum - b.sum);

  // === Mutuo: stato pagamenti ===
  // Conta le tx del recurrence group del mutuo per stimare rate
  // confermate vs residue. Skip se il mutuo non è attivo.
  let mortgageStats: {
    paidCount: number;
    totalCount: number;
    nextDueDate: Date | null;
  } | null = null;
  if (estate.mortgageRecurrenceGroupId && estate.mortgageDurationMonths) {
    const mortgageTxs = await prisma.transaction.findMany({
      where: { recurrenceGroupId: estate.mortgageRecurrenceGroupId },
      orderBy: { date: "asc" },
      select: { confirmed: true, date: true },
    });
    const paidCount = mortgageTxs.filter((t) => t.confirmed).length;
    const nextDue =
      mortgageTxs.find((t) => !t.confirmed && t.date.getTime() > Date.now())?.date ?? null;
    mortgageStats = {
      paidCount,
      totalCount: estate.mortgageDurationMonths,
      nextDueDate: nextDue,
    };
  }

  const isRented = estate.holding === "rented";
  const valueStatus = !isRented ? estateValueStatus(estate) : null;
  const purchasePriceProQuota =
    !isRented && estate.purchasePrice
      ? estate.purchasePrice * estate.ownershipShare
      : null;
  const effectiveValueProQuota =
    valueStatus && valueStatus.value > 0
      ? valueStatus.value * estate.ownershipShare
      : null;
  // Il "guadagno" ha senso solo se abbiamo un valore attuale REALE (non
  // fallback dal prezzo di acquisto, che produrrebbe sempre 0).
  const valueGain =
    purchasePriceProQuota != null && effectiveValueProQuota != null && !valueStatus?.isFallback
      ? effectiveValueProQuota - purchasePriceProQuota
      : null;
  const valueGainPct =
    purchasePriceProQuota && effectiveValueProQuota && !valueStatus?.isFallback
      ? (effectiveValueProQuota - purchasePriceProQuota) / purchasePriceProQuota
      : null;

  return (
    <div className="space-y-6">
      <Link
        href="/estates"
        className="inline-flex items-center gap-1.5 text-xs text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
      >
        <ArrowLeft className="size-3.5" />
        Tutti gli immobili
      </Link>

      <header className="flex items-start gap-4 flex-wrap">
        <span className="size-16 rounded-2xl bg-violet-500/10 border border-violet-500/30 flex items-center justify-center text-3xl shrink-0">
          {estate.emoji}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span
              className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border font-medium ${
                isRented
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                  : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              }`}
            >
              {isRented ? "🏷️ In affitto" : "🔑 Di proprietà"}
            </span>
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[var(--color-fg-muted)]">
              {TYPE_LABEL[estate.type] ?? estate.type}
            </span>
            {!isRented && estate.ownershipShare < 1 && (
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400">
                Quota {Math.round(estate.ownershipShare * 100)}%
              </span>
            )}
            {!isRented && estate.monthlyRent != null && estate.monthlyRent > 0 && (
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                Affittato a terzi
              </span>
            )}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{estate.name}</h1>
          {(estate.address || estate.city || estate.country) && (
            <p className="text-sm text-[var(--color-fg-muted)] mt-0.5 inline-flex items-center gap-1.5">
              <MapPin className="size-3.5" />
              {[estate.address, estate.city, estate.country].filter(Boolean).join(", ")}
            </p>
          )}
        </div>
        <EstateDetailActions
          estate={{
            id: estate.id,
            name: estate.name,
            type: estate.type,
            holding: estate.holding,
            emoji: estate.emoji,
            city: estate.city,
            country: estate.country,
            address: estate.address,
            purchaseDate: estate.purchaseDate,
            purchasePrice: estate.purchasePrice,
            currentValue: estate.currentValue,
            ownershipShare: estate.ownershipShare,
            monthlyRent: estate.monthlyRent,
            notes: estate.notes,
            mortgageAmount: estate.mortgageAmount,
            mortgageRate: estate.mortgageRate,
            mortgageDurationMonths: estate.mortgageDurationMonths,
            mortgageStartDate: estate.mortgageStartDate,
            mortgageMonthlyPayment: estate.mortgageMonthlyPayment,
          }}
        />
      </header>

      <RentRecurrenceCard
        estateId={estate.id}
        estateName={estate.name}
        holding={estate.holding}
        hasRecurrence={!!rentRecurrenceGroupId}
        recurrenceGroupId={rentRecurrenceGroupId}
        nextPaymentDate={nextRentDate?.toISOString() ?? null}
        actualMonthlyRent={actualMonthlyRent}
        candidates={rentCandidates}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {!isRented && (
          <>
            <Card>
              <CardContent>
                <div className="text-[11px] uppercase tracking-wider text-[var(--color-fg-subtle)] flex items-center gap-1.5 h-5">
                  <span>Valore stimato</span>
                  {valueStatus?.needsAlert && (
                    <span
                      className="inline-flex items-center justify-center size-[18px] rounded-full bg-rose-500 text-white shadow-[0_0_0_2px_rgba(225,29,72,0.25)] shrink-0"
                      title={
                        valueStatus.isFallback
                          ? "Nessun valore attuale: stimato dal prezzo d'acquisto"
                          : "Valore non riconfermato da oltre 5 anni"
                      }
                      aria-label={
                        valueStatus.isFallback
                          ? "Nessun valore attuale: stimato dal prezzo d'acquisto"
                          : "Valore non riconfermato da oltre 5 anni"
                      }
                    >
                      <AlertTriangle className="size-3" strokeWidth={2.5} />
                    </span>
                  )}
                </div>
                <div
                  className={`text-xl font-semibold tabular-nums mt-1 ${
                    valueStatus?.isFallback ? "text-amber-400" : ""
                  }`}
                >
                  {effectiveValueProQuota != null ? formatEUR(effectiveValueProQuota) : "—"}
                </div>
                {valueStatus?.isFallback ? (
                  <div className="text-[11px] text-amber-400 mt-1 inline-flex items-start gap-1">
                    <AlertTriangle className="size-3 mt-0.5 shrink-0" />
                    <span>Nessun valore attuale: stimato dal prezzo d&apos;acquisto</span>
                  </div>
                ) : valueGain != null ? (
                  <div
                    className={`text-[11px] tabular-nums mt-1 inline-flex items-center gap-1 ${
                      valueGain >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {valueGain >= 0 ? (
                      <TrendingUp className="size-3" />
                    ) : (
                      <TrendingDown className="size-3" />
                    )}
                    {valueGain >= 0 ? "+" : ""}
                    {formatEUR(valueGain, { compact: true })}{" "}
                    {valueGainPct != null && `(${(valueGainPct * 100).toFixed(1)}%)`}
                  </div>
                ) : null}
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <div className="text-[11px] uppercase tracking-wider text-[var(--color-fg-subtle)]">
                  Prezzo acquisto
                </div>
                <div className="text-xl font-semibold tabular-nums mt-1">
                  {purchasePriceProQuota != null ? formatEUR(purchasePriceProQuota) : "—"}
                </div>
                {estate.purchaseDate && (
                  <div className="text-[11px] text-[var(--color-fg-subtle)] mt-1 inline-flex items-center gap-1">
                    <Calendar className="size-3" />
                    {formatDate(estate.purchaseDate, {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
        {((estate.monthlyRent != null && estate.monthlyRent > 0) || actualMonthlyRent != null) && (
          <Card>
            <CardContent>
              <div className="text-[11px] uppercase tracking-wider text-[var(--color-fg-subtle)]">
                {isRented ? "Affitto pagato / mese" : "Affitto incassato / mese"}
              </div>
              <div
                className={`text-xl font-semibold tabular-nums mt-1 ${
                  isRented ? "text-rose-400" : "text-emerald-400"
                }`}
              >
                {isRented ? "-" : "+"}
                {formatEUR(
                  (actualMonthlyRent ?? estate.monthlyRent ?? 0) *
                    (isRented ? 1 : estate.ownershipShare),
                )}
              </div>
              <div className="text-[11px] text-[var(--color-fg-subtle)] mt-1">
                {actualMonthlyRent != null
                  ? `mediana ultimi 12 mesi · ${recentConfirmedRent.length} pagamenti`
                  : `valore previsto · ~${formatEUR(
                      (estate.monthlyRent ?? 0) * (isRented ? 1 : estate.ownershipShare) * 12,
                    )}/anno`}
              </div>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent>
            <div className="text-[11px] uppercase tracking-wider text-[var(--color-fg-subtle)]">
              Cashflow netto tracciato
            </div>
            <div
              className={`text-xl font-semibold tabular-nums mt-1 ${
                net > 0 ? "text-emerald-400" : net < 0 ? "text-rose-400" : ""
              }`}
            >
              {net > 0 ? "+" : ""}
              {formatEUR(net)}
            </div>
            <div className="text-[11px] text-[var(--color-fg-subtle)] mt-1">
              {operatingTxs.length} movimenti operativi
              {capexTotal !== 0 && (
                <>
                  {" · "}
                  <span title="Capex (acquisto, mutuo capitale) escluso dal cashflow">
                    capex {capexTotal < 0 ? "" : "+"}
                    {formatEUR(capexTotal, { compact: true })}
                  </span>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {estate.mortgageAmount != null && estate.mortgageMonthlyPayment != null && (
        <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/[0.08] via-[var(--color-surface)] to-violet-500/[0.02] p-5">
          <div className="flex items-start gap-3 flex-wrap">
            <span className="size-10 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center shrink-0">
              <Landmark className="size-5 text-violet-300" />
            </span>
            <div className="flex-1 min-w-[200px]">
              <div className="text-sm font-medium text-violet-200">Mutuo attivo</div>
              <div className="text-[11px] text-[var(--color-fg-muted)] mt-0.5">
                Capitale {formatEUR(estate.mortgageAmount, { compact: true })}
                {estate.mortgageRate != null && ` · ${estate.mortgageRate}% annuo`}
                {estate.mortgageDurationMonths != null && ` · ${estate.mortgageDurationMonths} mesi`}
              </div>
            </div>
            {estate.mortgageRecurrenceGroupId && (
              <Link
                href="/movimenti/ricorrenze"
                className="text-xs text-violet-300 hover:underline inline-flex items-center gap-1"
              >
                Gestisci rate
                <ChevronRight className="size-3" />
              </Link>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-subtle)]">
                Rata mensile
              </div>
              <div className="text-base font-semibold tabular-nums mt-0.5 text-rose-400">
                -{formatEUR(estate.mortgageMonthlyPayment)}
              </div>
            </div>
            {estate.mortgageStartDate && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-subtle)]">
                  Prima rata
                </div>
                <div className="text-sm mt-0.5 inline-flex items-center gap-1">
                  <Calendar className="size-3 text-[var(--color-fg-subtle)]" />
                  {formatDate(estate.mortgageStartDate, {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </div>
              </div>
            )}
            {mortgageStats && (
              <>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-subtle)]">
                    Rate pagate
                  </div>
                  <div className="text-base font-semibold tabular-nums mt-0.5">
                    {mortgageStats.paidCount}{" "}
                    <span className="text-[var(--color-fg-subtle)] text-sm font-normal">
                      / {mortgageStats.totalCount}
                    </span>
                  </div>
                </div>
                {mortgageStats.nextDueDate && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-subtle)]">
                      Prossima rata
                    </div>
                    <div className="text-sm mt-0.5 inline-flex items-center gap-1">
                      <Calendar className="size-3 text-[var(--color-fg-subtle)]" />
                      {formatDate(mortgageStats.nextDueDate, {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          {estate.mortgageDurationMonths != null && estate.mortgageMonthlyPayment != null && (
            <div className="mt-4 pt-3 border-t border-violet-500/20 grid grid-cols-2 gap-3 text-xs">
              <div className="flex justify-between">
                <span className="text-[var(--color-fg-muted)]">Totale da pagare</span>
                <span className="tabular-nums">
                  {formatEUR(
                    estate.mortgageMonthlyPayment * estate.mortgageDurationMonths,
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--color-fg-muted)]">Interessi totali</span>
                <span className="tabular-nums text-amber-300">
                  {formatEUR(
                    estate.mortgageMonthlyPayment * estate.mortgageDurationMonths -
                      estate.mortgageAmount,
                  )}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="max-w-md">
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-[var(--color-fg-muted)] uppercase tracking-wider">
            Spese per categoria
          </h3>
          {categoryRows.length === 0 ? (
            <Card>
              <CardContent>
                <p className="py-6 text-center text-xs text-[var(--color-fg-subtle)]">
                  Nessuna spesa collegata.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="surface divide-y divide-[var(--color-border)]/60">
              {categoryRows.map((c) => (
                <div key={c.name} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="size-8 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] flex items-center justify-center text-base shrink-0">
                    {c.emoji}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{c.name}</div>
                    <div className="text-[11px] text-[var(--color-fg-subtle)]">
                      {c.count} mov.
                    </div>
                  </div>
                  <span className="text-sm font-medium tabular-nums text-rose-400">
                    {formatEUR(c.sum)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {(totalIn > 0 || totalOut < 0) && (
            <div className="surface p-3 space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-[var(--color-fg-muted)]">Totale entrate</span>
                <span className="tabular-nums text-emerald-400">+{formatEUR(totalIn)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-[var(--color-fg-muted)]">Totale uscite</span>
                <span className="tabular-nums text-rose-400">{formatEUR(totalOut)}</span>
              </div>
              <div className="flex justify-between text-xs pt-1.5 border-t border-[var(--color-border)]/50">
                <span className="font-medium">Netto</span>
                <span
                  className={`tabular-nums font-medium ${
                    net > 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {net > 0 ? "+" : ""}
                  {formatEUR(net)}
                </span>
              </div>
            </div>
          )}
        </div>

      </div>

      {estate.notes && (
        <Card>
          <CardContent>
            <div className="text-[11px] uppercase tracking-wider text-[var(--color-fg-subtle)] mb-2">
              Note
            </div>
            <p className="text-sm text-[var(--color-fg-muted)] whitespace-pre-wrap">
              {estate.notes}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
