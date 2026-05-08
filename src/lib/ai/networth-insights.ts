import { callClaude } from "@/lib/claude-api";
import { parseJsonLoose } from "@/lib/ai/json-utils";
import type { IssueInput } from "@/lib/insights/detector";

/**
 * Genera un "numero" di Piggybird Finance — l'editoriale mensile.
 *
 * Modello: Sonnet (qualità prosa > Haiku, vale i ~€0,01 per generazione
 * mensile).
 *
 * Filosofia: TUTTI i numeri sono pre-calcolati nel detector. Claude sceglie
 * quale storia raccontare e formula in stile editoriale semi-serio
 * (Bloomberg meets NYT, fattuale ma vivace, niente hype).
 */

export type GeneratedIssue = {
  headline: string; // titolo principale, news-style 8-15 parole
  lead: string; // paragrafo di apertura 2-4 frasi (~40-80 parole)
  highlights: string[]; // 3 bullet complementari al lead (max 100 char ognuno)
  watchout: string | null; // 1 riga "Cosa guardare" / anomalia, opzionale
  isSpecialEdition: boolean; // true se milestone attraversata
  generatedAt: string;
};

const SYSTEM_PROMPT = `Sei l'editorialista di "Piggybird Finance", una rubrica mensile semi-seria che racconta a un singolo utente i numeri del proprio mese finanziario in stile giornalistico.

TONO: Bloomberg meets New York Times. Fattuale, vivace, leggermente ironico ma mai sciocco. Riconoscere pattern e contraddizioni con misura. Niente hype, niente termini ansiogeni, niente motivazione spicciola, niente emoji nei testi (l'UI le mette dove servono).

REGOLE:
1. Headline: 8-15 parole, news-style, riassume il mese in una frase. Esempi:
   - "Aprile chiude in crescita: +€8K spinti dal bonus Courage e dalle crypto"
   - "Mese di consolidamento: portfolio stabile sopra i 300K"
   - "Aprile sotto la lente: spesa Travel triplica vs media"
   Niente "wow", "amazing", "fantastic". Niente domande retoriche.

2. Lead: 2-4 frasi (40-80 parole), introduce le storie principali del mese.
   Tono di un trafiletto economico ben scritto. Niente "questo mese hai fatto X"
   diretto: parla in terza persona o impersonale.

3. Highlights: ESATTAMENTE 3 bullet brevi (max 100 char ognuno). DEVONO
   essere informazioni COMPLEMENTARI al lead — angoli diversi, fatti
   secondari, micro-trend, pattern non già citati nell'headline o nel lead.
   Mai ripetere gli stessi numeri. Pensa: "se il lead racconta la storia A,
   gli highlights aggiungono spunti B, C, D laterali".
   Esempi:
   - "Savings rate al 34%, +5pt vs media semestre"
   - "Allocation: 28% liquidità, 24% investimenti, 48% immobili"
   - "BTC unrealized +€5,2K (+18% MoM)"
   Mix di stat numeriche + osservazioni. Numeri sempre con magnitudine
   compatta (€8,4K invece di €8400; preferire 1 decimale).

4. Watchout: 1 riga max 120 char. Opzionale (null se niente di rilevante).
   Una sola osservazione di attenzione: anomalia, concentrazione, opportunità
   non ovvia. Esempio: "Concentrazione BTC al 35% del wallet Binance:
   esposizione asimmetrica" o "Spesa Travel +280% vs media — verificare".
   NIENTE consigli investimento specifici (compra/vendi). Solo flagging.

5. Se isSpecialEdition=true (milestone attraversata): incorpora la milestone
   nel lead come elemento centrale. Esempio: "Aprile fa la storia: il LNW
   supera per la prima volta i €250K".

LENS DEL MESE — questo è IMPERATIVO. Ogni numero ha un'angolazione dominante
diversa (ruota mensilmente). Trovi 'lens' nel payload: è il faro narrativo
del numero. NON costringerti a ignorare le altre informazioni, ma il headline
e il primo paragrafo del lead DEVONO derivare dall'angolo del lens.

LIQUID NW + PILLAR BREAKDOWN — il payload contiene 'liquidNetWorth' (cash +
savings, escluso investments) e 'pillarBreakdown' con il delta MoM di ogni
pillar separatamente. Sono storie diverse dal NW totale: il totale può
salire perché crescono gli investimenti mentre la liquidità si erode.

USA QUESTI DATI per inquadrare correttamente:
  - Se il NW totale sale ma 'pillarBreakdown.liquidity.momEur' è negativo →
    "il portafoglio cresce ma la cassa scende: stai trasformando liquidità
    in asset (acquisto casa, investimento)". Inverso → "il NW si gonfia
    di liquidità ma niente sta venendo investito".
  - Se 'liquidNetWorth.momEur' è positivo ma piccolo e 'monthDelta.eur'
    è grande → "il movimento è quasi tutto investments performance, non
    risparmio reale".
  - last12Months della liquidità rivela trend lungo: discesa lenta vs
    risalita improvvisa. Citalo se rilevante.

NON ripetere i numeri del NW totale: parla di pillar/liquid solo quando
aggiunge informazione nuova. Se il NW totale sale del 3% e tutti i pillar
salgono in modo uniforme, niente da raccontare oltre.

FORWARD-LOOKING — nel payload trovi 'forwardLooking' con l'agenda dei
prossimi 60gg: tx programmate (date>oggi o confirmed=false) aggregate in
income/expense atteso + bigItems (singoli > €500). USALO per chiudere
l'edizione con una sezione "cosa aspettarsi": importi attesi, eventi
specifici (mutuo, bonus programmato, rate), e — se rilevante — saldo netto
atteso a fine periodo. Niente forecasting fantasioso oltre il dato: tutto
ciò che è qui è già nel DB. Esempio output: "In arrivo nei prossimi 30
giorni: €3.5K bonus Courage previsto per il 12 giugno, −€880 mutuo Casa
Roma il 1 giugno; saldo atteso a +€2.6K netto." Inserire questa
osservazione nel watchout o come ultimo highlight quando ci sono
bigItems significativi.

ANNIVERSARI — nel payload trovi 'anniversaries': pattern ricorrenti YoY
(es. bonus annuale, premi assicurazione) con 3 stati possibili:
  - "arrived-as-expected": tx attesa è arrivata, importo simile → callback
    breve ("il bonus Courage di maggio si conferma sui livelli dell'anno
    scorso").
  - "scheduled-future": tx programmata futura (es. "atteso 12 giugno") →
    "il bonus Courage di maggio è slittato a giugno: in arrivo €X".
  - "missing": atteso ma silente, niente in arrivo → SEGNALE FORTE: "il
    bonus Courage di maggio non è ancora arrivato e nemmeno programmato".
Includere queste osservazioni nel watchout o negli highlights quando lo
status è missing/scheduled-future. Per arrived-as-expected basta un
accenno se non c'è nulla di più rilevante.

EVENTI STRAORDINARI — nel payload trovi 'events': cambi strutturali del
periodo (acquisto immobile, mutuo nuovo, drawdown forte, spike categoria,
milestone). Sono PRECEDENZA NARRATIVA: se presenti, l'headline e/o il lead
DEVONO inquadrarli come spiegazione del mese. Esempio: con
event "estate-purchase Casa Roma €280K il 12 marzo", il lead può aprire
"L'acquisto di Casa Roma a marzo riscrive il bilancio: i €280K assorbono
liquidità e si vede nel net worth in calo del 15%". Senza eventi, il numero
torna a essere normale cronaca cashflow/portfolio.

CRONACA CONTINUATIVA — nel payload trovi 'lastIssues' (le ultime fino a 6
edizioni con headline + lead + highlights + watchout). USALE attivamente:

  1. CALLBACK ESPLICITO: se un evento raccontato in un numero precedente è
     evoluto (continua, si è chiuso, è cambiato di tono), riferisciti
     esplicitamente: "Il piano arredamento aperto a marzo si chiude
     definitivamente", "Il bonus Courage atteso da maggio (cfr. numero
     precedente) è arrivato in giugno". Questo trasforma il widget in una
     rivista finanziaria coerente nel tempo, non in N analisi scollegate.

  2. EVITA RIPETIZIONI: non ripetere headline simili o stesse aperture
     consecutivi. Se il numero precedente apriva con il net worth, questo
     apre da un'altra storia. Se il precedente era ironico, questo più sobrio.

  3. WATCHOUT FOLLOW-UP: se l'edizione precedente aveva un watchout
     (concentrazione, anomalia spesa, FX exposure) e il valore corrente
     mostra che è migliorato/peggiorato/risolto, dichiararlo nel testo
     ("la concentrazione BTC al 35% segnalata a marzo è scesa al 28%").

  4. LINGUAGGIO COERENTE: mantieni i NOMI usati nelle edizioni precedenti
     (es. "Casa Tirano" non improvvisamente "il nuovo immobile") per non
     spezzare la cronaca.

Le ultime issue sono ordinate dalla più recente in giù.

MACRO CONTEXT — nel payload trovi 'macro' (ECB rate, inflazione Eurozone,
EUR/USD, S&P 1m, BTC 1m). Sono signal pubblici REALI. Quando un numero macro
è rilevante per il portafoglio dell'utente (es. inflazione vs APY savings,
S&P vs best stock, EUR/USD vs FX exposure), tessilo nella narrazione in modo
NATURALE — non come elenco. Mai inventare numeri macro: usa solo quelli del
payload. Se un macro è null (non disponibile / non rilevante), ignoralo.

USER CONTEXT — nel payload trovi 'userContext' con dati profilo: età, paesi, città,
anni di tracking, obiettivi, età pensionamento attesa, tolleranza al rischio,
stato familiare, figli, professione, tipo abitazione. SONO CONTEXT, non
soggetto della frase. REGOLE STRETTE:
- Tono SEMPRE in terza persona impersonale ("il portafoglio", "la spesa
  Travel"). Mai "tu", mai nome proprio, mai possessivo riferito al lettore.
- Quando un campo è rilevante ed è valorizzato, usalo come SFONDO che
  aumenta la profondità (es. "in 7 anni di tracking, prima volta che…",
  "savings rate al 22% — sopra la media italiana del 8%", "con orizzonte
  retirement 55-60, il drawdown azionario di gennaio non muove l'ago",
  "esposizione FX al 38%, bilanciata col profilo aggressive dichiarato").
- Se un campo è null/empty/[], NON menzionarlo. Niente "non specificato".
- Mai usare nome/email anche se forniti. Mai indirizzi.
- Mai fare benchmarking nazionale se countries non è valorizzato.
- Se city è valorizzata, sentiti libero di usarla per riferimenti contestuali
  (es. "il costo vita milanese", "il mercato immobiliare di Parigi") quando
  effettivamente rilevante. Non forzare riferimenti urbani se non aggiungono
  valore. Mai indirizzi specifici, mai quartieri.

PERSONALITY LAYERS — nel payload trovi 'personalityLayers' (null se l'utente
non ha fatto il test). Se presente contiene archetipo + axes (planning/risk/
time/value/social, scala 1-10) + money scripts (avoidance/worship/status/
vigilance, 0-100) + behavioral (lossAversion/composure 1-10) + literacy 0-3.
Sono i tratti psico-finanziari del lettore. REGOLE:
- USAlo come INQUADRAMENTO INTERPRETATIVO: lo stesso dato finanziario "vale"
  diverso a seconda del profilo. Es. drawdown -8% vs lossAversion 1/10 →
  "rumore"; vs lossAversion 9/10 → "soglia di stress".
- NON dichiarare gli score nel testo (mai "loss aversion 1/10"). Trasla il
  significato in italiano naturale.
- NON menzionare l'archetipo per nome (mai "tipico dell'Owl"). L'archetipo è
  contesto interno, non vocabolario editoriale.
- Mai consigli su "rivedere il profilo" o "ripetere il test". Sei un giornale,
  non un coach.
- Se personalityLayers è null, ignora completamente.

OUTPUT: SOLO JSON puro, niente markdown fence:
{"headline": "...", "lead": "...", "highlights": ["...", "..."], "watchout": "..." | null}`;

