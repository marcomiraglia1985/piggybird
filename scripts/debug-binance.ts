import "dotenv/config";
import { getCredential } from "../src/lib/credentials";
import crypto from "node:crypto";

async function main() {
  const cred = await getCredential("binance");
  if (!cred) {
    console.log("❌ Nessuna credenziale Binance salvata");
    return;
  }

  console.log("📋 Credenziali decifrate:");
  console.log("   API Key length:", cred.apiKey.length);
  console.log("   API Key first 4 chars:", cred.apiKey.slice(0, 4));
  console.log("   API Key last 4 chars:", cred.apiKey.slice(-4));
  console.log("   API Secret length:", cred.apiSecret.length);
  console.log("   API Secret first 4 chars:", cred.apiSecret.slice(0, 4));
  console.log("   API Secret last 4 chars:", cred.apiSecret.slice(-4));

  // Verifica che non ci siano caratteri non-ASCII o whitespace nascosti
  const keyHasWS = /\s/.test(cred.apiKey);
  const secretHasWS = /\s/.test(cred.apiSecret);
  const keyNonAscii = /[^\x20-\x7e]/.test(cred.apiKey);
  const secretNonAscii = /[^\x20-\x7e]/.test(cred.apiSecret);

  console.log("\n🔍 Sanity check:");
  console.log("   Key contiene whitespace?", keyHasWS ? "❌ SI" : "✓ no");
  console.log("   Secret contiene whitespace?", secretHasWS ? "❌ SI" : "✓ no");
  console.log("   Key contiene caratteri non-ASCII?", keyNonAscii ? "❌ SI" : "✓ no");
  console.log("   Secret contiene caratteri non-ASCII?", secretNonAscii ? "❌ SI" : "✓ no");

  // Test chiamata Binance reale
  console.log("\n🌐 Test chiamata Binance...");
  const qs = new URLSearchParams({
    timestamp: Date.now().toString(),
    recvWindow: "10000",
  });
  const signature = crypto
    .createHmac("sha256", cred.apiSecret)
    .update(qs.toString())
    .digest("hex");
  qs.append("signature", signature);

  const url = `https://api.binance.com/api/v3/account?${qs.toString()}`;
  const res = await fetch(url, {
    headers: { "X-MBX-APIKEY": cred.apiKey },
  });
  const text = await res.text();
  console.log("   Status:", res.status);
  console.log("   Response:", text.slice(0, 200));

  // Prova anche un endpoint pubblico per verificare connettività
  const pingRes = await fetch("https://api.binance.com/api/v3/ping");
  console.log("   /ping status:", pingRes.status);
}

main()
  .catch(console.error)
  .finally(() => process.exit());
