import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Cifratura simmetrica AES-256-GCM.
 *
 * - Chiave da APP_MASTER_KEY (.env, 32 byte hex)
 * - IV random per ogni cifratura (96 bit, raccomandato per GCM)
 * - Auth tag verifica integrità: se il ciphertext o IV vengono modificati
 *   la decifratura fallisce (no integrity → error)
 *
 * NB: chiave perduta → dati illeggibili. Backup di .env in posto sicuro.
 */

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const hex = process.env.APP_MASTER_KEY;
  if (!hex) {
    throw new Error(
      "APP_MASTER_KEY non configurata. Aggiungila in .env (32 byte hex).",
    );
  }
  if (hex.length !== 64) {
    throw new Error(
      "APP_MASTER_KEY deve essere 32 byte (64 caratteri hex).",
    );
  }
  return Buffer.from(hex, "hex");
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
