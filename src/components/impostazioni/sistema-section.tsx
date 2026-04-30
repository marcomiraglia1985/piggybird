"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, ExternalLink, Lock } from "lucide-react";

export function SistemaSection({ version }: { version: string }) {
  const [autostart, setAutostart] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sistema</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3 py-2 border-b border-[var(--border)]/50">
            <div>
              <div className="font-medium inline-flex items-center gap-1.5">
                Apri all&apos;avvio del computer
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--fg-subtle)] inline-flex items-center gap-1">
                  <Lock className="size-3" /> richiede app desktop
                </span>
              </div>
              <p className="text-[11px] text-[var(--fg-subtle)] mt-0.5">
                Disponibile dalla versione desktop (Tauri). Sulla versione web/locale non
                applicabile.
              </p>
            </div>
            <label className="inline-flex items-center cursor-not-allowed opacity-50">
              <input
                type="checkbox"
                checked={autostart}
                onChange={(e) => setAutostart(e.target.checked)}
                disabled
                className="size-4 accent-violet-500"
              />
            </label>
          </div>

          <div className="flex items-center justify-between gap-3 py-2 border-b border-[var(--border)]/50">
            <div>
              <div className="font-medium">Versione</div>
              <p className="text-[11px] text-[var(--fg-subtle)] mt-0.5">
                Build attualmente installata
              </p>
            </div>
            <span className="font-mono text-sm">v{version}</span>
          </div>

          <div className="flex items-center justify-between gap-3 py-2">
            <div>
              <div className="font-medium">Cerca aggiornamenti</div>
              <p className="text-[11px] text-[var(--fg-subtle)] mt-0.5">
                Auto-update non disponibile in modalità web. Per aggiornare: pull dal
                repo e <code className="text-[10px]">npm install</code>.
              </p>
            </div>
            <button
              disabled
              className="h-8 px-3 rounded bg-[var(--surface-2)] border border-[var(--border)] text-xs opacity-50 cursor-not-allowed inline-flex items-center gap-1.5"
            >
              <AlertTriangle className="size-3" />
              Non disponibile
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
