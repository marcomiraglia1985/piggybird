"use client";

import type { PostHogConfig } from "posthog-js";

// PostHog SDK esporta `PostHog` come class che ha campi privati interni →
// usare il type del modulo default (= ph instance) via import dinamico, ma
// per compatibilità con `loaded` callback usiamo l'inferred type.
type PostHogClient = Awaited<ReturnType<typeof importPosthog>>["default"];
async function importPosthog() {
  return import("posthog-js");
}

/**
 * Wrapper PostHog con anonymization aggressiva.
 *
 * Filosofia: telemetria PURAMENTE ANONIMA — il claim deve corrispondere alla
 * realtà tecnica. PostHog by default raccoglie IP, GeoIP, $browser, $os,
 * $current_url, $referrer e crea Person profiles arricchiti. Senza override
 * la privacy non c'è. Misure adottate:
 *
 *   1. `property_denylist`: drop di tutte le proprietà auto-popolate da
 *      PostHog che possono fingerprintare (IP, geo, UA-derived, URL).
 *   2. `bootstrap.distinctID = installId` (UUID random in DB), invece di
 *      `posthog.identify()` → eventi anonimi, niente Person profile materializzato.
 *   3. `register()` per le 3 proprietà tecniche che vogliamo (app_version,
 *      platform coarse, locale) come super-properties senza ID utente.
 *   4. `disable_session_recording`, `disable_surveys`, `advanced_disable_feature_flags`
 *      → niente surface aggiuntiva.
 *   5. Dynamic import: posthog-js (~55KB gz) caricato solo se telemetry attiva.
 *
 * ⚠️ Lato PostHog project (admin manuale, una tantum):
 *      Project Settings → Privacy → "Discard client IPs" = ON
 *    Senza, PostHog Cloud comunque memorizza IP server-side anche se la
 *    proprietà non arriva nell'evento. Marco deve flaggarlo dal dashboard.
 *
 * Modello opt-out (come VS Code, Homebrew, Sentry):
 *   - Default: telemetria attiva. Niente modal di consenso.
 *   - Disclosure full in Impostazioni → Privacy con toggle ON/OFF.
 *   - Setting "telemetry.enabled": missing/"true" → enabled, "false" → opt-out.
 */

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";

// Heartbeat: 1× ogni 23h. Persistito in Setting "telemetry.lastHeartbeat" così
// non si resetta a ogni reload della webview Tauri (in-memory non basta).
const HEARTBEAT_INTERVAL_MS = 23 * 60 * 60 * 1000;

let initialized = false;
let initPromise: Promise<void> | null = null;
let phInstance: PostHogClient | null = null;

export type TelemetryStatus = "enabled" | "disabled";

export async function getTelemetryStatus(): Promise<TelemetryStatus> {
  try {
    const res = await fetch("/api/settings");
    if (!res.ok) return "enabled";
    const data = await res.json();
    const v = data.settings?.["telemetry.enabled"];
    if (v === "false") return "disabled";
    return "enabled"; // missing or "true" → enabled
  } catch {
    return "enabled";
  }
}

export async function setTelemetryEnabled(enabled: boolean): Promise<void> {
  await fetch("/api/settings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key: "telemetry.enabled", value: enabled ? "true" : "false" }),
  });
  if (initPromise) await initPromise; // attendi init in corso prima di applicare toggle
  if (initialized && phInstance) {
    if (enabled) {
      phInstance.opt_in_capturing();
    } else {
      phInstance.opt_out_capturing();
      // reset(true) cancella distinct_id + super-props da localStorage:
      // dopo opt-out non resta nessuna trace lato client.
      phInstance.reset(true);
      initialized = false;
      phInstance = null;
    }
  } else if (enabled) {
    void initTelemetry();
  }
}

/** Recupera (o crea) l'installId persistente. Generato a primo init,
 *  salvato in Setting "telemetry.installId". UUID v4 random — niente PII. */
async function getOrCreateInstallId(): Promise<string> {
  const res = await fetch("/api/settings");
  if (res.ok) {
    const data = await res.json();
    const existing = data.settings?.["telemetry.installId"];
    if (existing && typeof existing === "string" && existing.length > 0) {
      return existing;
    }
  }
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await fetch("/api/settings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key: "telemetry.installId", value: id }),
  });
  return id;
}

/** Fingerprint denylist: tutte le proprietà che PostHog auto-popola e che
 *  possono identificare/fingerprintare. PostHog SDK accetta nomi esatti. */
