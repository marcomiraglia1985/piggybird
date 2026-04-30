import { feature } from "topojson-client";
import { geoEquirectangular, geoPath } from "d3-geo";

/**
 * Genera l'SVG path string dei continenti via world-atlas (TopoJSON) +
 * d3-geo (proiezione equirectangular). Calcolato una volta al primo accesso
 * e cachato in memoria del processo server.
 *
 * Resolution: 110m (low detail, ~50KB di stringa). Per più dettaglio passare
 * a "land-50m.json" o "land-10m.json" (file più grandi).
 *
 * Output coordinate system:
 *   - x in gradi di longitudine (-180 a 180)
 *   - y in gradi di latitudine NEGATIVI (-90 = nord, +90 = sud) per matchare
 *     SVG y-down con nord-up convention
 *   → Usabile direttamente in viewBox="-180 -90 360 180"
 */

let cached: string | null = null;

export async function getWorldLandPath(): Promise<string> {
  if (cached !== null) return cached;
  // Import dinamico del JSON (Node only). Se l'import fallisce in qualche
  // edge environment, ritorniamo stringa vuota → widget mostra solo
  // day/night overlay senza continenti.
  try {
    const mod = await import("world-atlas/land-110m.json");
    const worldData = (mod as { default: unknown }).default ?? mod;
    // Cast: i tipi forniti da topojson-client sono permissivi
    const land = feature(
      worldData as Parameters<typeof feature>[0],
      (worldData as { objects: { land: unknown } }).objects
        .land as Parameters<typeof feature>[1],
    );
    const projection = geoEquirectangular()
      .scale(180 / Math.PI) // 1 unità output = 1 grado
      .translate([0, 0]); // centrato in (0,0), matcha viewBox
    const pathFn = geoPath(projection);
    // FeatureCollection → singola path string concatenata
    const result = pathFn(land as Parameters<typeof pathFn>[0]) ?? "";
    cached = result;
    return result;
  } catch (e) {
    console.warn("Failed to compute world land path:", e);
    cached = "";
    return "";
  }
}
