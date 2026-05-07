import { prisma } from "./prisma";
import { decrypt, ensureMasterKey } from "./crypto";

const PROVIDER_KEY = "anthropic";

export type StoredKeyResult =
  | { status: "ok"; key: string }
  | { status: "missing" }
  | { status: "decrypt_failed" };

/**
 * Decifra la API key Anthropic salvata dall'utente in `ApiCredential`
 * (Impostazioni → AI Features). Distingue tre casi:
 *   - "ok": chiave presente e decifrata
 *   - "missing": nessuna riga in DB (utente non ha mai configurato)
 *   - "decrypt_failed": riga presente ma decrypt fallito (master key
 *     cambiata, payload corrotto). NON va in fallback dev — è un bug
 *     dell'utente che va surface.
 */
export async function getStoredAnthropicKey(): Promise<StoredKeyResult> {
  await ensureMasterKey();
  const cred = await prisma.apiCredential.findUnique({
    where: { provider: PROVIDER_KEY },
  });
  if (!cred) return { status: "missing" };
  try {
    const key = decrypt({
      ciphertext: cred.apiKey,
      iv: cred.iv,
      authTag: cred.authTag,
    });
    return { status: "ok", key };
  } catch {
    return { status: "decrypt_failed" };
  }
}

/**
 * Risolve la API key per chiamate AI dove serve un fallback dev: BYOK utente
 * vince (paga chi ha la chiave), altrimenti `BETA_AI_FALLBACK_KEY` per
 * unblock al primo import. Usata dai universal-parser fallback (banche/broker
 * sconosciuti).
 *
 * Nota: se BYOK presente ma decrypt fallito → ritorna `null` (NON cade su
 * env). Il caller deve surface l'errore così l'utente reinserisce la key
 * invece di far pagare la dev key di Marco silenziosamente.
 */
export async function resolveAnthropicApiKey(): Promise<string | null> {
  const stored = await getStoredAnthropicKey();
  if (stored.status === "ok") return stored.key;
  if (stored.status === "decrypt_failed") {
    console.warn(
      "[anthropic-key-resolver] decrypt failed for stored credential — refusing dev fallback",
    );
    return null;
  }
  // status === "missing": l'utente non ha configurato BYOK, OK fallback env.
  const env = process.env.BETA_AI_FALLBACK_KEY?.trim();
  return env || null;
}
