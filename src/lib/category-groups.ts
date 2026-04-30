"use client";

import { useEffect, useMemo, useState } from "react";

export type GroupableCat = {
  id: string;
  emoji: string;
  name: string;
  group: string;
  estateId?: string | null;
  displayOrder?: number;
  active?: boolean;
};

export type GroupableEstate = { id: string; name: string; emoji: string | null };

export type CategoryGroup = {
  /** Chiave univoca: "uncategorized", "estate:<id>" o nome del group */
  key: string;
  /** Etichetta da mostrare (con emoji per estates) */
  label: string;
  cats: GroupableCat[];
  /** Quando true, è un macro-header (separatore in cima, no items, non
   *  selezionabile). Es. "ESTATES" prima dei singoli immobili. */
  isMacroHeader?: boolean;
  /** Quando true, è un macro-footer (chiude visivamente una sezione macro
   *  con un divider, no label, no items). */
  isMacroFooter?: boolean;
};

const GROUP_LABELS: Record<string, string> = {
  uncategorized: "🆕 Da categorizzare",
  income: "Entrate",
  transfer: "Trasferimenti",
  investments: "Investimenti",
  paris: "Parigi (legacy)",
  casa: "Casa",
  utenze: "Utenze",
  banca: "Banca & Tasse",
  food: "Cibo & Bar",
  lifestyle: "Lifestyle",
  transport: "Trasporti",
  altri: "Altri",
};

/**
 * Hook che raggruppa le categorie nello stesso ordine usato in /categorie:
 * - "Da categorizzare" prima
 * - Poi ESTATES (sub-ordinate via localStorage estate-order)
 * - Poi macro-aree standard (ordinate via localStorage macro-order)
 *
 * Le tx all'interno di ogni gruppo sono ordinate per displayOrder asc.
 */
export function useCategoryGroups<T extends GroupableCat>(
  categories: T[],
  estates: GroupableEstate[] | undefined,
): CategoryGroup[] {
  const [macroOrder, setMacroOrder] = useState<string[]>([]);
  const [estateOrder, setEstateOrder] = useState<string[]>([]);

  useEffect(() => {
    try {
      const m = localStorage.getItem("fp-categories-macro-order");
      if (m) {
        const arr = JSON.parse(m) as string[];
        if (Array.isArray(arr)) setMacroOrder(arr);
      }
      const e = localStorage.getItem("fp-categories-estate-order");
      if (e) {
        const arr = JSON.parse(e) as string[];
        if (Array.isArray(arr)) setEstateOrder(arr);
      }
    } catch {}
  }, []);

  return useMemo(() => {
    const ests = estates ?? [];
    const estateById = new Map(ests.map((e) => [e.id, e]));

    // Bucketize cats by section key. Le archiviate (active=false) vanno in
    // un bucket separato "obsolete" che renderemo in fondo.
    const buckets = new Map<string, T[]>();
    const obsolete: T[] = [];
    for (const c of categories) {
      if (c.active === false) {
        obsolete.push(c);
        continue;
      }
      const key = c.estateId ? `estate:${c.estateId}` : c.group;
      const arr = buckets.get(key) ?? [];
      arr.push(c);
      buckets.set(key, arr);
    }
    // Ordina ogni bucket per displayOrder
    for (const arr of buckets.values()) {
      arr.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
    }

    const result: CategoryGroup[] = [];

    // 1. Uncategorized in cima sempre se ha cat
    if (buckets.has("uncategorized")) {
      result.push({
        key: "uncategorized",
        label: GROUP_LABELS.uncategorized,
        cats: buckets.get("uncategorized")!,
      });
    }

    // 2. Macro top-level: combina "estates" (espande in sub-section per
    // immobile) con i gruppi standard. Rispetta l'ordine macroOrder se
    // presente, altrimenti il default.
    const estateBucketKeys = [...buckets.keys()].filter((k) => k.startsWith("estate:"));
    const standardBucketKeys = [...buckets.keys()].filter(
      (k) => !k.startsWith("estate:") && k !== "uncategorized",
    );

    const REGULAR_ORDER = [
      "income",
      "transfer",
      "investments",
      "casa",
      "utenze",
      "banca",
      "food",
      "lifestyle",
      "transport",
      "altri",
      "paris",
    ];

    // Costruisci l'ordine top-level (macroOrder se presente, altrimenti
    // default: estates + REGULAR_ORDER). "estates" è un singolo entry che
    // poi viene espanso nelle sotto-sezioni per immobile.
    const topLevelKeys: string[] = [];
    const seen = new Set<string>();
    if (macroOrder.length > 0) {
      for (const k of macroOrder) {
        if (k === "estates" && estateBucketKeys.length > 0) {
          topLevelKeys.push("estates");
          seen.add("estates");
        } else if (standardBucketKeys.includes(k)) {
          topLevelKeys.push(k);
          seen.add(k);
        }
      }
    }
    // Append eventuali mancanti: estates se non già + standard mancanti in
    // REGULAR_ORDER + altri custom.
    if (!seen.has("estates") && estateBucketKeys.length > 0) {
      topLevelKeys.push("estates");
      seen.add("estates");
    }
    for (const k of REGULAR_ORDER) {
      if (standardBucketKeys.includes(k) && !seen.has(k)) {
        topLevelKeys.push(k);
        seen.add(k);
      }
    }
    for (const k of standardBucketKeys) {
      if (!seen.has(k)) topLevelKeys.push(k);
    }

    // Ordine sub-estate (estateOrder)
    const orderedEstateKeys: string[] = [];
    const seenEstates = new Set<string>();
    for (const k of estateOrder) {
      if (estateBucketKeys.includes(k)) {
        orderedEstateKeys.push(k);
        seenEstates.add(k);
      }
    }
    for (const k of estateBucketKeys) {
      if (!seenEstates.has(k)) orderedEstateKeys.push(k);
    }

    // Renderizza i gruppi nell'ordine top-level. La macro "estates" diventa:
    // 1. Un header "🏢 ESTATES" (isMacroHeader: separatore, non selezionabile)
    // 2. Sub-section per ogni immobile, etichettata col solo nome del building
    for (const tk of topLevelKeys) {
      if (tk === "estates") {
        if (orderedEstateKeys.length > 0) {
          result.push({
            key: "estates-header",
            label: "🏢 ESTATES",
            cats: [],
            isMacroHeader: true,
          });
          for (const ek of orderedEstateKeys) {
            const id = ek.slice("estate:".length);
            const e = estateById.get(id);
            const label = e ? `${e.emoji ?? "🏢"} ${e.name}` : "🏢 Estate";
            result.push({ key: ek, label, cats: buckets.get(ek)! });
          }
          result.push({
            key: "estates-footer",
            label: "",
            cats: [],
            isMacroFooter: true,
          });
        }
      } else {
        result.push({
          key: tk,
          label: GROUP_LABELS[tk] ?? tk,
          cats: buckets.get(tk)!,
        });
      }
    }

    // 4. Obsolete (archiviate) IN FONDO sempre se presenti
    if (obsolete.length > 0) {
      obsolete.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
      result.push({
        key: "obsolete",
        label: "🗄️ Obsolete (archiviate)",
        cats: obsolete,
      });
    }

    return result;
  }, [categories, estates, macroOrder, estateOrder]);
}
