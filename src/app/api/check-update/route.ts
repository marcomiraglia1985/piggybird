import { NextResponse } from "next/server";
import pkg from "../../../../package.json";
import { getLatestRelease } from "@/lib/github";

export const runtime = "nodejs";
// No cache: la version-badge polla già lato client ogni 6h (vedi
// version-badge.tsx). Server cache di 1h causava problemi: app installata
// pre-rilascio non vedeva mai la release nuova fino al restart + 1h.
export const dynamic = "force-dynamic";

/**
 * Confronta la versione corrente (da package.json) con l'ultima release
 * pubblicata su GitHub. Ritorna info per mostrare il badge "Aggiornamento
 * disponibile" nel sidebar.
 *
 * Versioning: confronto semver semplice (split + numeric compare). Il tag
 * della release può essere "v0.2.0" o "0.2.0" — normalizziamo strippando "v".
 */

function normalizeVersion(v: string): string {
  return v.trim().replace(/^v/i, "");
}

function compareVersions(a: string, b: string): number {
  const pa = normalizeVersion(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = normalizeVersion(b).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}

export async function GET() {
  const current = (pkg as { version?: string }).version ?? "0.0.0";
  try {
    const release = await getLatestRelease();
    if (!release) {
      return NextResponse.json({
        current,
        latest: null,
        updateAvailable: false,
        info: "Nessuna release ancora pubblicata",
      });
    }
    const latest = normalizeVersion(release.tag_name);
    const updateAvailable = compareVersions(latest, current) > 0;
    // Cerca un asset .dmg nella release (app Mac); fallback all'URL del browser.
    const dmgAsset = release.assets.find((a) => a.name.toLowerCase().endsWith(".dmg"));
    return NextResponse.json({
      current,
      latest,
      updateAvailable,
      releaseUrl: release.html_url,
      releaseName: release.name,
      releaseNotes: release.body?.slice(0, 2000) ?? "",
      publishedAt: release.published_at,
      downloadUrl: dmgAsset?.browser_download_url ?? release.html_url,
      downloadName: dmgAsset?.name ?? null,
      downloadSize: dmgAsset?.size ?? null,
    });
  } catch (e) {
    // Non-fatal: se GitHub è giù o token mancante, ritorniamo solo la corrente
    return NextResponse.json({
      current,
      latest: null,
      updateAvailable: false,
      error: e instanceof Error ? e.message : "Errore check update",
    });
  }
}
