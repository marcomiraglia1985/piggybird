import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fingerprintBeneficiary } from "@/lib/beneficiary-fingerprint";

export const runtime = "nodejs";

/**
 * Trova cluster di varianti dello stesso beneficiario.
 *
 * Algoritmo v2 — head-based clustering (NO transitivity):
 *  1. Fingerprint aggressivo (date inline, numeri lunghi, punteggiatura).
 *     Stesso fingerprint → stesso cluster.
 *  2. Token-set match testato SOLO contro cluster "head" esistenti, non
 *     transitivo — evita catene tipo "A~B, B~C ⇒ A nel cluster di C" che
 *     producono mega-cluster (Esselunga + Amazon + Carrefour insieme).
 *
 *  Criteri di merge (devono essere SODDISFATTI ENTRAMBI):
 *    a) almeno 1 token "forte" (len ≥5, non stopword) condiviso
 *    b) subset: tutti i token forti del piu' piccolo sono nel piu' grande
 *       (es. "Conad" ⊂ "Supermercato Conad")
 *       OPPURE Jaccard ≥ 0.6 sui token significativi
 *
 *  AI semantica (es. "Pokémon" vs "Yinli Zeng" stesso negozio) NON gestita —
 *  feature futura ✨ Moneybird.
 */

/** Token deboli: parole procedurali bancarie, suffissi societari, articoli,
 *  città comuni. Non contano nel matching. */
const STOPWORDS = new Set([
  // Suffissi societari
  "srl", "srls", "spa", "sas", "snc", "sapa", "gmbh", "ltd", "inc", "corp",
  "llc", "kg", "ag", "bv", "nv", "sarl",
  // Procedurali bancarie
  "prelevt", "prelievo", "prelevamento", "carta", "carte", "pagamento",
  "pagam", "bonifico", "bonif", "addebito", "addebit", "accredito", "accred",
  "sepa", "pos", "atm", "online", "operazione", "operaz", "transazione",
  "spese", "commiss", "commissioni", "ricarica", "stipendio", "rimborso",
  "deposito", "conto", "corrente", "imposta", "bollo", "interessi", "netti",
  // Generiche localizzazione e città comuni (rumore frequente)
  "via", "viale", "piazza", "corso",
  "milano", "roma", "torino", "napoli", "italia", "italy", "italian",
  "parigi", "paris", "london", "berlin", "tirana", "albania",
  "store", "shop", "market",
  // Articoli/preposizioni IT/FR/EN
  "the", "and", "for", "del", "della", "dei", "degli", "delle",
  "dal", "dalla", "dai", "dagli", "dalle",
  "con", "per", "che", "tra", "fra", "des", "les", "une",
]);

/** Token significativi di un fingerprint: ≥3 char, non stopword, non puro num. */
function tokenize(fp: string): Set<string> {
  return new Set(
    fp
      .split(" ")
      .map((t) => t.trim())
      .filter((t) => t.length >= 3)
      .filter((t) => !STOPWORDS.has(t))
      .filter((t) => !/^\d+$/.test(t)),
  );
}

/** Vero se due token-set sono "abbastanza simili" da unire i cluster.
 *  Richiede sempre almeno 1 token forte (len ≥5) condiviso. */
function shouldMerge(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || b.size === 0) return false;
  const inter: string[] = [];
  for (const t of a) if (b.has(t)) inter.push(t);
  if (inter.length === 0) return false;
  if (!inter.some((t) => t.length >= 5)) return false;
  // Subset: il piu' piccolo è completamente contenuto nel piu' grande
  const small = a.size <= b.size ? a : b;
  const big = a.size <= b.size ? b : a;
  let allIn = true;
  for (const t of small) {
    if (!big.has(t)) {
      allIn = false;
      break;
    }
  }
  if (allIn) return true;
  // Jaccard
  const union = new Set([...a, ...b]).size;
  return inter.length / union >= 0.6;
}

