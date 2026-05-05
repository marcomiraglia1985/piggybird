"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  closestCorners,
  useSensor,
  useSensors,
  useDroppable,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Columns2, Columns3, Square, X, Plus, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { MasonryGrid } from "./masonry-grid";

const PLACEMENT_KEY = "fp-dashboard-placement-v2";
const COLS_KEY = "fp-dashboard-cols";
const HIDDEN_KEY = "fp-dashboard-hidden";
const SPANS_KEY = "fp-dashboard-spans";
const WIDE = "wide";

/**
 * Layout di DEFAULT per il primo accesso (zero localStorage). Sovrascritto
 * dalle scelte dell'utente non appena tocca la dashboard. Per aggiornare
 * il default: configura il layout come vuoi tu, poi (in dev) leggi
 * `localStorage.getItem("fp-dashboard-placement-v2")` ecc. da DevTools e
 * incolla i valori qui sotto.
 */
const DEFAULT_COLS: Cols = 2;
const DEFAULT_SPANS: Record<string, number> = {
  "networth-chart": 1,
};
const DEFAULT_HIDDEN: string[] = [
  "world-daynight",
  "top-expenses",
  "asset-allocation",
  "estate-roi",
  "sp500-beat",
  "anniversary",
  "coffee-tracker",
  "world-clocks",
];
const DEFAULT_PLACEMENT: Placement = {
  wide: [
    "networth-chart",
    "world-daynight",
    "milestones",
    "future-you",
    "month-summary",
    "accounts",
  ],
  cols: [
    ["top-expenses", "asset-allocation", "estate-roi", "sp500-beat"],
    ["anniversary", "coffee-tracker", "world-clocks", "recent-transactions"],
  ],
};

export type DashboardCard = {
  id: string;
  label: string;
  node: React.ReactNode;
  defaultSpan?: number;
  minSpan?: number;
  maxSpan?: number;
  removable?: boolean;
  /** Quando true, il widget è AI-powered: nel modal "Aggiungi widget" viene
   *  mostrato in una sezione separata con badge ✨. */
  aiPowered?: boolean;
};

type Cols = 1 | 2 | 3;

// Layout split:
//   - `wide`: cards con span > 1, in una zona CSS-grid in alto (auto-flow row
//     dense per riempire i gap se più wide cards stanno su una stessa riga).
//   - `cols[i]`: cards con span = 1 in colonna i. Ogni colonna è uno stack
//     flex INDIPENDENTE → un box alto in col-0 non spinge giù i box di col-1.
type Placement = {
  wide: string[];
  cols: string[][];
};

function emptyPlacement(n: Cols): Placement {
  return { wide: [], cols: Array.from({ length: n }, () => []) };
}

function effectiveSpan(card: DashboardCard, spans: Record<string, number>, cols: Cols): number {
  const min = Math.max(1, card.minSpan ?? 1);
  const max = Math.min(card.maxSpan ?? 3, cols);
  const user = spans[card.id] ?? card.defaultSpan ?? 1;
  return Math.max(min, Math.min(max, user));
}

/**
 * Collision detection custom: prioritizza i container colonna quando il
 * cursore è dentro la loro area. Default `closestCorners` invece può "agganciare"
 * una card vicina in una colonna adiacente, impedendo di droppare nella
 * colonna che si vede vuota o lontana dalle card.
 *
 * Algoritmo:
 *   1. Cerca i droppable container (id WIDE o "col-N") sotto il pointer
 *   2. Se trovato, restituisce quello (preferendo container con cursore dentro)
 *   3. Altrimenti fallback a closestCorners (cards lontane = riordinamento entro
 *      stessa zona o drop in zona vuota distante)
 */
