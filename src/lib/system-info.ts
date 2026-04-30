import pkg from "../../package.json";
import os from "node:os";

/**
 * System info auto-collectable (zero input utente). Usato come metadata
 * negli snapshot di debug e telemetry. Niente PII, solo configurazione tecnica.
 *
 * Esempio output:
 * {
 *   appVersion: "0.1.0",
 *   platform: "darwin",
 *   osVersion: "24.6.0",
 *   arch: "arm64",
 *   nodeVersion: "v22.0.0",
 *   locale: "it-IT",
 *   tz: "Europe/Rome"
 * }
 */
export type SystemInfo = {
  appVersion: string;
  platform: string;
  osVersion: string;
  arch: string;
  nodeVersion: string;
  locale: string;
  tz: string;
};

export function getSystemInfo(): SystemInfo {
  return {
    appVersion: (pkg as { version?: string }).version ?? "unknown",
    platform: os.platform(),
    osVersion: os.release(),
    arch: os.arch(),
    nodeVersion: process.version,
    locale: Intl.DateTimeFormat().resolvedOptions().locale ?? "unknown",
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "unknown",
  };
}
