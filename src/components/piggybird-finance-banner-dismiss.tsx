"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";

/**
 * Bottone dismiss per il banner Piggybird Finance. Salva un Setting per il
 * mese corrente così che il banner non riappaia fino al mese successivo.
 */
export function PiggybirdFinanceBannerDismiss({
  dismissedKey,
}: {
  dismissedKey: string;
}) {
  const [hidden, setHidden] = useState(false);
  const router = useRouter();

  async function dismiss() {
    setHidden(true);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: dismissedKey, value: "1" }),
      });
      router.refresh();
    } catch {
      setHidden(false);
    }
  }

  if (hidden) return null;
  return (
    <button
      type="button"
      onClick={dismiss}
      title="Nascondi fino al prossimo numero"
      aria-label="Nascondi avviso"
      className="shrink-0 size-7 inline-flex items-center justify-center rounded text-[#8a7a5e] hover:text-[#0e0a06] hover:bg-[#c8b890]/30 transition-colors"
    >
      <X className="size-4" />
    </button>
  );
}
