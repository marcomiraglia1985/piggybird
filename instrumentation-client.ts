import * as Sentry from "@sentry/nextjs";
import pkg from "./package.json";

const APP_RELEASE = `piggybird@${pkg.version}`;

/**
 * Sentry init lato browser. Viene caricato automaticamente da Next.js
 * (file convention 15+). Cattura errori JS client-side (React render errors,
 * promise rejection, network errors).
 *
 * User context (email) viene settato dal componente `SentryUserContext`
 * quando il profilo è caricato.
 */
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    release: APP_RELEASE,
    tracesSampleRate: 0.01,
    // Replay disabilitato per privacy: registrerebbe DOM con dati finanziari
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    ignoreErrors: [
      // Errori innocui delle estensioni browser
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      "Non-Error promise rejection captured",
      // Aborti utente (navigation away mid-fetch)
      "AbortError",
      "The user aborted a request",
    ],
    beforeSend(event) {
      // Scrub URL query string (potenzialmente contiene id / token)
      if (event.request?.url) {
        try {
          const u = new URL(event.request.url);
          event.request.url = u.origin + u.pathname;
        } catch {}
      }
      return event;
    },
  });
}

// Hook Next.js 15+ per catturare errori di navigation client-side
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
