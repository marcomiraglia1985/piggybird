# Piggybird — Build & Distribuzione v0.1.0

## Stato Tauri/.dmg

⚠️ **Architettura attuale incompatibile con `output: "export"`** richiesto da Tauri (`frontendDist: "../out"`).

L'app usa Prisma + better-sqlite3 + API routes server-side per ogni operazione (queries, mutations, AI calls). Una static export (Next.js `output: "export"`) disattiverebbe le API routes — l'app non funzionerebbe.

**Tre vie per shippare desktop:**

1. **Tauri sidecar con Node bundled** (corretto ma complesso)
   - Embeddi Node binary + `next start` standalone in Tauri sidecar
   - Tauri WebView punta a `localhost:3000` servito dal sidecar
   - Richiede `tauri-plugin-shell` + bundling Node + ~1-2 giorni setup
   - Risultato: vero `.dmg` self-contained

2. **Refactor a Tauri commands** (lavoro grosso)
   - Riscrivi tutte le API routes come Tauri Rust commands invocate via `@tauri-apps/api/core`
   - Prisma → SQL diretto da Rust
   - Settimane di lavoro

3. **Distribuzione "run from source"** (pragmatico per beta v0.1.0)
   - Beta tester: `git clone` o ricevono zip
   - `npm install && npm run dev` → apre browser su localhost:3000
   - NO .dmg ma NO architectural rework
   - **Consigliato per v0.1.0** finché non decidi tra opzione 1 e 2

---

## Env strategy

| Var | Dev (.env) | Beta build distribuito | Note |
|---|---|---|---|
| `DATABASE_URL` | ✅ `file:./dev.db` | ✅ relativo a app data dir | Sempre presente |
| `APP_MASTER_KEY` | ✅ baked | ❌ **NON baked** | Auto-generata al primo avvio per ogni utente (vedi `crypto.ts → ensureMasterKey`) e salvata in `Setting.system.masterKey` |
| `BETA_AI_FALLBACK_KEY` | ⚠️ **MANCA** in tuo .env | ✅ baked | Tua chiave Anthropic per universal-parser AI fallback. Aggiungi a .env subito + bake al build |
| `GITHUB_TOKEN` | ✅ baked | ⚠️ a tua scelta | Per snapshot debug + notify nuovi template. Se baked: amici beta possono creare issue/snapshot con tuo PAT (rischio compromissione). Per beta chiusa di amici fidati: OK; alternativa = backend forwarding |
| `GITHUB_REPO` | ✅ baked | ✅ baked | `marcomiraglia1985/piggybird` — pubblico OK |
| `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` | ✅ baked | ✅ baked | DSN sono pubblici per design |
| `SENTRY_AUTH_TOKEN` | ✅ baked | ❌ **NON baked** | Solo build-time per source maps upload |
| `SENTRY_ORG_SLUG` + `SENTRY_PROJECT_SLUG` | ✅ baked | ❌ NON baked | Solo build-time |
| `PIGGYBIRD_STATS_URL` | ✅ baked | ✅ baked | URL pubblico worker Cloudflare |

### Action items prima del build

1. **Aggiungi `BETA_AI_FALLBACK_KEY` a `.env`** (è la tua Anthropic key)
2. **Crea `.env.production`** con SOLO le var "✅ baked beta" (mai committare)
3. **Considera GitHub forwarding** se non vuoi che amici beta abbiano accesso al tuo PAT via reverse engineering del bundle

---

## Pre-flight checklist

### Code health
- [x] `npx tsc --noEmit` — errori residui in chart Recharts/dnd-kit (non-blocking, ignorati via `next.config.ts → typescript.ignoreBuildErrors: true`)
- [x] `npm run dev` boot OK
- [ ] `npm run build` — testare quando architettura finale è decisa

### Privacy / Universal app
- [x] Copyright + authors → "Team Panino"
- [x] Placeholder profile generic ("Il tuo nome")
- [x] Prisma schema comments scrubbed
- [x] Personality archetypes comments scrubbed
- [x] CSV parsers neutrali (BNP/Fineco/Revolut/N26 — no merchant rules)
- [x] BETA_AI_FALLBACK_KEY mai espose lato client (no `NEXT_PUBLIC_` prefix)

### Backend
- [x] Personality test 5D + 12 bird archetypes
- [x] Backend stats (Cloudflare Worker) live + funzionante
- [x] Test versioning (TEST_VERSION constant + banner upgrade)

### Beta-test setup
- [x] Welcome onboarding multi-step
- [x] Sentry error tracking
- [x] Snapshot debug uploader (button bottom-right)
- [ ] BETA_AI_FALLBACK_KEY settato

---

## Post-decision (Tauri)

Quando scegli tra opzioni 1/2/3 sopra, eseguire i comandi corrispondenti.

Per opzione **1 (sidecar)** servirà:
```bash
# Build Next.js standalone server
npm run build

# Tauri build con sidecar config
npm run tauri:build
# → src-tauri/target/release/bundle/dmg/Piggybird_0.1.0_*.dmg
```

Per opzione **3 (run from source)** Marco distribuisce zip della repo + README:
```bash
# Beta tester:
git clone <repo>
cd app
npm install
npm run dev
# Apri http://localhost:3000
```
