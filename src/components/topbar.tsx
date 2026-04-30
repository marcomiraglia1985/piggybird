"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Plus,
  X,
  Command,
  FileText,
  ArrowLeftRight,
  TrendingUp,
  Upload,
  ChevronDown,
  Snowflake,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { NewTransactionDialog } from "@/components/movimenti/new-transaction-dialog";
import { HeaderClock } from "@/components/header-clock";
import { useToast } from "@/components/ui/toast";

type AddMode = "single" | "transfer" | "trade";

export function Topbar() {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<AddMode>("single");
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [frozen, setFrozen] = useState<boolean>(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Fetch freeze state al mount + ascolta eventi "fp-freeze-changed"
  // emessi dal toggle in /conti per aggiornarsi in real-time senza refresh.
  useEffect(() => {
    fetch("/api/accounts/freeze")
      .then((r) => r.json())
      .then((d) => setFrozen(!!d.frozen))
      .catch(() => {});

    function onFreezeChanged(e: Event) {
      const detail = (e as CustomEvent<{ frozen: boolean }>).detail;
      if (typeof detail?.frozen === "boolean") {
        setFrozen(detail.frozen);
      }
    }
    window.addEventListener("fp-freeze-changed", onFreezeChanged);
    return () =>
      window.removeEventListener("fp-freeze-changed", onFreezeChanged);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  function openAdd(mode: AddMode) {
    if (frozen) {
      blockedFrozen();
      return;
    }
    setDialogMode(mode);
    setOpen(true);
    setMenuOpen(false);
  }

  function blockedFrozen() {
    setMenuOpen(false);
    toast({
      title: "Conti congelati 🔒",
      description:
        "Sblocca i saldi (in /conti) prima di aggiungere nuovi movimenti, trade o import.",
      variant: "info",
    });
  }

  function submit() {
    const q = query.trim();
    if (q) router.push(`/movimenti?q=${encodeURIComponent(q)}`);
    else router.push("/movimenti");
  }

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--bg)]/70 backdrop-blur-xl">
      <div className="flex h-14 items-center gap-3 px-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--fg-subtle)]" />
          <input
            id="topbar-search"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              else if (e.key === "Escape") setQuery("");
            }}
            placeholder="Cerca movimenti…  (Invio per cercare)"
            className="w-full h-9 pl-9 pr-9 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-sm placeholder:text-[var(--fg-subtle)] focus:outline-none focus:border-violet-500/50 transition-colors"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-[var(--surface-2)]"
            >
              <X className="size-3.5 text-[var(--fg-subtle)]" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("open-command-palette"))}
          className="hidden sm:inline-flex items-center gap-1.5 h-9 px-2.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-xs text-[var(--fg-muted)] hover:text-[var(--fg)] hover:border-[var(--border-strong)] transition-colors"
          title="Apri comandi rapidi"
        >
          <Command className="size-3.5" />
          <span>Comandi</span>
          <kbd className="ml-1 inline-flex items-center gap-0.5 rounded border border-[var(--border)] bg-[var(--surface-2)] px-1 py-px text-[10px] text-[var(--fg-subtle)]">
            ⌘K
          </kbd>
        </button>
        <ThemeToggle />
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => {
              if (frozen) {
                blockedFrozen();
                return;
              }
              setMenuOpen((v) => !v);
            }}
            title={
              frozen
                ? "Conti congelati — sblocca dalle Impostazioni o dalla pagina Conti"
                : undefined
            }
            className={
              frozen
                ? "inline-flex items-center gap-1.5 h-9 pl-3 pr-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-sm font-medium cursor-not-allowed"
                : "inline-flex items-center gap-1.5 h-9 pl-3 pr-2.5 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-sm font-medium shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40 transition-shadow"
            }
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-disabled={frozen}
          >
            {frozen ? <Snowflake className="size-4" /> : <Plus className="size-4" />}
            Aggiungi
            {!frozen && (
              <ChevronDown
                className={`size-3.5 transition-transform ${menuOpen ? "rotate-180" : ""}`}
              />
            )}
          </button>
          {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-1 w-60 rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl overflow-hidden z-40"
              >
                <MenuItem
                  icon={<FileText className="size-4" />}
                  label="Movimento"
                  hint="Entrata o uscita"
                  onClick={() => openAdd("single")}
                />
                <MenuItem
                  icon={<ArrowLeftRight className="size-4" />}
                  label="Trasferimento"
                  hint="Tra due tuoi conti"
                  onClick={() => openAdd("transfer")}
                />
                <MenuItem
                  icon={<TrendingUp className="size-4" />}
                  label="Trade"
                  hint="BUY/SELL asset investimento"
                  onClick={() => openAdd("trade")}
                />
                <div className="border-t border-[var(--border)]" />
                <MenuItem
                  icon={<Upload className="size-4" />}
                  label="Importa CSV/Excel"
                  hint="File estratto conto"
                  onClick={() => {
                    if (frozen) {
                      blockedFrozen();
                      return;
                    }
                    setMenuOpen(false);
                    router.push("/import");
                  }}
                />
              </div>
            )}
        </div>
        <div className="ml-auto">
          <HeaderClock />
        </div>
      </div>
      <NewTransactionDialog
        open={open}
        onClose={() => setOpen(false)}
        initialMode={dialogMode}
      />
    </header>
  );
}

function MenuItem({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="w-full text-left px-3 py-2.5 hover:bg-[var(--surface-2)] flex items-center gap-3 transition-colors"
    >
      <span className="size-8 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center text-[var(--fg-muted)]">
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-[11px] text-[var(--fg-subtle)]">{hint}</span>}
      </span>
    </button>
  );
}
