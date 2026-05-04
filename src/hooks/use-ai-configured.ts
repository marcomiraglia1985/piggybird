"use client";

import { useEffect, useState } from "react";

/**
 * Pre-check on mount: l'utente ha configurato la propria Claude API key
 * in Impostazioni → Funzioni AI? Stati: null = sconosciuto (in flight),
 * true = configurata, false = assente o errore di rete.
 *
 * Usato per gating dei bottoni AI (auto-categorize, AI Review): se false
 * mostriamo CTA "Configura AI" invece del bottone normale.
 */
export function useAiConfigured(): boolean | null {
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/ai/credential")
      .then((r) => r.json())
      .then((d) => setConfigured(!!d.configured))
      .catch(() => setConfigured(false));
  }, []);

  return configured;
}
