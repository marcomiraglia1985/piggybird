"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Settings2, ArrowUpRight, Check } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import {
  getProvidersForAccountType,
  getProvider,
} from "@/lib/account-providers";

/**
 * Popover ⚙ sulla card del conto: per ora consente di cambiare il `provider`
 * (Generic / Binance / Revolut X / ecc.). Quando il provider scelto richiede
 * setup chiave API, link diretto a Impostazioni → Integrazioni.
 *
 * In futuro: ownership share, rename, notes — tutto qui per evitare modali.
 */
export function AccountSettingsPopover({
  accountId,
  accountType,
  currentProviderId,
}: {
  accountId: string;
  accountType: string;
  currentProviderId: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const providers = getProvidersForAccountType(accountType);
  const currentProvider = getProvider(currentProviderId);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Element | null;
      if (ref.current && target && !ref.current.contains(target)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("click", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function selectProvider(providerId: string) {
    if (providerId === currentProviderId || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/accounts/${accountId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: providerId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({
          title: data.error ?? "Impossibile cambiare provider",
          variant: "error",
        });
      } else {
        const newProv = getProvider(providerId);
        toast({
          title: `Provider aggiornato → ${newProv.label}`,
          variant: "success",
          duration: 2500,
        });
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  // Se non ci sono provider alternativi compatibili (es. type=cash → solo
  // generic), nascondi del tutto il popover per non aggiungere rumore.
  if (providers.length <= 1) return null;

  return (
    <div
      ref={ref}
      className="relative inline-block"
      // Evita che drag-and-drop catturi click sul popover (la card è draggable)
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Impostazioni del conto"
        aria-label="Impostazioni del conto"
        aria-expanded={open}
        className="absolute right-12 top-2 size-5 inline-flex items-center justify-center rounded text-[var(--fg-subtle)] opacity-0 group-hover:opacity-80 hover:text-[var(--fg)] hover:bg-[var(--surface-2)] transition-opacity"
        // I className `absolute right-12 top-2` posizionano l'icona accanto
        // ad Archive (right-7) e GripVertical (right-2) sulla card.
      >
        <Settings2 className="size-3" />
      </button>
      {open && (
        <div className="absolute right-0 top-7 w-64 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl overflow-hidden z-30 text-xs">
          <div className="px-3 py-2 border-b border-[var(--border)]">
            <div className="text-[10px] uppercase tracking-widest font-medium text-[var(--fg-muted)]">
              Provider del conto
            </div>
            <div className="text-[10px] text-[var(--fg-subtle)] mt-0.5 leading-snug">
              Cambia broker/banca per abilitare la sync API.
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {providers.map((p) => {
              const selected = p.id === currentProviderId;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={saving}
                  onClick={() => selectProvider(p.id)}
                  className={`w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-[var(--surface-2)] disabled:opacity-50 ${selected ? "bg-violet-500/5" : ""}`}
                >
                  <span className="size-7 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center text-base shrink-0">
                    {p.emoji}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">{p.label}</span>
                      {selected && (
                        <Check className="size-3 text-violet-400 shrink-0" />
                      )}
                    </div>
                    <div className="text-[10px] text-[var(--fg-subtle)] leading-snug">
                      {p.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          {currentProvider.hasIntegration && (
            <div className="px-3 py-2 border-t border-[var(--border)] bg-[var(--surface)]/40">
              <Link
                href="/impostazioni#integrazioni"
                className="inline-flex items-center gap-1 text-[11px] text-violet-400 hover:underline"
              >
                Configura chiave API in Impostazioni
                <ArrowUpRight className="size-3" />
              </Link>
              {currentProvider.integrationHint && (
                <div className="text-[10px] text-[var(--fg-subtle)] mt-0.5 leading-snug">
                  {currentProvider.integrationHint}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
