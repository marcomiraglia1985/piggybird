"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import pkg from "../../package.json";
import { VersionBadge } from "@/components/version-badge";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  Users,
  TrendingUp,
  PieChart,
  Tag,
  Settings,
  Upload,
  GripVertical,
  Handshake,
  PlusCircle,
  BookOpen,
  PiggyBank,
  Building2,
  Snowflake,
  AlertTriangle,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Quando true, l'icona viene colorata cyan + tooltip esplicativo. */
  frozen?: boolean;
  /** Quando true, il link non navigare; mostra un title tooltip e
   *  l'utente è bloccato. Usato per disabilitare /import quando i conti
   *  sono congelati. */
  disabled?: boolean;
  disabledTitle?: string;
  /** Numero da mostrare in un badge ambra a destra (per richieste di
   *  attenzione, es. immobili con valore obsoleto). */
  alert?: number;
  alertTitle?: string;
};

const TOP_FIXED: NavItem = { href: "/", label: "Dashboard", icon: LayoutDashboard };

const REORDERABLE_DEFAULT: NavItem[] = [
  { href: "/movimenti", label: "Movimenti", icon: ArrowLeftRight },
  { href: "/conti", label: "Conti", icon: Wallet },
  { href: "/cointestato", label: "Cointestato", icon: Users },
  { href: "/risparmi", label: "Risparmi", icon: PiggyBank },
  { href: "/estates", label: "Estates", icon: Building2 },
  { href: "/friendsplit", label: "Friendsplit", icon: Handshake },
  { href: "/crediti", label: "Crediti", icon: BookOpen },
  { href: "/investimenti", label: "Investimenti", icon: TrendingUp },
  { href: "/riepilogo", label: "Riepilogo", icon: PieChart },
  { href: "/categorie", label: "Categorie", icon: Tag },
];

const BOTTOM_FIXED: NavItem[] = [
  { href: "/import", label: "Importa CSV", icon: Upload },
  { href: "/conti/nuovo", label: "Aggiungi Conto", icon: PlusCircle },
  { href: "/impostazioni", label: "Impostazioni", icon: Settings },
];

const STORAGE_KEY = "fp-sidebar-order";

export function Sidebar({
  accountsFrozen = true,
  estatesAlert = 0,
}: {
  accountsFrozen?: boolean;
  /** Numero di immobili senza valore attuale o non riconfermati da >5 anni. */
  estatesAlert?: number;
}) {
  const pathname = usePathname();
  const [order, setOrder] = useState<string[]>(REORDERABLE_DEFAULT.map((i) => i.href));
  const [mounted, setMounted] = useState(false);

  // Quando i conti sono congelati, sostituisco l'icona Wallet con Snowflake
  // (cyan) per dare un promemoria visuale globale.
  const reorderableItems = REORDERABLE_DEFAULT.map((item) => {
    let next: NavItem = { ...item, frozen: false as const };
    if (item.href === "/conti" && accountsFrozen) {
      next = { ...next, icon: Snowflake, frozen: true };
    }
    if (item.href === "/estates" && estatesAlert > 0) {
      next = {
        ...next,
        alert: estatesAlert,
        alertTitle: `${estatesAlert} immobile/i con valore obsoleto o mancante`,
      };
    }
    return next;
  });

  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const arr = JSON.parse(stored) as string[];
        // Includi solo href validi e aggiungi quelli mancanti in fondo
        const valid = arr.filter((h) => REORDERABLE_DEFAULT.some((i) => i.href === h));
        const missing = REORDERABLE_DEFAULT.filter((i) => !valid.includes(i.href)).map((i) => i.href);
        setOrder([...valid, ...missing]);
      }
    } catch {}
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setOrder((prev) => {
      const oldIdx = prev.indexOf(String(active.id));
      const newIdx = prev.indexOf(String(over.id));
      if (oldIdx === -1 || newIdx === -1) return prev;
      const next = arrayMove(prev, oldIdx, newIdx);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  const reorderable = order
    .map((href) => reorderableItems.find((i) => i.href === href))
    .filter((i): i is (typeof reorderableItems)[number] => Boolean(i));

  return (
    <aside className="hidden md:flex w-60 flex-col border-r border-[var(--border)] bg-[var(--bg-elevated)]/60 backdrop-blur-xl sticky top-0 h-screen">
      <div className="px-5 py-6 border-b border-[var(--border)]">
        <Link href="/" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/piggybird-icon-white.png"
            alt="Piggybird"
            className="size-[61px] object-contain"
          />
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold tracking-tight">
              Piggybird
            </span>
            <span className="text-[10px] text-[var(--fg-subtle)] tracking-tight">
              Save smart. Fly higher.
            </span>
            <VersionBadge currentVersion={pkg.version} />
          </div>
        </Link>
      </div>

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        <NavLink item={TOP_FIXED} pathname={pathname} fixed />

        <div className="pt-1">
          {mounted ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={reorderable.map((i) => i.href)} strategy={verticalListSortingStrategy}>
                {reorderable.map((item) => (
                  <SortableNavLink key={item.href} item={item} pathname={pathname} />
                ))}
              </SortableContext>
            </DndContext>
          ) : (
            // SSR fallback: mostra ordine default senza drag
            reorderableItems.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))
          )}
        </div>
      </nav>

      <div className="p-3 border-t border-[var(--border)] space-y-0.5">
        {BOTTOM_FIXED.map((item) => {
          // Quando i conti sono congelati, il link "Importa CSV" diventa
          // visivamente snowflake e non cliccabile (CSV import = aggiunta tx).
          let resolved: NavItem = item;
          if (item.href === "/import" && accountsFrozen) {
            resolved = {
              ...item,
              icon: Snowflake,
              frozen: true,
              disabled: true,
              disabledTitle:
                "Conti congelati: l'import CSV è bloccato. Sblocca dalla pagina Conti per importare nuovi movimenti.",
            };
          }
          return (
            <NavLink key={item.href} item={resolved} pathname={pathname} fixed />
          );
        })}
      </div>
    </aside>
  );
}