// Set degli id dei droppable container (wide + col-N). Hardcoded per cols ≤ 3.
const CONTAINER_IDS = new Set<string>([WIDE, "col-0", "col-1", "col-2"]);
const collisionDetection: CollisionDetection = (args) => {
  // Step 1: cosa c'è sotto il pointer?
  const pointerCollisions = pointerWithin(args);
  // Card sotto il pointer hanno priorità (riordinamento intra-zona)
  const cardHit = pointerCollisions.find(
    (c) => !CONTAINER_IDS.has(String(c.id)),
  );
  if (cardHit) return [cardHit];
  // Container sotto il pointer (zona vuota di una colonna)
  const containerHit = pointerCollisions.find((c) =>
    CONTAINER_IDS.has(String(c.id)),
  );
  if (containerHit) return [containerHit];
  // Fallback: rectIntersection per intercettare drop ai bordi
  const rectColl = rectIntersection(args);
  if (rectColl.length > 0) return rectColl;
  return closestCorners(args);
};

function shortestColIdx(cols: string[][]): number {
  let best = 0;
  for (let i = 1; i < cols.length; i++) {
    if (cols[i].length < cols[best].length) best = i;
  }
  return best;
}

function buildInitialPlacement(
  cards: DashboardCard[],
  cols: Cols,
  spans: Record<string, number>,
): Placement {
  const out = emptyPlacement(cols);
  let cursor = 0;
  for (const c of cards) {
    const sp = effectiveSpan(c, spans, cols);
    if (sp > 1) {
      out.wide.push(c.id);
    } else {
      out.cols[cursor].push(c.id);
      cursor = (cursor + 1) % cols;
    }
  }
  return out;
}

// Allinea il placement allo stato corrente di cards/cols/spans:
// - rimuove id sconosciuti
// - adatta numero colonne (extra colonne → ultima)
// - card span>1 DEVONO stare in wide (cols zone non gestisce span)
// - card span=1 possono stare ovunque: rispettiamo la scelta dell'utente
//   (es. utente ha trascinato il donut nella cella vuota a fianco del
//   chart wide → non rimettiamolo in cols al refresh)
// - inserisce card nuove nella zona giusta
function reconcilePlacement(
  prev: Placement,
  cards: DashboardCard[],
  cols: Cols,
  spans: Record<string, number>,
): Placement {
  const known = new Set(cards.map((c) => c.id));
  let wide = prev.wide.filter((id) => known.has(id));
  let arr = prev.cols.map((col) => col.filter((id) => known.has(id)));

  if (arr.length > cols) {
    const extras = arr.slice(cols).flat();
    arr = arr.slice(0, cols);
    arr[cols - 1].push(...extras);
  } else while (arr.length < cols) arr.push([]);

  const inWide = new Set(wide);
  const inCols = new Set(arr.flat());

  for (const card of cards) {
    const sp = effectiveSpan(card, spans, cols);
    if (sp > 1) {
      // span>1 deve stare in wide
      if (inCols.has(card.id)) {
        for (const col of arr) {
          const i = col.indexOf(card.id);
          if (i >= 0) {
            col.splice(i, 1);
            break;
          }
        }
        inCols.delete(card.id);
      }
      if (!inWide.has(card.id)) {
        wide.push(card.id);
        inWide.add(card.id);
      }
    } else {
      // span=1: preserva posizione utente. Aggiungi a cols solo se mai posizionato.
      if (!inWide.has(card.id) && !inCols.has(card.id)) {
        arr[shortestColIdx(arr)].push(card.id);
        inCols.add(card.id);
      }
    }
  }

  return { wide, cols: arr };
}

