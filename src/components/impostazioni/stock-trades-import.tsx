"use client";

import { useEffect, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LineChart, Upload, CheckCircle2, AlertTriangle, Trash2 } from "lucide-react";

type SupportedBroker = { name: string; platform: string };
type Summary = {
  platform: string;
  total: number;
  inserted: number;
  skipped: number;
};
type DbStat = { platform: string; count: number };

export function StockTradesImport() {
  const [supported, setSupported] = useState<SupportedBroker[]>([]);
  const [stats, setStats] = useState<DbStat[]>([]);
  const [uploading, setUploading] = useState(false);
  const [lastResult, setLastResult] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadStatus() {
    try {
      const sup = await fetch("/api/integrations/stock-trades/import").then(
        (r) => r.json(),
      );
      setSupported(sup.supported ?? []);
      const s = await fetch("/api/integrations/stock-trades/stats").then((r) =>
        r.json(),
      );
      setStats(s.byPlatform ?? []);
    } catch {}
  }
  useEffect(() => {
    loadStatus();
  }, []);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    setLastResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/integrations/stock-trades/import", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Import fallito");
      } else {
        setLastResult(data);
        await loadStatus();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function deletePlatform(platform: string) {
    const ok = confirm(
      `Cancellare TUTTI i ${stats.find((s) => s.platform === platform)?.count ?? 0} trade della platform "${platform}"? L'azione è irreversibile (potrai re-importare il CSV).`,
    );
    if (!ok) return;
    await fetch(
      `/api/integrations/stock-trades/import?platform=${encodeURIComponent(platform)}`,
      { method: "DELETE" },
    );
    await loadStatus();
  }

  return (
    <div className="space-y-2">
      <CardHeader>
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <LineChart className="size-4 text-emerald-400" />
            Trade history broker
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-[var(--fg-muted)] leading-relaxed">
          Importa il CSV export del tuo conto di investimento. I dati popolano
          il widget <strong>S&amp;P beat</strong> e altri tool di performance.
        </p>

        <div className="mt-3 space-y-1">
          <p className="text-[11px] uppercase tracking-wider text-[var(--fg-subtle)]">
            Broker supportati
          </p>
          <div className="flex flex-wrap gap-1.5">
            {supported.map((b) => (
              <span
                key={b.platform}
                className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-0.5 text-[11px]"
              >
                {b.name}
              </span>
            ))}
            <span className="text-[10px] text-[var(--fg-subtle)] inline-flex items-center px-1">
              (altri broker in arrivo — dimmi cosa usi)
            </span>
          </div>
        </div>

        <div className="mt-4">
          <label
            className={`inline-flex items-center gap-2 h-9 px-3 rounded-lg text-xs font-medium border cursor-pointer transition-colors ${
              uploading
                ? "bg-[var(--surface-2)] border-[var(--border)] text-[var(--fg-subtle)] cursor-wait"
                : "bg-violet-500/15 border-violet-500/40 text-violet-300 hover:bg-violet-500/25"
            }`}
          >
            <Upload className="size-3.5" />
            {uploading ? "Importazione…" : "Carica CSV"}
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={onUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
        </div>

        {lastResult && (
          <div className="mt-3 inline-flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/[0.08] p-2.5 text-xs">
            <CheckCircle2 className="size-3.5 text-emerald-400 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium text-emerald-300">
                Import {lastResult.platform} completato
              </div>
              <div className="text-[var(--fg-muted)] mt-0.5">
                {lastResult.total} eventi totali ·{" "}
                <strong>{lastResult.inserted}</strong> nuovi ·{" "}
                {lastResult.skipped} già presenti (deduplicati)
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-3 inline-flex items-start gap-2 rounded-md border border-rose-500/30 bg-rose-500/[0.08] p-2.5 text-xs">
            <AlertTriangle className="size-3.5 text-rose-400 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium text-rose-300">Import fallito</div>
              <div className="text-[var(--fg-muted)] mt-0.5">{error}</div>
            </div>
          </div>
        )}

      </CardContent>
    </div>
  );
}
