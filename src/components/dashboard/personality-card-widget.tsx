import Link from "next/link";
import { Compass, ArrowUpRight, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { PersonalityProfile } from "@/lib/personality";

/**
 * Mini card "Profilo Money" sulla dashboard. Due stati:
 *  - Test NON completato → CTA per iniziare il test
 *  - Test completato → mostra archetipo (bird/emoji + name + tagline) e
 *    link a /impostazioni/personality dove vivono le insights AI complete
 *
 * Server component: niente fetch lato client, niente flicker.
 */
export function PersonalityCardWidget({
  profile,
}: {
  profile: PersonalityProfile;
}) {
  const isDone = profile.completed && profile.archetype != null;

  return (
    <Card className="flex flex-col gap-3 h-full">
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold inline-flex items-center gap-1.5">
          <Compass className="size-3.5 text-violet-400" />
          Profilo Money
        </h3>
        <Sparkles className="size-3 text-orange-400" />
      </header>

      {isDone && profile.archetype ? (
        <div className="flex-1 flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <span className="text-3xl shrink-0">{profile.archetype.emoji}</span>
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">
                {profile.archetype.bird}
              </div>
              <div className="text-[11px] text-[var(--fg-subtle)] truncate">
                {profile.archetype.name}
              </div>
            </div>
          </div>
          {profile.archetype.tagline && (
            <p className="text-xs italic text-[var(--fg-muted)] leading-snug line-clamp-2">
              &ldquo;{profile.archetype.tagline}&rdquo;
            </p>
          )}
          <div className="mt-auto pt-1">
            <Link
              href="/impostazioni/personality"
              className="inline-flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300"
            >
              Vedi profilo
              <ArrowUpRight className="size-3" />
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-3">
          <p className="text-xs text-[var(--fg-muted)] leading-relaxed">
            Scopri il tuo archetipo finanziario in 5 minuti. Il test combina
            assi comportamentali, money scripts e biases.
          </p>
          <div className="mt-auto">
            <Link
              href="/impostazioni/personality"
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-xs font-medium shadow-md shadow-violet-500/20 hover:shadow-violet-500/40"
            >
              Inizia il test
              <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
        </div>
      )}
    </Card>
  );
}
