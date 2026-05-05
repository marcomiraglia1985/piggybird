import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * CTA "Configura AI" usato come fallback quando una feature AI è abilitata
 * ma l'utente non ha (ancora) configurato la sua Claude API key. Linka a
 * Impostazioni → Funzioni AI con tooltip esplicito.
 */
export function ConfigureAiCta({
  title = "Configura la tua API key in Impostazioni → Funzioni AI",
  className,
}: {
  title?: string;
  className?: string;
}) {
  return (
    <a
      href="/impostazioni#ai"
      title={title}
      className={cn(
        "h-9 px-3 inline-flex items-center gap-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-xs font-medium hover:border-[var(--border-strong)]",
        className,
      )}
    >
      <Sparkles className="size-3.5 text-orange-400" />
      Configura AI
    </a>
  );
}
