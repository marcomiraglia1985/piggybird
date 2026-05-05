import { CryptoPlatformView } from "@/components/investimenti/crypto-platform-view";
import { getBrokerPlatformName } from "@/lib/broker-platform-resolver";

export const dynamic = "force-dynamic";

export default async function CryptoPage() {
  const platform = await getBrokerPlatformName("binance");
  return (
    <CryptoPlatformView
      platform={platform}
      title={`Crypto ${platform}`}
      emoji="🚀"
      description="prezzi live via Binance API"
      syncProvider="binance"
    />
  );
}
