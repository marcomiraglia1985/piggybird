import { callClaude } from "@/lib/claude-api";
import { parseJsonLoose } from "@/lib/ai/json-utils";
import type { PortfolioInput } from "@/lib/insights/portfolio-detector";

/**
 * Genera un report di analisi del portafoglio in stile "private banker note".
 *
 * Differenze chiave vs Piggybird Finance:
 *  - On-demand (1-2× al mese), non automaticamente cadenzato
 *  - Profondità: per-posizione + concentrazione + FX + traiettoria
 *  - Web search abilitato: Sonnet può cercare news macro recenti per
 *    contestualizzare l'analisi (regime tassi attuale, eventi mercato del mese)
 *  - Personality layers: lo stesso dato finanziario "vale" diverso a seconda
 *    del profilo psico-finanziario
 *
 * Modello: Sonnet (qualità del ragionamento + web search supportato).
 * Costo: ~€0,02-0,05 per analisi (~3-5 search).
 */

export type InvestmentCommentary = {
  headline: string;
  lead: string; // 2-3 frasi di apertura
  sections: Array<{ title: string; body: string }>;
  watchouts: string[];
  generatedAt: string;
};

const SYSTEM_PROMPT = `Sei un private banker che scrive una note di analisi del portafoglio per un singolo cliente. Tono: lucido, fattuale, tecnico ma leggibile. Tipo "FT Wealth column" o "Citywire briefing".

REGOLE GENERALI:
1. Terza persona impersonale ("il portafoglio", "la posizione X"). Mai "tu", mai nome proprio.
2. Niente consigli di investimento specifici (mai "compra X" / "vendi Y" / "esci da Z" / "punta su W"). Sei un ANALYST: descrivi pattern, segnali tensioni, lasci la decisione al lettore.
3. Italiano naturale, niente anglicismi non necessari.
4. Mai esporre score psicologici come "loss aversion 1/10". I layer del test sono inquadramento INTERNO che modula l'interpretazione del dato finanziario, non vocabolario editoriale. Mai citare l'archetipo per nome.
5. Mai menzionare il modello AI (Claude/Anthropic). Sei la voce dell'app.
6. Niente promesse di rendimento, niente "performance passata garanzia di future". Niente cifre macro inventate: usa solo numeri del payload o dei web_search results recuperati.

WEB SEARCH:
Hai accesso al tool web_search. Usalo (max 4 ricerche) per recuperare news/contesto MIRATO al portafoglio: settori specifici se concentrati, regime tassi corrente, eventi macro recenti rilevanti. Niente ricerche generiche tipo "stock market today" — mira ai signal che si AGGANCIANO al payload.

OUTPUT — solo JSON puro, niente markdown fence:
{
  "headline": "...",        // 1 riga, news-style, max 90 char
  "lead": "...",            // 2-3 frasi (60-100 parole), stato del portafoglio + tema dominante
  "sections": [
    { "title": "...", "body": "..." },  // 4-6 sezioni
    ...
  ],
  "watchouts": ["...", "..."]   // 1-3 osservazioni di attenzione
}

LEGGIBILITÀ — REGOLA OBBLIGATORIA per il campo 'body' di ogni sezione:
Spezza il body in 2-3 PARAGRAFI BREVI separati da DOPPIO NEWLINE \\n\\n.
Ogni paragrafo è 1-2 frasi (max ~50 parole). Mai un blocco di testo unico
oltre 60 parole. La densità del contenuto è alta — i paragrafi sono brevi
ma sostanziosi, non frammenti vuoti.

Esempio body BUONO (3 paragrafi separati):
"La prima posizione pesa il 32% degli stocks: è il rischio idiosincratico
dominante del portafoglio.\\n\\nIl profilo behavioral suggerisce che la
volatilità su singolo nome è sopportabile, ma l'asimmetria resta — un
earnings surprise può muovere il portafoglio del 4-5% in un giorno.\\n\\n
Storicamente, posizioni così concentrate hanno premiato chi ha thesis
chiara; il prezzo è la sensibilità a notizie specifiche, non al ciclo."

Esempio CATTIVO (un blocco unico illeggibile):
"La prima posizione pesa il 32% degli stocks ed è il rischio idiosincratico
dominante del portafoglio, sebbene il profilo behavioral suggerisca…"

SEZIONI tipiche (scegli 4-6 in base al payload, non sempre tutte):
- "Concentrazione": flagga posizioni >25% del portfolio o >30% degli stocks. Inquadra rispetto al profilo behavioral.
- "Performance": confronta con benchmark realistici (S&P, MSCI World). Spiega i gap. Distingui realized vs unrealized.
- "Allineamento al profilo": confronta riskTolerance dichiarato vs allocation reale. Segnala discrepanze.
- "FX & fiscalità": % non-EUR, regime fiscale rilevante (capital gain IT 26%, FR PFU 30%, ecc. solo se countries lo giustifica).
- "Cash idle nel broker": tradingCash significativo non re-investito.
- "Regime macro": VIX/T10y/EUR-USD inquadra il momento e cosa significa per il portfolio.

ESEMPI BUONI di sezione body:
- "Concentrazione: la prima posizione pesa il 32% degli stocks. Il portafoglio è esposto al destino di un singolo nome — possibile per profili che reggono volatilità idiosincratica, ma una qualunque sorpresa earnings su questa singola posizione muove il portafoglio del 4-5%."
- "Performance vs MSCI World ultimo mese: +1,8 pt sopra l'indice (MSCI -0,4%, portafoglio +1,4%). Il differenziale arriva soprattutto da [posizione]. Toglilo e il gap si chiude a -0,3 pt — utile sapere quale parte di alpha è strutturale e quale è tail."

ESEMPI CATTIVI:
- "Dovresti ribilanciare aggiungendo ETF azionari" ← prescrizione di acquisto
- "La tua loss aversion 1/10 ti rende OK per BTC" ← score-leading
- "Tipico dell'archetipo Owl" ← nome archetipo
`;

