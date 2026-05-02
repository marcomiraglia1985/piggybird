import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "./prisma";
import { decrypt, encrypt } from "./crypto";
import {
  AI_MODELS,
  computeCallCostEur,
  type AIModelId,
} from "./ai-pricing";
import { buildUserContext } from "./ai-context";

const PROVIDER_KEY = "anthropic";

/**
 * Wrapper sopra Anthropic SDK per le feature AI on-demand della app.
 *
 * Filosofia:
 *   - BYOK (Bring Your Own Key): l'utente inserisce la propria API key in
 *     /impostazioni → AI Features. Salvata cifrata in ApiCredential
 *     (provider="anthropic") tramite lib/crypto.ts (AES-256-GCM).
 *   - On-demand: ogni chiamata è scatenata da un'esplicita azione utente.
 *     Niente background, niente token bruciati senza consent.
 *   - Tracked: ogni call salva una row in AIUsage con tokens + cost EUR.
 */

export type ClaudeMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ClaudeCallOptions = {
  feature: string; // identificativo della feature, salvato in AIUsage
  model?: AIModelId;
  system?: string;
  messages: ClaudeMessage[];
  maxTokens?: number;
  /** Se true, NON registra in AIUsage (es. per test credential). */
  skipUsageTracking?: boolean;
  /** Se true, prepende automaticamente buildUserContext() al system prompt.
   *  Usare per feature di insight/osservazione dove conta personalizzare il
   *  tono e l'angolo. NON usare per task narrowly funzionali (es. parsing
   *  CSV, mapping colonne) dove il context aggiunge solo token sprecati. */
  includeUserContext?: boolean;
};

export type ClaudeCallResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costEur: number;
  model: AIModelId;
};

async function getApiKey(): Promise<string | null> {
  const cred = await prisma.apiCredential.findUnique({
    where: { provider: PROVIDER_KEY },
  });
  if (!cred) return null;
  try {
    return decrypt({
      ciphertext: cred.apiKey,
      iv: cred.iv,
      authTag: cred.authTag,
    });
  } catch {
    return null;
  }
}

export async function hasAnthropicCredential(): Promise<boolean> {
  const cred = await prisma.apiCredential.findUnique({
    where: { provider: PROVIDER_KEY },
    select: { provider: true },
  });
  return cred != null;
}

/** Salva (o aggiorna) la API key Anthropic, cifrata. */
export async function saveAnthropicCredential(apiKey: string): Promise<void> {
  const enc = encrypt(apiKey);
  const hint = apiKey.length > 8 ? `…${apiKey.slice(-4)}` : "set";
  await prisma.apiCredential.upsert({
    where: { provider: PROVIDER_KEY },
    create: {
      provider: PROVIDER_KEY,
      apiKey: enc.ciphertext,
      iv: enc.iv,
      authTag: enc.authTag,
      hint,
    },
    update: {
      apiKey: enc.ciphertext,
      iv: enc.iv,
      authTag: enc.authTag,
      hint,
    },
  });
}

export async function deleteAnthropicCredential(): Promise<void> {
  await prisma.apiCredential
    .delete({ where: { provider: PROVIDER_KEY } })
    .catch(() => null);
}

/** Test rapido: chiama l'API con un prompt minimale per validare la key. */
export async function testAnthropicCredential(apiKey: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    const client = new Anthropic({ apiKey });
    await client.messages.create({
      model: AI_MODELS.haiku,
      max_tokens: 5,
      messages: [{ role: "user", content: "ping" }],
    });
    return { ok: true };
  } catch (e) {
    const err = e as { status?: number; message?: string };
    return {
      ok: false,
      error:
        err.status === 401
          ? "API key non valida (401 unauthorized)"
          : err.message ?? String(e),
    };
  }
}

/**
 * Rate limit: max 5 chiamate AI / 60 secondi. In-memory rolling window
 * (per-process — l'app desktop ha 1 istanza, va bene). Protegge da
 * spam accidentale (es. utente che clicca rapido) o malicious loops.
 * Throw `Error("rate-limit:retry-after-Xs")` se superato.
 */
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;
const callTimestamps: number[] = [];

function checkRateLimit(): void {
  const now = Date.now();
  // Drop timestamps fuori dalla finestra
  while (callTimestamps.length > 0 && now - callTimestamps[0] > RATE_LIMIT_WINDOW_MS) {
    callTimestamps.shift();
  }
  if (callTimestamps.length >= RATE_LIMIT_MAX) {
    const oldest = callTimestamps[0];
    const retryAfterSec = Math.ceil((RATE_LIMIT_WINDOW_MS - (now - oldest)) / 1000);
    throw new Error(
      `Limite chiamate AI raggiunto (${RATE_LIMIT_MAX}/min). Riprova tra ${retryAfterSec}s.`,
    );
  }
  callTimestamps.push(now);
}

/**
 * Chiamata principale: Claude messages API + tracking automatico in AIUsage.
 * Lancia errore se: (a) credential mancante, (b) rate limit superato, (c) API error.
 */
export async function callClaude(
  opts: ClaudeCallOptions,
): Promise<ClaudeCallResult> {
  checkRateLimit();
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error("Nessuna API key Anthropic configurata.");
  }
  const model: AIModelId = opts.model ?? "sonnet";
  const client = new Anthropic({ apiKey });

  // Prepende il contesto utente al system prompt se richiesto. Fail-safe:
  // se buildUserContext fallisce per qualunque motivo, procede con il
  // system originale (la feature AI non si rompe per un errore di profilo).
  let systemPrompt = opts.system;
  if (opts.includeUserContext) {
    try {
      const userContext = await buildUserContext();
      if (userContext) {
        systemPrompt = systemPrompt
          ? `${userContext}\n\n---\n\n${systemPrompt}`
          : userContext;
      }
    } catch {
      // ignora, usa system originale
    }
  }

  let result: ClaudeCallResult | null = null;
  let errorMsg: string | null = null;
  let status: "ok" | "error" | "rate_limited" = "ok";

  try {
    const resp = await client.messages.create({
      model: AI_MODELS[model],
      max_tokens: opts.maxTokens ?? 1024,
      system: systemPrompt,
      messages: opts.messages,
    });
    const text = resp.content
      .filter((c) => c.type === "text")
      .map((c) => (c as { text: string }).text)
      .join("");
    const inputTokens = resp.usage?.input_tokens ?? 0;
    const outputTokens = resp.usage?.output_tokens ?? 0;
    const costEur = computeCallCostEur(model, inputTokens, outputTokens);
    result = { text, inputTokens, outputTokens, costEur, model };
  } catch (e) {
    const err = e as { status?: number; message?: string };
    errorMsg = err.message ?? String(e);
    status = err.status === 429 ? "rate_limited" : "error";
  }

  if (!opts.skipUsageTracking) {
    await prisma.aIUsage
      .create({
        data: {
          feature: opts.feature,
          model: AI_MODELS[model],
          inputTokens: result?.inputTokens ?? 0,
          outputTokens: result?.outputTokens ?? 0,
          costEur: result?.costEur ?? 0,
          status,
          errorMsg,
        },
      })
      .catch(() => null);
  }

  if (!result) {
    throw new Error(errorMsg ?? "Claude API error");
  }
  return result;
}
