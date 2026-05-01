/**
 * Money Birds — gli archetipi finanziari di Piggybird.
 *
 * Ogni archetipo è una specie di uccello che riflette un profilo psicologico
 * universale (non legato a strumenti finanziari di un paese specifico).
 *
 * Modello a 5 dimensioni — basato su costrutti di personalità cross-culturali
 * (Big Five, Zimbardo Time Perspective, Hofstede individualism, Van Boven &
 * Gilovich materialism vs experientialism). NON usa item proprietari di
 * inventari validati (KMSI-R, Grable-Lytton, MAS) — tutto Piggybird-original
 * per consentire distribuzione commerciale.
 *
 *   1. PLANNING:  flow (1) ←→ structure (10)
 *   2. RISK:      averse (1) ←→ seeking (10)
 *   3. TIME:      present-focused (1) ←→ future-focused (10)
 *   4. VALUE:     functional (1) ←→ experiential/status (10)
 *   5. SOCIAL:    individualist (1) ←→ collectivist (10)
 *
 * Centroidi degli archetipi: posizionati a mano sulla base della descrizione
 * archetipica del personaggio (NON calibrati su mean scores statistici di un
 * singolo paese). Lo scoring trova l'archetipo più vicino nello spazio 5D.
 *
 * Calibrazione v3: in v2 lo Sparrow era il centroide più vicino al punto
 * neutro (5.5,5.5,5.5,5.5,5.5) → distance 3.64 vs 4.15+ degli altri. Risultato
 * pratico: utenti con risposte moderate convergevano su Sparrow per default.
 * In v3 i centroidi sono stati spinti più verso i poli (target: distanza dal
 * neutro ≥ 5.7 per ogni archetipo) per evitare il "neutral magnet effect".
 *
 * Lo `iconPath` è placeholder — le icone custom (illustrazioni degli uccelli)
 * vanno in /public/personality/<id>.png.
 */

export type Axes = {
  /** 1 (flow / spontaneo) ←→ 10 (structure / metodico) */
  planning: number;
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
  /** Specie di uccello — appare nel UI insieme al nome ("The Owl") */
  bird: string;
  /** Emoji placeholder finché non sono disponibili icone custom (PNG da
   *  /public/personality/<id>.png — il path è già pronto). */
  emoji: string;
  iconPath: string;
  /** Tagline 1 frase, prima persona */
  tagline: string;
  /** Descrizione 2-3 frasi che lega la metafora dell'uccello al profilo */
  description: string;
  /** Posizione caratteristica nello spazio 5D delle assi */
  centroid: Axes;
  /** Tag colorimetrici per UI badge (Tailwind colors family) */
  color: "violet" | "emerald" | "amber" | "rose" | "sky" | "indigo" | "teal" | "fuchsia";
};

