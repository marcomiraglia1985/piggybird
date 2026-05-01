import { Info } from "lucide-react";

/**
 * Disclaimer obbligatorio sotto ogni output di Moneybird Insights.
 *
 * Posizionamento legale: tiene la feature fuori dalla definizione MiFID II di
 * "investment advice" (Art. 4(1)(4)) — recommendation specifica su strumenti
 * specifici a una persona specifica. "Insights" è educativo/personalizzazione,
 * non advice.
 *
 * NON modificare il testo senza una revisione legale: il wording specifico
 * "non fornisce consulenza finanziaria" + indicazione di consulente abilitato
 * è il meccanismo di safe-harbor.
 */
export const AI_DISCLAIMER =
  "Moneybird Insights non fornisce consulenza finanziaria. Le osservazioni sono educative e basate sui tuoi dati locali — per decisioni di investimento consulta un consulente abilitato.";

export function AiDisclaimer({ className }: { className?: string }) {
  return (
    <div
      className={`flex items-start gap-2 text-[10px] text-[var(--fg-subtle)] leading-relaxed border-t border-[var(--border)]/50 pt-2 mt-2 ${className ?? ""}`}
    >
      <Info className="size-3 shrink-0 mt-0.5" />
      <span>{AI_DISCLAIMER}</span>
    </div>
  );
}
