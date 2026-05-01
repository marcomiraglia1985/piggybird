"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * True masonry layout (Pinterest-style): ogni card "sale" a riempire lo
 * spazio vuoto sopra di lei. CSS grid auto-flow:dense riempie solo gap
 * orizzontali nella stessa riga; per il flow verticale serve JS.
 *
 * Algoritmo:
 *   1. Misura larghezza container + altezza di ogni card (ResizeObserver)
 *   2. Per ogni card calcola la posizione: trova la combinazione di colonne
 *      consecutive (in base allo span) con la cima più bassa
 *   3. Posiziona la card con position:absolute (top, left, width)
 *   4. Container height = max(colHeights)
 *
 * Re-layout automatico: quando container cambia size, contenuto card cambia,
 * o lista items cambia.
 */

export type MasonryItem = {
  id: string;
  span: number;
  node: React.ReactNode;
};

type Position = { top: number; left: number; width: number };

export function MasonryGrid({
  items,
  cols,
  gap = 24,
}: {
  items: MasonryItem[];
  cols: number;
  gap?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [layout, setLayout] = useState<Map<string, Position>>(new Map());
  const [containerHeight, setContainerHeight] = useState(0);

  function recompute() {
    const container = containerRef.current;
    if (!container || cols <= 0) return;
    const W = container.offsetWidth;
    if (W <= 0) return;
    const colWidth = (W - gap * (cols - 1)) / cols;
    const colHeights = new Array(cols).fill(0);
    const newLayout = new Map<string, Position>();

    for (const item of items) {
      const span = Math.max(1, Math.min(item.span, cols));
      // Trova la posizione ottimale: per ogni possibile starting col,
      // calcola la cima richiesta (max delle colonne span). Vince la più bassa.
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

      // Aggiorna colHeights per le colonne occupate
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

  // Initial layout + ricomputazione quando items cambia
  useLayoutEffect(() => {
    recompute();
    // Ricompute al frame dopo per beccare layout post-paint (font rendering, ecc.)
    const id = requestAnimationFrame(recompute);
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, cols, gap]);

  // ResizeObserver: ricomputa quando container cambia size O quando il
  // contenuto di qualche card cambia altezza (es. async data, expand/collapse).
  useEffect(() => {
    const ro = new ResizeObserver(() => recompute());
    if (containerRef.current) ro.observe(containerRef.current);
    for (const el of itemRefs.current.values()) ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, cols, gap]);

  return (
    <div
      ref={containerRef}
      className="relative w-full"
      style={{ height: containerHeight }}
    >
      {items.map((item) => {
        const pos = layout.get(item.id);
        return (
          <div
            key={item.id}
            ref={(el) => {
              if (el) itemRefs.current.set(item.id, el);
              else itemRefs.current.delete(item.id);
            }}
            style={
              pos
                ? {
                    position: "absolute",
                    top: pos.top,
                    left: pos.left,
                    width: pos.width,
                    transition: "top 0.2s ease, left 0.2s ease, width 0.2s ease",
                  }
                : { position: "absolute", visibility: "hidden" }
            }
          >
            {item.node}
          </div>
        );
      })}
    </div>
  );
}
