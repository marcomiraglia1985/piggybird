/**
 * Prezzi modelli Anthropic (USD per 1M token, riferimento aprile 2026).
 * Convertiamo a EUR via tasso fisso (basta una stima — non è contabilità).
 */

const USD_TO_EUR = 0.92; // media storica recente

export const AI_MODELS = {
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5-20251001",
  opus: "claude-opus-4-7",
} as const;

export type AIModelId = keyof typeof AI_MODELS;

/** $ per 1M tokens, [input, output] */
const PRICING_USD: Record<AIModelId, [number, number]> = {
  haiku: [0.8, 4.0],
  sonnet: [3.0, 15.0],
  opus: [15.0, 75.0],
};

export function computeCallCostEur(
  model: AIModelId,
  inputTokens: number,
  outputTokens: number,
): number {
  const [inUsd, outUsd] = PRICING_USD[model];
  const usd = (inputTokens / 1_000_000) * inUsd + (outputTokens / 1_000_000) * outUsd;
  return usd * USD_TO_EUR;
}

export function formatCostEur(eur: number): string {
  if (eur < 0.01) return `< €0.01`;
  if (eur < 1) return `€${eur.toFixed(3)}`;
  return `€${eur.toFixed(2)}`;
}
