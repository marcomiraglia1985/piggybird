import * as Sentry from "@sentry/nextjs";

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
  if (!process.env.SENTRY_DSN) return; // skip se non configurato

  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      // Più basso = meno noise; in beta vogliamo TUTTI gli errori reali.
      tracesSampleRate: 0.1,
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
      tracesSampleRate: 0.1,
    });
  }
}

// Hook ufficiale Next.js 15+ per catturare errori server-side React.
export const onRequestError = Sentry.captureRequestError;
