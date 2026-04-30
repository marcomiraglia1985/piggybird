"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Database, AlertTriangle, RefreshCw, CheckCircle2 } from "lucide-react";

type BackupFile = { name: string; size: number; mtime: string };

export function DatiSection() {
  const [autoBackup, setAutoBackup] = useState(false);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [files, setFiles] = useState<BackupFile[]>([]);
  const [dir, setDir] = useState("");
  const [running, setRunning] = useState(false);
  const [justRan, setJustRan] = useState(false);

  async function loadStatus() {
    const [s, b] = await Promise.all([
      fetch("/api/settings").then((r) => r.json()),
      fetch("/api/backup/run").then((r) => r.json()),
    ]);
    setAutoBackup(s.settings?.backupAuto === "1");
    setLastBackup(s.settings?.backupLastRun ?? null);
    setFiles(b.files ?? []);
    setDir(b.dir ?? "");
  }
  useEffect(() => {
    loadStatus();
  }, []);

  async function toggleAuto() {
    const next = !autoBackup;
    setAutoBackup(next);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "backupAuto", value: next ? "1" : "0" }),
    });
    if (next) runBackup();
  }

  async function runBackup() {
    setRunning(true);
    try {
      await fetch("/api/backup/run", { method: "POST" });
      setJustRan(true);
      setTimeout(() => setJustRan(false), 1500);
      await loadStatus();
    } finally {
      setRunning(false);
    }
  }

  // Auto-backup once-a-day on page mount when enabled
  useEffect(() => {
    if (!autoBackup) return;
    const last = lastBackup ? new Date(lastBackup).getTime() : 0;
    const oneDay = 24 * 60 * 60 * 1000;
    if (Date.now() - last > oneDay) {
      runBackup();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoBackup]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dati &amp; backup</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3 py-2 border-b border-[var(--border)]/50">
            <div>
              <div className="font-medium">Export movimenti CSV</div>
              <p className="text-[11px] text-[var(--fg-subtle)] mt-0.5">
                Tutti i movimenti con account, categoria, beneficiario.
              </p>
            </div>
            <a
              href="/api/export/transactions.csv"
              download
              className="h-8 px-3 rounded bg-[var(--surface-2)] border border-[var(--border)] text-xs hover:border-[var(--border-strong)] inline-flex items-center gap-1.5"
            >
              <Download className="size-3" />
              Esporta CSV
            </a>
          </div>

          <div className="flex items-center justify-between gap-3 py-2 border-b border-[var(--border)]/50">
            <div>
              <div className="font-medium">Backup automatico DB</div>
              <p className="text-[11px] text-[var(--fg-subtle)] mt-0.5">
                Snapshot SQLite giornaliero in <code className="text-[10px]">{dir || "~/Library/Application Support/MoneybirdFinance/backups"}</code>.
                Mantiene gli ultimi 30 giorni.
              </p>
              {lastBackup && (
                <p className="text-[11px] text-emerald-400/70 mt-0.5">
                  Ultimo backup: {new Date(lastBackup).toLocaleString("it-IT")}
                </p>
              )}
            </div>
            <label className="inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={autoBackup}
                onChange={toggleAuto}
                className="size-4 accent-violet-500"
              />
            </label>
          </div>

          <div className="flex items-center justify-between gap-3 py-2 border-b border-[var(--border)]/50">
            <div>
              <div className="font-medium">Backup ora</div>
              <p className="text-[11px] text-[var(--fg-subtle)] mt-0.5">
                Genera subito uno snapshot del DB nella cartella backup.
              </p>
            </div>
            <button
              onClick={runBackup}
              disabled={running}
              className="h-8 px-3 rounded bg-[var(--surface-2)] border border-[var(--border)] text-xs hover:border-[var(--border-strong)] inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              {running ? (
                <RefreshCw className="size-3 animate-spin" />
              ) : justRan ? (
                <CheckCircle2 className="size-3 text-emerald-400" />
              ) : (
                <Database className="size-3" />
              )}
              {running ? "Backup…" : justRan ? "Fatto" : "Esegui"}
            </button>
          </div>

          {files.length > 0 && (
            <div className="py-2 border-b border-[var(--border)]/50">
              <div className="font-medium mb-2">Backup recenti ({files.length})</div>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {files.map((f) => (
                  <div
                    key={f.name}
                    className="flex items-center justify-between text-[11px] text-[var(--fg-subtle)] py-1 border-b border-[var(--border)]/30 last:border-0"
                  >
                    <span className="font-mono">{f.name}</span>
                    <span className="tabular-nums">
                      {(f.size / 1024).toFixed(0)} KB
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 py-2 border-b border-[var(--border)]/50">
            <div>
              <div className="font-medium">Scarica DB completo</div>
              <p className="text-[11px] text-[var(--fg-subtle)] mt-0.5">
                File SQLite scaricabile (utile per migrazione macchina).
              </p>
            </div>
            <a
              href="/api/export/db"
              download
              className="h-8 px-3 rounded bg-[var(--surface-2)] border border-[var(--border)] text-xs hover:border-[var(--border-strong)] inline-flex items-center gap-1.5"
            >
              <Download className="size-3" />
              Scarica
            </a>
          </div>

          <div className="flex items-center justify-between gap-3 py-2">
            <div>
              <div className="font-medium text-rose-400">Cancella tutti i dati</div>
              <p className="text-[11px] text-[var(--fg-subtle)] mt-0.5">
                Reset completo del DB. Operazione irreversibile.
              </p>
            </div>
            <button
              disabled
              className="h-8 px-3 rounded bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs opacity-50 cursor-not-allowed inline-flex items-center gap-1.5"
            >
              <AlertTriangle className="size-3" />
              Disabilitato
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