export async function GET() {
  // Conteggio aggregato per beneficiary + sign (in/out). Permette al client
  // di mostrare ↑ entrata / ↓ uscita / ⇅ misto per ogni variante.
  const [grouped, posBy, negBy] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["beneficiary"],
      where: { beneficiary: { not: null } },
      _count: { _all: true },
    }),
    prisma.transaction.groupBy({
      by: ["beneficiary"],
      where: { beneficiary: { not: null }, amount: { gt: 0 } },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.transaction.groupBy({
      by: ["beneficiary"],
      where: { beneficiary: { not: null }, amount: { lt: 0 } },
      _count: { _all: true },
      _sum: { amount: true },
    }),
  ]);

  const posMap = new Map<string, { count: number; sum: number }>();
  for (const r of posBy) {
    const k = r.beneficiary?.trim();
    if (!k) continue;
    posMap.set(k, { count: r._count._all, sum: r._sum.amount ?? 0 });
  }
  const negMap = new Map<string, { count: number; sum: number }>();
  for (const r of negBy) {
    const k = r.beneficiary?.trim();
    if (!k) continue;
    negMap.set(k, { count: r._count._all, sum: r._sum.amount ?? 0 });
  }

  type Variant = {
    name: string;
    count: number;
    countIn: number;
    countOut: number;
    sumIn: number;
    sumOut: number;
  };
  const fpMap = new Map<string, Variant[]>();
  const fpTokens = new Map<string, Set<string>>();
  const fpTotal = new Map<string, number>();

  for (const row of grouped) {
    const name = row.beneficiary?.trim();
    if (!name) continue;
    const fp = fingerprintBeneficiary(name);
    if (!fp) continue;
    const p = posMap.get(name) ?? { count: 0, sum: 0 };
    const n = negMap.get(name) ?? { count: 0, sum: 0 };
    const arr = fpMap.get(fp) ?? [];
    arr.push({
      name,
      count: row._count._all,
      countIn: p.count,
      countOut: n.count,
      sumIn: p.sum,
      sumOut: n.sum,
    });
    fpMap.set(fp, arr);
    fpTotal.set(fp, (fpTotal.get(fp) ?? 0) + row._count._all);
    if (!fpTokens.has(fp)) fpTokens.set(fp, tokenize(fp));
  }

  // Ordina fingerprint per popolarità desc — i piu' frequenti diventano "head"
  // di cluster e attirano i piu' rari (Esselunga grande, "Esselunga via X" piccolo).
  const fpEntries = Array.from(fpMap.keys())
    .map((fp) => ({
      fp,
      total: fpTotal.get(fp)!,
      tokens: fpTokens.get(fp)!,
    }))
    .sort((a, b) => b.total - a.total);

  // Heads: cluster representatives. Ogni nuovo fingerprint cerca il miglior
  // head esistente; se nessuno matcha, diventa un nuovo head. NIENTE
  // transitivity: un head non può recruitare altri head dopo essere stato
  // recruitato.
  const heads: { fp: string; tokens: Set<string> }[] = [];
  const fpToHead = new Map<string, string>();

  for (const e of fpEntries) {
    let bestHead: { fp: string; tokens: Set<string> } | null = null;
    let bestShared = 0;
    for (const h of heads) {
      if (!shouldMerge(e.tokens, h.tokens)) continue;
      let shared = 0;
      for (const t of e.tokens) if (h.tokens.has(t)) shared++;
      if (shared > bestShared) {
        bestShared = shared;
        bestHead = h;
      }
    }
    if (bestHead) {
      fpToHead.set(e.fp, bestHead.fp);
    } else {
      fpToHead.set(e.fp, e.fp);
      heads.push({ fp: e.fp, tokens: e.tokens });
    }
  }

  // Group variants by head
  const byHead = new Map<string, Variant[]>();
  for (const [fp, vs] of fpMap.entries()) {
    const head = fpToHead.get(fp) ?? fp;
    const arr = byHead.get(head) ?? [];
    arr.push(...vs);
    byHead.set(head, arr);
  }

  const clusters = Array.from(byHead.entries())
    .map(([headFp, vs]) => {
      const sorted = [...vs].sort((a, b) => {
        if (a.count !== b.count) return b.count - a.count;
        if (a.name.length !== b.name.length) return b.name.length - a.name.length;
        return a.name.localeCompare(b.name);
      });
      return {
        key: headFp,
        variants: sorted,
        totalTx: vs.reduce((s, v) => s + v.count, 0),
        suggestedCanonical: sorted[0].name,
      };
    })
    .filter((c) => c.variants.length > 1)
    .sort((a, b) => b.totalTx - a.totalTx);

  return NextResponse.json({ clusters });
}
