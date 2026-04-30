"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Plus,
  ArrowRight,
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  Users,
  TrendingUp,
  PieChart,
  Tag,
  Settings,
  Upload,
  Handshake,
  BookOpen,
  RefreshCw,
} from "lucide-react";

type Command = {
  id: string;
  label: string;
  hint?: string;
  icon?: React.ComponentType<{ className?: string }>;
  emoji?: string;
  keywords?: string;
  action: () => void;
};

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setMounted(true), []);

  // ⌘K to open. Custom event "open-command-palette" permette di aprirla
  // anche da bottoni UI senza dover passare lo stato come prop.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    function onOpenEvent() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-command-palette", onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-command-palette", onOpenEvent);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlight(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const commands: Command[] = useMemo(
    () => [
      // Navigation
      { id: "nav-dashboard", label: "Dashboard", icon: LayoutDashboard, action: () => router.push("/") },
      { id: "nav-movimenti", label: "Movimenti", icon: ArrowLeftRight, action: () => router.push("/movimenti") },
      { id: "nav-conti", label: "Conti", icon: Wallet, action: () => router.push("/conti") },
      { id: "nav-cointestato", label: "Cointestato", icon: Users, action: () => router.push("/cointestato") },
      { id: "nav-friendsplit", label: "Friendsplit", icon: Handshake, action: () => router.push("/friendsplit") },
      { id: "nav-crediti", label: "Crediti", icon: BookOpen, action: () => router.push("/crediti") },
      { id: "nav-investimenti", label: "Investimenti", icon: TrendingUp, action: () => router.push("/investimenti") },
      { id: "nav-stocks", label: "Trading Revolut (stocks)", emoji: "📈", action: () => router.push("/investimenti/stocks") },
      { id: "nav-binance", label: "Crypto Binance", emoji: "🚀", action: () => router.push("/investimenti/crypto") },
      { id: "nav-revolutx", label: "Crypto Revolut X", emoji: "🚀", action: () => router.push("/investimenti/crypto-revolut") },
      { id: "nav-riepilogo", label: "Riepilogo", icon: PieChart, action: () => router.push("/riepilogo") },
      { id: "nav-categorie", label: "Categorie", icon: Tag, action: () => router.push("/categorie") },
      { id: "nav-import", label: "Importa CSV", icon: Upload, action: () => router.push("/import") },
      { id: "nav-impostazioni", label: "Impostazioni", icon: Settings, action: () => router.push("/impostazioni") },
      { id: "nav-ricorrenze", label: "Ricorrenze", emoji: "🔁", keywords: "recurring", action: () => router.push("/movimenti/ricorrenze") },
      // Actions
      {
        id: "action-add-tx",
        label: "Aggiungi movimento",
        icon: Plus,
        keywords: "nuovo movimento singolo",
        action: () => {
          // Apre il dialog cliccando il bottone Aggiungi della topbar
          const btn = document.querySelector<HTMLButtonElement>("header button[type='button']:has(svg.lucide-plus)");
          btn?.click();
        },
      },
      {
        id: "action-sync-investimenti",
        label: "Sincronizza investimenti",
        icon: RefreshCw,
        keywords: "sync update binance revolut stocks",
        action: () => {
          router.push("/investimenti");
          // Trigger sync via DOM se possibile, altrimenti l'utente clicca dal pulsante
        },
      },
      {
        id: "action-aggiungi-conto",
        label: "Aggiungi conto",
        icon: Plus,
        keywords: "nuovo account",
        action: () => router.push("/conti/nuovo"),
      },
      {
        id: "action-search",
        label: query.trim() ? `Cerca "${query}" nei movimenti` : "Cerca nei movimenti…",
        icon: Search,
        action: () => {
          if (query.trim()) {
            router.push(`/movimenti?q=${encodeURIComponent(query.trim())}`);
          } else {
            router.push("/movimenti");
          }
        },
      },
    ],
    [router, query],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => {
      const text = `${c.label} ${c.hint ?? ""} ${c.keywords ?? ""}`.toLowerCase();
      return text.includes(q);
    });
  }, [commands, query]);

  function execute(c: Command) {
    setOpen(false);
    setTimeout(() => c.action(), 50);
  }

  if (!mounted) return null;

  const palette = (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-start justify-center pt-24 px-4"
        >
          <motion.div
            initial={{ scale: 0.95, y: -10, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: -10, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] shadow-2xl overflow-hidden"
          >
            <div className="flex items-center gap-2 border-b border-[var(--border)] px-3">
              <Search className="size-4 text-[var(--fg-muted)]" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setHighlight(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setHighlight((h) => Math.min(h + 1, filtered.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setHighlight((h) => Math.max(h - 1, 0));
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    const c = filtered[highlight];
                    if (c) execute(c);
                  }
                }}
                placeholder="Cerca pagine, azioni o digita per cercare nei movimenti…"
                className="w-full h-12 bg-transparent text-sm focus:outline-none placeholder:text-[var(--fg-subtle)]"
              />
              <kbd className="text-[10px] text-[var(--fg-subtle)] px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--surface-2)]">
                ESC
              </kbd>
            </div>
            <div className="max-h-96 overflow-y-auto py-1">
              {filtered.length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-[var(--fg-subtle)]">
                  Nessun risultato
                </div>
              )}
              {filtered.map((c, idx) => {
                const Icon = c.icon;
                const isHighlighted = idx === highlight;
                return (
                  <button
                    key={c.id}
                    onMouseEnter={() => setHighlight(idx)}
                    onClick={() => execute(c)}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
                      isHighlighted
                        ? "bg-violet-500/10 text-[var(--fg)]"
                        : "text-[var(--fg-muted)] hover:bg-[var(--surface)]"
                    }`}
                  >
                    <span className="size-7 inline-flex items-center justify-center shrink-0">
                      {c.emoji ? (
                        <span className="text-base">{c.emoji}</span>
                      ) : Icon ? (
                        <Icon className="size-4" />
                      ) : null}
                    </span>
                    <span className="flex-1">{c.label}</span>
                    {isHighlighted && <ArrowRight className="size-3.5 text-violet-400" />}
                  </button>
                );
              })}
            </div>
            <div className="border-t border-[var(--border)] px-3 py-2 flex items-center justify-between text-[10px] text-[var(--fg-subtle)]">
              <span>
                <kbd className="px-1 py-0.5 rounded border border-[var(--border)] bg-[var(--surface-2)]">↑</kbd>{" "}
                <kbd className="px-1 py-0.5 rounded border border-[var(--border)] bg-[var(--surface-2)]">↓</kbd>{" "}
                naviga ·{" "}
                <kbd className="px-1 py-0.5 rounded border border-[var(--border)] bg-[var(--surface-2)]">↵</kbd>{" "}
                seleziona
              </span>
              <span>
                Apri con{" "}
                <kbd className="px-1 py-0.5 rounded border border-[var(--border)] bg-[var(--surface-2)]">⌘K</kbd>
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(palette, document.body);
}
