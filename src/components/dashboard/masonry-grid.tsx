"use client";

import {
  type CSSProperties,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/**
 * True masonry layout (Pinterest-style): ogni card "sale" a riempire lo
 * spazio vuoto sopra di lei.
 *
 * Algoritmo a due fasi (per altezze accurate):
 *   Phase 1 (initial paint): items renderizzati in CSS grid normale →
 *     altezza accurata, layout corretto in attesa del calcolo masonry
 *   Phase 2 (useLayoutEffect): misura altezze, calcola posizioni, switch
 *     a position absolute. SYNC prima del paint → niente flash visivo.
 *
 * Re-layout automatico via ResizeObserver (window resize + content height
 * changes via async data, expand/collapse, ecc.).
 *
 * Supporta wrapper custom per item via prop `wrapItem` (es. edit mode con
 * DnD: il wrapper attacca useSortable handlers + transform su top dello
 * style absolute calcolato).
 */

export type MasonryItem = {
  id: string;
  span: number;
  node: React.ReactNode;
};

type Position = { top: number; left: number; width: number };

export type MasonryWrapItemArgs = {
  item: MasonryItem;
  baseStyle: CSSProperties;
  /** Da chiamare nel ref dell'elemento outer per misurazione altezza masonry. */
  setRef: (el: HTMLElement | null) => void;
};

export function MasonryGrid({
  items,
  cols,
  gap = 24,
  wrapItem,
}: {
  items: MasonryItem[];
  cols: number;
  gap?: number;
  wrapItem?: (args: MasonryWrapItemArgs) => React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [layout, setLayout] = useState<Map<string, Position>>(new Map());
  const [containerHeight, setContainerHeight] = useState<number | null>(null);
  const layoutReady = layout.size === items.length && items.length > 0;

  function recompute() {
    const container = containerRef.current;
    if (!container || cols <= 0) return;
    const W = container.clientWidth;
    if (W <= 0) return;
    const colWidth = (W - gap * (cols - 1)) / cols;
    const colHeights = new Array(cols).fill(0);
    const newLayout = new Map<string, Position>();

    for (const item of items) {
      const span = Math.max(1, Math.min(item.span, cols));
      // Per ogni starting col possibile, calcola la cima richiesta (max
      // colonne occupate dallo span). Vince la più bassa. Tie-break: minor
      // bestCol (più a sinistra).
      let bestCol = 0;
      let bestTop = Infinity;
      for (let c = 0; c <= cols - span; c++) {
        const top = Math.max(...colHeights.slice(c, c + span));
        if (top < bestTop) {
          bestTop = top;
          bestCol = c;
        }
      }
      if (bestTop === Infinity) bestTop = 0;
      const left = bestCol * (colWidth + gap);
      const width = span * colWidth + (span - 1) * gap;
      newLayout.set(item.id, { top: bestTop, left, width });

      // Aggiorna colHeights per le N colonne occupate (= stessa altezza)
      const el = itemRefs.current.get(item.id);
      const itemH = el?.offsetHeight ?? 0;
      const newH = bestTop + itemH + gap;
      for (let c = bestCol; c < bestCol + span; c++) {
        colHeights[c] = newH;
      }
    }
    setLayout(newLayout);
    setContainerHeight(Math.max(0, Math.max(...colHeights) - gap));
  }

  // Phase 2 — sync prima del paint: misura + calcola layout
  useLayoutEffect(() => {
    recompute();
    // Anche al frame dopo per beccare re-layout post async data load
    const id = requestAnimationFrame(recompute);
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, cols, gap]);

  // ResizeObserver: container resize O content height changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => recompute());
    ro.observe(container);
    for (const el of itemRefs.current.values()) ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, cols, gap]);

  return (
    <div
      ref={containerRef}
      className={layoutReady ? "relative w-full" : "w-full"}
      style={{
        // In phase 1 (no layout) usa CSS grid normale così items hanno
        // larghezza corretta (per measure altezza). In phase 2 height
        // explicit dal calcolo masonry.
        ...(layoutReady
          ? { height: containerHeight ?? undefined }
          : {
              display: "grid",
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gap,
              alignItems: "start",
            }),
      }}
    >
      {items.map((item) => {
        const pos = layout.get(item.id);
        const span = Math.max(1, Math.min(item.span, cols));
        const baseStyle: CSSProperties =
          layoutReady && pos
            ? {
                position: "absolute",
                top: pos.top,
                left: pos.left,
                width: pos.width,
                transition: "top 0.25s ease, left 0.25s ease, width 0.25s ease",
              }
            : {
                // Phase 1: posizione naturale nella grid, span colonne
                gridColumn: `span ${span}`,
              };
        const setRef = (el: HTMLElement | null) => {
          if (el) itemRefs.current.set(item.id, el as HTMLDivElement);
          else itemRefs.current.delete(item.id);
        };
        if (wrapItem) {
          return (
            <span key={item.id} style={{ display: "contents" }}>
              {wrapItem({ item, baseStyle, setRef })}
            </span>
          );
        }
        return (
          <div key={item.id} ref={setRef} style={baseStyle}>
            {item.node}
          </div>
        );
      })}
    </div>
  );
}
