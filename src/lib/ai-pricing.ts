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

/**
 * Anthropic prompt caching pricing (vs base input):
 *  - cache_creation_input_tokens: 1.25× del prezzo input base (penalty per il primo write)
 *  - cache_read_input_tokens:     0.10× del prezzo input base (90% sconto)
 *  - input_tokens:                1.00× (base, non-cached)
 * Output tokens senza modifiche dal caching.
 */
const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;

export function computeCallCostEur(
  model: AIModelId,
  inputTokens: number,
  outputTokens: number,
  cacheCreationTokens: number = 0,
  cacheReadTokens: number = 0,
): number {
  const [inUsd, outUsd] = PRICING_USD[model];
  const inputUsd = (inputTokens / 1_000_000) * inUsd;
  const cacheWriteUsd =
    (cacheCreationTokens / 1_000_000) * inUsd * CACHE_WRITE_MULTIPLIER;
  const cacheReadUsd =
    (cacheReadTokens / 1_000_000) * inUsd * CACHE_READ_MULTIPLIER;
  const outputUsd = (outputTokens / 1_000_000) * outUsd;
  const usd = inputUsd + cacheWriteUsd + cacheReadUsd + outputUsd;
  return usd * USD_TO_EUR;
}

export function formatCostEur(eur: number): string {
  if (eur < 0.01) return `< €0.01`;
  if (eur < 1) return `€${eur.toFixed(3)}`;
  return `€${eur.toFixed(2)}`;
}