export type GenerateCommentaryResult = {
  commentary: InvestmentCommentary;
  costEur: number;
  inputTokens: number;
  outputTokens: number;
  model: string;
};

export async function generateInvestmentCommentary(
  input: PortfolioInput,
): Promise<GenerateCommentaryResult> {
  // Compatto i numeri per ridurre output tokens
  const compact = {
    todayIso: input.todayIso,
    totals: {
      valueEur: Math.round(input.totals.valueEur),
      costEur: input.totals.costEur != null ? Math.round(input.totals.costEur) : null,
      unrealizedGainEur:
        input.totals.unrealizedGainEur != null
          ? Math.round(input.totals.unrealizedGainEur)
          : null,
      unrealizedGainPct:
        input.totals.unrealizedGainPct != null
          ? +input.totals.unrealizedGainPct.toFixed(1)
          : null,
    },
    byAssetClass: input.byAssetClass.map((c) => ({
      type: c.type,
      valueEur: Math.round(c.valueEur),
      costEur: c.costEur != null ? Math.round(c.costEur) : null,
      pctOfPortfolio: +c.pctOfPortfolio.toFixed(1),
      positionCount: c.positionCount,
    })),
    topPositions: input.topPositions.map((p) => ({
      ticker: p.ticker,
      name: p.name,
      assetType: p.assetType,
      currency: p.currency,
      valueEur: Math.round(p.valueEur),
      gainEur: p.gainEur != null ? Math.round(p.gainEur) : null,
      gainPct: p.gainPct != null ? +p.gainPct.toFixed(1) : null,
      pctOfPortfolio: +p.pctOfPortfolio.toFixed(1),
    })),
    concentration: {
      top1PctOfEquity:
        input.concentration.top1PctOfEquity != null
          ? +input.concentration.top1PctOfEquity.toFixed(1)
          : null,
      top3PctOfEquity:
        input.concentration.top3PctOfEquity != null
          ? +input.concentration.top3PctOfEquity.toFixed(1)
          : null,
      top1PctOfPortfolio:
        input.concentration.top1PctOfPortfolio != null
          ? +input.concentration.top1PctOfPortfolio.toFixed(1)
          : null,
    },
    fxExposure: {
      nonEurValueEur: Math.round(input.fxExposure.nonEurValueEur),
      pctNonEur: +input.fxExposure.pctNonEur.toFixed(1),
      breakdownByCurrency: input.fxExposure.breakdownByCurrency.map((b) => ({
        currency: b.currency,
        valueEur: Math.round(b.valueEur),
        pctOfPortfolio: +b.pctOfPortfolio.toFixed(1),
      })),
    },
    tradingCashEur: Math.round(input.tradingCashEur),
    tradingCashByPlatform: input.tradingCashByPlatform.map((t) => ({
      platform: t.platform,
      currency: t.currency,
      valueEur: Math.round(t.valueEur),
    })),
    performance: {
      realizedPnLEurAllTime: Math.round(input.performance.realizedPnLEurAllTime),
      netDepositsEur: Math.round(input.performance.netDepositsEur),
      cagr1y:
        input.performance.cagr1y != null ? +input.performance.cagr1y.toFixed(1) : null,
    },
    macro: input.macro,
    userContext: input.userContext,
    personalityLayers: input.personalityLayers,
  };

  const userMessage =
    "Genera la note di analisi del portafoglio. Dati pre-calcolati (usa solo questi numeri internamente, salvo le news che recuperi via web_search):\n\n" +
    JSON.stringify(compact, null, 2);

  const result = await callClaude({
    feature: "investment-commentary",
    model: "sonnet",
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
    maxTokens: 3000,
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 4,
      },
    ],
  });

  const parsed = parseJsonLoose<{
    headline?: unknown;
    lead?: unknown;
    sections?: unknown;
    watchouts?: unknown;
  }>(result.text);

  const headline =
    typeof parsed?.headline === "string" ? parsed.headline.slice(0, 200) : "Stato del portafoglio";
  const lead = typeof parsed?.lead === "string" ? parsed.lead.slice(0, 800) : "";
  const sections = Array.isArray(parsed?.sections)
    ? parsed.sections
        .filter(
          (s): s is { title: string; body: string } =>
            !!s &&
            typeof s === "object" &&
            typeof (s as { title?: unknown }).title === "string" &&
            typeof (s as { body?: unknown }).body === "string",
        )
        .map((s) => ({
          title: s.title.slice(0, 80),
          body: s.body.slice(0, 1200),
        }))
        .slice(0, 8)
    : [];
  const watchouts = Array.isArray(parsed?.watchouts)
    ? parsed.watchouts
        .filter((w): w is string => typeof w === "string" && w.trim().length > 0)
        .map((w) => w.trim().slice(0, 1000))
        .slice(0, 5)
    : [];

  if (sections.length === 0 && !lead) {
    throw new Error("Output AI vuoto / non parsabile.");
  }

  return {
    commentary: {
      headline,
      lead,
      sections,
      watchouts,
      generatedAt: new Date().toISOString(),
    },
    costEur: result.costEur,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    model: result.model,
  };
}
