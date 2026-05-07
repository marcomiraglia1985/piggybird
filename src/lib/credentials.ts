import { prisma } from "./prisma";
import { encrypt, decrypt, ensureMasterKey, maskKey, type EncryptedField } from "./crypto";

/**
 * Service layer per le credenziali API: salva, carica, revoca.
 * Le credenziali in chiaro restano in memoria solo durante la chiamata
 * server-side; non vengono mai serializzate verso il client.
 *
 * Tutti i punti di accesso chiamano `ensureMasterKey()` prima di
 * encrypt/decrypt: difesa contro il caso in cui il boot hook
 * `instrumentation.ts` non sia riuscito a inizializzare la chiave
 * (DB non pronto, race con migrations, edge runtime). Idempotente.
 */

export async function saveCredential(
  provider: string,
  apiKey: string,
  apiSecret: string,
) {
  await ensureMasterKey();
  const encKey = encrypt(apiKey);
  const encSecret = encrypt(apiSecret);
  // Usa lo stesso IV/authTag della key per semplicità: in realtà sono due
  // operazioni indipendenti, ma li teniamo nello stesso record. Per sicurezza
  // memorizziamo entrambi i payload separatamente — qui lo facciamo
  // concatenando in JSON (più pulito).
  const payload: EncryptedField & { secretCiphertext: string; secretIv: string; secretAuthTag: string } = {
    ciphertext: encKey.ciphertext,
    iv: encKey.iv,
    authTag: encKey.authTag,
    secretCiphertext: encSecret.ciphertext,
    secretIv: encSecret.iv,
    secretAuthTag: encSecret.authTag,
  };

  await prisma.apiCredential.upsert({
    where: { provider },
    create: {
      provider,
      apiKey: payload.ciphertext,
      apiSecret: JSON.stringify({
        ciphertext: payload.secretCiphertext,
        iv: payload.secretIv,
        authTag: payload.secretAuthTag,
      }),
      iv: payload.iv,
      authTag: payload.authTag,
      hint: maskKey(apiKey),
    },
    update: {
      apiKey: payload.ciphertext,
      apiSecret: JSON.stringify({
        ciphertext: payload.secretCiphertext,
        iv: payload.secretIv,
        authTag: payload.secretAuthTag,
      }),
      iv: payload.iv,
      authTag: payload.authTag,
      hint: maskKey(apiKey),
      lastSyncAt: null,
    },
  });
}

export async function getCredential(
  provider: string,
): Promise<{ apiKey: string; apiSecret: string } | null> {
  await ensureMasterKey();
  const row = await prisma.apiCredential.findUnique({ where: { provider } });
  if (!row) return null;
  const apiKey = decrypt({ ciphertext: row.apiKey, iv: row.iv, authTag: row.authTag });
  const secretPayload = JSON.parse(row.apiSecret) as EncryptedField;
  const apiSecret = decrypt(secretPayload);
  return { apiKey, apiSecret };
}

/** Sicuro per il client: solo metadata, no segreti. */
export async function getCredentialStatus(provider: string) {
  const row = await prisma.apiCredential.findUnique({
    where: { provider },
    select: { provider: true, hint: true, createdAt: true, lastSyncAt: true },
  });
  return row;
}

export async function deleteCredential(provider: string) {
  await prisma.apiCredential.delete({ where: { provider } }).catch(() => null);
}

export async function markSynced(provider: string) {
  await prisma.apiCredential.update({
    where: { provider },
    data: { lastSyncAt: new Date() },
  });
}