export function DashboardGrid({
  cards,
  locked = false,
}: {
  cards: DashboardCard[];
  locked?: boolean;
}) {
  const [cols, setCols] = useState<Cols>(2);
  const [spans, setSpans] = useState<Record<string, number>>({});
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [placement, setPlacement] = useState<Placement>(() => emptyPlacement(2));
  const [mounted, setMounted] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Refs allineati allo state per leggere SEMPRE l'ultimo valore dagli event
  // handler. Senza questo, onDragEnd legge `placement` dalla closure del
  // render in cui è stato creato, ma onDragOver ha già aggiornato lo state
  // via functional updater → la persistenza scrive il valore VECCHIO e il
  // drag cross-colonna non si salva (bug riportato).
  const placementRef = useRef(placement);
  const colsRef = useRef(cols);
  const spansRef = useRef(spans);
  useEffect(() => { placementRef.current = placement; }, [placement]);
  useEffect(() => { colsRef.current = cols; }, [cols]);
  useEffect(() => { spansRef.current = spans; }, [spans]);

  useEffect(() => {
    setMounted(true);
    // First-run detection: se PLACEMENT_KEY non esiste, è il primo accesso
    // dell'utente → applichiamo i DEFAULT_* baked. Altrimenti rispettiamo
    // tutto quello che l'utente ha già configurato in localStorage.
    const hasUserConfig =
      typeof window !== "undefined" && !!localStorage.getItem(PLACEMENT_KEY);

    let lc: Cols;
    let ls: Record<string, number>;
    let lh: Set<string>;
    let lp: Placement | null;

    if (!hasUserConfig) {
      lc = DEFAULT_COLS;
      ls = { ...DEFAULT_SPANS };
      lh = new Set(DEFAULT_HIDDEN.filter((id) => cards.some((c) => c.id === id)));
      lp = DEFAULT_PLACEMENT;
    } else {
      lc = 2;
      ls = {};
      lh = new Set();
      lp = null;
      try {
        const c = localStorage.getItem(COLS_KEY);
        if (c === "1" || c === "2" || c === "3") lc = parseInt(c, 10) as Cols;
        const sp = localStorage.getItem(SPANS_KEY);
        if (sp) {
          const obj = JSON.parse(sp) as Record<string, number>;
          for (const c of cards) {
            const v = obj[c.id];
            if (Number.isInteger(v) && v > 0) ls[c.id] = v;
          }
        }
        const h = localStorage.getItem(HIDDEN_KEY);
        if (h) {
          const idsArr = JSON.parse(h) as string[];
          lh = new Set(idsArr.filter((id) => cards.some((c) => c.id === id)));
        }
        const p = localStorage.getItem(PLACEMENT_KEY);
        if (p) {
          const parsed = JSON.parse(p) as Placement;
          if (parsed && Array.isArray(parsed.wide) && Array.isArray(parsed.cols))
            lp = parsed;
        }
      } catch {}
    }

    setCols(lc);
    setSpans(ls);
    setHidden(lh);
    setPlacement(
      lp
        ? reconcilePlacement(lp, cards, lc, ls)
        : buildInitialPlacement(cards, lc, ls),
    );
  }, [cards]);

  function persistPlacement(next: Placement) {
    placementRef.current = next; // sync IMMEDIATO, non aspetta il commit
    setPlacement(next);
    try {
      localStorage.setItem(PLACEMENT_KEY, JSON.stringify(next));
    } catch {}
  }
  function persistHidden(next: Set<string>) {
    setHidden(next);
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify([...next]));
    } catch {}
  }
  function persistSpans(next: Record<string, number>) {
    spansRef.current = next; // sync IMMEDIATO
    setSpans(next);
    try {
      localStorage.setItem(SPANS_KEY, JSON.stringify(next));
    } catch {}
  }
  function setColsPersist(n: Cols) {
    persistPlacement(reconcilePlacement(placementRef.current, cards, n, spansRef.current));
    setCols(n);
    try {
      localStorage.setItem(COLS_KEY, String(n));
    } catch {}
  }
  function hideCard(id: string) {
    const next = new Set(hidden);
    next.add(id);
    persistHidden(next);
  }
  function showCard(id: string) {
    const next = new Set(hidden);
    next.delete(id);
    persistHidden(next);
    persistPlacement(
      reconcilePlacement(placementRef.current, cards, colsRef.current, spansRef.current),
    );
  }
  function setCardSpan(id: string, span: number) {
    const ns = { ...spansRef.current, [id]: span };
    persistSpans(ns);
    persistPlacement(reconcilePlacement(placementRef.current, cards, colsRef.current, ns));
  }

  function getCardSpan(card: DashboardCard) {
    return effectiveSpan(card, spans, cols);
  }
  function getAllowedSpans(card: DashboardCard) {
    const min = Math.max(1, card.minSpan ?? 1);
    const max = Math.min(card.maxSpan ?? 3, cols);
    const out: number[] = [];
    for (let s = min; s <= max; s++) out.push(s);
    return out.length ? out : [1];
  }

  const cardMap = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);

  const visibleP = useMemo(
    () => ({
      wide: placement.wide.filter((id) => !hidden.has(id)),
      cols: placement.cols.map((col) => col.filter((id) => !hidden.has(id))),
    }),
    [placement, hidden],
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function findContainer(id: string, p: Placement = placementRef.current): string | null {
    if (id === WIDE) return WIDE;
    if (id.startsWith("col-")) return id;
    if (p.wide.includes(id)) return WIDE;
    for (let i = 0; i < p.cols.length; i++) {
      if (p.cols[i].includes(id)) return `col-${i}`;
    }
    return null;
  }

  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const aId = String(active.id);
    const oId = String(over.id);
    // Calcoliamo TUTTO da placementRef.current per evitare lag tra
    // pointermove successivi: se React non ha ancora committato il primo
    // setPlacement, una seconda onDragOver vedrebbe stato vecchio dal closure.
    const prev = placementRef.current;
    const aCont = findContainer(aId, prev);
    const oCont = findContainer(oId, prev);
    if (!aCont || !oCont || aCont === oCont) return;

    const next: Placement = { wide: [...prev.wide], cols: prev.cols.map((c) => [...c]) };
    const fromArr =
      aCont === WIDE ? next.wide : next.cols[parseInt(aCont.split("-")[1], 10)];
    const toArr = oCont === WIDE ? next.wide : next.cols[parseInt(oCont.split("-")[1], 10)];
    const fIdx = fromArr.indexOf(aId);
    if (fIdx >= 0) fromArr.splice(fIdx, 1);
    if (oId === oCont) {
      toArr.push(aId);
    } else {
      const oIdx = toArr.indexOf(oId);
      if (oIdx >= 0) toArr.splice(oIdx, 0, aId);
      else toArr.push(aId);
    }

    placementRef.current = next; // sync IMMEDIATO
    setPlacement(next);
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    // Leggi sempre l'ultimo placement dal ref: onDragOver ha probabilmente
    // già mutato lo state e la closure di onDragEnd è stale.
    const cur = placementRef.current;
    const curCols = colsRef.current;
    const curSpans = spansRef.current;

    if (!over) {
      // Drop fuori da una droppable zone: il move "preview" fatto da
      // onDragOver è già nello state corrente — lo persistiamo così com'è.
      try {
        localStorage.setItem(PLACEMENT_KEY, JSON.stringify(cur));
      } catch {}
      return;
    }
    const aId = String(active.id);
    const oId = String(over.id);
    const aCont = findContainer(aId, cur);
    const oCont = findContainer(oId, cur);
    if (!aCont || !oCont) return;

    let next: Placement = cur;
    if (aCont === oCont && aId !== oId) {
      const arr = aCont === WIDE ? cur.wide : cur.cols[parseInt(aCont.split("-")[1], 10)];
      const oldIdx = arr.indexOf(aId);
      const newIdx = arr.indexOf(oId);
      if (oldIdx >= 0 && newIdx >= 0 && oldIdx !== newIdx) {
        const moved = arrayMove(arr, oldIdx, newIdx);
        next =
          aCont === WIDE
            ? { ...cur, wide: moved }
            : {
                ...cur,
                cols: cur.cols.map((c, i) => (`col-${i}` === aCont ? moved : c)),
              };
      }
    }

    // Drag tra zone wide↔colonna: aggiorna anche lo span (auto-bump)
    const card = cardMap.get(aId);
    if (card && aCont !== oCont) {
      const min = Math.max(1, card.minSpan ?? 1);
      const max = Math.min(card.maxSpan ?? 3, curCols);
      let desired = curSpans[aId] ?? card.defaultSpan ?? 1;
      if (oCont === WIDE && desired === 1) desired = Math.max(2, min);
      if (oCont !== WIDE && desired > 1) desired = 1;
      desired = Math.max(min, Math.min(max, desired));
      if (desired !== (curSpans[aId] ?? card.defaultSpan ?? 1)) {
        const ns = { ...curSpans, [aId]: desired };
        persistSpans(ns);
      }
    }

    persistPlacement(next);
  }

  const hiddenCards = cards.filter((c) => hidden.has(c.id));
  const isEditing = mounted && !locked;

  // ----- Static (locked / pre-mount) -----
  const staticView = (() => {
    const hasWide = visibleP.wide.length > 0;
    const hasCols = visibleP.cols.some((col) => col.length > 0);
    // True masonry: i widget narrow "salgono" a riempire lo spazio vuoto
    // SOPRA di loro (impossibile con CSS grid puro cross-browser).
    // Implementato in JS via <MasonryGrid>: misura altezze + position absolute
    // + ResizeObserver per re-layout quando contenuto cambia.
    // Ordine items: prima wide, poi cols flatten row-by-row.
    const masonryItems: { id: string; span: number; node: React.ReactNode }[] = [];
    for (const id of visibleP.wide) {
      const card = cardMap.get(id);
      if (!card) continue;
      masonryItems.push({ id, span: getCardSpan(card), node: card.node });
    }
    const maxColLen = Math.max(0, ...visibleP.cols.map((c) => c.length));
    for (let row = 0; row < maxColLen; row++) {
      for (let c = 0; c < visibleP.cols.length; c++) {
        const id = visibleP.cols[c]?.[row];
        if (!id) continue;
        const card = cardMap.get(id);
        if (!card) continue;
        masonryItems.push({ id, span: getCardSpan(card), node: card.node });
      }
    }
    return (
      <div className="space-y-6">
        {(hasWide || hasCols) && (
          <MasonryGrid items={masonryItems} cols={cols} gap={24} />
        )}
      </div>
    );
  })();

  // ----- Edit mode -----
  const editView = (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-1.5">
        <span className="text-[11px] text-[var(--color-fg-subtle)] mr-1">Layout</span>
        <ColsButton current={cols} value={1} onClick={setColsPersist} icon={<Square className="size-3" />} label="1 colonna" />
        <ColsButton current={cols} value={2} onClick={setColsPersist} icon={<Columns2 className="size-3.5" />} label="2 colonne" />
        <ColsButton current={cols} value={3} onClick={setColsPersist} icon={<Columns3 className="size-3.5" />} label="3 colonne" />
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={() => setIsDragging(true)}
        onDragOver={onDragOver}
        onDragEnd={(e) => {
          setIsDragging(false);
          onDragEnd(e);
        }}
        onDragCancel={() => setIsDragging(false)}
      >
        <div className="space-y-6">
          {/* Wide zone (CSS grid auto-flow row dense) */}
          <DroppableContainer id={WIDE} isDragging={isDragging} className="min-h-[40px]">
            <SortableContext items={visibleP.wide} strategy={rectSortingStrategy}>
              <div
                className="grid gap-6"
                style={{
                  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                  gridAutoFlow: "row dense",
                }}
              >
                {visibleP.wide.map((id) => {
                  const card = cardMap.get(id);
                  if (!card) return null;
                  return (
                    <SortableCard
                      key={id}
                      id={id}
                      span={getCardSpan(card)}
                      allowedSpans={getAllowedSpans(card)}
                      removable={card.removable !== false}
                      onHide={() => hideCard(id)}
                      onSpan={(s) => setCardSpan(id, s)}
                    >
                      {card.node}
                    </SortableCard>
                  );
                })}
              </div>
            </SortableContext>
          </DroppableContainer>

          {/* Column zones: ogni colonna è una pila flex indipendente */}
          <div
            className="grid gap-6 items-start"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {visibleP.cols.map((col, idx) => (
              <DroppableContainer
                key={idx}
                id={`col-${idx}`}
                isDragging={isDragging}
                className="flex flex-col gap-6 min-h-[200px]"
              >
                <SortableContext items={col} strategy={verticalListSortingStrategy}>
                  {col.map((id) => {
                    const card = cardMap.get(id);
                    if (!card) return null;
                    return (
                      <SortableCard
                        key={id}
                        id={id}
                        span={1}
                        allowedSpans={getAllowedSpans(card)}
                        removable={card.removable !== false}
                        onHide={() => hideCard(id)}
                        onSpan={(s) => setCardSpan(id, s)}
                      >
                        {card.node}
                      </SortableCard>
                    );
                  })}
                </SortableContext>
              </DroppableContainer>
            ))}
          </div>
        </div>
      </DndContext>
    </div>
  );

  return (
    <div className="space-y-6">
      {isEditing ? editView : staticView}

      <div className="flex justify-center pt-2">
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-[var(--color-surface-2)] border border-dashed border-[var(--color-border)] text-sm text-[var(--color-fg-muted)] hover:border-violet-500/40 hover:text-violet-300 transition-colors"
        >
          <Plus className="size-4" />
          Aggiungi widgets
        </button>
      </div>

      <AddWidgetsModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        hiddenCards={hiddenCards}
        onAdd={(id) => showCard(id)}
      />
    </div>
  );
}

