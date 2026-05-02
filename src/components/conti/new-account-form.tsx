"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Plus } from "lucide-react";
import { getProvidersForAccountType } from "@/lib/account-providers";

// Emoji allineate alle icone lucide-react usate nella sidebar (Users /
// Handshake / BookOpen) per coerenza visiva tra Aggiungi Conto e nav.
const TYPES = [
  { value: "liquid", label: "Liquidità", emoji: "💳", desc: "Conto corrente personale" },
  { value: "joint", label: "Cointestato", emoji: "👥", desc: "Conto condiviso (es. con compagn*)" },
  { value: "cash", label: "Contante", emoji: "💵", desc: "Liquidi fisici" },
  { value: "savings", label: "Risparmi", emoji: "🐷", desc: "Conto deposito o salvadanaio" },
  { value: "credit", label: "Crediti", emoji: "📖", desc: "Soldi prestati ad amici o persone" },
  { value: "investment", label: "Investimenti", emoji: "📈", desc: "Conto trading dedicato" },
  { value: "friendsplit", label: "Friendsplit", emoji: "🤝", desc: "Spese condivise: chi deve quanto a chi" },
] as const;

const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "ALL"];

export function NewAccountForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialType = (() => {
    const t = searchParams.get("type");
    return TYPES.find((x) => x.value === t)?.value ?? "liquid";
  })();
  const [name, setName] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]["value"]>(initialType);
  const [provider, setProvider] = useState<string>("generic");
  const [currency, setCurrency] = useState("EUR");
  const [emoji, setEmoji] = useState("");
  const [ownership, setOwnership] = useState("1");
  const [balance, setBalance] = useState("0");
  /** Solo per type=investment: classe asset (stocks/crypto/metals).
   *  Determina come la posizione apparirà su /investimenti. */
  const [assetClass, setAssetClass] = useState<"stocks" | "crypto" | "metals">(
    "crypto",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = TYPES.find((t) => t.value === type)!;

  function pickType(v: (typeof TYPES)[number]["value"]) {
    setType(v);
    if (v === "joint" && ownership === "1") setOwnership("0.666666666666667");
    if (v !== "joint" && ownership !== "1") setOwnership("1");
    // Reset provider quando cambi type — alcuni provider sono compatibili
    // solo con certi tipi (es. binance/revolut-x solo con investment)
    setProvider("generic");
  }

  const providersForType = getProvidersForAccountType(type);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          type,
          provider,
          currency,
          emoji: emoji.trim() || selected.emoji,
          ownershipShare: parseFloat(ownership),
          currentBalance: parseFloat(balance) || 0,
          ...(type === "investment" ? { assetClass } : {}),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? "Errore");
      }
      router.push("/conti");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6 surface p-6">
      <div className="space-y-2">
        <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">Tipo conto</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => pickType(t.value)}
              className={`text-left p-3 rounded-xl border transition-colors ${
                type === t.value
                  ? "border-violet-500/50 bg-violet-500/10"
                  : "border-[var(--border)] bg-[var(--surface-2)]/40 hover:border-[var(--border-strong)]"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-xl">{t.emoji}</span>
                <span className="font-medium text-sm">{t.label}</span>
              </div>
              <div className="text-[11px] text-[var(--fg-subtle)] mt-1">{t.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {type === "investment" && (
        <div className="space-y-2">
          <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">
            Classe asset
            <span className="text-[var(--fg-subtle)] normal-case tracking-normal ml-1">
              (cosa contiene il broker)
            </span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { v: "stocks", label: "Azioni / ETF", emoji: "📈" },
              { v: "crypto", label: "Crypto", emoji: "🪙" },
              { v: "metals", label: "Metalli", emoji: "🥇" },
            ].map((a) => (
              <button
                key={a.v}
                type="button"
                onClick={() => setAssetClass(a.v as typeof assetClass)}
                className={`p-2.5 rounded-lg border transition-colors text-left ${
                  assetClass === a.v
                    ? "border-violet-500/50 bg-violet-500/10"
                    : "border-[var(--border)] bg-[var(--surface-2)]/40 hover:border-[var(--border-strong)]"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span>{a.emoji}</span>
                  <span className="font-medium text-xs">{a.label}</span>
                </div>
              </button>
            ))}
          </div>
          <p className="text-[10px] text-[var(--fg-subtle)] leading-relaxed">
            Determina dove appare su <em>/investimenti</em> e come viene
            colorata la card su <em>/conti</em>.
          </p>
        </div>
      )}

      {providersForType.length > 1 && (
        <div className="space-y-2">
          <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">
            Provider esterno
            <span className="text-[var(--fg-subtle)] normal-case tracking-normal ml-1">
              (per attivare API/sync automatico)
            </span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {providersForType.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setProvider(p.id)}
                className={`text-left p-2.5 rounded-lg border transition-colors ${
                  provider === p.id
                    ? "border-violet-500/50 bg-violet-500/10"
                    : "border-[var(--border)] bg-[var(--surface-2)]/40 hover:border-[var(--border-strong)]"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span>{p.emoji}</span>
                  <span className="font-medium text-xs">{p.label}</span>
                </div>
                <div className="text-[10px] text-[var(--fg-subtle)] mt-0.5 leading-snug">
                  {p.description}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">Nome</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Es. Fineco, Cointestato, Contante…"
            required
            className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-violet-500/50"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">Emoji</label>
          <input
            type="text"
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            placeholder={selected.emoji}
            maxLength={4}
            className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-violet-500/50"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">Valuta</label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-violet-500/50"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">
            Saldo iniziale
          </label>
          <input
            type="number"
            step="any"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm tabular-nums focus:outline-none focus:border-violet-500/50"
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">
            Quota di proprietà{" "}
            <span className="text-[var(--fg-subtle)] normal-case tracking-normal">
              (frazione di tua proprietà; 1 = tutto tuo)
            </span>
          </label>
          <div className="flex flex-wrap gap-2 mb-1">
            {[
              { v: "1", label: "100% (tutto tuo)" },
              { v: "0.5", label: "1/2" },
              { v: "0.666666666666667", label: "2/3" },
              { v: "0.333333333333333", label: "1/3" },
            ].map((p) => {
              const active = Math.abs(parseFloat(ownership) - parseFloat(p.v)) < 0.01;
              return (
                <button
                  key={p.v}
                  type="button"
                  onClick={() => setOwnership(p.v)}
                  className={`h-7 px-2.5 rounded-md text-xs border transition-colors ${
                    active
                      ? "border-violet-500/50 bg-violet-500/10 text-violet-200"
                      : "border-[var(--border)] bg-[var(--surface-2)]/40 hover:border-[var(--border-strong)]"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <input
            type="number"
            step="any"
            min="0"
            max="1"
            value={ownership}
            onChange={(e) => setOwnership(e.target.value)}
            className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm tabular-nums focus:outline-none focus:border-violet-500/50"
          />
        </div>
      </div>

      {error && (
        <div className="text-sm text-rose-400 inline-flex items-center gap-1.5">
          <AlertTriangle className="size-4" /> {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-sm font-medium disabled:opacity-50"
        >
          <Plus className="size-4" />
          {saving ? "Creo…" : "Crea conto"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/conti")}
          className="h-9 px-4 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm"
        >
          Annulla
        </button>
      </div>
    </form>
  );
}