function NavLink({
  item,
  pathname,
  fixed,
}: {
  item: NavItem;
  pathname: string;
  fixed?: boolean;
}) {
  const { toast } = useToast();
  const Icon = item.icon;
  const active =
    pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));

  const baseClass = cn(
    "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
    active
      ? "text-[var(--fg)]"
      : "text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--surface)]",
    item.disabled && "opacity-60 cursor-not-allowed hover:text-[var(--fg-muted)] hover:bg-transparent",
  );

  const innerContent = (
    <>
      {active && !item.disabled && (
        <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-violet-500/20 to-indigo-500/10 border border-violet-500/30" />
      )}
      <Icon
        className={cn(
          "relative size-4 shrink-0",
          item.frozen && "text-cyan-300",
        )}
        {...(item.frozen
          ? { "aria-label": "Conti congelati: i saldi non si aggiornano dai movimenti" }
          : {})}
      />
      <span className="relative truncate">{item.label}</span>
      {item.alert != null && item.alert > 0 && (
        <span className="ml-auto">
          <AlertBadge count={item.alert} title={item.alertTitle ?? ""} />
        </span>
      )}
      {fixed && !item.alert && !item.disabled && (
        <span className="relative ml-auto text-[10px] text-[var(--fg-subtle)]/60 pointer-events-none">
          ◆
        </span>
      )}
    </>
  );

  if (item.disabled) {
    return (
      <button
        type="button"
        onClick={() =>
          toast({
            title: "Conti congelati 🔒",
            description:
              "Sblocca i saldi (in /conti) prima di aggiungere nuovi movimenti, trade o import.",
            variant: "info",
          })
        }
        className={cn(baseClass, "text-left w-full")}
        title={item.disabledTitle ?? "Disabilitato"}
        aria-disabled="true"
        data-tutorial={TUTORIAL_TARGETS[item.href]}
      >
        {innerContent}
      </button>
    );
  }

  return (
    <Link
      href={item.href}
      className={baseClass}
      data-tutorial={TUTORIAL_TARGETS[item.href]}
    >
      {innerContent}
    </Link>
  );
}

/** Mappa href → identificatore tutorial. Usato dal WelcomeTutorial per
 *  ancorare i tooltip ai sidebar items giusti. */
const TUTORIAL_TARGETS: Record<string, string | undefined> = {
  "/movimenti": "movimenti",
  "/conti": "conti",
  "/import": "import",
  "/impostazioni": "impostazioni",
};

/** Badge alert con tooltip portalato (esce dall'overflow della sidebar). */
function AlertBadge({ count, title, extraClass }: { count: number; title: string; extraClass?: string }) {
  const [hover, setHover] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    if (!hover) {
      setRect(null);
      return;
    }
    const update = () => {
      if (ref.current) setRect(ref.current.getBoundingClientRect());
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [hover]);

  return (
    <span
      ref={ref}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={cn(
        "relative inline-flex items-center justify-center size-[18px] rounded-full bg-rose-500 text-white shadow-[0_0_0_2px_rgba(225,29,72,0.25)] cursor-help",
        extraClass,
      )}
      aria-label={title}
    >
      <AlertTriangle className="size-3" strokeWidth={2.5} />
      {hover &&
        rect &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            role="tooltip"
            style={{
              position: "fixed",
              left: rect.right + 8,
              top: rect.top + rect.height / 2,
              transform: "translateY(-50%)",
              zIndex: 9999,
            }}
            className="pointer-events-none w-56 rounded-md border border-rose-500/40 bg-[var(--bg-elevated)] px-2.5 py-2 text-[11px] font-normal leading-relaxed text-[var(--fg)] shadow-xl"
          >
            <span className="block font-semibold text-rose-300 mb-1">
              {count} immobile{count === 1 ? "" : "/i"} da riconfermare
            </span>
            <span className="block text-[var(--fg-muted)]">
              Il valore stimato manca o non viene aggiornato da oltre 5 anni.
              Apri /estates e riconferma il prezzo attuale di mercato.
            </span>
          </span>,
          document.body,
        )}
    </span>
  );
}

function SortableNavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.href,
  });
  const Icon = item.icon;
  const active =
    pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative flex items-center gap-1 rounded-lg",
        isDragging && "z-10 opacity-80",
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 z-10 size-5 inline-flex items-center justify-center rounded text-[var(--fg-subtle)] bg-[var(--surface)]/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 hover:text-[var(--fg)] cursor-grab active:cursor-grabbing transition-opacity"
        title="Trascina per riordinare"
      >
        <GripVertical className="size-3.5" />
      </button>
      <Link
        href={item.href}
        data-tutorial={TUTORIAL_TARGETS[item.href]}
        className={cn(
          "relative flex items-center gap-3 rounded-lg px-3 py-2 pr-7 text-sm font-medium transition-colors flex-1",
          active
            ? "text-[var(--fg)]"
            : "text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--surface)]",
        )}
      >
        {active && (
          <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-violet-500/20 to-indigo-500/10 border border-violet-500/30" />
        )}
        <Icon
          className={cn(
            "relative size-4 shrink-0",
            item.frozen && "text-cyan-300",
          )}
        />
        <span className="relative truncate">{item.label}</span>
        {item.alert != null && item.alert > 0 && (
          <span className="ml-auto mr-5">
            <AlertBadge count={item.alert} title={item.alertTitle ?? ""} />
          </span>
        )}
      </Link>
    </div>
  );
}
