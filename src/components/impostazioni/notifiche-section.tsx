"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell, Mail, BellRing, TrendingUp, AlertCircle, Clock } from "lucide-react";

export function NotificheSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <Bell className="size-4 text-amber-400" />
            Notifiche
            <span className="ml-1 inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-300">
              <Clock className="size-2.5" />
              In arrivo
            </span>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-[var(--fg-muted)] leading-relaxed">
          Sistema notifiche non ancora attivo. Disponibili nella versione
          desktop (Tauri wrap, notifiche macOS native) o tramite email digest.
        </p>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <NotifFeature
            icon={<Mail className="size-3.5" />}
            title="Riepilogo settimanale"
            desc="Email con NW, top spese e movimenti rilevanti"
            tone="violet"
          />
          <NotifFeature
            icon={<BellRing className="size-3.5" />}
            title="Push desktop"
            desc="Alert su scadenze e ricorrenze non confermate"
            tone="cyan"
          />
          <NotifFeature
            icon={<TrendingUp className="size-3.5" />}
            title="Soglia investimenti"
            desc="Quando un asset supera ±% configurabile"
            tone="emerald"
          />
          <NotifFeature
            icon={<AlertCircle className="size-3.5" />}
            title="Spese fuori controllo"
            desc="Alert se una categoria sfora il tetto mensile"
            tone="rose"
          />
        </div>

      </CardContent>
    </Card>
  );
}

function NotifFeature({
  icon,
  title,
  desc,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  tone: "violet" | "cyan" | "emerald" | "rose";
}) {
  const tones = {
    violet: "text-violet-400 bg-violet-500/10 border-violet-500/30",
    cyan: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
    emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
    rose: "text-rose-400 bg-rose-500/10 border-rose-500/30",
  };
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)]/40 p-2.5 flex gap-2.5 opacity-60">
      <div
        className={`size-7 shrink-0 rounded-md border inline-flex items-center justify-center ${tones[tone]}`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs font-medium leading-tight">{title}</div>
        <div className="text-[10px] text-[var(--fg-subtle)] leading-tight mt-0.5">
          {desc}
        </div>
      </div>
    </div>
  );
}