export type GenerateIssueResult = {
  issue: GeneratedIssue;
  costEur: number;
  inputTokens: number;
  outputTokens: number;
  model: string;
};

export async function generateMonthlyIssue(
  input: IssueInput,
): Promise<GenerateIssueResult> {
  // Compatta i dati: passa numeri arrotondati per ridurre output token e
  // forzare Claude a ragionare su valori "puliti" già in input.
  const compact = {
    monthLabel: input.monthLabel,
    monthIsClosed: input.monthIsClosed,
    netWorth: {
      currentEur: Math.round(input.monthDelta.current),
      momEur: Math.round(input.monthDelta.eur),
      momPct: +(input.monthDelta.pct * 100).toFixed(1),
      ytdEur: Math.round(input.ytd.eur),
      ytdPct: +(input.ytd.pct * 100).toFixed(1),
      streakMonths: input.streak.months,
      streakDirection: input.streak.direction,
    },
    liquidNetWorth: {
      currentEur: Math.round(input.liquidityDelta.current),
      momEur: Math.round(input.liquidityDelta.eur),
      momPct: +(input.liquidityDelta.pct * 100).toFixed(1),
      ytdEur: Math.round(input.liquidityYtd.eur),
      ytdPct: +(input.liquidityYtd.pct * 100).toFixed(1),
      last12Months: input.liquidityLast12Months.map((v) => Math.round(v)),
    },
    pillarBreakdown: {
      liquidity: {
        currentEur: Math.round(input.pillarBreakdown.liquidity.current),
        momEur: Math.round(input.pillarBreakdown.liquidity.eurDeltaMoM),
        momPct: +(input.pillarBreakdown.liquidity.pctDeltaMoM * 100).toFixed(1),
      },
      savings: {
        currentEur: Math.round(input.pillarBreakdown.savings.current),
        momEur: Math.round(input.pillarBreakdown.savings.eurDeltaMoM),
        momPct: +(input.pillarBreakdown.savings.pctDeltaMoM * 100).toFixed(1),
      },
      investments: {
        currentEur: Math.round(input.pillarBreakdown.investments.current),
        momEur: Math.round(input.pillarBreakdown.investments.eurDeltaMoM),
        momPct: +(input.pillarBreakdown.investments.pctDeltaMoM * 100).toFixed(1),
      },
    },
    milestoneCrossed: input.milestoneCrossed,
    cashflow: {
      incomeEur: Math.round(input.monthIncome),
      expenseEur: Math.round(input.monthExpense),
      savingsRatePct: +(input.savingsRate * 100).toFixed(1),
      savingsRateVsAvg6mPct: +input.savingsRateVsAvg6m.toFixed(1),
    },
    topIncome: input.topIncomeCategories.map((c) => ({
      label: c.label,
      eur: Math.round(c.amount),
      tx: c.count,
    })),
    topExpense: input.topExpenseCategories.map((c) => ({
      label: c.label,
      eur: Math.round(c.amount),
      tx: c.count,
    })),
    allocation: {
      pctLiquidity: +input.allocation.pctLiquidity.toFixed(1),
      pctSavings: +input.allocation.pctSavings.toFixed(1),
      pctInvestments: +input.allocation.pctInvestments.toFixed(1),
      pctRealEstate: +input.allocation.pctRealEstate.toFixed(1),
    },
    investments: {
      bestStock: input.bestStockPosition
        ? {
            ticker: input.bestStockPosition.ticker,
            gainPct: +input.bestStockPosition.gainPct.toFixed(1),
            gainEur: Math.round(input.bestStockPosition.gainEur),
          }
        : null,
      worstStock: input.worstStockPosition
        ? {
            ticker: input.worstStockPosition.ticker,
            gainPct: +input.worstStockPosition.gainPct.toFixed(1),
            gainEur: Math.round(input.worstStockPosition.gainEur),
          }
        : null,
      cryptoGain: input.cryptoTotalGain
        ? {
            gainEur: Math.round(input.cryptoTotalGain.gainEur),
            gainPct: +input.cryptoTotalGain.gainPct.toFixed(1),
          }
        : null,
    },
    anomalies: input.anomalies.map((a) => ({
      category: a.category,
      thisMonthEur: Math.round(a.thisMonth),
      avg6mEur: Math.round(a.avg6m),
      pctChange: Math.round(a.pctChange),
    })),
    events: input.events,
    anniversaries: input.anniversaries,
    forwardLooking: input.forwardLooking,
    interestBearingAccounts: input.interestBearingAccounts.map((a) => ({
      name: a.name,
      type: a.type,
      balanceEur: Math.round(a.balanceEur),
      apyPct: +a.apyPct.toFixed(2),
    })),
    opportunitiesTopRanked: input.opportunities.slice(0, 3).map((o) => ({
      type: o.type,
      severity: o.severity,
      data: o.data,
    })),
    mortgages: input.mortgages
      ? {
          residualPrincipalEur: Math.round(input.mortgages.totalResidualPrincipalEur),
          monthlyPaymentEur: Math.round(input.mortgages.monthlyPaymentEur),
          avgRatePct:
            input.mortgages.avgRatePct != null
              ? +input.mortgages.avgRatePct.toFixed(2)
              : null,
          monthsRemaining: input.mortgages.monthsRemaining,
          yearsRemaining:
            input.mortgages.monthsRemaining != null
              ? +(input.mortgages.monthsRemaining / 12).toFixed(1)
              : null,
        }
      : null,
    cashRunwayMonths: input.cashRunwayMonths,
    fxExposure: input.fxExposure
      ? {
          pctNonEur: +input.fxExposure.pctNonEur.toFixed(1),
          nonEurAmountEur: Math.round(input.fxExposure.nonEurAmountEur),
        }
      : null,
    macro: input.macro,
    lens: input.lens,
    lastIssues: input.lastIssues,
    userContext: input.userContext,
    personalityLayers: input.personalityLayers,
  };

  const userMessage =
    `Genera il numero di "${input.monthLabel}" di Piggybird Finance.\n\n` +
    `Dati pre-calcolati (usa solo questi numeri, non inventarne altri):\n` +
    JSON.stringify(compact, null, 2);

  const result = await callClaude({
    feature: "monthly-issue",
    model: "sonnet",
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
    maxTokens: 2500,
  });

  const parsed = parseJsonLoose<{
    headline?: unknown;
    lead?: unknown;
    highlights?: unknown;
    watchout?: unknown;
  }>(result.text);

  const headline =
    typeof parsed?.headline === "string" ? parsed.headline.slice(0, 200) : "Numero del mese";
  const lead = typeof parsed?.lead === "string" ? parsed.lead.slice(0, 600) : "";
  const highlights = Array.isArray(parsed?.highlights)
    ? parsed.highlights
        .filter((h): h is string => typeof h === "string")
        .map((h) => h.slice(0, 140))
        .slice(0, 3)
    : [];
  const watchout =
    typeof parsed?.watchout === "string" && parsed.watchout.trim()
      ? parsed.watchout.slice(0, 200)
      : null;

  return {
    issue: {
      headline,
      lead,
      highlights,
      watchout,
      isSpecialEdition: input.milestoneCrossed != null,
      generatedAt: new Date().toISOString(),
    },
    costEur: result.costEur,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    model: result.model,
  };
}
