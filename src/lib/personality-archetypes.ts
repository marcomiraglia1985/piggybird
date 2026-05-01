/**
 * Money Archetypes per il Personality Test di Piggybird.
 *
 * Sistema basato su 4 assi finanziari (modellati su literature behavioral
 * finance: Klontz Money Scripts, Statman Financial Personality, Furnham's
 * MAS, ma rivisti per l'uso AI personalization):
 *
 *   1. RISK orientation:  averse (1) ←→ seeking (10)
 *   2. TIME horizon:      present-focused (1) ←→ future-focused (10)
 *   3. VALUE driver:      functional (1) ←→ experiential/status (10)
 *   4. SOCIAL orientation: individualist (1) ←→ collectivist (10)
 *
 * Ogni archetype occupa una zona caratteristica nello spazio 4D. Il scoring
 * algorithm calcola le 4 coordinate dalle risposte e trova l'archetype più
 * vicino (euclidean distance).
 *
 * Lo `iconPath` è placeholder — Marco fornirà icone custom per ogni archetype.
 */

export type Axes = {
  /** 1 (risk averse) ←→ 10 (risk seeking) */
  risk: number;
  /** 1 (present) ←→ 10 (future) */
  time: number;
  /** 1 (functional) ←→ 10 (experiential/status) */
  value: number;
  /** 1 (individualist) ←→ 10 (collectivist) */
  social: number;
};

export type MoneyArchetype = {
  id: string;
  name: string;
  /** Emoji placeholder finché Marco non fornisce icone custom (PNG da
   *  /public/personality/<id>.png — il path è già pronto). */
  emoji: string;
  iconPath: string;
  /** Tagline 1 frase, prima persona (es. "I soldi sono libertà.") */
  tagline: string;
  /** Descrizione 2-3 frasi, second persona ("Sei una persona che...") */
  description: string;
  /** Posizione caratteristica nello spazio 4D delle assi */
  centroid: Axes;
  /** Tag colorimetrici per UI badge (Tailwind colors family) */
  color: "violet" | "emerald" | "amber" | "rose" | "sky" | "indigo" | "teal" | "fuchsia";
};

