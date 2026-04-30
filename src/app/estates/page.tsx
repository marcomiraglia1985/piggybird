import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { formatEUR } from "@/lib/utils";
import { MapPin, ArrowUpRight, Home, AlertTriangle } from "lucide-react";
import { EstatesHeader } from "@/components/estates/estates-header";
import { estateValueStatus } from "@/lib/estate-value";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  apartment: "Appartamento",
  house: "Casa",
  commercial: "Commerciale",
  land: "Terreno",
  other: "Altro",
};

export default async function EstatesPage() {
  const estates = await prisma.realEstate.findMany({
    where: { active: true },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
  });

  // Account candidati per addebito mutuo: liquid + joint (escluse savings,
  // friendsplit, investment).
  const mortgageAccounts = await prisma.account.findMany({
    where: { active: true, type: { in: ["liquid", "joint"] } },
    orderBy: { displayOrder: "asc" },
    select: { id: true, name: true, emoji: true, type: true },
  });

  // Aggrega entrate/uscite per estate considerando sia tx.estateId esplicito
  // che category.estateId (auto-link).
  const ids = estates.map((e) => e.id);
  const aggMap = new Map<string, { sum: number; count: number }>();
  if (ids.length > 0) {
    const linkedTxs = await prisma.transaction.findMany({
      where: {
        OR: [
          { estateId: { in: ids } },
          { category: { estateId: { in: ids } } },
        ],
      },
      select: {
        amount: true,
        estateId: true,
        category: { select: { estateId: true } },
      },
    });
    for (const t of linkedTxs) {
      const eid = t.estateId ?? t.category?.estateId ?? null;
      if (!eid) continue;
      const cur = aggMap.get(eid) ?? { sum: 0, count: 0 };
      cur.sum += t.amount;
      cur.count += 1;
      aggMap.set(eid, cur);
    }
  }

  const ownedEstates = estates.filter((e) => e.holding === "owned");
  const rentedEstates = estates.filter((e) => e.holding === "rented");
  const totalValue = ownedEstates.reduce(
    (s, e) => s + estateValueStatus(e).value * e.ownershipShare,
    0,
  );
  const monthlyRentIn = ownedEstates.reduce(
    (s, e) => s + (e.monthlyRent ?? 0) * e.ownershipShare,
    0,
  );
  const monthlyRentOut = rentedEstates.reduce((s, e) => s + (e.monthlyRent ?? 0), 0);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Estates</h1>
          <p className="text-sm text-[var(--color-fg-muted)] mt-0.5">
            Gestisci i tuoi immobili — entrate da affitto, spese, valore.
          </p>
        </div>
        <EstatesHeader accounts={mortgageAccounts} />
      </header>

      {estates.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent>
              <div className="text-xs text-[var(--color-fg-muted)]">
                {ownedEstates.length > 0 ? "Valore proprietà (pro-quota)" : "Immobili gestiti"}
              </div>
              <div className="text-2xl font-semibold tabular-nums mt-1">
                {ownedEstates.length > 0 ? formatEUR(totalValue) : estates.length}
              </div>
              <div className="text-[11px] text-[var(--color-fg-subtle)] mt-1">
                {ownedEstates.length > 0 && `${ownedEstates.length} di proprietà`}
                {ownedEstates.length > 0 && rentedEstates.length > 0 && " · "}
                {rentedEstates.length > 0 && `${rentedEstates.length} in affitto`}
              </div>
            </CardContent>
          </Card>
          {monthlyRentIn > 0 && (
            <Card>
              <CardContent>
                <div className="text-xs text-[var(--color-fg-muted)]">Affitti incassati / mese</div>
                <div className="text-2xl font-semibold tabular-nums text-emerald-400 mt-1">
                  +{formatEUR(monthlyRentIn)}
                </div>
                <div className="text-[11px] text-[var(--color-fg-subtle)] mt-1">
                  ~{formatEUR(monthlyRentIn * 12)}/anno
                </div>
              </CardContent>
            </Card>
          )}
          {monthlyRentOut > 0 && (
            <Card>
              <CardContent>
                <div className="text-xs text-[var(--color-fg-muted)]">Affitti pagati / mese</div>
                <div className="text-2xl font-semibold tabular-nums text-rose-400 mt-1">
                  -{formatEUR(monthlyRentOut)}
                </div>
                <div className="text-[11px] text-[var(--color-fg-subtle)] mt-1">
                  ~{formatEUR(monthlyRentOut * 12)}/anno
                </div>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent>
              <div className="text-xs text-[var(--color-fg-muted)]">Movimenti collegati</div>
              <div className="text-2xl font-semibold tabular-nums mt-1">
                {[...aggMap.values()].reduce((s, x) => s + x.count, 0)}
              </div>
              <div className="text-[11px] text-[var(--color-fg-subtle)] mt-1">
                Entrate + spese tracciate
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {estates.length === 0 ? (
        <Card>
          <CardContent>
            <div className="py-16 text-center space-y-3">
              <Home className="size-10 text-[var(--color-fg-subtle)] mx-auto" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Nessun immobile registrato</p>
                <p className="text-xs text-[var(--color-fg-muted)]">
                  Aggiungi il tuo primo immobile per tracciare entrate da affitto, spese
                  (utenze, tasse, manutenzione) e valore.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {estates.map((e) => {
            const agg = aggMap.get(e.id);
            const netCashflow = agg?.sum ?? 0;
            return (
              <Link
                key={e.id}
                href={`/estates/${e.id}`}
                className="surface p-5 hover:border-violet-500/40 transition-colors group"
              >
                <div className="flex items-start gap-3">
                  <span className="size-12 rounded-xl bg-violet-500/10 border border-violet-500/30 flex items-center justify-center text-2xl shrink-0">
                    {e.emoji}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{e.name}</div>
                        {(e.city || e.country) && (
                          <div className="text-[11px] text-[var(--color-fg-subtle)] flex items-center gap-1 mt-0.5">
                            <MapPin className="size-3" />
                            {[e.city, e.country].filter(Boolean).join(", ")}
                          </div>
                        )}
                      </div>
                      <ArrowUpRight className="size-4 text-[var(--color-fg-subtle)] group-hover:text-violet-400 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-all shrink-0" />
                    </div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span
                        className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border font-medium ${
                          e.holding === "rented"
                            ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                            : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                        }`}
                      >
                        {e.holding === "rented" ? "🏷️ In affitto" : "🔑 Possiedo"}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[var(--color-fg-muted)]">
                        {TYPE_LABEL[e.type] ?? e.type}
                      </span>
                      {e.holding === "owned" && e.ownershipShare < 1 && (
                        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400">
                          {Math.round(e.ownershipShare * 100)}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-[var(--color-border)]/50">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-subtle)] flex items-center gap-1.5 whitespace-nowrap h-5">
                      <span>
                        {e.holding === "rented" ? "Affitto/mese" : "Valore stimato"}
                      </span>
                      {e.holding === "owned" && (() => {
                        const s = estateValueStatus(e);
                        if (!s.needsAlert) return null;
                        const tip = s.isFallback
                          ? "Nessun valore attuale: stimato dal prezzo d'acquisto. Riconferma in /estates."
                          : "Valore non riconfermato da oltre 5 anni. Aggiornalo in /estates.";
                        return (
                          <span
                            className="inline-flex items-center justify-center size-[18px] rounded-full bg-rose-500 text-white shadow-[0_0_0_2px_rgba(225,29,72,0.25)] shrink-0"
                            title={tip}
                            aria-label={tip}
                          >
                            <AlertTriangle className="size-3" strokeWidth={2.5} />
                          </span>
                        );
                      })()}
                    </div>
                    <div className="text-sm font-medium tabular-nums mt-0.5 whitespace-nowrap">
                      {e.holding === "rented"
                        ? e.monthlyRent != null && e.monthlyRent > 0
                          ? `-${formatEUR(e.monthlyRent)}`
                          : "—"
                        : (() => {
                            const s = estateValueStatus(e);
                            return s.value === 0 ? "—" : formatEUR(s.value);
                          })()}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-subtle)] flex items-center h-5">
                      Cashflow tracciato
                    </div>
                    <div
                      className={`text-sm font-medium tabular-nums mt-0.5 ${
                        netCashflow > 0
                          ? "text-emerald-400"
                          : netCashflow < 0
                            ? "text-rose-400"
                            : "text-[var(--color-fg-muted)]"
                      }`}
                    >
                      {netCashflow > 0 ? "+" : ""}
                      {agg ? formatEUR(netCashflow) : "—"}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
