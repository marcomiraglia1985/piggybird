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
  Loader2,
  Tag,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { formatEUR, formatDate, cn } from "@/lib/utils";
import { formatCostEur } from "@/lib/ai-pricing";
import { SUPPORTED_BANKS } from "@/lib/csv-parsers/banks";
import { CategoryPicker } from "@/components/movimenti/category-picker";
import { AIButton } from "@/components/ui/ai-button";
import { ConfigureAiCta } from "@/components/ai/configure-ai-cta";
import { useAiConfigured } from "@/hooks/use-ai-configured";

type AiAnnotation = {
  idx: string;
  cleanedBeneficiary: string | null;
  suggestedCategoryId: string | null;
  confidence: number;
  transferPairIdx: string | null;
  reasoning: string;
};

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
  suggestedCategoryName?: string | null;
  duplicateOf?: string | null;
  softDuplicateOf?: SoftDupInfo | null;
  notes?: string | null;
  currency: string;
  transferGroupId?: string | null;
  isTransfer?: boolean;
  confirmsRecurrence?: { txId: string; newDate: string; newAmount: number } | null;
  /** Override server-side dell'account scelto nel pair stage (per quirk
   *  Revolut Current → Savings sugli interessi passthrough, ecc.) */
  forceAccountId?: string | null;
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

type FileResult = {
  fileName: string;
  format: string;
  rows: ParsedRow[];
  warnings: string[];
};

type AggregatedData = {
  files: FileResult[];
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
  /** File CSV di provenienza — utile quando si caricano più CSV in batch. */
  sourceFileName?: string;
};