export const ARCHETYPES: MoneyArchetype[] = [
  {
    id: "vault-keeper",
    name: "The Vault Keeper",
    emoji: "🔒",
    iconPath: "/personality/vault-keeper.png",
    tagline: "I soldi sono sicurezza.",
    description:
      "Eviti il rischio per principio, non per paura. Hai un fondo di emergenza pieno e dormi tranquillo. La crescita lenta ma certa vale più di un guadagno potenziale.",
    centroid: { risk: 2, time: 7, value: 2, social: 4 },
    color: "indigo",
  },
  {
    id: "wealth-architect",
    name: "The Wealth Architect",
    emoji: "🏗️",
    iconPath: "/personality/wealth-architect.png",
    tagline: "Sto costruendo qualcosa che dura.",
    description:
      "Pianifichi a 10+ anni con disciplina. Diversifichi, ribilanci, investi automaticamente. Il patrimonio è un progetto a lungo termine, non un evento.",
    centroid: { risk: 6, time: 9, value: 4, social: 3 },
    color: "violet",
  },
  {
    id: "free-spirit",
    name: "The Free Spirit",
    emoji: "🦋",
    iconPath: "/personality/free-spirit.png",
    tagline: "I soldi servono per vivere, non per accumulare.",
    description:
      "Vivi nel presente. Fai i conti a fine mese senza ansia, ma senza piano. Quello che hai, hai. Il futuro si vede strada facendo.",
    centroid: { risk: 5, time: 2, value: 7, social: 6 },
    color: "amber",
  },
  {
    id: "experiential-optimist",
    name: "The Experiential Optimist",
    emoji: "☀️",
    iconPath: "/personality/experiential-optimist.png",
    tagline: "I ricordi non si comprano dopo.",
    description:
      "Spendi volentieri per viaggi, cene, esperienze condivise. Tagli sul materiale ma non sull'esperienza. Risparmi quanto basta, vivi tutto il resto.",
    centroid: { risk: 4, time: 3, value: 9, social: 8 },
    color: "rose",
  },
  {
    id: "generous-provider",
    name: "The Generous Provider",
    emoji: "🤝",
    iconPath: "/personality/generous-provider.png",
    tagline: "I miei soldi sono per chi amo.",
    description:
      "Pensi prima alla famiglia, agli amici, ai vicini di scrivania. Risparmi per dare. Il senso del denaro è la possibilità di sostenere chi ti circonda.",
    centroid: { risk: 3, time: 6, value: 5, social: 10 },
    color: "emerald",
  },
  {
    id: "status-curator",
    name: "The Status Curator",
    emoji: "👑",
    iconPath: "/personality/status-curator.png",
    tagline: "Quello che possiedo dice chi sono.",
    description:
      "Investi nella qualità che si vede e si tocca: vestiti, casa, auto, brand. Non per vanità, ma perché credi che le cose belle migliorino la vita quotidiana.",
    centroid: { risk: 5, time: 4, value: 10, social: 7 },
    color: "fuchsia",
  },
  {
    id: "cautious-steward",
    name: "The Cautious Steward",
    emoji: "🛡️",
    iconPath: "/personality/cautious-steward.png",
    tagline: "Non rischio quello che ho già costruito.",
    description:
      "Hai accumulato, ora proteggi. Pensi a eredità, lascito, continuità. Eviti debito e leva. La conservazione vale più della crescita aggressiva.",
    centroid: { risk: 1, time: 9, value: 3, social: 7 },
    color: "teal",
  },
  {
    id: "bold-investor",
    name: "The Bold Investor",
    emoji: "🚀",
    iconPath: "/personality/bold-investor.png",
    tagline: "Senza rischio non c'è ritorno vero.",
    description:
      "Concentri su asset growth (stock individuali, crypto, startup). Tolleri grandi swing. Lo studio ti accompagna ma la decisione è tua. Lungo termine = vincita.",
    centroid: { risk: 10, time: 8, value: 5, social: 2 },
    color: "rose",
  },
  {
    id: "mindful-minimalist",
    name: "The Mindful Minimalist",
    emoji: "🌿",
    iconPath: "/personality/mindful-minimalist.png",
    tagline: "Meno cose, più libertà.",
    description:
      "Compri poco e durevole. Ogni acquisto è una scelta, mai un riflesso. Risparmi naturalmente perché non desideri il superfluo. Tempo > denaro > oggetti.",
    centroid: { risk: 4, time: 7, value: 1, social: 4 },
    color: "emerald",
  },
  {
    id: "fire-seeker",
    name: "The FIRE Seeker",
    emoji: "🏝️",
    iconPath: "/personality/fire-seeker.png",
    tagline: "Voglio uscire dal lavoro più presto possibile.",
    description:
      "Ottimizzi savings rate al massimo. Calcoli quando potrai vivere di rendita. Ogni euro non speso è tempo guadagnato. Strategia: risparmio aggressivo + index investing.",
    centroid: { risk: 6, time: 10, value: 3, social: 3 },
    color: "sky",
  },
  {
    id: "social-currency",
    name: "The Social Currency",
    emoji: "🌐",
    iconPath: "/personality/social-currency.png",
    tagline: "Mi muovo con la mia tribù.",
    description:
      "Le decisioni finanziarie passano dal gruppo: amici, community, social. Trend-aware, FOMO-aware. Quando il gruppo si muove, ti muovi anche tu.",
    centroid: { risk: 7, time: 4, value: 7, social: 9 },
    color: "fuchsia",
  },
  {
    id: "visionary-founder",
    name: "The Visionary Founder",
    emoji: "💡",
    iconPath: "/personality/visionary-founder.png",
    tagline: "I soldi sono semi che si piantano.",
    description:
      "Vedi il denaro come capitale per costruire idee. Re-invest sul tuo business, non in asset passivi. Tolleri liquidity drag perché punti a equity value.",
    centroid: { risk: 9, time: 9, value: 6, social: 4 },
    color: "violet",
  },
];

/**
 * Trova l'archetype più vicino alle 4 coordinate utente (euclidean distance
 * nello spazio 4D, normalizzata per range 1-10).
 */
export function findArchetype(axes: Axes): MoneyArchetype {
  let best = ARCHETYPES[0];
  let bestDist = Infinity;
  for (const a of ARCHETYPES) {
    const dr = a.centroid.risk - axes.risk;
    const dt = a.centroid.time - axes.time;
    const dv = a.centroid.value - axes.value;
    const ds = a.centroid.social - axes.social;
    const dist = Math.sqrt(dr * dr + dt * dt + dv * dv + ds * ds);
    if (dist < bestDist) {
      bestDist = dist;
      best = a;
    }
  }
  return best;
}

/** Ritorna i top-N archetype più vicini (per "anche tu sei un po'…" UI). */
export function rankArchetypes(axes: Axes, n = 3): MoneyArchetype[] {
  return [...ARCHETYPES]
    .map((a) => {
      const dr = a.centroid.risk - axes.risk;
      const dt = a.centroid.time - axes.time;
      const dv = a.centroid.value - axes.value;
      const ds = a.centroid.social - axes.social;
      return { a, dist: Math.sqrt(dr * dr + dt * dt + dv * dv + ds * ds) };
    })
    .sort((x, y) => x.dist - y.dist)
    .slice(0, n)
    .map((x) => x.a);
}
