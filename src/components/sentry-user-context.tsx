"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Linka gli errori Sentry al profilo utente corrente (email + nome). Senza
 * questo, in dashboard Sentry vedi solo "user anonimo".
 *
 * Privacy: invia SOLO email + name (i dati che l'utente ha già acconsentito
 * di mandare con gli snapshot). Niente paesi/professione/ecc.
 */
export function SentryUserContext() {
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d) => {
        const p = d.profile;
        if (p?.email) {
          Sentry.setUser({
            email: p.email,
            username: p.name || p.email.split("@")[0],
          });
        }
      })
      .catch(() => {
        // silent: se profile API fail, gli errori arrivano comunque ma anonimi
      });
  }, []);

  return null;
}
