"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Check,
  User as UserIcon,
  Mail,
  Globe,
  Pencil,
  X,
  Cake,
  Users as UsersIcon,
  Briefcase,
  History,
  Target,
  Brain,
  ChevronRight,
} from "lucide-react";
import { CountryPicker } from "@/components/ui/country-picker";
import { flagFor } from "@/lib/countries";
import {
  CHILDREN_COUNT_OPTIONS,
  FAMILY_STATUSES,
  GOAL_OPTIONS,
  HOUSING_TYPE_OPTIONS,
  MONTHLY_INCOME_OPTIONS,
  PROFESSIONS,
  RETIREMENT_AGE_OPTIONS,
  RISK_TOLERANCE_OPTIONS,
  TRACKING_EXPERIENCES,
  calcAge,
} from "@/lib/profile-options";

/**
 * Sezione "Profilo" in /impostazioni: read-only di default. Click su "Modifica"
 * per sbloccare gli input. Auto-salvano on blur. Campi obbligatori (nome, email,
 * paesi) e opzionali demografici (età, famiglia, professione, esperienza, goals).
 */
export function ProfiloSection() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [countries, setCountries] = useState<string[]>([]);
  const [city, setCity] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [familyStatus, setFamilyStatus] = useState("");
  const [profession, setProfession] = useState("");
  const [trackingExperience, setTrackingExperience] = useState("");
  const [goals, setGoals] = useState<string[]>([]);
  const [monthlyIncome, setMonthlyIncome] = useState("");
  const [childrenCount, setChildrenCount] = useState("");
  const [retirementAge, setRetirementAge] = useState("");
  const [riskTolerance, setRiskTolerance] = useState("");
  const [housingType, setHousingType] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  // Archetipo personality test (lazy fetch — opzionale, non blocca render)
  const [archetype, setArchetype] = useState<{
    id: string;
    name: string;
    emoji: string;
    bird: string;
    tagline: string;
  } | null>(null);

  useEffect(() => {
    fetch("/api/personality")
      .then((r) => r.json())
      .then((d) => {
        if (d?.completed && d?.archetype) {
          setArchetype({
            id: d.archetype.id,
            name: d.archetype.name,
            emoji: d.archetype.emoji,
            bird: d.archetype.bird,
            tagline: d.archetype.tagline,
          });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d) => {
        const p = d.profile ?? {};
        setName(p.name ?? "");
        setEmail(p.email ?? "");
        setCountries(Array.isArray(p.countries) ? p.countries : []);
        setCity(p.city ?? "");
        setBirthDate(p.birthDate ?? "");
        setFamilyStatus(p.familyStatus ?? "");
        setProfession(p.profession ?? "");
        setTrackingExperience(p.trackingExperience ?? "");
        setGoals(Array.isArray(p.goals) ? p.goals : []);
        setMonthlyIncome(p.monthlyIncome ?? "");
        setChildrenCount(p.childrenCount ?? "");
        setRetirementAge(p.retirementAge ?? "");
        setRiskTolerance(p.riskTolerance ?? "");
        setHousingType(p.housingType ?? "");
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  async function persist(patch: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? "Errore");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setSaving(false);
    }
  }

  function updateCountries(next: string[]) {
    setCountries(next);
    persist({ countries: next });
  }

  function selectOne(
    current: string,
    value: string,
    setter: (v: string) => void,
    key: string,
  ) {
    const next = current === value ? "" : value;
    setter(next);
    persist({ [key]: next });
  }

  function toggleGoal(g: string) {
    const next = goals.includes(g) ? goals.filter((x) => x !== g) : [...goals, g];
    setGoals(next);
    persist({ goals: next });
  }

  // Helpers per il read-only display
  const familyLabel = FAMILY_STATUSES.find((f) => f.value === familyStatus);
  const professionLabel = PROFESSIONS.find((p) => p.value === profession);
  const incomeLabel = MONTHLY_INCOME_OPTIONS.find((o) => o.value === monthlyIncome);
  const childrenLabel = CHILDREN_COUNT_OPTIONS.find((o) => o.value === childrenCount);
  const retirementLabel = RETIREMENT_AGE_OPTIONS.find((o) => o.value === retirementAge);
  const riskLabel = RISK_TOLERANCE_OPTIONS.find((o) => o.value === riskTolerance);
  const housingLabel = HOUSING_TYPE_OPTIONS.find((o) => o.value === housingType);
  const experienceLabel = TRACKING_EXPERIENCES.find((t) => t.value === trackingExperience);
  const goalLabels = GOAL_OPTIONS.filter((g) => goals.includes(g.value));

  return (
    <div className="surface p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium inline-flex items-center gap-1.5">
          <UserIcon className="size-3.5 text-violet-400" />
          Il tuo profilo
        </h3>
        <div className="flex items-center gap-2">
          {saving && <span className="text-[10px] text-[var(--fg-subtle)]">salvo…</span>}
          {saved && (
            <span className="text-[10px] inline-flex items-center gap-0.5 text-emerald-400">
              <Check className="size-3" /> salvato
            </span>
          )}
          <button
            type="button"
            onClick={() => setEditMode((m) => !m)}
            className="h-7 px-2.5 rounded-md bg-[var(--surface-2)] border border-[var(--border)] text-[11px] inline-flex items-center gap-1 hover:border-[var(--border-strong)] transition-colors"
          >
            {editMode ? (
              <>
                <X className="size-3" />
                Fatto
              </>
            ) : (
              <>
                <Pencil className="size-3" />
                Modifica
              </>
            )}
          </button>
        </div>
      </div>

      {!editMode ? (
        // === READ-ONLY VIEW ===
        <div className="space-y-1.5 text-sm">
          <Row icon={<UserIcon className="size-3" />} label="Nome">
            {loaded ? name || <Empty /> : <Loading />}
          </Row>
          <Row icon={<Mail className="size-3" />} label="Email">
            {loaded ? email || <Empty /> : <Loading />}
          </Row>
          <Row icon={<Globe className="size-3" />} label="Paesi">
            {loaded ? (
              countries.length > 0 ? (
                <span className="inline-flex items-center gap-1 flex-wrap">
                  {countries.map((c) => (
                    <span key={c} className="inline-flex items-center gap-0.5">
                      <span className="text-base leading-none">{flagFor(c)}</span>
                      {c}
                    </span>
                  ))}
                </span>
              ) : (
                <Empty />
              )
            ) : (
              <Loading />
            )}
          </Row>
          <Row icon={<Globe className="size-3" />} label="Città">
            {loaded ? city ? <span>{city}</span> : <Empty /> : <Loading />}
          </Row>
          <Row icon={<Cake className="size-3" />} label="Età">
            {loaded ? (
              (() => {
                const age = calcAge(birthDate);
                return age != null ? (
                  <span>
                    {age} anni{" "}
                    <span className="text-[var(--fg-subtle)] text-xs">
                      ({new Date(birthDate).toLocaleDateString("it-IT", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })})
                    </span>
                  </span>
                ) : (
                  <Empty />
                );
              })()
            ) : (
              <Loading />
            )}
          </Row>
          <Row icon={<UsersIcon className="size-3" />} label="Famiglia">
            {loaded ? (
              familyLabel ? (
                <>
                  <span className="mr-1">{familyLabel.emoji}</span>
                  {familyLabel.label}
                </>
              ) : (
                <Empty />
              )
            ) : (
              <Loading />
            )}
          </Row>
          <Row icon={<Briefcase className="size-3" />} label="Lavoro">
            {loaded ? (
              professionLabel ? (
                <>
                  <span className="mr-1">{professionLabel.emoji}</span>
                  {professionLabel.label}
                </>
              ) : (
                <Empty />
              )
            ) : (
              <Loading />
            )}
          </Row>
          <Row icon={<History className="size-3" />} label="Esperienza">
            {loaded ? (
              experienceLabel ? (
                <>
                  <span className="mr-1">{experienceLabel.emoji}</span>
                  {experienceLabel.label}
                </>
              ) : (
                <Empty />
              )
            ) : (
              <Loading />
            )}
          </Row>
          <Row icon={<Target className="size-3" />} label="Obiettivi">
            {loaded ? (
              goalLabels.length > 0 ? (
                <span className="inline-flex items-center gap-1 flex-wrap">
                  {goalLabels.map((g) => (
                    <span key={g.value} className="inline-flex items-center gap-0.5">
                      <span>{g.emoji}</span>
                      {g.label}
                    </span>
                  ))}
                </span>
              ) : (
                <Empty />
              )
            ) : (
              <Loading />
            )}
          </Row>
          <Row icon={<UserIcon className="size-3" />} label="Reddito">
            {loaded ? (
              incomeLabel ? <>💶 {incomeLabel.label}</> : <Empty />
            ) : <Loading />}
          </Row>
          <Row icon={<UsersIcon className="size-3" />} label="Figli">
            {loaded ? (
              childrenLabel ? (
                <><span className="mr-1">{childrenLabel.emoji}</span>{childrenLabel.label}</>
              ) : <Empty />
            ) : <Loading />}
          </Row>
          <Row icon={<Cake className="size-3" />} label="Pensione">
            {loaded ? (
              retirementLabel ? (
                <><span className="mr-1">{retirementLabel.emoji}</span>{retirementLabel.label}</>
              ) : <Empty />
            ) : <Loading />}
          </Row>
          <Row icon={<Target className="size-3" />} label="Rischio">
            {loaded ? (
              riskLabel ? (
                <><span className="mr-1">{riskLabel.emoji}</span>{riskLabel.label}</>
              ) : <Empty />
            ) : <Loading />}
          </Row>
          <Row icon={<Globe className="size-3" />} label="Casa">
            {loaded ? (
              housingLabel ? (
                <><span className="mr-1">{housingLabel.emoji}</span>{housingLabel.label}</>
              ) : <Empty />
            ) : <Loading />}
          </Row>
        </div>
      ) : (
        // === EDIT VIEW ===
        <div className="space-y-3">
          <EditField label="Nome" icon={<UserIcon className="size-3" />}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name.trim() && persist({ name: name.trim() })}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              disabled={!loaded}
              placeholder="Il tuo nome"
              className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-violet-500/50 disabled:opacity-50"
            />
          </EditField>

          <EditField label="Email" icon={<Mail className="size-3" />}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => email.trim() && persist({ email: email.trim() })}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              disabled={!loaded}
              placeholder="es. nome@esempio.com"
              className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-violet-500/50 disabled:opacity-50"
            />
          </EditField>

          <EditField label="Paesi di residenza" icon={<Globe className="size-3" />}>
            <CountryPicker
              value={countries}
              onChange={updateCountries}
              placeholder="Cerca un paese europeo…"
            />
          </EditField>

          <EditField label="Città" icon={<Globe className="size-3" />}>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              onBlur={() => persist({ city: city.trim() })}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              placeholder="Es. Milano, Paris, Berlin…"
              maxLength={64}
              className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-violet-500/50"
            />
          </EditField>

          <EditField label="Data di nascita" icon={<Cake className="size-3" />}>
            <input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              onBlur={() => persist({ birthDate })}
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
          </EditField>

          <EditField label="Stato familiare" icon={<UsersIcon className="size-3" />}>
            <div className="grid grid-cols-2 gap-1">
              {FAMILY_STATUSES.map((f) => (
                <ChoiceButton
                  key={f.value}
                  selected={familyStatus === f.value}
                  onClick={() =>
                    selectOne(familyStatus, f.value, setFamilyStatus, "familyStatus")
                  }
                >
                  <span className="mr-1">{f.emoji}</span>
                  {f.label}
                </ChoiceButton>
              ))}
            </div>
          </EditField>

          <EditField label="Professione" icon={<Briefcase className="size-3" />}>
            <div className="grid grid-cols-2 gap-1">
              {PROFESSIONS.map((p) => (
                <ChoiceButton
                  key={p.value}
                  selected={profession === p.value}
                  onClick={() =>
                    selectOne(profession, p.value, setProfession, "profession")
                  }
                >
                  <span className="mr-1">{p.emoji}</span>
                  {p.label}
                </ChoiceButton>
              ))}
            </div>
          </EditField>

          <EditField
            label="Esperienza con tracking finanziario"
            icon={<History className="size-3" />}
          >
            <div className="grid grid-cols-2 gap-1">
              {TRACKING_EXPERIENCES.map((t) => (
                <ChoiceButton
                  key={t.value}
                  selected={trackingExperience === t.value}
                  onClick={() =>
                    selectOne(
                      trackingExperience,
                      t.value,
                      setTrackingExperience,
                      "trackingExperience",
                    )
                  }
                >
                  <span className="mr-1">{t.emoji}</span>
                  {t.label}
                </ChoiceButton>
              ))}
            </div>
          </EditField>

          <EditField
            label="Cosa cerchi in Piggybird? (multi-select)"
            icon={<Target className="size-3" />}
          >
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
          </EditField>

          <EditField label="Reddito mensile" icon={<UserIcon className="size-3" />}>
            <div className="grid grid-cols-2 gap-1">
              {MONTHLY_INCOME_OPTIONS.map((o) => (
                <ChoiceButton
                  key={o.value}
                  selected={monthlyIncome === o.value}
                  onClick={() => {
                    const next = monthlyIncome === o.value ? "" : o.value;
                    setMonthlyIncome(next);
                    persist({ monthlyIncome: next });
                  }}
                >
                  {o.label}
                </ChoiceButton>
              ))}
            </div>
          </EditField>

          <EditField label="Numero di figli" icon={<UsersIcon className="size-3" />}>
            <div className="grid grid-cols-4 gap-1">
              {CHILDREN_COUNT_OPTIONS.map((o) => (
                <ChoiceButton
                  key={o.value}
                  selected={childrenCount === o.value}
                  onClick={() => {
                    const next = childrenCount === o.value ? "" : o.value;
                    setChildrenCount(next);
                    persist({ childrenCount: next });
                  }}
                >
                  <span className="mr-1">{o.emoji}</span>
                  {o.label}
                </ChoiceButton>
              ))}
            </div>
          </EditField>

          <EditField label="Età pensionamento desiderata" icon={<Cake className="size-3" />}>
            <div className="grid grid-cols-3 gap-1">
              {RETIREMENT_AGE_OPTIONS.map((o) => (
                <ChoiceButton
                  key={o.value}
                  selected={retirementAge === o.value}
                  onClick={() => {
                    const next = retirementAge === o.value ? "" : o.value;
                    setRetirementAge(next);
                    persist({ retirementAge: next });
                  }}
                >
                  <span className="mr-1">{o.emoji}</span>
                  {o.label}
                </ChoiceButton>
              ))}
            </div>
          </EditField>

          <EditField label="Tolleranza rischio investimenti" icon={<Target className="size-3" />}>
            <div className="grid grid-cols-3 gap-1">
              {RISK_TOLERANCE_OPTIONS.map((o) => (
                <ChoiceButton
                  key={o.value}
                  selected={riskTolerance === o.value}
                  onClick={() => {
                    const next = riskTolerance === o.value ? "" : o.value;
                    setRiskTolerance(next);
                    persist({ riskTolerance: next });
                  }}
                >
                  <span className="mr-1">{o.emoji}</span>
                  {o.label}
                </ChoiceButton>
              ))}
            </div>
          </EditField>

          <EditField label="Tipo abitazione attuale" icon={<Globe className="size-3" />}>
            <div className="grid grid-cols-2 gap-1">
              {HOUSING_TYPE_OPTIONS.map((o) => (
                <ChoiceButton
                  key={o.value}
                  selected={housingType === o.value}
                  onClick={() => {
                    const next = housingType === o.value ? "" : o.value;
                    setHousingType(next);
                    persist({ housingType: next });
                  }}
                >
                  <span className="mr-1">{o.emoji}</span>
                  {o.label}
                </ChoiceButton>
              ))}
            </div>
          </EditField>
        </div>
      )}

      {error && (
        <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg p-2">
          {error}
        </p>
      )}

      <Link
        href="/impostazioni/personality"
        className="group flex items-center gap-3 rounded-lg p-3 mt-2 bg-gradient-to-br from-violet-500/[0.14] to-indigo-500/[0.06] border border-violet-500/40 hover:from-violet-500/[0.22] hover:to-indigo-500/[0.10] hover:border-violet-500/60 transition-colors"
      >
        {archetype ? (
          <>
            <span className="size-10 rounded-lg bg-violet-500/25 border border-violet-500/40 flex items-center justify-center shrink-0 text-2xl leading-none">
              {archetype.emoji}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-violet-800 dark:text-violet-100">
                Sei {archetype.name}{" "}
                <span className="font-normal opacity-70">({archetype.bird})</span>
              </div>
              <div className="text-[10px] text-violet-900/75 dark:text-violet-200/75 mt-0.5 italic leading-snug">
                &quot;{archetype.tagline}&quot;
              </div>
            </div>
          </>
        ) : (
          <>
            <span className="size-8 rounded-lg bg-violet-500/25 border border-violet-500/40 flex items-center justify-center shrink-0">
              <Brain className="size-4 text-violet-700 dark:text-violet-200" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-violet-800 dark:text-violet-100">
                Take a personality test
              </div>
              <div className="text-[10px] text-violet-900/75 dark:text-violet-200/75 mt-0.5 leading-snug">
                Capisci che tipo di persona finanziaria sei. Personalizza la AI di
                Piggybird sul tuo modo di pensare ai soldi.
              </div>
            </div>
          </>
        )}
        <ChevronRight className="size-4 text-violet-700 dark:text-violet-300 group-hover:translate-x-0.5 transition-transform" />
      </Link>
    </div>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 py-0.5">
      <span className="text-[var(--fg-subtle)] inline-flex items-center gap-1 w-20 shrink-0 text-[11px] uppercase tracking-wider mt-0.5">
        {icon}
        {label}
      </span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function Empty() {
  return <span className="text-[var(--fg-subtle)] italic">non impostato</span>;
}

function Loading() {
  return <span className="text-[var(--fg-subtle)]">…</span>;
}

function EditField({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] uppercase tracking-wider text-[var(--fg-subtle)] font-medium inline-flex items-center gap-1.5">
        {icon}
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