export function ImportClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const preselectedAccountId = searchParams.get("account");
  const [stage, setStage] = useState<
    | "idle"
    | "parsing"
    | "pair"
    | "no-accounts"
    | "review"
    | "committing"
    | "trading-confirm"
    | "done"
  >("idle");
  /** Tipo dell'ultimo import committato: usato per scegliere il CTA nella
   *  pagina "done" (Vai ai movimenti vs Vai agli investimenti). */
  const [lastImportKind, setLastImportKind] = useState<"bank" | "broker">("bank");
  /** File CSV trading riconosciuti ma in attesa di conferma utente prima
   *  del commit al broker import endpoint. */
  const [pendingTrading, setPendingTrading] = useState<
    { file: File; fileName: string }[]
  >([]);
  const [data, setData] = useState<AggregatedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Editable[]>([]);
  /** Mappa fileName → accountId scelto nello step pair (uno per file). */
  const [fileAccounts, setFileAccounts] = useState<Map<string, string>>(new Map());
  const [committed, setCommitted] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [hideDuplicates, setHideDuplicates] = useState(false);
  /** Progress durante il parse di N file: indice corrente + nome file. */
  const [parseProgress, setParseProgress] = useState<{
    current: number;
    total: number;
    currentFile: string;
  } | null>(null);
  const aiConfigured = useAiConfigured();
  /** Annotazioni AI per externalId — popolato dopo il click su Revisione AI. */
  const [aiAnnotations, setAiAnnotations] = useState<Map<string, AiAnnotation>>(new Map());
  const [aiLoading, setAiLoading] = useState(false);
  /** Costo cumulativo dell'ultima review AI, mostrato nella UI dopo l'apply. */
  const [aiCost, setAiCost] = useState<number | null>(null);
  // Banche aggiunte dinamicamente via universal AI fallback (es. N26).
  // Mostrate accanto a SUPPORTED_BANKS hardcoded col badge ✨.
  const [aiBanks, setAiBanks] = useState<{ name: string; usageCount: number }[]>([]);
  // Tempo trascorso in stage="parsing" — usato per cambiare il messaggio
  // dinamicamente: dopo qualche secondo l'utente capisce che il delay è AI.
  const [parsingElapsedMs, setParsingElapsedMs] = useState(0);

  useEffect(() => {
    if (stage !== "parsing") {
      setParsingElapsedMs(0);
      return;
    }
    // Reset elapsed quando cambia il file corrente in batch — così la
    // soglia "Apprendimento AI…" misura il tempo per il file specifico,
    // non l'intero batch.
    const start = Date.now();
    setParsingElapsedMs(0);
    const id = setInterval(() => setParsingElapsedMs(Date.now() - start), 250);
    return () => clearInterval(id);
  }, [stage, parseProgress?.current]);

  useEffect(() => {
    fetch("/api/parser-templates")
      .then((r) => r.json())
      .then((d) => setAiBanks(Array.isArray(d.banks) ? d.banks : []))
      .catch(() => {});
  }, []);

  const onFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setStage("parsing");
      setError(null);
      setParseProgress({ current: 0, total: files.length, currentFile: files[0].name });
      const results: FileResult[] = [];
      let lastResponse: ParseResponse | null = null;
      const failed: { fileName: string; error: string }[] = [];
      // CSV trading riconosciuti — accumulati per conferma utente, non auto-import.
      const tradingFiles: { file: File; fileName: string }[] = [];
      // Sequenziale per non scatenare race condition sull'AI fallback delle
      // banche nuove (se due file della stessa banca sconosciuta arrivano in
      // parallelo, finirebbero a chiamare Claude due volte).
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setParseProgress({ current: i, total: files.length, currentFile: file.name });
        const fd = new FormData();
        fd.append("file", file);
        try {
          const res = await fetch("/api/import/parse", { method: "POST", body: fd });
          if (!res.ok) {
            const err = (await res.json().catch(() => null)) as
              | { error?: string; tradingDetected?: boolean }
              | null;
            // Trading CSV: differiamo l'import al confirm utente (no auto-commit).
            if (err?.tradingDetected) {
              tradingFiles.push({ file, fileName: file.name });
              continue;
            }
            throw new Error(err?.error ?? "errore parsing");
          }
          const json = (await res.json()) as ParseResponse;
          lastResponse = json;
          results.push({
            fileName: file.name,
            format: json.format,
            rows: json.rows,
            warnings: json.warnings,
          });
        } catch (e) {
          // Il file fallito viene saltato — gli altri proseguono.
          // Cumuliamo gli errori e li mostriamo come warning a fine batch
          // (review stage), invece di scartare il lavoro buono.
          failed.push({
            fileName: file.name,
            error: e instanceof Error ? e.message : "errore sconosciuto",
          });
        }
      }
      setParseProgress(null);
      // Solo trading detected, nessun bank CSV: stage di conferma broker.
      if (results.length === 0 && tradingFiles.length > 0 && failed.length === 0) {
        setPendingTrading(tradingFiles);
        setStage("trading-confirm");
        return;
      }
      if (results.length === 0) {
        // Tutti i file falliti: mostriamo il dettaglio del primo + count.
        const first = failed[0];
        const more = failed.length > 1 ? ` (e altri ${failed.length - 1})` : "";
        setError(`${first?.fileName}: ${first?.error}${more}`);
        setStage("idle");
        return;
      }
      // Mix bank + trading: i trading vanno in pendingTrading e li gestiamo
      // dopo il commit bancario, oppure (più semplice) il banner nel pair
      // stage può listarli. Per ora li accumuliamo e mostriamo info.
      if (tradingFiles.length > 0) {
        setPendingTrading(tradingFiles);
      }
      if (failed.length > 0) {
        // Almeno un file OK + qualcuno fallito: prosegui ma surface i fail
        // come warning persistente.
        const summary = failed.map((f) => `${f.fileName}: ${f.error}`).join(" · ");
        setError(`${failed.length} file ignorati — ${summary}`);
      }
      if (!lastResponse) return;
      // 0 conti? Empty state che chiede di crearne uno prima di importare.
      if (lastResponse.accounts.length === 0) {
        setData({
          files: results,
          accounts: lastResponse.accounts,
          categories: lastResponse.categories,
          estates: lastResponse.estates,
        });
        setStage("no-accounts");
        return;
      }
      // Default per ogni file: priorità
      //   1. ?account= in URL se valido
      //   2. `suggestedAccount` maggioritario tra le righe (parser sa quale
      //      conto questo file rappresenta — es. Revolut Savings, Revolut Trading)
      //   3. primo conto disponibile (fallback)
      const accountsByName = new Map(
        lastResponse.accounts.map((a) => [a.name, a.id]),
      );
      const m = new Map<string, string>();
      for (const r of results) {
        // Vote tra le suggestedAccount delle righe del file
        const voteByName = new Map<string, number>();
        for (const row of r.rows) {
          const name = row.suggestedAccount;
          if (!name) continue;
          voteByName.set(name, (voteByName.get(name) ?? 0) + 1);
        }
        let majorityName: string | null = null;
        let majorityCount = 0;
        for (const [name, count] of voteByName) {
          if (count > majorityCount) {
            majorityCount = count;
            majorityName = name;
          }
        }
        const suggestedId =
          majorityName != null ? accountsByName.get(majorityName) ?? null : null;

        const fileInitial =
          preselectedAccountId &&
          lastResponse.accounts.some((a) => a.id === preselectedAccountId)
            ? preselectedAccountId
            : suggestedId ?? lastResponse.accounts[0].id;
        m.set(r.fileName, fileInitial);
      }
      setFileAccounts(m);
      setData({
        files: results,
        accounts: lastResponse.accounts,
        categories: lastResponse.categories,
        estates: lastResponse.estates,
      });
      setStage("pair");
    },
    [preselectedAccountId],
  );

  // Quando l'utente conferma i conti per ogni file, costruisce gli edits
  // unendo le righe di tutti i file con l'accountId scelto per ciascuno.
  function confirmPairing() {
    if (!data) return;
    // Più categorie possono condividere lo stesso emoji (es. 💰 → "Interessi"
    // income + "Metals" investment). Indicizzo come array e disambiguo per
    // segno della tx: positivo → preferisci type "income", negativo → "expense".
    const catsByEmoji = new Map<string, Category[]>();
    for (const c of data.categories) {
      const arr = catsByEmoji.get(c.emoji) ?? [];
      arr.push(c);
      catsByEmoji.set(c.emoji, arr);
    }
    function pickCategory(
      emoji: string | null | undefined,
      name: string | null | undefined,
      amount: number,
    ) {
      if (!emoji) return null;
      const matches = catsByEmoji.get(emoji);
      if (!matches || matches.length === 0) return null;
      if (matches.length === 1) return matches[0];
      // 1) Match per nome esatto se il parser l'ha specificato (caso più sicuro)
      if (name) {
        const byName = matches.find(
          (c) => c.name.toLowerCase() === name.toLowerCase(),
        );
        if (byName) return byName;
      }
      // 2) Disambigua per segno della tx → income/expense type
      const wanted = amount > 0 ? "income" : "expense";
      return matches.find((c) => c.type === wanted) ?? matches[0];
    }
    const allEdits: Editable[] = [];
    for (const file of data.files) {
      const fileAccountId = fileAccounts.get(file.fileName);
      if (!fileAccountId) return; // un file senza conto: blocca
      for (const r of file.rows) {
        const cat = pickCategory(r.suggestedCategoryEmoji, r.suggestedCategoryName, r.amount);
        // forceAccountId vince sul pair stage: usato dai quirk parser-level
        // (es. Revolut Current CSV reindirizza interessi savings al conto deposito).
        const accountId = r.forceAccountId ?? fileAccountId;
        allEdits.push({
          externalId: r.externalId,
          date: r.date,
          amount: r.amount,
          description: r.description,
          accountId,
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
          sourceFileName: file.fileName,
        });
      }
    }
    setEdits(allEdits);
    setStage("review");
  }

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) onFiles(files);
    },
    [onFiles],
  );

  const onCommit = useCallback(async () => {
    if (!data) return;
    setStage("committing");
    const selected = edits.filter((e) => e.selected);
    // Le righe che confermano una ricorrenza non vengono inserite — il commit
    // aggiorna la tx programmata esistente. Le altre creano una nuova tx.
    // Forwardiamo anche i cleanup AI Review (description→beneficiary,
    // categoryId, notes) così non vengono persi sulla pending tx.
    const toInsert = selected.filter((e) => !e.confirmsRecurrence);
    const confirmRecurrences = selected
      .filter((e) => e.confirmsRecurrence)
      .map((e) => ({
        ...e.confirmsRecurrence!,
        beneficiary: e.description || null,
        notes: e.notes,
        categoryId: e.categoryId,
      }));
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
      setLastImportKind("bank");
      const parts: string[] = [];
      if (inserted > 0) parts.push(`${inserted} nuovi`);
      if (merged > 0) parts.push(`${merged} arricchiti (merge)`);
      if (replaced > 0) parts.push(`${replaced} sostituiti`);
      if (confirmed > 0) parts.push(`${confirmed} programmati confermati`);
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
    setFileAccounts(new Map());
    setParseProgress(null);
    setAiAnnotations(new Map());
    setAiCost(null);
    setPendingTrading([]);
    setLastImportKind("bank");
  };

  const confirmTradingImport = useCallback(async () => {
    if (pendingTrading.length === 0) return;
    setStage("committing");
    setError(null);
    let totalInserted = 0;
    let totalSkipped = 0;
    const platforms = new Set<string>();
    const errors: string[] = [];
    for (const t of pendingTrading) {
      const fd = new FormData();
      fd.append("file", t.file);
      try {
        const res = await fetch("/api/integrations/stock-trades/import", {
          method: "POST",
          body: fd,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          throw new Error(err?.error ?? "errore import broker");
        }
        const json = (await res.json()) as {
          platform: string;
          total: number;
          inserted: number;
          skipped: number;
        };
        totalInserted += json.inserted;
        totalSkipped += json.skipped;
        platforms.add(json.platform);
      } catch (e) {
        errors.push(`${t.fileName}: ${e instanceof Error ? e.message : "err"}`);
      }
    }
    if (errors.length > 0) {
      setError(errors.join(" · "));
      setStage("trading-confirm");
      return;
    }
    setCommitted(totalInserted);
    setLastImportKind("broker");
    toast({
      title: `Trade ${[...platforms].join(", ")} importati`,
      description: `${totalInserted} nuovi · ${totalSkipped} già presenti (deduplicati)`,
      variant: "success",
    });
    setStage("done");
    router.refresh();
  }, [pendingTrading, router, toast]);

  const runAiReview = useCallback(async () => {
    if (!aiConfigured) {
      toast({
        title: "AI non configurata",
        description:
          "Vai in Impostazioni → Funzioni AI per inserire la tua API key Anthropic.",
        variant: "info",
      });
      return;
    }
    if (!data || edits.length === 0) return;
    setAiLoading(true);
    try {
      const accountById = new Map(data.accounts.map((a) => [a.id, a]));
      const rows = edits
        .filter((e) => e.selected)
        .map((e) => ({
          idx: e.externalId,
          date: e.date,
          amount: e.amount,
          description: e.description,
          notes: e.notes,
          accountName: accountById.get(e.accountId)?.name ?? "?",
          currentCategoryEmoji: e.suggestedCategoryEmoji ?? null,
        }));
      const categories = data.categories.map((c) => ({
        id: c.id,
        emoji: c.emoji,
        name: c.name,
        type: c.type,
      }));
      const res = await fetch("/api/import/ai-review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows, categories }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Errore AI review");
      }
      const json = await res.json();
      const annotations: AiAnnotation[] = json.annotations ?? [];
      const annMap = new Map<string, AiAnnotation>();
      for (const a of annotations) annMap.set(a.idx, a);
      setAiAnnotations(annMap);
      setAiCost(json.costEur ?? 0);

      // Applica i suggerimenti preservando l'identità delle righe non
      // annotate (evita full re-render): clona solo le righe toccate.
      // categoria solo se vuota (rispetta override utente), beneficiary
      // cleaned se diverso, transfer pair → transferGroupId condiviso
      // (rimappato server-side nel commit).
      setEdits((prev) => {
        // First pass: applica annotazioni per-riga non transfer.
        const afterRowAnn = prev.map((e) => {
          const a = annMap.get(e.externalId);
          if (!a) return e;
          const newCategoryId = !e.categoryId && a.suggestedCategoryId
            ? a.suggestedCategoryId
            : e.categoryId;
          const newDescription =
            a.cleanedBeneficiary && a.cleanedBeneficiary !== e.description
              ? a.cleanedBeneficiary
              : e.description;
          if (newCategoryId === e.categoryId && newDescription === e.description) {
            return e;
          }
          return { ...e, categoryId: newCategoryId, description: newDescription };
        });
        // Second pass: transfer pair. Mutiamo gli indici noti per evitare un
        // ulteriore mapping di tutto l'array.
        const transferUpdates = new Map<string, { isTransfer: boolean; transferGroupId: string }>();
        const byIdx = new Map(afterRowAnn.map((e) => [e.externalId, e]));
        const handled = new Set<string>();
        for (const e of afterRowAnn) {
          if (handled.has(e.externalId)) continue;
          const a = annMap.get(e.externalId);
          if (!a?.transferPairIdx) continue;
          const pair = byIdx.get(a.transferPairIdx);
          if (!pair || handled.has(pair.externalId)) continue;
          const aPair = annMap.get(pair.externalId);
          if (aPair?.transferPairIdx !== e.externalId) continue;
          if (e.transferGroupId || pair.transferGroupId) continue;
          const tgid = `ai-${crypto.randomUUID()}`;
          transferUpdates.set(e.externalId, { isTransfer: true, transferGroupId: tgid });
          transferUpdates.set(pair.externalId, { isTransfer: true, transferGroupId: tgid });
          handled.add(e.externalId);
          handled.add(pair.externalId);
        }
        if (transferUpdates.size === 0) return afterRowAnn;
        return afterRowAnn.map((e) => {
          const upd = transferUpdates.get(e.externalId);
          return upd ? { ...e, ...upd } : e;
        });
      });

      // Conta solo le annotazioni utili — quelle con almeno un suggerimento
      // applicabile. Se 0, mostriamo un messaggio chiaro invece del generico
      // "X righe analizzate" (che dà l'impressione che l'AI non abbia girato).
      const usefulCount = annotations.filter(
        (a) =>
          a.cleanedBeneficiary != null ||
          a.suggestedCategoryId != null ||
          a.transferPairIdx != null,
      ).length;
      toast({
        title:
          usefulCount > 0
            ? "Revisione AI completata"
            : "Niente da migliorare",
        description:
          usefulCount > 0
            ? `${usefulCount} suggerimenti su ${annotations.length} righe · ${formatCostEur(json.costEur ?? 0)}`
            : `${annotations.length} righe analizzate, nessun suggerimento utile (descrizioni già pulite, categorie già impostate, nessun transfer rilevato) · ${formatCostEur(json.costEur ?? 0)}`,
        variant: "success",
      });
    } catch (e) {
      toast({
        title: "Errore Revisione AI",
        description: e instanceof Error ? e.message : "Sconosciuto",
        variant: "error",
      });
    } finally {
      setAiLoading(false);
    }
  }, [aiConfigured, data, edits, toast]);

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
    const allPicked = data.files.every((f) => fileAccounts.get(f.fileName));
    const totalRows = data.files.reduce((s, f) => s + f.rows.length, 0);
    const isSingle = data.files.length === 1;
    return (
      <div className="max-w-2xl mx-auto py-12 space-y-6">
        <div className="text-center space-y-2">
          <div className="size-14 mx-auto rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center">
            <FileText className="size-6 text-[var(--fg-muted)]" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight">
            {isSingle
              ? `CSV riconosciuto: ${formatLabel(data.files[0].format)}`
              : `${data.files.length} file riconosciuti`}
          </h2>
          <p className="text-sm text-[var(--fg-muted)]">
            {totalRows} righe trovate. {isSingle ? "In quale dei tuoi conti vanno questi movimenti?" : "Scegli il conto per ogni file."}
          </p>
        </div>
        <div className="surface p-4 space-y-3">
          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            {data.files.map((f) => (
              <div
                key={f.fileName}
                className="flex items-center gap-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 py-2.5"
              >
                <FileText className="size-4 text-[var(--fg-muted)] shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{f.fileName}</div>
                  <div className="text-[11px] text-[var(--fg-subtle)]">
                    {formatLabel(f.format)} · {f.rows.length} righe
                  </div>
                </div>
                <select
                  value={fileAccounts.get(f.fileName) ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFileAccounts((prev) => {
                      const next = new Map(prev);
                      next.set(f.fileName, v);
                      return next;
                    });
                  }}
                  className="h-9 rounded-lg bg-[var(--surface)] border border-[var(--border)] px-2 text-sm focus:outline-none focus:border-violet-500/50 max-w-[200px]"
                >
                  {data.accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.emoji ?? "💳"} {a.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-[var(--fg-subtle)]">
            Potrai cambiare il conto per singola riga nello step successivo.
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
            disabled={!allPicked}
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
              {stage === "parsing" ? (
                <Loader2 className="size-7 text-white animate-spin" />
              ) : (
                <UploadCloud className="size-7 text-white" />
              )}
            </div>
            <div>
              <p className="text-base font-medium">
                {stage === "parsing"
                  ? parseProgress && parseProgress.total > 1
                    ? `File ${parseProgress.current + 1} di ${parseProgress.total}: ${parseProgress.currentFile}`
                    : parsingElapsedMs < 2500
                      ? "Analisi del file…"
                      : parsingElapsedMs < 7000
                        ? "Riconoscimento del formato…"
                        : "Apprendimento di una nuova banca via AI…"
                  : "Trascina qui i file (CSV o XLSX)"}
              </p>
              <p className="text-sm text-[var(--fg-muted)] mt-1">
                {stage === "parsing"
                  ? parsingElapsedMs >= 7000
                    ? "Apprendimento via AI in corso — prossima volta sarà istantaneo per questa banca."
                    : parseProgress && parseProgress.total > 1
                      ? `${parseProgress.total - parseProgress.current - 1} file ancora da processare.`
                      : "Il formato viene riconosciuto automaticamente."
                  : "Trascina più file insieme per importarli in un unico passaggio. Conti supportati qui sotto."}
              </p>
            </div>
            <label className="cursor-pointer inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-sm hover:border-[var(--border-strong)]">
              <FileText className="size-4" />
              Sfoglia…
              <input
                type="file"
                multiple
                accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="hidden"
                onChange={(e) => {
                  const list = e.target.files;
                  if (list && list.length > 0) onFiles(Array.from(list));
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
            Conti supportati
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

    const aiAnnotatedCount = aiAnnotations.size;
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat
            label={data.files.length > 1 ? `Totali (${data.files.length} file)` : "Totali nel CSV"}
            value={data.files.reduce((s, f) => s + f.rows.length, 0).toString()}
          />
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

        <AiReviewBanner
          aiConfigured={aiConfigured}
          aiLoading={aiLoading}
          annotatedCount={aiAnnotatedCount}
          aiCost={aiCost}
          onRun={runAiReview}
          rowCount={selectedCount}
        />

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

        {data.files.some((f) => f.warnings.length > 0) && (
          <div className="surface border-amber-500/30 bg-amber-500/5 p-3 text-xs space-y-1">
            {data.files
              .flatMap((f) =>
                f.warnings.map((w) => (data.files.length > 1 ? `${f.fileName}: ${w}` : w)),
              )
              .slice(0, 5)
              .map((w, i) => (
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
                  {data.files.length > 1 && (
                    <th className="px-3 py-3 font-medium">Origine</th>
                  )}
                  <th className="px-3 py-3 font-medium">Descrizione</th>
                  <th className="px-3 py-3 font-medium">Conto</th>
                  <th className="px-3 py-3 font-medium">Categoria suggerita</th>
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
                      {data.files.length > 1 && (
                        <td className="px-3 py-2 text-[10px] text-[var(--fg-subtle)] max-w-[140px]">
                          <span title={e.sourceFileName} className="truncate inline-block max-w-full">
                            {e.sourceFileName}
                          </span>
                        </td>
                      )}
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
                          {aiAnnotations.has(e.externalId) && (
                            <span
                              title={`✨ ${aiAnnotations.get(e.externalId)?.reasoning ?? "Suggerimento AI"}`}
                              className="shrink-0 text-orange-300"
                            >
                              <Sparkles className="size-3" />
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
                              title="Categoria suggerita da pattern del parser / storico (no AI)"
                              className="text-[var(--fg-subtle)]"
                            >
                              <Tag className="size-3" />
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

  if (stage === "trading-confirm") {
    return (
      <div className="max-w-xl mx-auto py-12 space-y-6">
        <div className="text-center space-y-2">
          <div className="size-14 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
            <FileText className="size-6 text-emerald-400" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight">
            CSV trading riconosciuto
          </h2>
          <p className="text-sm text-[var(--fg-muted)]">
            {pendingTrading.length === 1
              ? "1 file di trading rilevato. Conferma per importare i trade nel tuo conto investimenti."
              : `${pendingTrading.length} file di trading rilevati. Conferma per importarli tutti.`}
          </p>
        </div>
        <div className="surface p-4 space-y-2">
          {pendingTrading.map((t) => (
            <div
              key={t.fileName}
              className="flex items-center gap-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 py-2.5"
            >
              <FileText className="size-4 text-[var(--fg-muted)] shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{t.fileName}</div>
                <div className="text-[11px] text-[var(--fg-subtle)]">
                  Revolut Trading · trade BUY/SELL/dividendi/cashflow
                </div>
              </div>
            </div>
          ))}
          <p className="text-[11px] text-[var(--fg-subtle)] pt-1">
            I trade verranno inseriti nel tuo conto Revolut Trading.
            I duplicati (stesso hash riga) sono ignorati automaticamente.
          </p>
        </div>
        {error && (
          <div className="surface border-rose-500/30 bg-rose-500/5 p-3 text-sm flex items-start gap-2">
            <AlertTriangle className="size-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={reset}
            className="h-9 px-4 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-sm hover:border-[var(--border-strong)]"
          >
            Annulla
          </button>
          <button
            onClick={confirmTradingImport}
            className="h-9 px-4 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-sm font-medium inline-flex items-center gap-2"
          >
            Importa trade
            <ArrowUpRight className="size-4" />
          </button>
        </div>
      </div>
    );
  }

  if (stage === "done") {
    const isBroker = lastImportKind === "broker";
    return (
      <div className="surface p-12 text-center space-y-4">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="size-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto">
          <CheckCircle2 className="size-7 text-emerald-400" />
        </motion.div>
        <div>
          <p className="text-lg font-medium">
            {committed} {isBroker ? "trade importati" : "movimenti importati"}
          </p>
          <p className="text-sm text-[var(--fg-muted)] mt-1">
            {isBroker
              ? "Trovi tutto nella pagina Investimenti."
              : "Trovi tutto nella pagina Movimenti."}
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
            href={isBroker ? "/investimenti" : "/movimenti"}
            className="h-9 px-4 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-sm font-medium inline-flex items-center"
          >
            {isBroker ? "Vai agli investimenti" : "Vai ai movimenti"}
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

function formatLabel(format: string): string {
  const matched = SUPPORTED_BANKS.find((b) => b.format === format);
  if (matched) return matched.name;
  // Format generato dal universal-parser AI fallback: "ai:nomebanca" o "ai:unknown".
  if (format === "ai:unknown") return "✨ Riconosciuto via Piggybird AI";
  if (format.startsWith("ai:")) {
    const name = format.slice(3);
    const titled = name.charAt(0).toUpperCase() + name.slice(1);
    return `✨ ${titled} (via Piggybird AI)`;
  }
  return format;
}

/**
 * Banner "✨ Revisione AI" mostrato sopra la tabella di review.
 * Tre stati visivi:
 *   1. Idle  → bottone abilitato, prompt all'utente
 *   2. Disabled → AI non configurata, link a Impostazioni
 *   3. Done  → mostra summary + costo dell'ultima call
 */
function AiReviewBanner({
  aiConfigured,
  aiLoading,
  annotatedCount,
  aiCost,
  onRun,
  rowCount,
}: {
  aiConfigured: boolean | null;
  aiLoading: boolean;
  annotatedCount: number;
  aiCost: number | null;
  onRun: () => void;
  rowCount: number;
}) {
  const disabled = !aiConfigured || aiLoading || rowCount === 0;
  const tooltip =
    aiConfigured === false
      ? "Configura la tua Claude API key in Impostazioni → Funzioni AI"
      : aiConfigured === null
        ? "Verifica configurazione AI…"
        : rowCount === 0
          ? "Seleziona almeno una riga"
          : undefined;

  return (
    <div className="rounded-xl border border-orange-500/30 bg-gradient-to-br from-amber-500/[0.04] via-orange-500/[0.06] to-rose-500/[0.04] p-3 flex items-center gap-3 flex-wrap">
      <div className="flex-1 min-w-[200px]">
        <div className="text-sm font-medium text-orange-200 flex items-center gap-1.5">
          <Sparkles className="size-3.5" />
          Revisione AI
          {annotatedCount > 0 && aiCost != null && (
            <span className="ml-2 text-[11px] text-[var(--fg-muted)] font-normal">
              · {annotatedCount} righe analizzate · {formatCostEur(aiCost)}
            </span>
          )}
        </div>
        <p className="text-[11px] text-[var(--fg-muted)] mt-0.5">
          {aiConfigured === false
            ? "Aggiungi la tua API key Anthropic per attivare: pulisce i merchant, suggerisce categorie sui movimenti nuovi, riconosce transfer cross-CSV."
            : annotatedCount > 0
              ? "Le righe annotate sono marcate con ✨ — passa il mouse sopra per vedere il ragionamento. Puoi sempre cambiare manualmente."
              : "Pulisce i merchant, suggerisce categorie sui movimenti nuovi, riconosce transfer cross-CSV."}
        </p>
        {aiConfigured === true && rowCount > 0 && (
          <p className="text-[10px] text-[var(--fg-subtle)] mt-1 leading-relaxed">
            Privacy: descrizione, note, importo e nome conto vengono inviati al
            tuo account Anthropic per l'analisi. Beneficiari, IBAN, dettagli
            persona NON vengono mai esfiltrati a terze parti.
          </p>
        )}
      </div>
      {aiConfigured === false ? (
        <ConfigureAiCta />
      ) : (
        <AIButton
          variant="subtle"
          size="sm"
          onClick={onRun}
          disabled={disabled}
          loading={aiLoading}
          title={tooltip}
        >
          {aiLoading
            ? "Analizzo…"
            : annotatedCount > 0
              ? "Rianalizza"
              : `Analizza ${rowCount} righe`}
        </AIButton>
      )}
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
