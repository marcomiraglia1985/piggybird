/**
 * Client per Revolut X public REST API (https://exchange.revolut.com).
 *
 * Auth Ed25519:
 *   message = `${timestamp_ms}${METHOD}${path}${queryString}${body}`  (no separatori)
 *   signature = base64(Ed25519_sign(privateKey, message))
 *   headers:
 *     X-Revx-API-Key: <64-char>
 *     X-Revx-Timestamp: <unix ms>
 *     X-Revx-Signature: <base64>
 *
 * Le credenziali (API Key + Ed25519 private PEM) sono cifrate in DB via
 * `saveCredential('revolut-x', apiKey, privatePem)` (AES-256-GCM, master in .env).
 */

import crypto from "node:crypto";
import { getCredential } from "./credentials";

const BASE_URL = "https://revx.revolut.com";

function signRequest(
  privateKey: crypto.KeyObject,
  method: string,
  fullPath: string,
  body: string,
  timestampMs: number,
): string {
  const message = `${timestampMs}${method}${fullPath}${body}`;
  const signature = crypto.sign(null, Buffer.from(message), privateKey);
  return signature.toString("base64");
}

export type RevolutXBalance = {
  currency: string;
  available: string;
  reserved: string;
  staked?: string;
  total: string;
};

async function callRevx<T>(
  method: "GET" | "POST" | "DELETE",
  pathWithQuery: string,
  body?: object,
): Promise<T> {
  const cred = await getCredential("revolut-x");
  if (!cred) {
    throw new Error("Credenziali Revolut X non configurate (vai in Impostazioni)");
  }
  let privateKey: crypto.KeyObject;
  try {
    privateKey = crypto.createPrivateKey(cred.apiSecret);
  } catch {
    throw new Error("Private key Revolut X non valida (atteso PEM Ed25519)");
  }
  const timestamp = Date.now();
  const bodyStr = body ? JSON.stringify(body) : "";
  const signature = signRequest(privateKey, method, pathWithQuery, bodyStr, timestamp);

  const res = await fetch(`${BASE_URL}${pathWithQuery}`, {
    method,
    headers: {
      "X-Revx-API-Key": cred.apiKey,
      "X-Revx-Timestamp": String(timestamp),
      "X-Revx-Signature": signature,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: bodyStr || undefined,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Revolut X ${res.status} ${res.statusText}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export async function getBalances(): Promise<RevolutXBalance[]> {
  return callRevx<RevolutXBalance[]>("GET", "/api/1.0/balances");
}
