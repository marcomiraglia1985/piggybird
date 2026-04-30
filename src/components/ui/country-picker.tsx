"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { COUNTRIES, flagFor, searchCountries } from "@/lib/countries";

/**
 * Multi-select searchable per paesi. Mostra chip con flag + nome, dropdown
 * filtrato sotto l'input.
 *
 * Storage: array di nomi italiani (es. ["Italia", "Francia"]). Per nomi
 * legacy non presenti nel set curato (es. utenti pre-picker), il chip mostra
 * 🌐 al posto della flag — non si rompe.
 *
 * UX:
 *   - input + freccia "▾" ad apertura dropdown
 *   - typing filtra (matcha inizio parola del nome o codice ISO)
 *   - max ~6 risultati visibili (scroll dentro)
 *   - click su option aggiunge alla lista
 *   - click ⨯ su chip rimuove
 *   - paesi già selezionati esclusi dalla dropdown
 */
export function CountryPicker({
  value,
  onChange,
  placeholder = "Cerca un paese…",
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Chiude il dropdown quando si clicca fuori
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function add(name: string) {
    if (value.includes(name)) return;
    onChange([...value, name]);
    setQuery("");
    // Tieni aperta la dropdown per add multipli rapidi
  }

  function remove(name: string) {
    onChange(value.filter((v) => v !== name));
  }

  const results = searchCountries(query, value).slice(0, 80);

  return (
    <div ref={wrapperRef} className="relative">
      {/* Chip selezionate */}
      <div className="flex items-center gap-1 flex-wrap mb-1.5 min-h-[24px]">
        {value.length === 0 && (
          <span className="text-[11px] text-[var(--fg-subtle)] italic">
            Nessun paese selezionato
          </span>
        )}
        {value.map((c) => (
          <span
            key={c}
            className="inline-flex items-center gap-1 h-6 pl-2 pr-0.5 rounded-full bg-violet-500/40 border border-violet-400/60 text-[11px] font-medium text-white"
          >
            <span className="text-base leading-none">{flagFor(c)}</span>
            {c}
            <button
              type="button"
              onClick={() => remove(c)}
              className="size-4 inline-flex items-center justify-center rounded-full hover:bg-violet-300/30 text-white"
              aria-label={`Rimuovi ${c}`}
            >
              <X className="size-2.5" />
            </button>
          </span>
        ))}
      </div>

      {/* Input + dropdown */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "Enter" && results.length > 0) {
              e.preventDefault();
              add(results[0].name);
            }
          }}
          placeholder={placeholder}
          className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] pl-3 pr-8 text-sm focus:outline-none focus:border-violet-500/50"
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="absolute right-1 top-1/2 -translate-y-1/2 size-7 inline-flex items-center justify-center text-[var(--fg-muted)] hover:text-[var(--fg)]"
          aria-label="Apri lista paesi"
        >
          ▾
        </button>

        {open && results.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1 z-10 max-h-[240px] overflow-y-auto rounded-lg bg-[var(--surface)] border border-[var(--border)] shadow-xl shadow-black/40">
            {results.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => add(c.name)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-violet-500/15 transition-colors"
              >
                <span className="text-base leading-none">{c.flag}</span>
                <span className="flex-1">{c.name}</span>
                <span className="text-[10px] text-[var(--fg-subtle)] tabular-nums">
                  {c.code}
                </span>
              </button>
            ))}
          </div>
        )}

        {open && results.length === 0 && query.trim() && (
          <div className="absolute left-0 right-0 top-full mt-1 z-10 rounded-lg bg-[var(--surface)] border border-[var(--border)] shadow-xl shadow-black/40 px-3 py-3 text-xs text-[var(--fg-subtle)]">
            Nessun paese trovato per &ldquo;{query}&rdquo;.
            {COUNTRIES.length} paesi disponibili — prova un altro termine.
          </div>
        )}
      </div>
    </div>
  );
}
