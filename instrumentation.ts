import * as Sentry from "@sentry/nextjs";
import pkg from "./package.json";

const APP_RELEASE = `piggybird@${pkg.version}`;

/**
 * Next.js instrumentation hook: chiamato automaticamente all'avvio del runtime
 * (Node + Edge). Inizializza Sentry per error tracking server-side.
 *
 * Client-side init: vedi `instrumentation-client.ts`.
 *
 * Privacy: niente body request/response inviato di default; user context
 * (email) viene settato lato client quando il profilo è caricato.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Boot: assicura che APP_MASTER_KEY sia disponibile. Su build distribuita
    // (no env var settata), la chiave viene generata al primo avvio e
    // salvata nel DB locale dell'utente. PRIMA del check Sentry — la master
    // key è critical-path per encrypt/decrypt delle API credentials, anche
    // su build senza Sentry (es. dev sandbox).
    try {
      const { ensureMasterKey } = await import("./src/lib/crypto");
      await ensureMasterKey();
    } catch (e) {
      console.error("[instrumentation] ensureMasterKey failed at boot:", e);
      // Defensive retry alla prima encrypt/decrypt (vedi i singoli route handler)
    }
  }

  if (!process.env.SENTRY_DSN) return; // skip Sentry se non configurato

  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      release: APP_RELEASE,
      // Più basso = meno noise; in beta vogliamo TUTTI gli errori reali.
      tracesSampleRate: 0.01,
      // Ignora errori innocui che non sono bug
      ignoreErrors: [
        "ECONNRESET",
        "AbortError",
      ],
      beforeSend(event) {
        // Strip query string da URL (potrebbe contenere token / query con dati personali)
        if (event.request?.url) {
          event.request.url = event.request.url.split("?")[0];
        }
        // Mai inviare il body delle request (può contenere dati finanziari /
        // settings con email / token utente)
        if (event.request) {
          delete event.request.data;
          delete event.request.cookies;
          if (event.request.headers) {
            delete event.request.headers["authorization"];
            delete event.request.headers["cookie"];
          }
        }
        return event;
      },
    });

    // Setta user context per gli errori server-side. Letto dal DB UNA VOLTA
    // all'avvio del server (basta perché l'utente è single-user-per-install).
    // Se cambia profilo, basta restart del server (in dev: hot reload Next).
    // Lazy require per evitare circular import + skip se DB non pronto.
    try {
      const { getUserProfile } = await import("./src/lib/user-profile");
      const profile = await getUserProfile();
      if (profile.email) {
        Sentry.setUser({
          email: profile.email,
          username: profile.name || profile.email.split("@")[0],
        });
      }
    } catch {
      // DB non raggiungibile o profilo vuoto — skip, errori arriveranno anonimi
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      release: APP_RELEASE,
      tracesSampleRate: 0.01,
    });
  }
}

// Hook ufficiale Next.js 15+ per catturare errori server-side React.
export const onRequestError = Sentry.captureRequestError;
