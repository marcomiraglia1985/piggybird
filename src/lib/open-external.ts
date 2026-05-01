/**
 * Apre un URL esterno nel browser di sistema.
 *
 * Necessario perché in Tauri WebView `<a target="_blank">` e `window.open()`
 * sono no-op se non viene configurato `tauri-plugin-shell` con permission
 * `shell:allow-open` (vedi `src-tauri/capabilities/default.json`).
 *
 * Strategia:
 *   - Se gira in Tauri (rilevato via `__TAURI_INTERNALS__`): usa `invoke`
 *     del plugin shell per aprire nel browser di sistema (Safari su Mac).
 *   - Altrimenti (web/dev server): usa `window.open` standard.
 *
 * URL whitelisted in capabilities: solo `http://` e `https://`. Schemi custom
 * (mailto:, tel:) richiederebbero scope addizionale.
 */
export async function openExternal(url: string): Promise<void> {
  if (typeof window === "undefined") return;
  const isTauri = "__TAURI_INTERNALS__" in window;
  if (isTauri) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("plugin:shell|open", { path: url });
      return;
    } catch (e) {
      // Fallback se l'invoke fallisce (permission non valida, plugin non
      // registrato, ecc.) — meglio aprire dentro la WebView che non aprire
      // niente.
      console.warn("[open-external] shell|open invoke failed, fallback to window.open", e);
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
