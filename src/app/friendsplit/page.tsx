import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { formatEUR, formatDate, cn } from "@/lib/utils";
import Link from "next/link";
import { TrendingUp, TrendingDown, Users, Handshake, Plus, User } from "lucide-react";
import { getSelfName, parseMembers, type FriendsplitMember } from "@/lib/friendsplit-meta";
import {
  NewFriendsplitButton,
  DeleteFriendsplitButton,
  EditFriendsplitButton,
} from "@/components/friendsplit/friendsplit-actions";

export const dynamic = "force-dynamic";

export default async function FriendsplitPage() {
  const accounts = await prisma.account.findMany({
    where: { type: "friendsplit" },
    orderBy: { displayOrder: "asc" },
  });

  const transactions = await prisma.transaction.findMany({
    where: { accountId: { in: accounts.map((a) => a.id) } },
    orderBy: { date: "desc" },
    include: { category: true },
  });

  const txByAccount = new Map<string, typeof transactions>();
  for (const t of transactions) {
    const arr = txByAccount.get(t.accountId) ?? [];
    arr.push(t);
    txByAccount.set(t.accountId, arr);
  }

  // Identità utente + membri per ogni account friendsplit (dinamici da DB)
  const SELF_NAME = await getSelfName();
  const membersByAccountId = new Map<string, FriendsplitMember[]>();
  for (const a of accounts) {
    membersByAccountId.set(a.id, parseMembers(a.membersJson));
  }

  /**
   * Calcola net balance "pool view" per OGNI membro del gruppo (modello
   * Splitwise/Tricount): >0 in credito, <0 in debito, sum = 0.
   *
   * Per ogni tx parsa "Anticipato da: X · Tot. Y · Per: A,B,C":
   *   - balance[payer] += tot
   *   - per ogni partecipante p: balance[p] -= tot/N
   *
   * Le tx con notes incomplete vengono skippate. Per tx vecchie senza "Per:"
   * fallback assume tutti i membri partecipano. Le tx legacy split "(K/N)"
   * sono trattate come spese indipendenti — ogni record è un anticipo separato.
   */
  function computePerPersonBalances(
    txs: typeof transactions,
    accountId: string,
  ): Map<string, number> | null {
    const members = membersByAccountId.get(accountId) ?? [];
    if (members.length === 0) return null;
    const memberNames = members.map((m) => m.name);
    const balances = new Map<string, number>();
    for (const m of memberNames) balances.set(m, 0);

    for (const t of txs) {
      const notes = t.notes ?? "";
      const payerMatch = notes.match(/Anticipato da:\s*([^·]+)/);
      const payer = payerMatch ? payerMatch[1].trim() : null;
      const totMatch = notes.match(/Tot\.\s*([\d.]+)/);
      const partsMatch = notes.match(/Per:\s*([^·]+)/);
      const explicitParts = partsMatch
        ? partsMatch[1].split(",").map((s) => s.trim()).filter(Boolean)
        : null;
      const participants = explicitParts ?? memberNames;
      if (!payer || !totMatch || participants.length === 0) continue;
      const tot = parseFloat(totMatch[1]);
      if (!isFinite(tot) || tot <= 0) continue;
      if (!balances.has(payer)) continue;

      balances.set(payer, (balances.get(payer) ?? 0) + tot);
      const share = tot / participants.length;
      for (const p of participants) {
        if (!balances.has(p)) continue;
        balances.set(p, (balances.get(p) ?? 0) - share);
      }
    }
    return balances;
  }

  const grandTotal = accounts.reduce((s, a) => {
    const txs = txByAccount.get(a.id) ?? [];
    return s + txs.reduce((acc, t) => acc + t.amount, 0);
  }, 0);

  if (accounts.length === 0) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-6">
        <div className="size-16 mx-auto rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center">
          <Handshake className="size-7 text-[var(--fg-muted)]" />
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Nessun Friendsplit</h1>
          <p className="text-sm text-[var(--fg-muted)]">
            Tieni traccia delle spese condivise con altre persone (coinquilini,
            amici): chi deve quanto a chi. Crea un conto di tipo Friendsplit per
            ogni gruppo.
          </p>
        </div>
        <Link
          href="/conti/nuovo?type=friendsplit"
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--fg)] text-[var(--bg)] px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="size-4" /> Crea primo Friendsplit
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight inline-flex items-center gap-2">
            <span>🤝</span> Friendsplit
          </h1>
          <p className="text-sm text-[var(--fg-muted)] mt-0.5">
            Spese condivise — chi deve quanto · {accounts.length} friendsplit ·{" "}
            <span
              className={cn(
                "font-medium tabular-nums",
                grandTotal > 0 ? "text-emerald-400" : grandTotal < 0 ? "text-rose-400" : "",
              )}
            >
              {grandTotal > 0
                ? `In credito di ${formatEUR(grandTotal)}`
                : grandTotal < 0
                  ? `In debito di ${formatEUR(Math.abs(grandTotal))}`
                  : "In pari"}
            </span>
          </p>
        </div>
        <NewFriendsplitButton />
      </header>

      {/* Recap di tutti i friendsplit in cima */}
      <div
        className={`grid grid-cols-1 ${accounts.length === 2 ? "sm:grid-cols-2" : accounts.length >= 3 ? "lg:grid-cols-3 sm:grid-cols-2" : ""} gap-4`}
      >
        {accounts.map((account) => {
          const txs = txByAccount.get(account.id) ?? [];
          const balance = txs.reduce((s, t) => s + t.amount, 0);
          const accountMembers = membersByAccountId.get(account.id) ?? [];
          const positive = balance > 0;
          const settled = Math.abs(balance) < 0.01;
          const perPerson = computePerPersonBalances(txs, account.id);
          // Pool view: net balance per ogni membro (self incluso). Ordina
          // per importo desc così i più sbilanciati appaiono in alto.
          const breakdown = perPerson
            ? Array.from(perPerson.entries())
                .filter(([, v]) => Math.abs(v) >= 0.01)
                .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
            : [];
          return (
            <div
              key={`recap-${account.id}`}
              className={cn(
                "relative overflow-hidden rounded-2xl border p-5",
                positive
                  ? "border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-[var(--surface)] to-emerald-500/5"
                  : settled
                    ? "border-[var(--border)] bg-[var(--surface)]"
                    : "border-rose-500/30 bg-gradient-to-br from-rose-500/10 via-[var(--surface)] to-rose-500/5",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="inline-flex items-center gap-2 min-w-0">
                      <span className="text-lg shrink-0">{account.emoji ?? "🤝"}</span>
                      <h2 className="text-base font-semibold truncate">
                        {account.name.replace("Friendsplit ", "")}
                      </h2>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <EditFriendsplitButton
                        account={{
                          id: account.id,
                          name: account.name,
                          emoji: account.emoji,
                          members: accountMembers,
                        }}
                      />
                      <DeleteFriendsplitButton
                        accountId={account.id}
                        accountName={account.name}
                        balance={balance}
                        txCount={txs.length}
                      />
                    </div>
                  </div>
                  {accountMembers.length > 0 && (
                    <div className="flex items-center gap-1.5 text-[11px] text-[var(--fg-muted)]">
                      <Users className="size-3 shrink-0" />
                      <span className="truncate">{accountMembers.map((m) => m.name).join(", ")}</span>
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div
                    className={cn(
                      "text-2xl font-semibold tabular-nums",
                      positive ? "text-emerald-400" : settled ? "" : "text-rose-400",
                    )}
                  >
                    {positive ? "+" : ""}
                    {formatEUR(balance)}
                  </div>
                  <div className="text-[11px] text-[var(--fg-subtle)] mt-0.5 inline-flex items-center gap-1 justify-end">
                    {settled ? (
                      "In pari"
                    ) : positive ? (
                      <>
                        <TrendingUp className="size-3 text-emerald-400" /> A credito
                      </>
                    ) : (
                      <>
                        <TrendingDown className="size-3 text-rose-400" /> A debito
                      </>
                    )}{" "}
                    · {txs.length} mov
                  </div>
                </div>
              </div>

              {/* Net balance per ogni membro (pool view). Positive = è in
                  credito (gli devono dare), negative = è in debito (deve dare).
                  Sum di tutti i membri = 0. Self viene segnato con "(io)". */}
              {breakdown.length > 0 && (
                <div className="mt-4 pt-3 border-t border-[var(--border)]/50 space-y-1">
                  {breakdown.map(([name, amount]) => {
                    const inCredit = amount > 0;
                    const isSelf = name === SELF_NAME;
                    return (
                      <div
                        key={name}
                        className="flex items-center justify-between gap-2 text-[12px]"
                      >
                        <span className="text-[var(--fg-muted)] inline-flex items-center gap-1.5">
                          <span
                            className={cn(
                              "font-medium",
                              isSelf ? "text-violet-300" : "text-[var(--fg)]",
                            )}
                          >
                            {name}
                            {isSelf && " (io)"}
                          </span>
                          <span className="text-[10px] text-[var(--fg-subtle)]">
                            {inCredit ? "in credito" : "in debito"}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "font-semibold tabular-nums",
                            inCredit ? "text-emerald-400" : "text-rose-400",
                          )}
                        >
                          {inCredit ? "+" : ""}
                          {formatEUR(amount)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Tabella unica cronologica con TUTTE le tx friendsplit (più recenti
          prima). Ogni riga mostra a quale gruppo appartiene tramite badge
          colorato. Più scorrevole quando si vogliono vedere le ultime spese
          aggiunte indipendentemente dal gruppo. */}
      {(() => {
        const accountById = new Map(accounts.map((a) => [a.id, a]));

        /** Estrae lista partecipanti dalle notes formato "...Per: A, B, C..." */
        function parseParticipants(notes: string | null): string[] | null {
          if (!notes) return null;
          const m = notes.match(/Per:\s*([^·]+)/);
          if (!m) return null;
          return m[1]
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        }

        /** Per tx vecchie senza "Per:": stima N partecipanti da Tot/QuotaMia. */
        function inferParticipantsCount(notes: string | null): number | null {
          if (!notes) return null;
          const totMatch = notes.match(/Tot\.\s*([\d.,]+)/);
          const quotaMatch = notes.match(/Quota mia:\s*([\d.,]+)/);
          if (!totMatch || !quotaMatch) return null;
          const tot = parseFloat(totMatch[1].replace(",", "."));
          const quota = parseFloat(quotaMatch[1].replace(",", "."));
          if (!isFinite(tot) || !isFinite(quota) || quota <= 0) return null;
          return Math.round(tot / quota);
        }

        const allSorted = [...transactions].sort(
          (a, b) => b.date.getTime() - a.date.getTime(),
        );
        const RECENT_LIMIT = 25;
        const display = allSorted.slice(0, RECENT_LIMIT);
        const hiddenCount = allSorted.length - display.length;

        if (allSorted.length === 0) {
          return (
            <Card>
              <CardContent>
                <p className="text-sm text-[var(--fg-muted)] py-6 text-center">
                  Nessun movimento friendsplit ancora. Aggiungi spese dal
                  bottone{" "}
                  <strong>+ Aggiungi → Friendsplit</strong> in alto.
                </p>
              </CardContent>
            </Card>
          );
        }

        return (
          <section className="space-y-3 scroll-mt-4">
            <div className="flex items-baseline justify-between gap-3 px-1">
              <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--fg-muted)]">
                Tutti i movimenti
              </h2>
              <span className="text-[11px] text-[var(--fg-subtle)]">
                {allSorted.length} totali
              </span>
            </div>
            <div className="surface overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-[var(--color-fg-subtle)] border-b border-[var(--color-border)]">
                      <th className="px-4 py-3 font-medium">Data</th>
                      <th className="px-4 py-3 font-medium">Gruppo</th>
                      <th className="px-4 py-3 font-medium">Categoria</th>
                      <th className="px-4 py-3 font-medium">Beneficiario</th>
                      <th className="px-4 py-3 font-medium text-right">Importo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {display.map((t) => {
                      const acc = accountById.get(t.accountId);
                      const groupLabel =
                        acc?.name.replace("Friendsplit ", "") ?? "—";
                      return (
                        <tr
                          key={t.id}
                          className="group border-b border-[var(--border)]/50 hover:bg-[var(--surface-2)]/40 transition-colors"
                        >
                          <td className="px-4 py-3 whitespace-nowrap text-[var(--fg-muted)]">
                            {formatDate(t.date, {
                              day: "2-digit",
                              month: "short",
                              year: "2-digit",
                            })}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-300 border border-violet-500/20">
                              <span>{acc?.emoji ?? "🤝"}</span>
                              {groupLabel}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {t.category ? (
                              <span className="inline-flex items-center gap-1.5">
                                <span className="shrink-0">{t.category.emoji}</span>
                                <span className="text-[var(--fg-muted)] text-xs">
                                  {t.category.name}
                                </span>
                              </span>
                            ) : (
                              <span className="text-[var(--fg-subtle)]">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 max-w-[260px]">
                            <div className="truncate">{t.beneficiary || t.notes || "—"}</div>
                            {t.notes && t.beneficiary && (
                              <div className="text-[11px] text-[var(--fg-subtle)] truncate">
                                {t.notes}
                              </div>
                            )}
                            {(() => {
                              const accMembers = acc
                                ? membersByAccountId.get(acc.id) ?? []
                                : [];
                              if (accMembers.length === 0) return null;
                              const members = accMembers.map((m) => m.name);
                              // Ordina: self prima, altri in ordine originale
                              const ordered = [
                                ...members.filter((m) => m === SELF_NAME),
                                ...members.filter((m) => m !== SELF_NAME),
                              ];
                              const explicit = parseParticipants(t.notes);
                              if (explicit) {
                                return (
                                  <div className="mt-1 flex items-center gap-1">
                                    {ordered.map((name) => {
                                      const active = explicit.includes(name);
                                      const isSelf = name === SELF_NAME;
                                      return (
                                        <span
                                          key={name}
                                          title={`${name}${active ? "" : " (non partecipa)"}`}
                                          className={cn(
                                            "size-5 inline-flex items-center justify-center rounded-full border",
                                            active
                                              ? isSelf
                                                ? "bg-violet-500/20 border-violet-500/50 text-violet-300"
                                                : "bg-[var(--surface-2)] border-[var(--border-strong)] text-[var(--fg)]"
                                              : "bg-transparent border-[var(--border)] text-[var(--fg-subtle)] opacity-40",
                                          )}
                                        >
                                          <User className="size-3" />
                                        </span>
                                      );
                                    })}
                                  </div>
                                );
                              }
                              // Fallback per tx vecchie senza "Per:" → mostra "X di Y"
                              const inferred = inferParticipantsCount(t.notes);
                              if (inferred && inferred > 0) {
                                return (
                                  <div className="mt-1 text-[10px] text-[var(--fg-subtle)] inline-flex items-center gap-1">
                                    <Users className="size-3" />
                                    <span className="tabular-nums">
                                      {inferred} di {members.length} partecipanti
                                    </span>
                                  </div>
                                );
                              }
                              return null;
                            })()}
                          </td>
                          <td
                            className={cn(
                              "px-4 py-3 text-right whitespace-nowrap tabular-nums font-medium",
                              t.amount > 0 ? "text-emerald-400" : "text-rose-400",
                            )}
                          >
                            {t.amount > 0 ? "+" : ""}
                            {formatEUR(t.amount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {hiddenCount > 0 && (
                <div className="px-4 py-3 text-center text-[11px] text-[var(--fg-subtle)] border-t border-[var(--border)]">
                  Mostrati i {display.length} più recenti su {allSorted.length} totali
                </div>
              )}
            </div>
          </section>
        );
      })()}
    </div>
  );
}
