import { CryptoPlatformView } from "@/components/investimenti/crypto-platform-view";

export const dynamic = "force-dynamic";

export default async function CryptoRevolutPage() {
  return (
    <CryptoPlatformView
      platform="Revolut X"
      title="Crypto Revolut X"
      emoji="🚀"
      description="sync via Revolut X public API (Ed25519)"
      syncProvider="revolut-x"
    />
  );
}
