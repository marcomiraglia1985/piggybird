"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Linka gli errori Sentry a un identificativo opaco dell'utente.
 *
 * Privacy: invia SOLO l'email-local-part come username (es. "marco"), MAI
 * email piena né nome. Per il dev che debugga è abbastanza per correlare
 * errori dello stesso utente ricevuti su più sessioni; per Sentry è un
 * pseudonimo non un PII completo (non risalibile alla persona reale senza
 * accesso al DB locale dell'utente).
 *
 * Niente paesi/professione/ecc. — Sentry deve avere il minimo per fare
 * grouping di errori, non profilare.
 */
export function SentryUserContext() {
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d) => {
        const p = d.profile;
        if (p?.email) {
          // Solo local-part (es. "marco"), no @domain. Identificativo
          // sufficiente per dev debugging, non risalibile a persona.
          Sentry.setUser({
            username: p.email.split("@")[0],
          });
        }
      })
      .catch(() => {
        // silent: se profile API fail, gli errori arrivano comunque ma anonimi
      });
  }, []);

  return null;
}
