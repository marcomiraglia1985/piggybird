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

MEMORIA — nel payload trovi 'lastIssues' (gli ultimi 1-2 numeri). NON ripetere
gli stessi headline o le stesse aperture. Cambia angolo, registro, struttura.
Se il numero precedente apriva con il net worth, questo apre con un'altra
storia. Se il precedente era ironico, questo è più sobrio. Varietà è la regola.

MACRO CONTEXT — nel payload trovi 'macro' (ECB rate, inflazione Eurozone,
EUR/USD, S&P 1m, BTC 1m). Sono signal pubblici REALI. Quando un numero macro
è rilevante per il portafoglio dell'utente (es. inflazione vs APY savings,
S&P vs best stock, EUR/USD vs FX exposure), tessilo nella narrazione in modo
NATURALE — non come elenco. Mai inventare numeri macro: usa solo quelli del
payload. Se un macro è null (non disponibile / non rilevante), ignoralo.

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
    maxTokens: 1500,
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
