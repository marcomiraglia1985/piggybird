"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { X, Building2, Pencil, Landmark } from "lucide-react";
import { calcMortgagePayment } from "@/lib/mortgage";
import { formatEUR } from "@/lib/utils";

const TYPE_OPTIONS = [
  { value: "apartment", label: "Appartamento", emoji: "🏢" },
  { value: "house", label: "Casa", emoji: "🏠" },
  { value: "commercial", label: "Commerciale", emoji: "🏬" },
  { value: "land", label: "Terreno", emoji: "🌳" },
  { value: "other", label: "Altro", emoji: "📍" },
];

export type AccountOption = {
  id: string;
  name: string;
  emoji: string;
  type: string;
};

export type EstateEditInput = {
  id: string;
  name: string;
  type: string;
  holding: string;
  emoji: string;
  city: string | null;
  country: string | null;
  address: string | null;
  purchaseDate: Date | string | null;
  purchasePrice: number | null;
  currentValue: number | null;
  ownershipShare: number;
  monthlyRent: number | null;
  notes: string | null;
  mortgageAmount?: number | null;
  mortgageRate?: number | null;
  mortgageDurationMonths?: number | null;
  mortgageStartDate?: Date | string | null;
  mortgageMonthlyPayment?: number | null;
};

function toDateInput(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function AddEstateDialog({
  open,
  onClose,
  estate,
  accounts = [],
}: {
  open: boolean;
  onClose: () => void;
  /** Quando presente: dialog in modalità edit, chiama PATCH invece di POST. */
  estate?: EstateEditInput;
  /** Lista conti su cui addebitare la rata mutuo (liquid/joint). Required
   *  solo se l'utente attiva il mutuo in create mode. */
  accounts?: AccountOption[];
}) {
  const isEdit = !!estate;
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(estate?.name ?? "");
  const [type, setType] = useState(estate?.type ?? "apartment");
  const [holding, setHolding] = useState<"owned" | "rented">(
    (estate?.holding === "rented" ? "rented" : "owned"),
  );
  const [emoji, setEmoji] = useState(estate?.emoji ?? "🏢");
  const [city, setCity] = useState(estate?.city ?? "");
  const [country, setCountry] = useState(estate?.country ?? "");
  const [address, setAddress] = useState(estate?.address ?? "");
  const [purchaseDate, setPurchaseDate] = useState(toDateInput(estate?.purchaseDate));
  const [purchasePrice, setPurchasePrice] = useState(
    estate?.purchasePrice != null ? String(estate.purchasePrice) : "",
  );
  const [currentValue, setCurrentValue] = useState(
    estate?.currentValue != null ? String(estate.currentValue) : "",
  );
  const [ownershipShare, setOwnershipShare] = useState(
    estate ? String(Math.round((estate.ownershipShare ?? 1) * 100)) : "100",
  );
  const [monthlyRent, setMonthlyRent] = useState(
    estate?.monthlyRent != null ? String(estate.monthlyRent) : "",
  );
  const [notes, setNotes] = useState(estate?.notes ?? "");

  // === Mortgage state ===
  // paymentMode: "totale" = niente mutuo (default per nuovo); "mortgage" = con
  // mutuo. In edit mode, derivato dallo stato dell'estate (se ha già amount).
  const [paymentMode, setPaymentMode] = useState<"totale" | "mortgage">(
    estate?.mortgageAmount != null ? "mortgage" : "totale",
  );
  const [mortgageAmount, setMortgageAmount] = useState(
    estate?.mortgageAmount != null ? String(estate.mortgageAmount) : "",
  );
  const [mortgageRate, setMortgageRate] = useState(
    estate?.mortgageRate != null ? String(estate.mortgageRate) : "",
  );
  const [mortgageDurationMonths, setMortgageDurationMonths] = useState(
    estate?.mortgageDurationMonths != null ? String(estate.mortgageDurationMonths) : "",
  );
  const [mortgageStartDate, setMortgageStartDate] = useState(
    toDateInput(estate?.mortgageStartDate),
  );
  const [mortgageAccountId, setMortgageAccountId] = useState<string>("");

  // Re-sync quando estate cambia (es. si apre il dialog su un estate diverso).
  useEffect(() => {
    if (!estate) return;
    setName(estate.name);
    setType(estate.type);
    setHolding(estate.holding === "rented" ? "rented" : "owned");
    setEmoji(estate.emoji);
    setCity(estate.city ?? "");
    setCountry(estate.country ?? "");
    setAddress(estate.address ?? "");
    setPurchaseDate(toDateInput(estate.purchaseDate));
    setPurchasePrice(estate.purchasePrice != null ? String(estate.purchasePrice) : "");
    setCurrentValue(estate.currentValue != null ? String(estate.currentValue) : "");
    setOwnershipShare(String(Math.round((estate.ownershipShare ?? 1) * 100)));
    setMonthlyRent(estate.monthlyRent != null ? String(estate.monthlyRent) : "");
    setNotes(estate.notes ?? "");
    setPaymentMode(estate.mortgageAmount != null ? "mortgage" : "totale");
    setMortgageAmount(estate.mortgageAmount != null ? String(estate.mortgageAmount) : "");
    setMortgageRate(estate.mortgageRate != null ? String(estate.mortgageRate) : "");
    setMortgageDurationMonths(
      estate.mortgageDurationMonths != null ? String(estate.mortgageDurationMonths) : "",
    );
    setMortgageStartDate(toDateInput(estate.mortgageStartDate));
  }, [estate]);

  // Anteprima rata client-side (formula identica al server)
  const previewMonthlyPayment = useMemo(() => {
    const a = parseFloat(mortgageAmount);
    const r = parseFloat(mortgageRate);
    const m = parseInt(mortgageDurationMonths, 10);
    if (!isFinite(a) || !isFinite(r) || !isFinite(m) || a <= 0 || m <= 0) {
      return null;
    }
    return calcMortgagePayment(a, r, m);
  }, [mortgageAmount, mortgageRate, mortgageDurationMonths]);

  const totalInterest = useMemo(() => {
    if (previewMonthlyPayment == null) return null;
    const m = parseInt(mortgageDurationMonths, 10);
    const a = parseFloat(mortgageAmount);
    if (!isFinite(m) || !isFinite(a)) return null;
    return previewMonthlyPayment * m - a;
  }, [previewMonthlyPayment, mortgageDurationMonths, mortgageAmount]);

  function reset() {
    if (isEdit) {
      // In edit mode chiudere senza salvare ripristina i valori dell'estate
      return;
    }
    setName("");
    setType("apartment");
    setHolding("owned");
    setEmoji("🏢");
    setCity("");
    setCountry("");
    setAddress("");
    setPurchaseDate("");
    setPurchasePrice("");
    setCurrentValue("");
    setOwnershipShare("100");
    setMonthlyRent("");
    setNotes("");
    setPaymentMode("totale");
    setMortgageAmount("");
    setMortgageRate("");
    setMortgageDurationMonths("");
    setMortgageStartDate("");
    setMortgageAccountId("");
    setError(null);
  }

  async function submit() {
    if (!name.trim()) {
      setError("Il nome è obbligatorio");
      return;
    }
    // Validazione mutuo lato client (i 4 campi base sono required quando attivo)
    const wantsMortgage = holding === "owned" && paymentMode === "mortgage";
    if (wantsMortgage) {
      const a = parseFloat(mortgageAmount);
      const r = parseFloat(mortgageRate);
      const m = parseInt(mortgageDurationMonths, 10);
      if (!isFinite(a) || a <= 0) {
        setError("Inserisci un importo mutuo valido");
        return;
      }
      if (!isFinite(r) || r < 0 || r > 100) {
        setError("Inserisci un tasso valido (0-100)");
        return;
      }
      if (!isFinite(m) || m <= 0) {
        setError("Inserisci una durata valida in mesi");
        return;
      }
      if (!isEdit && !mortgageAccountId) {
        setError("Seleziona il conto su cui addebitare le rate");
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        type,
        holding,
        emoji,
        ownershipShare: parseFloat(ownershipShare) / 100,
      };
      // In edit mode includiamo sempre i campi (anche null) per permettere
      // di azzerarli; in create mode li omettiamo se vuoti.
      if (isEdit) {
        payload.city = city.trim() || null;
        payload.country = country.trim() || null;
        payload.address = address.trim() || null;
        payload.notes = notes.trim() || null;
        payload.monthlyRent = monthlyRent ? parseFloat(monthlyRent) : null;
        if (holding === "owned") {
          payload.purchaseDate = purchaseDate
            ? new Date(purchaseDate).toISOString()
            : null;
          payload.purchasePrice = purchasePrice ? parseFloat(purchasePrice) : null;
          payload.currentValue = currentValue ? parseFloat(currentValue) : null;
          if (paymentMode === "mortgage") {
            payload.mortgageAmount = parseFloat(mortgageAmount);
            payload.mortgageRate = parseFloat(mortgageRate);
            payload.mortgageDurationMonths = parseInt(mortgageDurationMonths, 10);
            payload.mortgageStartDate = mortgageStartDate
              ? new Date(mortgageStartDate).toISOString()
              : null;
          }
          // NB: in edit, se l'utente toglie il mutuo (paymentMode=totale ma
          // estate.mortgageAmount era presente) NON cancelliamo automaticamente
          // i campi né le tx — richiede flusso dedicato. UI evidenzia il caso.
        } else {
          payload.purchaseDate = null;
          payload.purchasePrice = null;
          payload.currentValue = null;
        }
      } else {
        if (city.trim()) payload.city = city.trim();
        if (country.trim()) payload.country = country.trim();
        if (address.trim()) payload.address = address.trim();
        if (holding === "owned") {
          if (purchaseDate) payload.purchaseDate = new Date(purchaseDate).toISOString();
          if (purchasePrice) payload.purchasePrice = parseFloat(purchasePrice);
          if (currentValue) payload.currentValue = parseFloat(currentValue);
          if (paymentMode === "mortgage") {
            payload.mortgageAmount = parseFloat(mortgageAmount);
            payload.mortgageRate = parseFloat(mortgageRate);
            payload.mortgageDurationMonths = parseInt(mortgageDurationMonths, 10);
            if (mortgageStartDate) {
              payload.mortgageStartDate = new Date(mortgageStartDate).toISOString();
            }
            payload.mortgageAccountId = mortgageAccountId;
          }
        }
        if (monthlyRent) payload.monthlyRent = parseFloat(monthlyRent);
        if (notes.trim()) payload.notes = notes.trim();
      }

      const url = isEdit ? `/api/estates/${estate!.id}` : "/api/estates";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Errore di salvataggio");
      }
      reset();
      onClose();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !saving && onClose()}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg surface p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold inline-flex items-center gap-2">
                {isEdit ? (
                  <Pencil className="size-5 text-violet-400" />
                ) : (
                  <Building2 className="size-5 text-violet-400" />
                )}
                {isEdit ? "Modifica immobile" : "Aggiungi immobile"}
              </h2>
              <button
                onClick={onClose}
                disabled={saving}
                className="size-8 inline-flex items-center justify-center rounded-lg hover:bg-[var(--color-surface-2)] text-[var(--color-fg-muted)]"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-[80px_1fr] gap-2">
                <Field label="Emoji">
                  <input
                    type="text"
                    value={emoji}
                    onChange={(e) => setEmoji(e.target.value)}
                    maxLength={4}
                    className="w-full h-9 px-3 text-center text-lg rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] focus:outline-none focus:border-violet-500/50"
                  />
                </Field>
                <Field label="Nome immobile *">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Es. Appartamento Parigi"
                    className="w-full h-9 px-3 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm focus:outline-none focus:border-violet-500/50"
                  />
                </Field>
              </div>

              <Field label="Possesso">
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() => setHolding("owned")}
                    className={`h-9 px-3 rounded-lg text-xs border transition-colors ${
                      holding === "owned"
                        ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                        : "bg-[var(--color-surface-2)] border-[var(--color-border)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
                    }`}
                  >
                    🔑 Di proprietà
                  </button>
                  <button
                    type="button"
                    onClick={() => setHolding("rented")}
                    className={`h-9 px-3 rounded-lg text-xs border transition-colors ${
                      holding === "rented"
                        ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
                        : "bg-[var(--color-surface-2)] border-[var(--color-border)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
                    }`}
                  >
                    🏷️ In affitto (sono inquilino)
                  </button>
                </div>
              </Field>

              <Field label="Tipo">
                <div className="grid grid-cols-5 gap-1">
                  {TYPE_OPTIONS.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => {
                        setType(t.value);
                        if (emoji === "🏢" || emoji === "🏠" || emoji === "🏬" || emoji === "🌳" || emoji === "📍") {
                          setEmoji(t.emoji);
                        }
                      }}
                      className={`h-9 px-2 rounded-lg text-xs border transition-colors ${
                        type === t.value
                          ? "bg-violet-500/15 border-violet-500/40 text-violet-300"
                          : "bg-[var(--color-surface-2)] border-[var(--color-border)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
                      }`}
                    >
                      {t.emoji} {t.label}
                    </button>
                  ))}
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Città">
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Parigi"
                    className="w-full h-9 px-3 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm focus:outline-none focus:border-violet-500/50"
                  />
                </Field>
                <Field label="Paese">
                  <input
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="Francia"
                    className="w-full h-9 px-3 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm focus:outline-none focus:border-violet-500/50"
                  />
                </Field>
              </div>

              <Field label="Indirizzo">
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Via, civico"
                  className="w-full h-9 px-3 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm focus:outline-none focus:border-violet-500/50"
                />
              </Field>

              {holding === "owned" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Data acquisto">
                      <input
                        type="date"
                        value={purchaseDate}
                        onChange={(e) => setPurchaseDate(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm focus:outline-none focus:border-violet-500/50"
                      />
                    </Field>
                    <Field label="Prezzo acquisto (€)">
                      <input
                        type="number"
                        value={purchasePrice}
                        onChange={(e) => setPurchasePrice(e.target.value)}
                        placeholder="250000"
                        className="w-full h-9 px-3 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm focus:outline-none focus:border-violet-500/50"
                      />
                    </Field>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Valore stimato (€)">
                      <input
                        type="number"
                        value={currentValue}
                        onChange={(e) => setCurrentValue(e.target.value)}
                        placeholder="280000"
                        className="w-full h-9 px-3 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm focus:outline-none focus:border-violet-500/50"
                      />
                    </Field>
                    <Field label="Quota proprietà (%)">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={ownershipShare}
                        onChange={(e) => setOwnershipShare(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm focus:outline-none focus:border-violet-500/50"
                      />
                    </Field>
                  </div>

                  {/* === MORTGAGE SECTION === */}
                  <Field label="Modalità di pagamento">
                    <div className="grid grid-cols-2 gap-1">
                      <button
                        type="button"
                        onClick={() => setPaymentMode("totale")}
                        className={`h-9 px-3 rounded-lg text-xs border transition-colors ${
                          paymentMode === "totale"
                            ? "bg-violet-500/15 border-violet-500/40 text-violet-300"
                            : "bg-[var(--color-surface-2)] border-[var(--color-border)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
                        }`}
                      >
                        💶 Pagamento totale
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentMode("mortgage")}
                        className={`h-9 px-3 rounded-lg text-xs border transition-colors ${
                          paymentMode === "mortgage"
                            ? "bg-violet-500/15 border-violet-500/40 text-violet-300"
                            : "bg-[var(--color-surface-2)] border-[var(--color-border)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
                        }`}
                      >
                        🏦 Con mutuo
                      </button>
                    </div>
                  </Field>

                  {paymentMode === "mortgage" && (
                    <div className="rounded-xl border border-violet-500/30 bg-violet-500/[0.04] p-3 space-y-3">
                      <div className="text-[11px] uppercase tracking-wider text-violet-300 font-medium inline-flex items-center gap-1.5">
                        <Landmark className="size-3.5" />
                        Dettagli mutuo
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Importo mutuo (€) *">
                          <input
                            type="number"
                            value={mortgageAmount}
                            onChange={(e) => setMortgageAmount(e.target.value)}
                            placeholder="200000"
                            className="w-full h-9 px-3 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm focus:outline-none focus:border-violet-500/50"
                          />
                        </Field>
                        <Field label="Tasso annuo (%) *">
                          <input
                            type="number"
                            step="0.01"
                            value={mortgageRate}
                            onChange={(e) => setMortgageRate(e.target.value)}
                            placeholder="3.5"
                            className="w-full h-9 px-3 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm focus:outline-none focus:border-violet-500/50"
                          />
                        </Field>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Durata (mesi) *">
                          <input
                            type="number"
                            value={mortgageDurationMonths}
                            onChange={(e) => setMortgageDurationMonths(e.target.value)}
                            placeholder="240 (20 anni)"
                            className="w-full h-9 px-3 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm focus:outline-none focus:border-violet-500/50"
                          />
                        </Field>
                        <Field label="Data prima rata">
                          <input
                            type="date"
                            value={mortgageStartDate}
                            onChange={(e) => setMortgageStartDate(e.target.value)}
                            className="w-full h-9 px-3 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm focus:outline-none focus:border-violet-500/50"
                          />
                        </Field>
                      </div>
                      {!isEdit && (
                        <Field label="Conto di addebito *">
                          {accounts.length === 0 ? (
                            <div className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2">
                              Nessun conto disponibile. Crea prima un conto liquido in /conti.
                            </div>
                          ) : (
                            <select
                              value={mortgageAccountId}
                              onChange={(e) => setMortgageAccountId(e.target.value)}
                              className="w-full h-9 px-3 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm focus:outline-none focus:border-violet-500/50"
                            >
                              <option value="">Seleziona conto…</option>
                              {accounts.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.emoji} {a.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </Field>
                      )}
                      {previewMonthlyPayment != null && previewMonthlyPayment > 0 && (
                        <div className="rounded-lg bg-violet-500/[0.10] border border-violet-500/30 px-3 py-2 space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-violet-200">Rata mensile stimata</span>
                            <span className="font-semibold tabular-nums text-violet-100">
                              {formatEUR(previewMonthlyPayment)}
                            </span>
                          </div>
                          {totalInterest != null && totalInterest > 0 && (
                            <div className="flex justify-between text-[11px]">
                              <span className="text-[var(--color-fg-muted)]">Interessi totali</span>
                              <span className="tabular-nums text-[var(--color-fg-muted)]">
                                {formatEUR(totalInterest)}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                      {!isEdit && (
                        <p className="text-[10px] text-[var(--color-fg-subtle)] leading-relaxed">
                          Verranno generate automaticamente <strong>12 rate future</strong>{" "}
                          (programmate, da confermare ad ogni addebito) sul conto scelto, con
                          una nuova categoria <strong>🏦 Mutuo {name || "…"}</strong>. Potrai
                          estendere oltre 12 mesi dalla pagina Movimenti → Ricorrenze.
                        </p>
                      )}
                      {isEdit && (
                        <p className="text-[10px] text-amber-300/80 leading-relaxed">
                          ⚠️ Modificare importo/tasso/durata non aggiorna automaticamente le
                          rate già generate. Per allinearle, rigenerale manualmente da
                          Movimenti → Ricorrenze.
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}

              <Field
                label={
                  holding === "owned"
                    ? "Affitto incassato/mese (€) — solo se affittato a terzi"
                    : "Affitto pagato/mese (€)"
                }
              >
                <input
                  type="number"
                  value={monthlyRent}
                  onChange={(e) => setMonthlyRent(e.target.value)}
                  placeholder={holding === "owned" ? "900" : "1200"}
                  className="w-full h-9 px-3 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm focus:outline-none focus:border-violet-500/50"
                />
              </Field>

              <Field label="Note">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm focus:outline-none focus:border-violet-500/50 resize-none"
                />
              </Field>

            </div>

            {error && (
              <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg p-2">
                {error}
              </p>
            )}

            <div className="flex items-center gap-2 justify-end pt-2">
              <button
                onClick={onClose}
                disabled={saving}
                className="h-9 px-4 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm"
              >
                Annulla
              </button>
              <button
                onClick={submit}
                disabled={saving || !name.trim()}
                className="h-9 px-4 rounded-lg bg-violet-500 text-white text-sm font-medium disabled:opacity-50"
              >
                {saving ? "Salvo…" : isEdit ? "Salva modifiche" : "Aggiungi immobile"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] uppercase tracking-wider text-[var(--color-fg-subtle)] font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}
