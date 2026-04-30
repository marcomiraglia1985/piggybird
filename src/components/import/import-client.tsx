"use client";

import { useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import {
  UploadCloud,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Plus,
  ArrowUpRight,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { formatEUR, formatDate, cn } from "@/lib/utils";
import { SUPPORTED_BANKS } from "@/lib/csv-parsers/banks";
import { CategoryPicker } from "@/components/movimenti/category-picker";

type SoftDupInfo = {
  id: string;
  beneficiary: string | null;
  notes: string | null;
  categoryId: string | null;
  categoryEmoji: string | null;
  categoryName: string | null;
};

type ParsedRow = {
  externalId: string;
  date: string;
  amount: number;
  description: string;
  rawType?: string;
  suggestedAccount?: string;
  suggestedCategoryEmoji?: string | null;
  duplicateOf?: string | null;
  softDuplicateOf?: SoftDupInfo | null;
  notes?: string | null;
  currency: string;
  transferGroupId?: string | null;
  isTransfer?: boolean;
  confirmsRecurrence?: { txId: string; newDate: string; newAmount: number } | null;
};

type Account = { id: string; name: string; emoji: string | null };
type Category = {
  id: string;
  emoji: string;
  name: string;
  group: string;
  type: string;
  estateId?: string | null;
  displayOrder?: number;
};
type Estate = { id: string; name: string; emoji: string | null };

type ParseResponse = {
  format: string;
  rows: ParsedRow[];
  warnings: string[];
  accounts: Account[];
  categories: Category[];
  estates?: Estate[];
};

type Editable = {
  externalId: string;
  date: string;
  amount: number;
  description: string;
  accountId: string;
  categoryId: string | null;
  /** Categoria suggerita automaticamente dallo storico (emoji) */
  suggestedCategoryEmoji?: string | null;
  /** Account suggerito automaticamente */
  suggestedAccountName?: string | null;
  notes: string | null;
  isDuplicate: boolean;
  isTransfer: boolean;
  transferGroupId: string | null;
  isJoint: boolean;
  selected: boolean;
  /** Se settato, la riga CSV "spunta" una tx programmata: il commit
   *  aggiornerà la tx invece di crearne una nuova. */
  confirmsRecurrence?: { txId: string; newDate: string; newAmount: number } | null;
  /** Soft-duplicate: stessa data+amount+conto ma description diversa (tx
   *  manuale già presente). L'utente sceglie merge/replace/keep both. */
  softDuplicate?: SoftDupInfo | null;
  /** Action per il commit. Default per soft-dup = "merge", altrimenti "create". */
  action: "create" | "merge" | "replace";
};

export function ImportClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const preselectedAccountId = searchParams.get("account");
  const [stage, setStage] = useState<
    "idle" | "parsing" | "pair" | "no-accounts" | "review" | "committing" | "done"
  >("idle");
  const [data, setData] = useState<ParseResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Editable[]>([]);
  const [targetAccountId, setTargetAccountId] = useState<string>("");
  const [committed, setCommitted] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [hideDuplicates, setHideDuplicates] = useState(false);
  // Banche aggiunte dinamicamente via universal AI fallback (es. N26).
  // Mostrate accanto a SUPPORTED_BANKS hardcoded col badge ✨.
  const [aiBanks, setAiBanks] = useState<{ name: string; usageCount: number }[]>([]);

  useEffect(() => {
    fetch("/api/parser-templates")
      .then((r) => r.json())
      .then((d) => setAiBanks(Array.isArray(d.banks) ? d.banks : []))
      .catch(() => {});
  }, []);

  const onFile = useCallback(async (file: File) => {
    setStage("parsing");
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/import/parse", { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Errore parsing");
      }
      const json = (await res.json()) as ParseResponse;
      setData(json);
      // 0 conti? Empty state che chiede di crearne uno prima di importare.
      if (json.accounts.length === 0) {
        setStage("no-accounts");
        return;
      }
      // Default targetAccountId: 1) ?account= in URL  2) primo conto.
      const initialTarget =
        preselectedAccountId &&
        json.accounts.some((a) => a.id === preselectedAccountId)
          ? preselectedAccountId
          : json.accounts[0].id;
      setTargetAccountId(initialTarget);
      setStage("pair");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore sconosciuto");
      setStage("idle");
    }
  }, [preselectedAccountId]);

  // Quando l'utente conferma il conto target, costruisce gli edits con quel
  // conto come accountId per tutte le righe (override del suggestedAccount).
  function confirmPairing() {
    if (!data || !targetAccountId) return;
    const catByEmoji = new Map(data.categories.map((c) => [c.emoji, c]));
    setEdits(
      data.rows.map((r) => {
        const cat = r.suggestedCategoryEmoji ? catByEmoji.get(r.suggestedCategoryEmoji) : null;
        return {
          externalId: r.externalId,
          date: r.date,
          amount: r.amount,
          description: r.description,
          accountId: targetAccountId,
          categoryId: cat?.id ?? null,
          suggestedCategoryEmoji: r.suggestedCategoryEmoji ?? null,
          suggestedAccountName: r.suggestedAccount ?? null,
          // PRESERVA la causale estesa (Descrizione_Completa Fineco, Description
          // Revolut/BNP). È il segnale più forte per la categorizzazione AI e
          // permette all'utente di vedere la causale del bonifico/movimento.
          notes: r.notes ?? null,
          isDuplicate: !!r.duplicateOf,
          isTransfer: !!r.isTransfer,
          transferGroupId: r.transferGroupId ?? null,
          isJoint: false,
          // Soft-dup: di default selected (faremo merge per non perdere
          // info) — l'utente può cambiare a Keep Both o disattivare
          selected: (!r.duplicateOf && !r.softDuplicateOf) || !!r.confirmsRecurrence || !!r.softDuplicateOf,
          confirmsRecurrence: r.confirmsRecurrence ?? null,
          softDuplicate: r.softDuplicateOf ?? null,
          action: r.softDuplicateOf ? "merge" : "create",
        };
      }),
    );
    setStage("review");
  }

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    },
    [onFile],
  );

  const onCommit = useCallback(async () => {
    if (!data) return;
    setStage("committing");
    const selected = edits.filter((e) => e.selected);
    // Le righe che confermano una ricorrenza non vengono inserite — il commit
    // aggiorna la tx programmata esistente. Le altre creano una nuova tx.
    const toInsert = selected.filter((e) => !e.confirmsRecurrence);
    const confirmRecurrences = selected
      .filter((e) => e.confirmsRecurrence)
      .map((e) => e.confirmsRecurrence!);
    const rows = toInsert.map((e) => ({
      date: e.date,
      amount: e.amount,
      accountId: e.accountId,
      categoryId: e.categoryId,
      beneficiary: e.description || null,
      notes: e.notes,
      transferGroupId: e.transferGroupId,
      isJoint: e.isJoint,
      // Soft-dup actions
      action: e.softDuplicate ? e.action : "create",
      ...(e.softDuplicate && e.action !== "create"
        ? { existingTxId: e.softDuplicate.id }
        : {}),
    }));
    try {
      const res = await fetch("/api/import/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows, confirmRecurrences }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Errore inserimento");
      }
      const json = await res.json();
      const inserted = json.inserted ?? 0;
      const confirmed = json.confirmed ?? 0;
      const merged = json.merged ?? 0;
      const replaced = json.replaced ?? 0;
      setCommitted(inserted + confirmed + merged + replaced);
      const parts: string[] = [];
      if (inserted > 0) parts.push(`${inserted} nuovi`);
      if (merged > 0) parts.push(`${merged} arricchiti (merge)`);
      if (replaced > 0) parts.push(`${replaced} sostituiti`);
      if (confirmed > 0) parts.push(`${confirmed} ricorrenze confermate`);
      toast({
        title: `Import completato`,
        description: parts.join(" · ") || "0 movimenti",
        variant: "success",
      });
      setStage("done");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore sconosciuto");
      setStage("review");
    }
  }, [data, edits, router]);

  const reset = () => {
    setStage("idle");
    setData(null);
    setEdits([]);
    setError(null);
    setCommitted(0);
  };

  if (stage === "no-accounts") {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-6">
        <div className="size-16 mx-auto rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center">
          <AlertTriangle className="size-7 text-amber-400" />
        </div>
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">Crea prima un conto</h2>
          <p className="text-sm text-[var(--fg-muted)]">
            Per importare un CSV serve almeno un conto su cui far confluire i movimenti.
            Crea il conto della banca/exchange di cui stai per importare l&apos;estratto.
          </p>
        </div>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <button
            onClick={() => router.push("/conti/nuovo")}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--fg)] text-[var(--bg)] px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="size-4" /> Crea primo conto
          </button>
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--surface)] transition-colors"
          >
            Annulla
          </button>
        </div>
      </div>
    );
  }

  if (stage === "pair" && data) {
    const matched = SUPPORTED_BANKS.find((b) => b.format === data.format);
    const fmt = matched ? matched.name : data.format;
    return (
      <div className="max-w-xl mx-auto py-12 space-y-6">
        <div className="text-center space-y-2">
          <div className="size-14 mx-auto rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center">
            <FileText className="size-6 text-[var(--fg-muted)]" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight">CSV riconosciuto: {fmt}</h2>
          <p className="text-sm text-[var(--fg-muted)]">
            {data.rows.length} righe trovate. In quale dei tuoi conti vanno questi movimenti?
          </p>
        </div>
        <div className="surface p-4 space-y-3">
          <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">
            Conto di destinazione
          </label>
          <select
            value={targetAccountId}
            onChange={(e) => setTargetAccountId(e.target.value)}
            className="w-full h-10 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-violet-500/50"
          >
            {data.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.emoji ?? "💳"} {a.name}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-[var(--fg-subtle)]">
            Tutte le righe dell&apos;import useranno questo conto. Potrai cambiarlo per singola
            riga nello step successivo.
          </p>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={reset}
            className="h-9 px-4 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-sm hover:border-[var(--border-strong)]"
          >
            Annulla
          </button>
          <button
            onClick={confirmPairing}
            disabled={!targetAccountId}
            className="h-9 px-4 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-sm font-medium disabled:opacity-50 inline-flex items-center gap-2"
          >
            Avanti
            <ArrowUpRight className="size-4" />
          </button>
        </div>
      </div>
    );
  }

  if (stage === "idle" || stage === "parsing") {
    return (
      <div className="space-y-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={cn(
            "relative rounded-2xl border-2 border-dashed p-12 text-center transition-colors",
            dragOver
              ? "border-violet-500/60 bg-violet-500/5"
              : "border-[var(--border-strong)] bg-[var(--surface)]/40",
          )}
        >
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-3"
          >
            <div className="size-14 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <UploadCloud className="size-7 text-white" />
            </div>
            <div>
              <p className="text-base font-medium">
                {stage === "parsing"
                  ? "Analisi del file…"
                  : "Trascina qui il file (CSV o XLSX)"}
              </p>
              <p className="text-sm text-[var(--fg-muted)] mt-1">
                Il formato viene riconosciuto automaticamente. Banche
                supportate qui sotto.
              </p>
            </div>
            <label className="cursor-pointer inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-sm hover:border-[var(--border-strong)]">
              <FileText className="size-4" />
              Sfoglia…
              <input
                type="file"
                accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                }}
              />
            </label>
          </motion.div>
        </div>

        {error && (
          <div className="surface border-rose-500/30 bg-rose-500/5 p-4 text-sm flex items-start gap-2">
            <AlertTriangle className="size-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-wider text-[var(--fg-subtle)] text-center">
            Banche supportate
          </p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {SUPPORTED_BANKS.map((b) => (
              <span
                key={b.format}
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-xs"
              >
                <span>{b.flag}</span>
                <span className="font-medium">{b.name}</span>
              </span>
            ))}
            {aiBanks.map((b) => (
              <span
                key={`ai-${b.name}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-xs"
              >
                <span>🏦</span>
                <span className="font-medium">{b.name}</span>
              </span>
            ))}
          </div>
          <p className="text-[11px] text-[var(--fg-subtle)] text-center pt-1">
            Riconoscimento automatico dell&apos;header — nessuna selezione manuale
            del formato. Banche nuove vengono riconosciute al primo import e poi
            ricordate.
          </p>
        </div>
      </div>
    );
  }

  if (stage === "review" && data) {
    const selectedCount = edits.filter((e) => e.selected).length;
    const newCount = edits.filter((e) => !e.isDuplicate && !e.softDuplicate).length;
    const dupeCount = edits.filter((e) => e.isDuplicate).length;
    const softDupCount = edits.filter((e) => e.softDuplicate).length;
    const autoCategorizedCount = edits.filter((e) => e.suggestedCategoryEmoji).length;
    const transferCount = edits.filter((e) => e.isTransfer).length;
    const totalIn = edits.filter((e) => e.selected && e.amount > 0).reduce((s, e) => s + e.amount, 0);
    const totalOut = edits.filter((e) => e.selected && e.amount < 0).reduce((s, e) => s + e.amount, 0);
    const visibleEdits = hideDuplicates ? edits.filter((e) => !e.isDuplicate) : edits;

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Totali nel CSV" value={data.rows.length.toString()} />
          <Stat label="Nuovi" value={newCount.toString()} variant="emerald" />
          <Stat
            label={softDupCount > 0 ? "Da decidere (soft-dup)" : "Già presenti"}
            value={(softDupCount > 0 ? softDupCount : dupeCount).toString()}
            variant={softDupCount > 0 ? "violet" : "amber"}
          />
          <Stat
            label="Auto-categorizzate"
            value={autoCategorizedCount.toString()}
            variant="violet"
            icon="sparkle"
          />
        </div>

        <div className="surface p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hideDuplicates}
                  onChange={(e) => setHideDuplicates(e.target.checked)}
                />
                <span>Nascondi già presenti</span>
              </label>
              <span className="text-emerald-400 tabular-nums">+{formatEUR(totalIn, { compact: true })}</span>
              <span className="text-rose-400 tabular-nums">{formatEUR(totalOut, { compact: true })}</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={reset}
                className="h-9 px-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm hover:border-[var(--border-strong)]"
              >
                Annulla
              </button>
              <button
                onClick={onCommit}
                disabled={selectedCount === 0}
                className="h-9 px-4 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-sm font-medium shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40 disabled:opacity-40 disabled:shadow-none"
              >
                Importa {selectedCount} movimenti
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-[var(--border)] text-sm">
            <span className="text-xs uppercase tracking-wider text-[var(--fg-subtle)] font-medium">
              Azioni di massa
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-[var(--fg-muted)]">Imposta conto:</span>
              <select
                onChange={(ev) => {
                  const v = ev.target.value;
                  if (!v) return;
                  setEdits((prev) =>
                    prev.map((p) => (p.selected ? { ...p, accountId: v } : p)),
                  );
                  ev.target.value = "";
                }}
                defaultValue=""
                className="h-8 rounded bg-[var(--surface-2)] border border-[var(--border)] px-2 text-xs"
              >
                <option value="" disabled>
                  → conto…
                </option>
                {data.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.emoji} {a.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={() =>
                setEdits((prev) =>
                  prev.map((p) => (p.selected ? { ...p, isJoint: !p.isJoint } : p)),
                )
              }
              className="h-8 px-3 rounded bg-pink-500/10 border border-pink-500/30 text-xs text-pink-400 hover:bg-pink-500/20"
            >
              ↔ Marca/Smarca cointestato
            </button>
            <span className="text-xs text-[var(--fg-subtle)]">
              (applicato ai {selectedCount} selezionati)
            </span>
          </div>
        </div>

        {error && (
          <div className="surface border-rose-500/30 bg-rose-500/5 p-3 text-sm flex items-start gap-2">
            <AlertTriangle className="size-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {data.warnings.length > 0 && (
          <div className="surface border-amber-500/30 bg-amber-500/5 p-3 text-xs space-y-1">
            {data.warnings.slice(0, 5).map((w, i) => (
              <div key={i} className="flex gap-2">
                <AlertTriangle className="size-3.5 text-amber-400 shrink-0 mt-0.5" />
                {w}
              </div>
            ))}
          </div>
        )}

        {softDupCount > 0 && (
          <SoftDupReviewSection
            edits={edits}
            onAction={(externalId, act) => {
              setEdits((prev) =>
                prev.map((p) =>
                  p.externalId === externalId
                    ? { ...p, action: act, selected: true }
                    : p,
                ),
              );
            }}
          />
        )}

        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-[var(--fg-subtle)] border-b border-[var(--border)]">
                  <th className="px-3 py-3 font-medium w-8">
                    <input
                      type="checkbox"
                      checked={selectedCount === edits.length}
                      onChange={(e) => {
                        const sel = e.target.checked;
                        setEdits((prev) => prev.map((p) => ({ ...p, selected: sel })));
                      }}
                    />
                  </th>
                  <th className="px-3 py-3 font-medium">Data</th>
                  <th className="px-3 py-3 font-medium">Descrizione</th>
                  <th className="px-3 py-3 font-medium">Conto</th>
                  <th className="px-3 py-3 font-medium">Categoria</th>
                  <th className="px-3 py-3 font-medium text-right">Importo</th>
                </tr>
              </thead>
              <tbody>
                {visibleEdits.map((e) => {
                  const i = edits.indexOf(e);
                  const dim = !e.selected;
                  return (
                    <tr
                      key={e.externalId + i}
                      className={cn(
                        "border-b border-[var(--border)]/50",
                        dim && "opacity-40",
                        e.isDuplicate && !dim && "bg-amber-500/5",
                        e.softDuplicate && !dim && "bg-blue-500/5",
                      )}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={e.selected}
                          onChange={(ev) => {
                            const sel = ev.target.checked;
                            setEdits((prev) => prev.map((p, idx) => (idx === i ? { ...p, selected: sel } : p)));
                          }}
                        />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-[var(--fg-muted)] text-xs">
                        {formatDate(e.date, { day: "2-digit", month: "short", year: "2-digit" })}
                      </td>
                      <td className="px-3 py-2 max-w-[280px]">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {e.isTransfer && (
                            <span
                              title="Transfer interno tra conti"
                              className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20 shrink-0"
                            >
                              ↔ Transfer
                            </span>
                          )}
                          <div className="truncate">{e.description || "—"}</div>
                        </div>
                        {e.isDuplicate && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            Possibile duplicato
                          </span>
                        )}
                        {e.softDuplicate && (
                          <span
                            title="Decisione presa nella sezione 'Decisioni richieste' sopra"
                            className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded border font-medium",
                              e.action === "merge"
                                ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                                : e.action === "replace"
                                  ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                                  : "bg-rose-500/10 text-rose-300 border-rose-500/30",
                            )}
                          >
                            {e.action === "merge"
                              ? "🤝 Merge"
                              : e.action === "replace"
                                ? "📥 Replace"
                                : "➕ Keep both"}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={e.accountId}
                          onChange={(ev) =>
                            setEdits((prev) =>
                              prev.map((p, idx) => (idx === i ? { ...p, accountId: ev.target.value } : p)),
                            )
                          }
                          className="h-7 rounded bg-[var(--surface-2)] border border-[var(--border)] px-2 text-xs"
                        >
                          {data.accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.emoji} {a.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <div className="inline-flex items-center gap-1.5">
                          {e.suggestedCategoryEmoji && (
                            <span
                              title="Categoria auto-rilevata dallo storico"
                              className="text-violet-400"
                            >
                              <Sparkles className="size-3" />
                            </span>
                          )}
                          <CategoryPicker
                            value={e.categoryId}
                            categories={data.categories}
                            estates={data.estates ?? []}
                            onChange={(catId) =>
                              setEdits((prev) =>
                                prev.map((p, idx) =>
                                  idx === i ? { ...p, categoryId: catId } : p,
                                ),
                              )
                            }
                          />
                        </div>
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right whitespace-nowrap tabular-nums font-medium",
                          e.amount > 0 ? "text-emerald-400" : "text-[var(--fg)]",
                        )}
                      >
                        {e.amount > 0 ? "+" : ""}
                        {formatEUR(e.amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  if (stage === "committing") {
    return (
      <div className="surface p-12 text-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="size-10 rounded-full border-2 border-violet-500/30 border-t-violet-500 mx-auto mb-4"
        />
        <p className="text-sm text-[var(--fg-muted)]">Importazione in corso…</p>
      </div>
    );
  }

  if (stage === "done") {
    return (
      <div className="surface p-12 text-center space-y-4">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="size-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto">
          <CheckCircle2 className="size-7 text-emerald-400" />
        </motion.div>
        <div>
          <p className="text-lg font-medium">{committed} movimenti importati</p>
          <p className="text-sm text-[var(--fg-muted)] mt-1">
            Trovi tutto nella pagina Movimenti.
          </p>
        </div>
        <div className="flex gap-2 justify-center">
          <button
            onClick={reset}
            className="h-9 px-4 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm hover:border-[var(--border-strong)]"
          >
            Importa altro
          </button>
          <a
            href="/movimenti"
            className="h-9 px-4 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-sm font-medium inline-flex items-center"
          >
            Vai ai movimenti
          </a>
        </div>
      </div>
    );
  }

  return null;
}

/**
 * Sezione "Decisioni richieste" sopra la tabella di import: mostra a card,
 * ben visibile, ogni soft-duplicate con la tx già nel DB side-by-side rispetto
 * alla riga CSV. Per ognuno l'utente sceglie: merge (default), replace, o
 * keep both. Lo stato si riflette poi come badge nella tabella sotto.
 */
function SoftDupReviewSection({
  edits,
  onAction,
}: {
  edits: Editable[];
  onAction: (externalId: string, act: "create" | "merge" | "replace") => void;
}) {
  const softDups = edits.filter((e) => e.softDuplicate);
  if (softDups.length === 0) return null;

  return (
    <div className="rounded-xl border-2 border-blue-500/40 bg-blue-500/[0.04] p-4 space-y-3">
      <div className="flex items-start gap-2">
        <span className="text-blue-300 text-lg leading-none mt-0.5">⚠</span>
        <div>
          <h3 className="text-sm font-semibold text-blue-200">
            {softDups.length}{" "}
            {softDups.length === 1
              ? "decisione richiesta"
              : "decisioni richieste"}
          </h3>
          <p className="text-xs text-[var(--fg-muted)] mt-0.5">
            Movimenti CSV con stessa data + importo + conto di tx già nel DB.
            Scegli per ogni gruppo: <strong>Merge</strong> (preserva i tuoi
            dati, aggiunge solo le info mancanti dal CSV) ·{" "}
            <strong>Replace</strong> (sovrascrivi con dati CSV) ·{" "}
            <strong>Keep both</strong> (sono 2 mov. distinti, crea entrambi).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {softDups.map((e) => {
          const soft = e.softDuplicate!;
          return (
            <div
              key={e.externalId}
              className="rounded-lg border border-blue-500/30 bg-[var(--bg)]/40 p-3 space-y-2"
            >
              <div className="text-xs flex items-center gap-2 flex-wrap">
                <span className="text-[var(--fg-muted)]">
                  {formatDate(e.date, {
                    day: "2-digit",
                    month: "short",
                    year: "2-digit",
                  })}
                </span>
                <span
                  className={cn(
                    "font-semibold tabular-nums",
                    e.amount > 0 ? "text-emerald-400" : "text-rose-400",
                  )}
                >
                  {e.amount > 0 ? "+" : ""}
                  {formatEUR(e.amount)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded border border-[var(--border)] p-2 bg-[var(--surface-2)]/40">
                  <div className="text-[9px] uppercase tracking-wider text-[var(--fg-subtle)] mb-1">
                    Già nel DB
                  </div>
                  <div className="text-xs font-medium truncate">
                    {soft.beneficiary || "(no beneficiary)"}
                  </div>
                  {soft.categoryName && (
                    <div className="text-[10px] text-[var(--fg-muted)] mt-0.5 truncate">
                      {soft.categoryEmoji} {soft.categoryName}
                    </div>
                  )}
                  {soft.notes && (
                    <div className="text-[10px] text-[var(--fg-subtle)] italic mt-1 line-clamp-2">
                      {soft.notes}
                    </div>
                  )}
                </div>
                <div className="rounded border border-violet-500/30 p-2 bg-violet-500/[0.04]">
                  <div className="text-[9px] uppercase tracking-wider text-violet-300 mb-1">
                    Riga CSV
                  </div>
                  <div className="text-xs font-medium truncate">
                    {e.description || "—"}
                  </div>
                  {e.notes && (
                    <div className="text-[10px] text-[var(--fg-subtle)] italic mt-1 line-clamp-2">
                      {e.notes}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <ChoiceBtn
                  active={e.action === "merge"}
                  tone="emerald"
                  onClick={() => onAction(e.externalId, "merge")}
                >
                  🤝 Merge
                </ChoiceBtn>
                <ChoiceBtn
                  active={e.action === "replace"}
                  tone="amber"
                  onClick={() => onAction(e.externalId, "replace")}
                >
                  📥 Replace
                </ChoiceBtn>
                <ChoiceBtn
                  active={e.action === "create"}
                  tone="rose"
                  onClick={() => onAction(e.externalId, "create")}
                >
                  ➕ Keep both
                </ChoiceBtn>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChoiceBtn({
  active,
  tone,
  onClick,
  children,
}: {
  active: boolean;
  tone: "emerald" | "amber" | "rose";
  onClick: () => void;
  children: React.ReactNode;
}) {
  const tones: Record<string, { active: string; inactive: string }> = {
    emerald: {
      active: "bg-emerald-500/25 border-emerald-500/60 text-emerald-200",
      inactive: "border-[var(--border)] text-[var(--fg-muted)] hover:border-emerald-500/40",
    },
    amber: {
      active: "bg-amber-500/25 border-amber-500/60 text-amber-200",
      inactive: "border-[var(--border)] text-[var(--fg-muted)] hover:border-amber-500/40",
    },
    rose: {
      active: "bg-rose-500/25 border-rose-500/60 text-rose-200",
      inactive: "border-[var(--border)] text-[var(--fg-muted)] hover:border-rose-500/40",
    },
  };
  const t = tones[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-7 px-2.5 rounded-md text-xs border font-medium transition-colors",
        active ? t.active : t.inactive,
      )}
    >
      {children}
    </button>
  );
}

function Stat({
  label,
  value,
  variant = "default",
  icon,
}: {
  label: string;
  value: string;
  variant?: "default" | "emerald" | "amber" | "violet";
  icon?: "sparkle";
}) {
  const colors = {
    default: "text-[var(--fg)]",
    emerald: "text-emerald-400",
    amber: "text-amber-400",
    violet: "text-violet-400",
  };
  return (
    <div className="surface px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-[var(--fg-subtle)] flex items-center gap-1.5">
        {icon === "sparkle" && <Sparkles className="size-3 text-violet-400" />}
        {label}
      </div>
      <div className={cn("text-2xl font-semibold tabular-nums mt-0.5", colors[variant])}>{value}</div>
    </div>
  );
}