function AddWidgetsModal({
  open,
  onClose,
  hiddenCards,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  hiddenCards: DashboardCard[];
  onAdd: (id: string) => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md surface p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Aggiungi widget</h2>
          <button
            type="button"
            onClick={onClose}
            className="size-8 inline-flex items-center justify-center rounded-lg hover:bg-[var(--color-surface-2)] text-[var(--color-fg-muted)]"
            title="Chiudi"
          >
            <X className="size-4" />
          </button>
        </div>

        {hiddenCards.length > 0 && (() => {
          const sortedAi = hiddenCards
            .filter((c) => c.aiPowered)
            .sort((a, b) => a.label.localeCompare(b.label, "it"));
          const sortedStd = hiddenCards
            .filter((c) => !c.aiPowered)
            .sort((a, b) => a.label.localeCompare(b.label, "it"));
          const renderRow = (c: DashboardCard) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onAdd(c.id);
                onClose();
              }}
              className={cn(
                "w-full flex items-center justify-between gap-2 h-10 px-3 rounded-lg border text-sm transition-colors",
                c.aiPowered
                  ? "bg-gradient-to-br from-amber-500/[0.06] via-orange-500/[0.08] to-rose-500/[0.06] border-orange-500/30 hover:border-orange-500/60 hover:text-orange-200"
                  : "bg-[var(--color-surface-2)] border-[var(--color-border)] hover:border-violet-500/40 hover:text-violet-300",
              )}
            >
              <span className="inline-flex items-center gap-1.5">
                {c.aiPowered && <Sparkles className="size-3 text-orange-400" />}
                {c.label}
              </span>
              <Plus className="size-4" />
            </button>
          );
          return (
            <>
              <p className="text-xs text-[var(--color-fg-muted)]">
                Widgets nascosti che puoi rimettere nella dashboard.
              </p>
              {sortedAi.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[10px] uppercase tracking-widest text-orange-300 font-medium inline-flex items-center gap-1.5">
                    <Sparkles className="size-3" />
                    AI Powered
                  </div>
                  {sortedAi.map(renderRow)}
                </div>
              )}
              {sortedStd.length > 0 && (
                <div className="space-y-2">
                  {sortedAi.length > 0 && (
                    <div className="text-[10px] uppercase tracking-widest text-[var(--color-fg-subtle)] font-medium pt-1">
                      Standard
                    </div>
                  )}
                  {sortedStd.map(renderRow)}
                </div>
              )}
            </>
          );
        })()}

        <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-4 text-center">
          <p className="text-xs text-[var(--color-fg-muted)]">
            ✨ Nuovi widget personalizzati in arrivo
          </p>
          <p className="text-[11px] text-[var(--color-fg-subtle)] mt-1">
            Li progettiamo insieme — dimmi cosa vuoi vedere in dashboard.
          </p>
        </div>
      </div>
    </div>
  );
}

