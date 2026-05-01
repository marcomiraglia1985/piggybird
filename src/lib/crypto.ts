import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Cifratura simmetrica AES-256-GCM.
 *
 * Strategia chiave master:
 *   1. APP_MASTER_KEY env var (32 byte hex) — usata se presente (dev, CI)
 *   2. Setting `system.masterKey` nel DB locale — generata al primo avvio
 *      tramite `ensureMasterKey()` se la env var non esiste. Ogni utente ha
 *      la sua chiave personale, isolata dal nostro build.
 *
 * NB: chiave perduta → dati cifrati (API credentials) illeggibili.
 * L'utente perde solo le credenziali API, non i suoi movimenti/conti.
 *
 * - IV random per ogni cifratura (96 bit, raccomandato per GCM)
 * - Auth tag verifica integrità: se ciphertext o IV vengono modificati
 *   la decifratura fallisce (no integrity → error)
 */

const ALGO = "aes-256-gcm";
const MASTER_KEY_SETTING = "system.masterKey";

function getKey(): Buffer {
  const hex = process.env.APP_MASTER_KEY;
  if (!hex) {
    throw new Error(
      "APP_MASTER_KEY non disponibile. Chiamare ensureMasterKey() al boot prima di usare encrypt/decrypt.",
    );
  }
  if (hex.length !== 64) {
    throw new Error(
      "APP_MASTER_KEY deve essere 32 byte (64 caratteri hex).",
    );
  }
  return Buffer.from(hex, "hex");
}

/**
 * Boot-time: assicura che `process.env.APP_MASTER_KEY` sia disponibile.
 * Order: env var (dev/CI) → DB Setting → genera nuova + salva in DB.
 *
 * Chiamare UNA VOLTA all'avvio (in `instrumentation.ts`). Idempotente.
 *
 * Lazy import di prisma per evitare circular import (crypto.ts → prisma →
 * adapter → ...).
 */
export async function ensureMasterKey(): Promise<void> {
  if (process.env.APP_MASTER_KEY && process.env.APP_MASTER_KEY.length === 64) {
    return;
  }
  const { prisma } = await import("./prisma");
  const existing = await prisma.setting
    .findUnique({ where: { key: MASTER_KEY_SETTING } })
    .catch(() => null);
  if (existing?.value && existing.value.length === 64) {
    process.env.APP_MASTER_KEY = existing.value;
    return;
  }
  // Genera nuova chiave 32 byte hex (256 bit)
  const fresh = randomBytes(32).toString("hex");
  await prisma.setting.upsert({
    where: { key: MASTER_KEY_SETTING },
    create: { key: MASTER_KEY_SETTING, value: fresh },
    update: { value: fresh },
  });
  process.env.APP_MASTER_KEY = fresh;
}

export type EncryptedField = {
  ciphertext: string; // base64
  iv: string; // base64
  authTag: string; // base64
};

export function encrypt(plain: string): EncryptedField {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

export function decrypt(payload: EncryptedField): string {
  const key = getKey();
  const iv = Buffer.from(payload.iv, "base64");
  const authTag = Buffer.from(payload.authTag, "base64");
  const ciphertext = Buffer.from(payload.ciphertext, "base64");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString("utf8");
}

/** Mostra solo le ultime 4 cifre per UI ("•••• •••• •••• 1234"). */
export function maskKey(key: string): string {
  if (key.length <= 8) return "•••• ••••";
  return `•••• •••• ${key.slice(-4)}`;
}
