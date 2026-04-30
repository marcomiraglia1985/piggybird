import { CryptoPlatformView } from "@/components/investimenti/crypto-platform-view";

export const dynamic = "force-dynamic";

export default async function CryptoPage() {
  return (
    <CryptoPlatformView
      platform="Binance"
      title="Crypto Binance"
      emoji="🚀"
      description="prezzi live via Binance API"
      syncProvider="binance"
    />
  );
}
