"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Loader2 } from "lucide-react";
import { CountryPicker } from "@/components/ui/country-picker";
import {
  FAMILY_STATUSES,
  GOAL_OPTIONS,
  PROFESSIONS,
  TRACKING_EXPERIENCES,
  calcAge,
} from "@/lib/profile-options";

/**
 * Modal welcome al primo avvio: l'utente inserisce nome + email + almeno
 * un paese di residenza (obbligatori). I campi demografici opzionali (età,
 * famiglia, professione, esperienza, obiettivi) sono in fondo, chiaramente
 * marcati come opzionali — l'utente può saltarli e completarli dopo da
 * Impostazioni → Profilo.
 *
 * Mostrato quando server-side `hasCompletedOnboarding()` ritorna false.
 */
export function WelcomeOnboarding() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [countries, setCountries] = useState<string[]>([]);
  const [birthDate, setBirthDate] = useState("");
  const [familyStatus, setFamilyStatus] = useState("");
  const [profession, setProfession] = useState("");
  const [trackingExperience, setTrackingExperience] = useState("");
  const [goals, setGoals] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d) => {
        const p = d.profile ?? {};
        if (p.name) setName(p.name);
        if (p.email) setEmail(p.email);
        if (Array.isArray(p.countries) && p.countries.length > 0) setCountries(p.countries);
        if (p.birthDate) setBirthDate(p.birthDate);
        if (p.familyStatus) setFamilyStatus(p.familyStatus);
        if (p.profession) setProfession(p.profession);
        if (p.trackingExperience) setTrackingExperience(p.trackingExperience);
        if (Array.isArray(p.goals)) setGoals(p.goals);
      })
      .catch(() => {});
  }, []);

  function toggleGoal(g: string) {
    setGoals((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  }

  async function submit() {
    if (!name.trim()) return setError("Il nome è obbligatorio");
    if (!email.trim() || !email.includes("@")) return setError("Email non valida");
    if (countries.length === 0) return setError("Aggiungi almeno un paese di residenza");

    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          countries,
          birthDate,
          familyStatus,
          profession,
          trackingExperience,
          goals,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? "Errore");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          className="w-full max-w-md surface p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        >
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/moneybird-icon-white.png"
              alt="Moneybird"
              className="size-20 object-contain shrink-0"
            />
            <div>
              <h2 className="text-xl font-semibold tracking-tight">
                Benvenuto su Moneybird
              </h2>
              <p className="text-xs text-[var(--fg-muted)] mt-0.5">
                Configura il tuo profilo per iniziare
              </p>
            </div>
          </div>

          <p className="text-[11px] text-[var(--fg-subtle)] bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-2.5 leading-relaxed">
            🔒 <strong>Privacy:</strong> tutti i tuoi dati finanziari restano sul tuo
            Mac. Niente cloud, niente account remoti. I dati qui sotto vengono usati
            per personalizzare la app e identificare te se decidi di mandare uno
            snapshot di debug (opt-in).
          </p>

          {/* === REQUIRED === */}
          <div className="space-y-3">
            <Field label="Il tuo nome *">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Es. Maria Rossi"
                autoFocus
                className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-violet-500/50"
              />
            </Field>

            <Field label="Email *">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="es. nome@esempio.com"
                className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-violet-500/50"
              />
              <p className="text-[10px] text-[var(--fg-subtle)]">
                È il tuo identificativo: ci permette di ricontattarti se mandi uno
                snapshot di debug.
              </p>
            </Field>

            <Field label="Paesi di residenza *">
              <CountryPicker
                value={countries}
                onChange={setCountries}
                placeholder="Cerca un paese europeo…"
              />
            </Field>
          </div>

          {/* === OPTIONAL DEMOGRAPHIC === */}
          <div className="pt-3 mt-2 border-t border-[var(--border)] space-y-3">
            <p className="text-[11px] text-[var(--fg-muted)] uppercase tracking-wider font-medium">
              Aiutaci a capire chi usa Moneybird (opzionale)
            </p>

            <Field label="Data di nascita">
              <input
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-violet-500/50"
              />
              {(() => {
                const age = calcAge(birthDate);
                return age != null ? (
                  <p className="text-[10px] text-[var(--fg-subtle)]">
                    {age} anni — si aggiorna automaticamente.
                  </p>
                ) : null;
              })()}
            </Field>

            <Field label="Stato familiare">
              <div className="grid grid-cols-2 gap-1">
                {FAMILY_STATUSES.map((f) => (
                  <ChoiceButton
                    key={f.value}
                    selected={familyStatus === f.value}
                    onClick={() => setFamilyStatus(familyStatus === f.value ? "" : f.value)}
                  >
                    <span className="mr-1">{f.emoji}</span>
                    {f.label}
                  </ChoiceButton>
                ))}
              </div>
            </Field>

            <Field label="Professione">
              <div className="grid grid-cols-2 gap-1">
                {PROFESSIONS.map((p) => (
                  <ChoiceButton
                    key={p.value}
                    selected={profession === p.value}
                    onClick={() => setProfession(profession === p.value ? "" : p.value)}
                  >
                    <span className="mr-1">{p.emoji}</span>
                    {p.label}
                  </ChoiceButton>
                ))}
              </div>
            </Field>

            <Field label="Esperienza con tracking finanziario">
              <div className="grid grid-cols-2 gap-1">
                {TRACKING_EXPERIENCES.map((t) => (
                  <ChoiceButton
                    key={t.value}
                    selected={trackingExperience === t.value}
                    onClick={() =>
                      setTrackingExperience(trackingExperience === t.value ? "" : t.value)
                    }
                  >
                    <span className="mr-1">{t.emoji}</span>
                    {t.label}
                  </ChoiceButton>
                ))}
              </div>
            </Field>

            <Field label="Cosa cerchi in Moneybird? (multi-select)">
              <div className="grid grid-cols-1 gap-1">
                {GOAL_OPTIONS.map((g) => (
                  <ChoiceButton
                    key={g.value}
                    selected={goals.includes(g.value)}
                    onClick={() => toggleGoal(g.value)}
                  >
                    <span className="mr-1.5">{g.emoji}</span>
                    {g.label}
                  </ChoiceButton>
                ))}
              </div>
            </Field>
          </div>

          {error && (
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg p-2">
              {error}
            </p>
          )}

          <div className="pt-2">
            <button
              onClick={submit}
              disabled={saving || !name.trim() || !email.trim() || countries.length === 0}
              className="w-full h-10 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-sm font-medium shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40 transition-shadow disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Salvo…
                </>
              ) : (
                <>
                  Inizia a usare Moneybird
                  <ChevronRight className="size-4" />
                </>
              )}
            </button>
            <p className="text-[10px] text-[var(--fg-subtle)] text-center mt-2">
              Potrai modificare questi dati in qualsiasi momento da Impostazioni → Profilo.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] uppercase tracking-wider text-[var(--fg-subtle)] font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

function ChoiceButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-8 px-2 rounded-lg text-[11px] border transition-colors text-left ${
        selected
          ? "bg-violet-500/30 border-violet-400/60 text-white font-medium"
          : "bg-[var(--surface-2)] border-[var(--border)] text-[var(--fg-muted)] hover:text-[var(--fg)] hover:border-[var(--border-strong)]"
      }`}
    >
      {children}
    </button>
  );
}
