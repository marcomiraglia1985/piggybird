# 🐤 Piggybird

> Personal finance tracker · Mac desktop app · Beta privata

**Status**: 🚧 beta chiusa con un piccolo gruppo di tester. Non è ancora un prodotto pubblico.

## Sei un tester invitato?

Hai ricevuto l'app via link diretto. Per installarla scarica l'ultimo `.dmg` da **[Releases](https://github.com/marcomiraglia1985/piggybird/releases/latest)** e segui le istruzioni della release (incluso il workaround `xattr -cr` per Gatekeeper, finché l'app non sarà notarizzata Apple).

Aggiornamenti: la app rileva nuove versioni e mostra un badge verde in sidebar. Click → "Scarica" apre il browser sul download.

## Sei capitato qui per caso?

Il repo è temporaneamente pubblico solo per permettere ai beta tester di scaricare i `.dmg` da GitHub Releases senza bisogno di account. Non è un prodotto open-source né un'offerta commerciale: è un side project personale, in fase di test su pochissimi utenti.

A fine beta il repo tornerà privato.

Se ti interessa il progetto, scrivimi: [@marcomiraglia1985](https://github.com/marcomiraglia1985) — niente promesse di accesso, dipende dagli slot disponibili.

## Cosa fa

App desktop macOS che traccia conti correnti, risparmi, investimenti (stock + crypto), immobili e spese condivise. Tutti i dati restano sul Mac dell'utente, niente cloud.

## Tech stack (per i curiosi)

- Next.js 16 + React 19 + Turbopack
- Prisma 7 + better-sqlite3 (DB locale)
- Tauri 2 (wrap macOS)
- TailwindCSS
- Sentry (error tracking)
- Anthropic Claude API (feature AI on-demand, BYOK)

---

⚠️ **Nessuna licenza pubblica**. Codice fornito as-is per finalità di beta testing privato. Vietata la redistribuzione del binario.