function DroppableContainer({
  id,
  className,
  isDragging,
  children,
}: {
  id: string;
  className?: string;
  isDragging?: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        className,
        "rounded-lg transition-all",
        // Durante un drag aggiungi un'area di drop visibile in fondo a tutte
        // le colonne (così anche colonne piene hanno una zona "vuota" dove
        // puoi droppare senza atterrare su una card esistente)
        isDragging && "pb-16",
        // Tutte le colonne come drop target validi (dashed + bg leggero)
        isDragging &&
          !isOver &&
          "outline-2 outline-dashed outline-violet-500/50 outline-offset-2 bg-violet-500/[0.03]",
        // La colonna effettivamente hovered: solid + bg più forte
        isOver &&
          "outline-2 outline-violet-500 outline-offset-2 bg-violet-500/[0.10]",
      )}
    >
      {children}
    </div>
  );
}

function ColsButton({
  current,
  value,
  onClick,
  icon,
  label,
}: {
  current: Cols;
  value: Cols;
  onClick: (v: Cols) => void;
  icon: React.ReactNode;
  label: string;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      title={label}
      className={cn(
        "size-7 inline-flex items-center justify-center rounded-md border transition-colors",
        active
          ? "bg-violet-500/15 border-violet-500/40 text-violet-300"
          : "bg-[var(--color-surface-2)] border-[var(--color-border)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]",
      )}
    >
      {icon}
    </button>
  );
}