const PROPERTY_DENYLIST: string[] = [
  "$ip",
  "$current_url",
  "$pathname",
  "$host",
  "$referrer",
  "$referring_domain",
  "$initial_referrer",
  "$initial_referring_domain",
  "$initial_current_url",
  "$initial_pathname",
  "$browser",
  "$browser_version",
  "$browser_language",
  "$os",
  "$os_version",
  "$device_type",
  "$device",
  "$screen_height",
  "$screen_width",
  "$viewport_height",
  "$viewport_width",
  "$raw_user_agent",
  "$user_agent",
  "$geoip_city_name",
  "$geoip_country_name",
  "$geoip_country_code",
  "$geoip_continent_name",
  "$geoip_continent_code",
  "$geoip_postal_code",
  "$geoip_latitude",
  "$geoip_longitude",
  "$geoip_time_zone",
  "$geoip_subdivision_1_name",
  "$geoip_subdivision_1_code",
  "$geoip_subdivision_2_name",
  "$geoip_subdivision_2_code",
  "$timezone",
];

export async function initTelemetry(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;
  if (typeof window === "undefined") return;
  if (!POSTHOG_KEY) {
    console.warn("[telemetry] NEXT_PUBLIC_POSTHOG_KEY non settata, skip init");
    return;
  }

  initPromise = (async () => {
    const status = await getTelemetryStatus();
    if (status !== "enabled") {
      initPromise = null;
      return;
    }
    const installId = await getOrCreateInstallId();

    // Dynamic import: posthog-js è ~55KB gz, lo carichiamo solo se telemetry on.
    const { default: posthog } = await importPosthog();

    const config: Partial<PostHogConfig> = {
      api_host: POSTHOG_HOST,
      person_profiles: "never", // niente Person profile, eventi puri anonimi
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      disable_surveys: true,
      advanced_disable_feature_flags: true,
      property_denylist: PROPERTY_DENYLIST,
      // bootstrap.distinctID forza l'ID senza chiamare identify() → niente
      // Person profile materializzato in PostHog.
      bootstrap: { distinctID: installId },
      persistence: "memory", // niente localStorage residuo
      loaded: (ph) => {
        // Super-properties: app_version, platform coarse, locale.
        // Inviate con ogni evento, niente PII.
        ph.register({
          app_version: process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown",
          platform: detectPlatform(),
          locale: typeof navigator !== "undefined" ? navigator.language : "unknown",
        });
        // Cast: il tipo `PostHog` esportato include campi privati interni
        // (rateLimiter, ecc.) che non vogliamo riflettere lato consumer.
        // Lo usiamo via `PostHogClient` (= module default) che è funzionalmente
        // identico runtime ma chiuso ai privati.
        phInstance = ph as unknown as PostHogClient;
        initialized = true;
      },
    };
    posthog.init(POSTHOG_KEY, config);
  })();

  return initPromise;
}

/** Platform coarse, no fingerprinting. */
function detectPlatform(): string {
  if (typeof navigator === "undefined") return "unknown";
  // @ts-expect-error Tauri internals not typed
  const tauri = typeof window !== "undefined" && (window.__TAURI_INTERNALS__ || window.isTauri);
  if (tauri) return "tauri";
  const ua = (navigator.userAgent || "").toLowerCase();
  if (ua.includes("mac")) return "web-macos";
  if (ua.includes("win")) return "web-windows";
  if (ua.includes("linux")) return "web-linux";
  return "web-other";
}

/** Heartbeat persistito in DB (Setting "telemetry.lastHeartbeat") così
 *  non si re-trigga a ogni reload Tauri. */
export async function trackAppOpened(): Promise<void> {
  if (!initialized || !phInstance) return;
  try {
    const res = await fetch("/api/settings");
    const data = res.ok ? await res.json() : { settings: {} };
    const lastStr = data.settings?.["telemetry.lastHeartbeat"];
    const last = lastStr ? Number(lastStr) : 0;
    const now = Date.now();
    if (now - last < HEARTBEAT_INTERVAL_MS) return;
    await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "telemetry.lastHeartbeat", value: String(now) }),
    });
    phInstance.capture("app_opened");
  } catch {
    // best-effort, mai propagare errori al chiamante
  }
}

export function trackPageViewed(path: string): void {
  if (!initialized || !phInstance) return;
  // Strip query/hash per non leakare ?account=id ecc.
  const cleanPath = path.split("?")[0].split("#")[0];
  phInstance.capture("page_viewed", { path: cleanPath });
}

export function trackFeatureUsed(
  feature: string,
  props?: Record<string, string | number | boolean>,
): void {
  if (!initialized || !phInstance) return;
  phInstance.capture("feature_used", { feature, ...(props ?? {}) });
}

export function trackAccountCreated(props: {
  type: string;
  provider: string;
  assetClass?: string;
}): void {
  if (!initialized || !phInstance) return;
  phInstance.capture("account_created", props);
}
