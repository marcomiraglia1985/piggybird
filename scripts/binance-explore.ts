import "dotenv/config";
import { getCredential } from "../src/lib/credentials";
import crypto from "node:crypto";

async function signed(path: string, params: Record<string, string> = {}) {
  const cred = await getCredential("binance");
  if (!cred) throw new Error("no cred");
  const qs = new URLSearchParams({
    ...params,
    timestamp: Date.now().toString(),
    recvWindow: "10000",
  });
  const signature = crypto
    .createHmac("sha256", cred.apiSecret)
    .update(qs.toString())
    .digest("hex");
  qs.append("signature", signature);
  const url = `https://api.binance.com${path}?${qs.toString()}`;
  const res = await fetch(url, { headers: { "X-MBX-APIKEY": cred.apiKey } });
  return { status: res.status, body: await res.text() };
}

async function explore() {
  const endpoints = [
    "/sapi/v1/asset/wallet/balance", // totali per wallet
    "/sapi/v3/asset/getUserAsset", // spot+funding (POST però)
    "/sapi/v1/simple-earn/flexible/position",
    "/sapi/v1/simple-earn/locked/position",
    "/sapi/v1/staking/position",
    "/sapi/v1/futures/loan/wallet",
  ];
  for (const e of endpoints) {
    const r = await signed(e);
    console.log(`\n=== ${e} (status ${r.status}) ===`);
    console.log(r.body.slice(0, 500));
  }

  // /sapi/v3/asset/getUserAsset must be POST
  const cred = await getCredential("binance");
  if (cred) {
    const qs = new URLSearchParams({
      timestamp: Date.now().toString(),
      recvWindow: "10000",
    });
    const sig = crypto.createHmac("sha256", cred.apiSecret).update(qs.toString()).digest("hex");
    qs.append("signature", sig);
    const res = await fetch(`https://api.binance.com/sapi/v3/asset/getUserAsset?${qs.toString()}`, {
      method: "POST",
      headers: { "X-MBX-APIKEY": cred.apiKey },
    });
    console.log(`\n=== POST /sapi/v3/asset/getUserAsset (status ${res.status}) ===`);
    console.log((await res.text()).slice(0, 800));
  }
}

explore().catch(console.error).finally(() => process.exit());