function SortableCard({
  id,
  children,
  span,
  allowedSpans,
  removable,
  onHide,
  onSpan,
}: {
  id: string;
  children: React.ReactNode;
  span: number;
  allowedSpans: number[];
  removable: boolean;
  onHide: () => void;
  onSpan: (s: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const style: React.CSSProperties = {
    gridColumn: `span ${span}`,
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("relative group", isDragging && "z-10 opacity-80 shadow-2xl")}
    >
      <div className="absolute bottom-full right-3 mb-1 z-10 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-md shadow-md px-1 py-0.5">
        {allowedSpans.length > 1 && (
          <>
            <span className="text-[10px] text-[var(--color-fg-subtle)] px-1">cols</span>
            {allowedSpans.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onSpan(s)}
                title={`Larghezza ${s} ${s === 1 ? "colonna" : "colonne"}`}
                className={cn(
                  "size-6 inline-flex items-center justify-center rounded text-[11px] font-medium tabular-nums transition-colors",
                  span === s
                    ? "bg-violet-500/15 text-violet-300"
                    : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-surface-2)]",
                )}
              >
                {s}
              </button>
            ))}
            <span className="w-px h-4 bg-[var(--color-border)] mx-1" />
          </>
        )}
        {removable && (
          <button
            type="button"
            onClick={onHide}
            title="Nascondi box"
            className="size-6 inline-flex items-center justify-center rounded text-[var(--color-fg-muted)] hover:text-rose-400 hover:bg-rose-500/10"
          >
            <X className="size-3.5" />
          </button>
        )}
        <button
          type="button"
          {...attributes}
          {...listeners}
          title="Trascina"
          className="size-6 inline-flex items-center justify-center rounded text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-surface-2)] cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="size-3.5" />
        </button>
      </div>
      {children}
    </div>
  );
}