export const ARCHETYPES: MoneyArchetype[] = [
  {
    id: "owl",
    name: "The Owl",
    bird: "Gufo",
    emoji: "🦉",
    iconPath: "/personality/owl.png",
    tagline: "Veglio, calcolo, custodisco.",
    description:
      "Come il gufo che osserva nel silenzio prima di muoversi, valuti ogni passo finanziario con attenzione. Eviti il rischio per principio, non per paura: la crescita lenta e sicura vale più di un guadagno ipotetico.",
    centroid: { planning: 8, risk: 2, time: 7, value: 2, social: 4 },
    color: "indigo",
  },
  {
    id: "weaver",
    name: "The Weaver",
    bird: "Uccello tessitore",
    emoji: "🪺",
    iconPath: "/personality/weaver.png",
    tagline: "Sto tessendo qualcosa che dura.",
    description:
      "Come l'uccello tessitore che intreccia il proprio nido nodo dopo nodo, costruisci il tuo patrimonio con disciplina paziente. Pianifichi a lungo termine, ribilanci, automatizzi. Il patrimonio è un progetto, non un evento.",
    centroid: { planning: 9, risk: 6, time: 9, value: 4, social: 3 },
    color: "violet",
  },
  {
    id: "hummingbird",
    name: "The Hummingbird",
    bird: "Colibrì",
    emoji: "🐦",
    iconPath: "/personality/hummingbird.png",
    tagline: "La vita è troppo veloce per non assaporarla ora.",
    description:
      "Come il colibrì che vola di fiore in fiore, vivi nel presente. Fai i conti a fine mese senza ansia ma senza piano. Quello che hai, hai. Il futuro si vede strada facendo.",
    centroid: { planning: 2, risk: 6, time: 2, value: 8, social: 7 },
    color: "amber",
  },
  {
    id: "bird-of-paradise",
    name: "The Bird of Paradise",
    bird: "Uccello del paradiso",
    emoji: "🦜",
    iconPath: "/personality/bird-of-paradise.png",
    tagline: "Le esperienze sono il vero patrimonio.",
    description:
      "Come l'uccello del paradiso che danza in colori sgargianti per ciò che conta, spendi volentieri per viaggi, cene, momenti memorabili. Tagli sull'oggetto materiale, mai sull'esperienza condivisa.",
    centroid: { planning: 3, risk: 4, time: 3, value: 9, social: 8 },
    color: "rose",
  },
  {
    id: "pelican",
    name: "The Pelican",
    bird: "Pellicano",
    emoji: "🐦",
    iconPath: "/personality/pelican.png",
    tagline: "I miei soldi sono per chi amo.",
    description:
      "Come il pellicano che apre il becco per sfamare i piccoli, pensi prima alla famiglia, agli amici, a chi ti circonda. Risparmi per dare. Il senso del denaro è la possibilità di sostenere gli altri.",
    centroid: { planning: 7, risk: 2, time: 6, value: 4, social: 10 },
    color: "emerald",
  },
  {
    id: "peacock",
    name: "The Peacock",
    bird: "Pavone",
    emoji: "🦚",
    iconPath: "/personality/peacock.png",
    tagline: "Ciò che possiedo racconta chi sono.",
    description:
      "Come il pavone che spiega la coda, investi nella qualità che si vede e si tocca: vestiti, casa, design. Non per vanità, ma perché credi che le cose belle migliorino la vita di ogni giorno.",
    centroid: { planning: 5, risk: 6, time: 3, value: 10, social: 8 },
    color: "fuchsia",
  },
  {
    id: "crane",
    name: "The Crane",
    bird: "Gru",
    emoji: "🕊️",
    iconPath: "/personality/crane.png",
    tagline: "Proteggo ciò che ho già costruito.",
    description:
      "Come la gru, simbolo di longevità in molte culture, hai accumulato e ora preservi. Pensi a continuità, eredità, a chi verrà dopo. Eviti debito e leva: la conservazione vale più della crescita aggressiva.",
    centroid: { planning: 8, risk: 2, time: 9, value: 4, social: 7 },
    color: "teal",
  },
  {
    id: "falcon",
    name: "The Falcon",
    bird: "Falco",
    emoji: "🦅",
    iconPath: "/personality/falcon.png",
    tagline: "Senza tuffarsi non si pesca nulla.",
    description:
      "Come il falco che dive a 320 km/h con precisione chirurgica, abbracci il rischio calcolato. Tolleri grandi oscillazioni perché studi, valuti, agisci con convinzione. Lungo termine, alta convinzione.",
    centroid: { planning: 6, risk: 10, time: 8, value: 5, social: 2 },
    color: "rose",
  },
  {
    id: "sparrow",
    name: "The Sparrow",
    bird: "Passero",
    emoji: "🐦",
    iconPath: "/personality/sparrow.png",
    tagline: "Meno cose, più libertà.",
    description:
      "Come il passero che si accontenta di poco e prospera ovunque, compri raramente e durevole. Ogni acquisto è una scelta, mai un riflesso. Risparmi naturalmente perché non desideri il superfluo.",
    centroid: { planning: 8, risk: 3, time: 8, value: 2, social: 3 },
    color: "emerald",
  },
  {
    id: "albatross",
    name: "The Albatross",
    bird: "Albatros",
    emoji: "🐦",
    iconPath: "/personality/albatross.png",
    tagline: "Voglio l'orizzonte aperto.",
    description:
      "Come l'albatros che plana per giorni senza battere le ali, ottimizzi ogni risorsa per un futuro di libertà. Ogni euro non speso è tempo guadagnato. Vuoi uscire dalla gabbia del lavoro obbligato.",
    centroid: { planning: 8, risk: 6, time: 10, value: 3, social: 3 },
    color: "sky",
  },
  {
    id: "starling",
    name: "The Starling",
    bird: "Storno",
    emoji: "🐦",
    iconPath: "/personality/starling.png",
    tagline: "Mi muovo con la mia tribù.",
    description:
      "Come gli storni nelle loro murmurazioni sincronizzate, segui il movimento del gruppo. Le decisioni finanziarie passano dalla tribù: amici, community, social. Quando il branco si muove, tu ti muovi con loro.",
    centroid: { planning: 3, risk: 8, time: 3, value: 8, social: 9 },
    color: "fuchsia",
  },
  {
    id: "raven",
    name: "The Raven",
    bird: "Corvo",
    emoji: "🐦",
    iconPath: "/personality/raven.png",
    tagline: "I soldi sono semi che si piantano.",
    description:
      "Come il corvo, intelligente e costruttore di soluzioni, vedi il denaro come capitale per realizzare idee. Reinvesti su quello che crei. Tolleri illiquidità perché punti a costruire valore vero.",
    centroid: { planning: 7, risk: 10, time: 9, value: 6, social: 3 },
    color: "violet",
  },
];

/**
 * Trova l'archetipo più vicino nello spazio 5D (euclidean distance).
 * Defensive: se un asse è undefined (es. profilo salvato pre-5D), usa 5
 * (neutro) così il calcolo non propaga NaN.
 */
export function findArchetype(axes: Axes): MoneyArchetype {
  let best = ARCHETYPES[0];
  let bestDist = Infinity;
  for (const a of ARCHETYPES) {
    const dp = a.centroid.planning - (axes.planning ?? 5);
    const dr = a.centroid.risk - (axes.risk ?? 5);
    const dt = a.centroid.time - (axes.time ?? 5);
    const dv = a.centroid.value - (axes.value ?? 5);
    const ds = a.centroid.social - (axes.social ?? 5);
    const dist = Math.sqrt(dp * dp + dr * dr + dt * dt + dv * dv + ds * ds);
    if (dist < bestDist) {
      bestDist = dist;
      best = a;
    }
  }
  return best;
}

/** Ritorna i top-N archetipi più vicini (per "anche tu sei un po'…" UI). */
export function rankArchetypes(axes: Axes, n = 3): MoneyArchetype[] {
  return [...ARCHETYPES]
    .map((a) => {
      const dp = a.centroid.planning - (axes.planning ?? 5);
      const dr = a.centroid.risk - (axes.risk ?? 5);
      const dt = a.centroid.time - (axes.time ?? 5);
      const dv = a.centroid.value - (axes.value ?? 5);
      const ds = a.centroid.social - (axes.social ?? 5);
      return { a, dist: Math.sqrt(dp * dp + dr * dr + dt * dt + dv * dv + ds * ds) };
    })
    .sort((x, y) => x.dist - y.dist)
    .slice(0, n)
    .map((x) => x.a);
}
