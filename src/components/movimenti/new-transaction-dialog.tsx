"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  AlertTriangle,
  Save,
  ArrowDownLeft,
  ArrowUpRight,
  Upload,
  FileText,
  TrendingUp,
  ArrowLeftRight,
  Handshake,
} from "lucide-react";
import { CategoryPicker } from "./category-picker";

type FsGroup = {
  id: string;
  name: string;
  emoji: string | null;
  members: { name: string }[];
};

type Account = { id: string; name: string; emoji: string | null; type: string };
type Category = {
  id: string;
  emoji: string;
  name: string;
  type: string;
  group: string;
  estateId?: string | null;
  displayOrder?: number;
};
type Estate = { id: string; name: string; emoji: string | null };
type BeneficiaryHint = {
  name: string;
  count: number;
  topCategoryId: string | null;
  topCategoryEmoji: string | null;
  topCategoryName: string | null;
};

export function NewTransactionDialog({
  open,
  onClose,
  initialMode,
}: {
  open: boolean;
  onClose: () => void;
  initialMode?: "single" | "transfer" | "trade" | "csv" | "friendsplit";
}) {
  const router = useRouter();
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmed, setConfirmed] = useState(true);

  const [mode, setMode] = useState<
    "single" | "csv" | "trade" | "transfer" | "friendsplit"
  >(initialMode ?? "single");

  // Friendsplit-specific state
  const [fsAccountId, setFsAccountId] = useState("");
  const [fsPayer, setFsPayer] = useState<string>("");
  const [fsParticipants, setFsParticipants] = useState<string[]>([]);
  const [fsTotal, setFsTotal] = useState("");
  const [fsPaymentAccountId, setFsPaymentAccountId] = useState("");
  // Meta dinamici da DB: nome utente + membri per ogni gruppo friendsplit
  const [selfName, setSelfName] = useState<string>("");
  const [fsGroups, setFsGroups] = useState<FsGroup[]>([]);

  // Sync mode quando initialMode cambia tra apertura/successiva apertura
  useEffect(() => {
    if (open && initialMode) setMode(initialMode);
  }, [open, initialMode]);

  // Transfer-specific fields
  const [transferToId, setTransferToId] = useState("");

  // Trade-specific fields
  const [tradeDirection, setTradeDirection] = useState<"buy" | "sell">("buy");
  const [tradeAssetType, setTradeAssetType] = useState<"stocks" | "crypto" | "metals" | "altro">(
    "crypto",
  );
  const [tradeAsset, setTradeAsset] = useState("");
  const [tradePlatform, setTradePlatform] = useState("");
  const [tradeQuantity, setTradeQuantity] = useState("");
  const [tradePrice, setTradePrice] = useState("");
  const [tradeCurrency, setTradeCurrency] = useState("EUR");

  const [recurring, setRecurring] = useState(false);
  const [frequency, setFrequency] = useState<"monthly" | "weekly" | "yearly">("monthly");
  const [recMode, setRecMode] = useState<"untilEndOfYear" | "months" | "occurrences">(
    "untilEndOfYear",
  );
  const [recValue, setRecValue] = useState("12");

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [estates, setEstates] = useState<Estate[]>([]);
  const [beneficiaryHints, setBeneficiaryHints] = useState<BeneficiaryHint[]>([]);
  const [beneficiaryDropdownOpen, setBeneficiaryDropdownOpen] = useState(false);
  /** True quando l'utente ha esplicitamente scelto una categoria dal dropdown.
   *  Se così, l'autocomplete del beneficiary NON sovrascrive la categoria. */
  const [categoryManuallyPicked, setCategoryManuallyPicked] = useState(false);
  const beneficiaryWrapRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([
      fetch("/api/accounts").then((r) => (r.ok ? r.json() : { accounts: [] })).catch(() => ({ accounts: [] })),
      fetch("/api/categories").then((r) => (r.ok ? r.json() : { categories: [] })).catch(() => ({ categories: [] })),
      fetch("/api/beneficiaries").then((r) => (r.ok ? r.json() : { beneficiaries: [] })).catch(() => ({ beneficiaries: [] })),
      fetch("/api/estates").then((r) => (r.ok ? r.json() : { estates: [] })).catch(() => ({ estates: [] })),
      fetch("/api/friendsplit/meta").then((r) => (r.ok ? r.json() : { selfName: "", groups: [] })).catch(() => ({ selfName: "", groups: [] })),
    ]).then(([a, c, b, e, fs]) => {
      const accs: Account[] = a.accounts ?? [];
      const cats: Category[] = c.categories ?? [];
      // Tieni TUTTI gli account in state. Il filtro per type (es. escludi
      // friendsplit dal mode "single") va fatto inline in ogni dropdown.
      setAccounts(accs);
      setCategories(cats);
      setBeneficiaryHints(b.beneficiaries ?? []);
      setEstates(e.estates ?? []);
      setSelfName(fs.selfName ?? "");
      setFsGroups(fs.groups ?? []);
      setFsPayer(fs.selfName ?? "");
      // Default account (primo liquid se esiste)
      const today = new Date();
      const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      setDate((prev) => prev || iso);
      // Default: primo conto liquid; fallback al primo non-friendsplit
      // (i friendsplit non vanno mai usati come "conto" del mode single).
      setAccountId(
        (prev) =>
          prev ||
          accs.find((x) => x.type === "liquid")?.id ||
          accs.find((x) => x.type !== "friendsplit")?.id ||
          "",
      );
      setLoading(false);
    });
  }, [open]);

  // Quando seleziono un gruppo friendsplit, pre-popola i partecipanti
  useEffect(() => {
    if (!fsAccountId) return;
    const group = fsGroups.find((g) => g.id === fsAccountId);
    if (!group || group.members.length === 0) return;
    const memberNames = group.members.map((m) => m.name);
    setFsParticipants(memberNames);
    setFsPayer(memberNames.includes(selfName) ? selfName : memberNames[0]);
  }, [fsAccountId, fsGroups, selfName]);

  // Click outside per chiudere il dropdown beneficiary
  useEffect(() => {
    if (!beneficiaryDropdownOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (
        beneficiaryWrapRef.current &&
        !beneficiaryWrapRef.current.contains(e.target as Node)
      ) {
        setBeneficiaryDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [beneficiaryDropdownOpen]);

  function close() {
    setDirection("in");
    setDate("");
    setAmount("");
    setAccountId("");
    setCategoryId("");
    setBeneficiary("");
    setNotes("");
    setConfirmed(true);
    setMode("single");
    setTradeDirection("buy");
    setTradeAssetType("crypto");
    setTradeAsset("");
    setTradePlatform("");
    setTradeQuantity("");
    setTradePrice("");
    setTradeCurrency("EUR");
    setTransferToId("");
    setRecurring(false);
    setFrequency("monthly");
    setRecMode("untilEndOfYear");
    setRecValue("12");
    setCategoryManuallyPicked(false);
    setBeneficiaryDropdownOpen(false);
    setFsAccountId("");
    setFsPayer(selfName);
    setFsParticipants([]);
    setFsTotal("");
    setFsPaymentAccountId("");
    setError(null);
    onClose();
  }

  function goToCsvImport() {
    if (!accountId) {
      setError("Seleziona un conto");
      return;
    }
    router.push(`/import?account=${accountId}`);
    close();
  }

  async function saveTrade() {
    setSaving(true);
    setError(null);
    try {
      const qty = parseFloat(tradeQuantity.replace(",", "."));
      const price = parseFloat(tradePrice.replace(",", "."));
      if (!isFinite(qty) || qty <= 0) throw new Error("Quantità non valida (deve essere > 0)");
      if (!isFinite(price) || price <= 0) throw new Error("Prezzo non valido (deve essere > 0)");
      if (!tradeAsset.trim()) throw new Error("Specifica l'asset (es. BTC, AAPL)");
      if (!accountId) throw new Error("Seleziona il conto bancario");
      if (!date) throw new Error("Inserisci una data");
      if (!isFinite(new Date(date).getTime())) throw new Error("Data non valida");
      const res = await fetch("/api/transactions/trade", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          direction: tradeDirection,
          assetType: tradeAssetType,
          asset: tradeAsset.trim().toUpperCase(),
          platform: tradePlatform.trim() || undefined,
          quantity: qty,
          pricePerUnit: price,
          currency: tradeCurrency,
          date,
          accountId,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? "Errore");
      }
      router.refresh();
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setSaving(false);
    }
  }

  async function saveFriendsplit() {
    setSaving(true);
    setError(null);
    try {
      const total = parseFloat(fsTotal.replace(",", "."));
      if (!isFinite(total) || total <= 0)
        throw new Error("Totale non valido (deve essere > 0)");
      if (!fsAccountId) throw new Error("Seleziona un gruppo friendsplit");
      if (!fsPayer) throw new Error("Seleziona chi ha pagato");
      if (fsParticipants.length === 0)
        throw new Error("Seleziona almeno un partecipante");
      if (fsPayer === selfName && !fsPaymentAccountId)
        throw new Error("Hai pagato tu: seleziona da quale conto sono usciti i soldi");
      if (!date) throw new Error("Inserisci una data");
      if (!isFinite(new Date(date).getTime())) throw new Error("Data non valida");
      const res = await fetch("/api/transactions/friendsplit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          friendsplitAccountId: fsAccountId,
          payerName: fsPayer,
          selfPaymentAccountId:
            fsPayer === selfName ? fsPaymentAccountId : undefined,
          totalAmount: total,
          participants: fsParticipants,
          date,
          categoryId: categoryId || null,
          beneficiary: beneficiary.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? "Errore");
      }
      router.refresh();
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setSaving(false);
    }
  }

  async function saveTransfer() {
    setSaving(true);
    setError(null);
    try {
      const a = parseFloat(amount.replace(",", "."));
      if (!isFinite(a) || a <= 0) throw new Error("Importo non valido (deve essere > 0)");
      if (!accountId) throw new Error("Seleziona il conto di partenza");
      if (!transferToId) throw new Error("Seleziona il conto di destinazione");
      if (accountId === transferToId) throw new Error("I due conti devono essere diversi");
      if (!date || !isFinite(new Date(date).getTime())) throw new Error("Data non valida");
      const res = await fetch("/api/transactions/transfer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fromAccountId: accountId,
          toAccountId: transferToId,
          amount: a,
          date,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? "Errore");
      }
      router.refresh();
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const a = parseFloat(amount.replace(",", "."));
      if (!isFinite(a) || a <= 0) throw new Error("Importo non valido (deve essere > 0)");
      if (!accountId) throw new Error("Seleziona un conto");
      if (!date) throw new Error("Inserisci una data");
      const parsedDate = new Date(date);
      if (!isFinite(parsedDate.getTime())) throw new Error("Data non valida");
      const signed = direction === "in" ? Math.abs(a) : -Math.abs(a);
      const recurrence = recurring
        ? {
            frequency,
            mode: recMode,
            value: recMode !== "untilEndOfYear" ? parseInt(recValue, 10) || 1 : undefined,
          }
        : undefined;
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date,
          amount: signed,
          accountId,
          categoryId: categoryId || null,
          beneficiary: beneficiary.trim() || null,
          notes: notes.trim() || null,
          confirmed,
          recurrence,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? "Errore");
      }
      router.refresh();
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setSaving(false);
    }
  }

  // Beneficiary autocomplete: filtra per substring case-insensitive
  const filteredBeneficiaryHints = useMemo(() => {
    const q = beneficiary.trim().toLowerCase();
    if (q.length < 2) return [];
    return beneficiaryHints
      .filter((b) => b.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [beneficiary, beneficiaryHints]);

  function pickBeneficiaryHint(hint: BeneficiaryHint) {
    setBeneficiary(hint.name);
    // Auto-fill categoria SOLO se l'utente non l'ha ancora scelta a mano
    if (!categoryManuallyPicked && hint.topCategoryId) {
      setCategoryId(hint.topCategoryId);
    }
    setBeneficiaryDropdownOpen(false);
  }

  if (!mounted) return null;

  const dialog = (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={close}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl surface p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Nuovo movimento</h2>
              <button
                onClick={close}
                className="size-8 inline-flex items-center justify-center rounded-lg hover:bg-[var(--surface-2)]"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="grid grid-cols-5 gap-1 p-1 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]">
              <button
                type="button"
                onClick={() => setMode("single")}
                className={`flex items-center justify-center gap-1.5 h-9 rounded-md text-xs font-medium transition-colors ${
                  mode === "single"
                    ? "bg-[var(--surface)] border border-[var(--border)] text-[var(--fg)]"
                    : "text-[var(--fg-muted)] hover:text-[var(--fg)]"
                }`}
              >
                <FileText className="size-4" />
                Movimento
              </button>
              <button
                type="button"
                onClick={() => setMode("transfer")}
                className={`flex items-center justify-center gap-1.5 h-9 rounded-md text-xs font-medium transition-colors ${
                  mode === "transfer"
                    ? "bg-[var(--surface)] border border-[var(--border)] text-[var(--fg)]"
                    : "text-[var(--fg-muted)] hover:text-[var(--fg)]"
                }`}
              >
                <ArrowLeftRight className="size-4" />
                Trasferimento
              </button>
              <button
                type="button"
                onClick={() => setMode("trade")}
                className={`flex items-center justify-center gap-1.5 h-9 rounded-md text-xs font-medium transition-colors ${
                  mode === "trade"
                    ? "bg-[var(--surface)] border border-[var(--border)] text-[var(--fg)]"
                    : "text-[var(--fg-muted)] hover:text-[var(--fg)]"
                }`}
              >
                <TrendingUp className="size-4" />
                Trade
              </button>
              <button
                type="button"
                onClick={() => setMode("friendsplit")}
                className={`flex items-center justify-center gap-1.5 h-9 rounded-md text-xs font-medium transition-colors ${
                  mode === "friendsplit"
                    ? "bg-[var(--surface)] border border-[var(--border)] text-[var(--fg)]"
                    : "text-[var(--fg-muted)] hover:text-[var(--fg)]"
                }`}
              >
                <Handshake className="size-4" />
                Friendsplit
              </button>
              <button
                type="button"
                onClick={() => setMode("csv")}
                className={`flex items-center justify-center gap-1.5 h-9 rounded-md text-xs font-medium transition-colors ${
                  mode === "csv"
                    ? "bg-[var(--surface)] border border-[var(--border)] text-[var(--fg)]"
                    : "text-[var(--fg-muted)] hover:text-[var(--fg)]"
                }`}
              >
                <Upload className="size-4" />
                CSV
              </button>
            </div>

            {mode === "friendsplit" ? (
              <FriendsplitForm
                accounts={accounts}
                categories={categories}
                estates={estates}
                selfName={selfName}
                fsGroups={fsGroups}
                fsAccountId={fsAccountId}
                setFsAccountId={setFsAccountId}
                fsPayer={fsPayer}
                setFsPayer={setFsPayer}
                fsParticipants={fsParticipants}
                setFsParticipants={setFsParticipants}
                fsTotal={fsTotal}
                setFsTotal={setFsTotal}
                fsPaymentAccountId={fsPaymentAccountId}
                setFsPaymentAccountId={setFsPaymentAccountId}
                date={date}
                setDate={setDate}
                categoryId={categoryId}
                setCategoryId={setCategoryId}
                setCategoryManuallyPicked={setCategoryManuallyPicked}
                beneficiary={beneficiary}
                setBeneficiary={setBeneficiary}
                notes={notes}
                setNotes={setNotes}
                error={error}
                saving={saving}
                onSave={saveFriendsplit}
                onCancel={close}
                loading={loading}
              />
            ) : mode === "trade" ? (
              <div className="space-y-4">
                <div className="text-sm text-[var(--fg-muted)]">
                  Registra una trade su asset investimento. L&apos;app crea
                  automaticamente l&apos;uscita dal conto bancario + entrata sull&apos;account
                  Investimenti, e per crypto su platform manuale aggiorna posizione e cost basis.
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTradeDirection("buy")}
                    className={`flex items-center justify-center gap-2 h-9 rounded-lg text-sm font-medium border transition-colors ${
                      tradeDirection === "buy"
                        ? "bg-rose-500/15 border-rose-500/40 text-rose-400"
                        : "bg-[var(--surface-2)] border-[var(--border)] text-[var(--fg-muted)]"
                    }`}
                  >
                    BUY
                  </button>
                  <button
                    type="button"
                    onClick={() => setTradeDirection("sell")}
                    className={`flex items-center justify-center gap-2 h-9 rounded-lg text-sm font-medium border transition-colors ${
                      tradeDirection === "sell"
                        ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                        : "bg-[var(--surface-2)] border-[var(--border)] text-[var(--fg-muted)]"
                    }`}
                  >
                    SELL
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">
                      Asset type
                    </label>
                    <select
                      value={tradeAssetType}
                      onChange={(e) =>
                        setTradeAssetType(
                          e.target.value as "stocks" | "crypto" | "metals" | "altro",
                        )
                      }
                      className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-violet-500/50"
                    >
                      <option value="crypto">🚀 Crypto</option>
                      <option value="stocks">📈 Stocks</option>
                      <option value="metals">💰 Metals</option>
                      <option value="altro">🌾 Altro</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">
                      Asset / ticker
                    </label>
                    <input
                      type="text"
                      value={tradeAsset}
                      onChange={(e) => setTradeAsset(e.target.value)}
                      placeholder={tradeAssetType === "crypto" ? "BTC" : tradeAssetType === "stocks" ? "AAPL" : "XAU"}
                      className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm font-mono uppercase focus:outline-none focus:border-violet-500/50"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">
                      Quantità
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={tradeQuantity}
                      onChange={(e) => setTradeQuantity(e.target.value)}
                      placeholder="1.5"
                      className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm tabular-nums focus:outline-none focus:border-violet-500/50"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">
                      Prezzo unit.
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={tradePrice}
                      onChange={(e) => setTradePrice(e.target.value)}
                      placeholder="2332.50"
                      className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm tabular-nums focus:outline-none focus:border-violet-500/50"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">
                      Valuta
                    </label>
                    <select
                      value={tradeCurrency}
                      onChange={(e) => setTradeCurrency(e.target.value)}
                      className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-violet-500/50"
                    >
                      <option value="EUR">EUR</option>
                      <option value="USD">USD</option>
                      <option value="GBP">GBP</option>
                      <option value="CHF">CHF</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">
                      Data
                    </label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-violet-500/50"
                    />
                  </div>
                </div>
                {tradeAssetType === "crypto" && (
                  <div className="space-y-1">
                    <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">
                      Platform crypto{" "}
                      <span className="text-[var(--fg-subtle)] normal-case tracking-normal">
                        (es. Binance, Revolut X — opzionale ma consigliato)
                      </span>
                    </label>
                    <input
                      type="text"
                      value={tradePlatform}
                      onChange={(e) => setTradePlatform(e.target.value)}
                      placeholder="Revolut X"
                      className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-violet-500/50"
                    />
                    <p className="text-[11px] text-[var(--fg-subtle)]">
                      Se specificato, aggiorna anche CryptoPosition manuale e cost basis.
                    </p>
                  </div>
                )}
                <div className="space-y-1">
                  <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">
                    Conto bancario (da cui esce / dove entra il denaro)
                  </label>
                  <select
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    disabled={loading}
                    className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-violet-500/50"
                  >
                    {accounts
                      .filter((a) => a.type !== "investment")
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.emoji ?? "💳"} {a.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">
                    Note <span className="text-[var(--fg-subtle)] normal-case tracking-normal">(opzionale)</span>
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-violet-500/50"
                  />
                </div>
                {tradeQuantity && tradePrice && (
                  <div className="rounded-lg bg-[var(--surface-2)]/50 border border-[var(--border)] p-3 text-sm">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[var(--fg-muted)]">Totale trade</span>
                      <span className="font-semibold tabular-nums">
                        {(parseFloat(tradeQuantity) * parseFloat(tradePrice) || 0).toFixed(2)}{" "}
                        {tradeCurrency}
                      </span>
                    </div>
                    {tradeCurrency !== "EUR" && (
                      <div className="text-[11px] text-[var(--fg-subtle)] mt-1">
                        Conversione EUR a FX corrente, calcolata server-side
                      </div>
                    )}
                  </div>
                )}
                {error && (
                  <div className="text-sm text-rose-400 inline-flex items-center gap-1.5">
                    <AlertTriangle className="size-4" /> {error}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button
                    onClick={saveTrade}
                    disabled={
                      saving || !tradeAsset.trim() || !tradeQuantity || !tradePrice || !accountId
                    }
                    className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-sm font-medium disabled:opacity-50"
                  >
                    <TrendingUp className="size-4" />
                    {saving ? "Salvo trade…" : `Registra ${tradeDirection.toUpperCase()}`}
                  </button>
                  <button
                    onClick={close}
                    disabled={saving}
                    className="h-9 px-4 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm"
                  >
                    Annulla
                  </button>
                </div>
              </div>
            ) : mode === "csv" ? (
              <div className="space-y-4">
                <div className="text-sm text-[var(--fg-muted)]">
                  Seleziona il conto a cui appartiene il CSV. I movimenti senza conto
                  riconosciuto in automatico useranno questo come default.
                </div>
                <div className="space-y-1">
                  <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">
                    Conto
                  </label>
                  <select
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    disabled={loading}
                    className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-violet-500/50"
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.emoji ?? "💳"} {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                {error && (
                  <div className="text-sm text-rose-400 inline-flex items-center gap-1.5">
                    <AlertTriangle className="size-4" /> {error}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button
                    onClick={goToCsvImport}
                    disabled={!accountId}
                    className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-sm font-medium disabled:opacity-50"
                  >
                    <Upload className="size-4" />
                    Apri import CSV
                  </button>
                  <button
                    onClick={close}
                    className="h-9 px-4 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm"
                  >
                    Annulla
                  </button>
                </div>
              </div>
            ) : mode === "transfer" ? (
              <div className="space-y-4">
                <div className="text-sm text-[var(--fg-muted)]">
                  Sposta denaro tra due tuoi conti. Crea automaticamente la coppia
                  uscita/entrata col vincolo di trasferimento.
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">Da</label>
                    <select
                      value={accountId}
                      onChange={(e) => setAccountId(e.target.value)}
                      disabled={loading}
                      className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-violet-500/50"
                    >
                      <option value="">— Seleziona —</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.emoji ?? "💳"} {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">A</label>
                    <select
                      value={transferToId}
                      onChange={(e) => setTransferToId(e.target.value)}
                      disabled={loading}
                      className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-violet-500/50"
                    >
                      <option value="">— Seleziona —</option>
                      {accounts
                        .filter((a) => a.id !== accountId)
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.emoji ?? "💳"} {a.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">Importo (€)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0,00"
                      className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm tabular-nums focus:outline-none focus:border-violet-500/50"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">Data</label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-violet-500/50"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">Note (opz.)</label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Es. Travaso mensile risparmi"
                    className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-violet-500/50"
                  />
                </div>
                {error && (
                  <div className="text-sm text-rose-400 inline-flex items-center gap-1.5">
                    <AlertTriangle className="size-4" /> {error}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button
                    onClick={saveTransfer}
                    disabled={
                      saving ||
                      !accountId ||
                      !transferToId ||
                      accountId === transferToId ||
                      !amount ||
                      !date
                    }
                    className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-sm font-medium disabled:opacity-50"
                  >
                    <ArrowLeftRight className="size-4" />
                    {saving ? "Salvo…" : "Trasferisci"}
                  </button>
                  <button
                    onClick={close}
                    disabled={saving}
                    className="h-9 px-4 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm"
                  >
                    Annulla
                  </button>
                </div>
              </div>
            ) : (
            <>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDirection("in")}
                className={`flex items-center justify-center gap-2 h-10 rounded-lg text-sm font-medium border transition-colors ${
                  direction === "in"
                    ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                    : "bg-[var(--surface-2)] border-[var(--border)] text-[var(--fg-muted)]"
                }`}
              >
                <ArrowDownLeft className="size-4" />
                Entrata
              </button>
              <button
                type="button"
                onClick={() => setDirection("out")}
                className={`flex items-center justify-center gap-2 h-10 rounded-lg text-sm font-medium border transition-colors ${
                  direction === "out"
                    ? "bg-rose-500/15 border-rose-500/40 text-rose-400"
                    : "bg-[var(--surface-2)] border-[var(--border)] text-[var(--fg-muted)]"
                }`}
              >
                <ArrowUpRight className="size-4" />
                Uscita
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">Data</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-violet-500/50"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">
                  Importo (EUR)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm tabular-nums focus:outline-none focus:border-violet-500/50"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">Conto</label>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  disabled={loading}
                  className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-violet-500/50"
                >
                  {accounts
                    .filter((a) => a.type !== "friendsplit")
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.emoji ?? "💳"} {a.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">Categoria</label>
                <CategoryPicker
                  variant="input"
                  value={categoryId || null}
                  categories={categories}
                  estates={estates}
                  disabled={loading}
                  onChange={(catId) => {
                    setCategoryId(catId ?? "");
                    setCategoryManuallyPicked(true);
                  }}
                />
              </div>
            </div>

            <div className="space-y-1" ref={beneficiaryWrapRef}>
              <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">
                Beneficiario / Mittente
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={beneficiary}
                  onChange={(e) => {
                    setBeneficiary(e.target.value);
                    setBeneficiaryDropdownOpen(true);
                  }}
                  onFocus={() => setBeneficiaryDropdownOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setBeneficiaryDropdownOpen(false);
                  }}
                  placeholder={direction === "in" ? "Es. Stipendio Courage" : "Es. Affitto, Spesa Esselunga"}
                  className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-violet-500/50"
                  autoComplete="off"
                />
                {beneficiaryDropdownOpen && filteredBeneficiaryHints.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-10 rounded-lg bg-[var(--bg-elevated)]/95 backdrop-blur border border-[var(--border)] shadow-xl max-h-60 overflow-y-auto py-1">
                    {filteredBeneficiaryHints.map((h) => (
                      <button
                        type="button"
                        key={h.name}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pickBeneficiaryHint(h)}
                        className="w-full text-left px-3 py-1.5 hover:bg-[var(--surface-2)] flex items-center justify-between gap-2"
                      >
                        <span className="truncate text-sm">{h.name}</span>
                        <span className="text-[10px] text-[var(--fg-subtle)] inline-flex items-center gap-2 shrink-0">
                          {h.topCategoryEmoji && (
                            <span className="text-[var(--fg-muted)]">
                              {h.topCategoryEmoji} {h.topCategoryName}
                            </span>
                          )}
                          <span className="tabular-nums">×{h.count}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">
                Note <span className="text-[var(--fg-subtle)] normal-case tracking-normal">(opzionale)</span>
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-violet-500/50"
              />
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[var(--border)] pt-3">
              {direction === "in" && (
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    className="size-4 accent-violet-500"
                  />
                  <span className="text-sm">
                    Già incassato
                    <span className="text-[var(--fg-subtle)] ml-1.5 text-xs">
                      (se futura, deseleziona)
                    </span>
                  </span>
                </label>
              )}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={recurring}
                  onChange={(e) => setRecurring(e.target.checked)}
                  className="size-4 accent-violet-500"
                />
                <span className="text-sm font-medium">Ricorrente</span>
                <span className="text-[var(--fg-subtle)] text-xs">
                  (occorrenze future)
                </span>
              </label>
            </div>

            {recurring && (
              <div className="space-y-3 rounded-lg bg-[var(--surface-2)]/40 border border-[var(--border)] p-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">
                      Frequenza
                    </label>
                    <select
                      value={frequency}
                      onChange={(e) =>
                        setFrequency(e.target.value as "monthly" | "weekly" | "yearly")
                      }
                      className="w-full h-9 rounded-lg bg-[var(--surface)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-violet-500/50"
                    >
                      <option value="monthly">Mensile</option>
                      <option value="weekly">Settimanale</option>
                      <option value="yearly">Annuale</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">
                      Durata
                    </label>
                    <select
                      value={recMode}
                      onChange={(e) =>
                        setRecMode(
                          e.target.value as "untilEndOfYear" | "months" | "occurrences",
                        )
                      }
                      className="w-full h-9 rounded-lg bg-[var(--surface)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-violet-500/50"
                    >
                      <option value="untilEndOfYear">Fino a fine anno</option>
                      <option value="months">Per N mesi</option>
                      <option value="occurrences">Per N rate</option>
                    </select>
                  </div>
                </div>

                {recMode !== "untilEndOfYear" && (
                  <div className="space-y-1">
                    <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">
                      {recMode === "months" ? "Numero di mesi" : "Numero di rate"}
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="240"
                      value={recValue}
                      onChange={(e) => setRecValue(e.target.value)}
                      className="w-full h-9 rounded-lg bg-[var(--surface)] border border-[var(--border)] px-3 text-sm tabular-nums focus:outline-none focus:border-violet-500/50"
                    />
                  </div>
                )}

                <p className="text-[11px] text-[var(--fg-subtle)] italic">
                  Le occorrenze future restano &quot;non confermate&quot; finché non le spunti.
                  Per fermarle, cancella le righe future.
                </p>
              </div>
            )}

            {error && (
              <div className="text-sm text-rose-400 inline-flex items-center gap-1.5">
                <AlertTriangle className="size-4" /> {error}
              </div>
            )}

            <div className="flex items-center gap-2">
              {(() => {
                const a = parseFloat(amount.replace(",", "."));
                const amountOk = isFinite(a) && a > 0;
                const dateOk = !!date && isFinite(new Date(date).getTime());
                const formValid = amountOk && !!accountId && dateOk;
                return (
                  <button
                    onClick={save}
                    disabled={saving || !formValid}
                    title={!formValid ? "Compila importo (>0), conto e data" : undefined}
                    className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-sm font-medium disabled:opacity-50"
                  >
                    <Save className="size-4" />
                    {saving ? "Salvo…" : "Aggiungi movimento"}
                  </button>
                );
              })()}
              <button
                onClick={close}
                disabled={saving}
                className="h-9 px-4 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm"
              >
                Annulla
              </button>
            </div>
            </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(dialog, document.body);
}

/**
 * Form per registrare una spesa friendsplit. Calcola in anteprima la quota
 * mia e cosa verrà creato (1 o 2 tx) prima di salvare.
 */
function FriendsplitForm({
  accounts,
  categories,
  estates,
  fsAccountId,
  setFsAccountId,
  fsPayer,
  setFsPayer,
  fsParticipants,
  setFsParticipants,
  fsTotal,
  setFsTotal,
  fsPaymentAccountId,
  setFsPaymentAccountId,
  date,
  setDate,
  categoryId,
  setCategoryId,
  setCategoryManuallyPicked,
  beneficiary,
  setBeneficiary,
  notes,
  setNotes,
  selfName,
  fsGroups,
  error,
  saving,
  onSave,
  onCancel,
  loading,
}: {
  accounts: Account[];
  categories: Category[];
  estates: Estate[];
  fsAccountId: string;
  setFsAccountId: (v: string) => void;
  fsPayer: string;
  setFsPayer: (v: string) => void;
  fsParticipants: string[];
  setFsParticipants: (v: string[]) => void;
  fsTotal: string;
  setFsTotal: (v: string) => void;
  fsPaymentAccountId: string;
  setFsPaymentAccountId: (v: string) => void;
  date: string;
  setDate: (v: string) => void;
  categoryId: string;
  setCategoryId: (v: string) => void;
  setCategoryManuallyPicked: (v: boolean) => void;
  beneficiary: string;
  setBeneficiary: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  selfName: string;
  fsGroups: FsGroup[];
  error: string | null;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const fsAccounts = accounts.filter((a) => a.type === "friendsplit");
  const selectedGroup = fsGroups.find((g) => g.id === fsAccountId) ?? null;
  const memberNames = selectedGroup?.members.map((m) => m.name) ?? [];

  const total = parseFloat(fsTotal.replace(",", ".")) || 0;
  const isSelfPayer = fsPayer === selfName;
  const selfIsParticipant = fsParticipants.includes(selfName);
  const myShare =
    selfIsParticipant && fsParticipants.length > 0
      ? total / fsParticipants.length
      : 0;
  const othersOwe = isSelfPayer ? total - myShare : 0;

  function toggleParticipant(name: string) {
    if (fsParticipants.includes(name)) {
      setFsParticipants(fsParticipants.filter((p) => p !== name));
    } else {
      setFsParticipants([...fsParticipants, name]);
    }
  }

  if (fsAccounts.length === 0) {
    return (
      <div className="space-y-4">
        <div className="text-sm text-[var(--fg-muted)] text-center py-8">
          Nessun account friendsplit. Crea prima un conto di tipo
          &quot;friendsplit&quot; in /conti per usare questo flusso.
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="h-9 px-4 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm"
          >
            Chiudi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-[var(--fg-muted)]">
        Registra una spesa condivisa. L&apos;app crea automaticamente le tx sui
        conti giusti in base a chi ha pagato e come si divide.
      </div>

      <div className="space-y-1">
        <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">
          Gruppo friendsplit
        </label>
        <select
          value={fsAccountId}
          onChange={(e) => setFsAccountId(e.target.value)}
          disabled={loading}
          className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-violet-500/50"
        >
          <option value="">— Seleziona —</option>
          {fsAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.emoji ?? "🤝"} {a.name}
            </option>
          ))}
        </select>
      </div>

      {selectedGroup && (
        <>
          <div className="space-y-1">
            <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">
              Chi ha pagato?
            </label>
            <div className="flex flex-wrap gap-2">
              {memberNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setFsPayer(name)}
                  className={`h-9 px-3 rounded-lg text-sm font-medium border transition-colors ${
                    fsPayer === name
                      ? "bg-violet-500/15 border-violet-500/40 text-violet-300"
                      : "bg-[var(--surface-2)] border-[var(--border)] text-[var(--fg-muted)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  {name === selfName ? `${name} (io)` : name}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">
              Chi ha partecipato? (split tra questi)
            </label>
            <div className="flex flex-wrap gap-2">
              {memberNames.map((name) => {
                const checked = fsParticipants.includes(name);
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => toggleParticipant(name)}
                    className={`h-9 px-3 rounded-lg text-sm border transition-colors inline-flex items-center gap-1.5 ${
                      checked
                        ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                        : "bg-[var(--surface-2)] border-[var(--border)] text-[var(--fg-muted)] hover:border-[var(--border-strong)]"
                    }`}
                  >
                    {checked ? "✓" : "○"} {name === selfName ? `${name} (io)` : name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">
                Totale (€)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={fsTotal}
                onChange={(e) => setFsTotal(e.target.value)}
                placeholder="0,00"
                className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm tabular-nums focus:outline-none focus:border-violet-500/50"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">
                Data
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-violet-500/50"
              />
            </div>
          </div>

          {isSelfPayer && (
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">
                Da quale conto sono usciti i soldi?
              </label>
              <select
                value={fsPaymentAccountId}
                onChange={(e) => setFsPaymentAccountId(e.target.value)}
                className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-violet-500/50"
              >
                <option value="">— Seleziona conto —</option>
                {accounts
                  .filter(
                    (a) =>
                      a.type !== "friendsplit" &&
                      a.type !== "investment" &&
                      a.type !== "credit",
                  )
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.emoji ?? "💳"} {a.name}
                    </option>
                  ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">
                Categoria
              </label>
              <CategoryPicker
                variant="input"
                value={categoryId || null}
                categories={categories}
                estates={estates}
                disabled={loading}
                onChange={(catId) => {
                  setCategoryId(catId ?? "");
                  setCategoryManuallyPicked(true);
                }}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">
                Beneficiario
              </label>
              <input
                type="text"
                value={beneficiary}
                onChange={(e) => setBeneficiary(e.target.value)}
                placeholder="Es. Esselunga"
                className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-violet-500/50"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">
              Note (opz.)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-violet-500/50"
            />
          </div>

          {/* Anteprima delle tx generate */}
          {total > 0 && fsParticipants.length > 0 && (
            <div className="rounded-lg border border-violet-500/30 bg-violet-500/[0.04] p-3 space-y-2 text-xs">
              <div className="font-medium text-violet-200">Anteprima movimenti</div>
              {isSelfPayer ? (
                <>
                  <div className="text-[var(--fg-muted)]">
                    • <span className="text-rose-300 tabular-nums">
                      −{total.toFixed(2)} €
                    </span>{" "}
                    sul conto pagamento (uscita reale)
                  </div>
                  {othersOwe > 0.001 && (
                    <div className="text-[var(--fg-muted)]">
                      • <span className="text-emerald-300 tabular-nums">
                        +{othersOwe.toFixed(2)} €
                      </span>{" "}
                      sul friendsplit (gli altri ti devono questa quota)
                    </div>
                  )}
                  <div className="text-[10px] text-[var(--fg-subtle)] pt-1 border-t border-violet-500/20">
                    Quota tua: <span className="tabular-nums">{myShare.toFixed(2)} €</span>
                    {" su "}
                    <span className="tabular-nums">{fsParticipants.length}</span> partecipanti
                  </div>
                </>
              ) : (
                <>
                  {myShare > 0.001 ? (
                    <div className="text-[var(--fg-muted)]">
                      • <span className="text-rose-300 tabular-nums">
                        −{myShare.toFixed(2)} €
                      </span>{" "}
                      sul friendsplit (devi questa quota a {fsPayer})
                    </div>
                  ) : (
                    <div className="text-amber-300">
                      ⚠ Non sei tra i partecipanti — niente da registrare
                    </div>
                  )}
                  <div className="text-[10px] text-[var(--fg-subtle)] pt-1 border-t border-violet-500/20">
                    Quota tua: <span className="tabular-nums">{myShare.toFixed(2)} €</span>
                    {" su "}
                    <span className="tabular-nums">{fsParticipants.length}</span> partecipanti
                  </div>
                </>
              )}
            </div>
          )}

          {error && (
            <div className="text-sm text-rose-400 inline-flex items-center gap-1.5">
              <AlertTriangle className="size-4" /> {error}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={onSave}
              disabled={
                saving ||
                !fsAccountId ||
                !fsTotal ||
                !date ||
                fsParticipants.length === 0 ||
                (isSelfPayer && !fsPaymentAccountId)
              }
              className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-sm font-medium disabled:opacity-50"
            >
              <Handshake className="size-4" />
              {saving ? "Salvo…" : "Registra spesa"}
            </button>
            <button
              onClick={onCancel}
              disabled={saving}
              className="h-9 px-4 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm"
            >
              Annulla
            </button>
          </div>
        </>
      )}
    </div>
  );
}
