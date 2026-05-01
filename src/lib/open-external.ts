/**
 * Apre un URL esterno nel browser di sistema.
 *
 * In Tauri WebView `<a target="_blank">` e `window.open()` sono no-op senza
 * `tauri-plugin-shell` configurato. Plugin registrato in `lib.rs`, permission
 * `shell:allow-open` con scope regex `^https?://.*` in capabilities.
 *
 * Strategia:
 *   1. Detect Tauri (`__TAURI_INTERNALS__` o `isTauri`).
 *   2. In Tauri: prova `invoke('plugin:shell|open')`. Se fallisce, mostra
 *      alert con URL + errore (utente copia/incolla manualmente).
 *   3. In browser: `window.open` standard.
 *
 * Note: in Tauri, `window.open()` ritorna un oggetto Window-like ma NON apre
 * niente — quindi non possiamo affidarci al return value come fallback.
 */

function isTauriEnv(): boolean {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window || "isTauri" in window;
}

export async function openExternal(url: string): Promise<void> {
  if (typeof window === "undefined") return;

  if (isTauriEnv()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("plugin:shell|open", { path: url });
      return;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[open-external] tauri shell open failed:", msg);
      // Fallback visibile: copia URL + alert con istruzioni
      try {
        await navigator.clipboard.writeText(url);
        window.alert(
          "Impossibile aprire il browser di sistema.\n\n" +
            "L'URL è stato copiato negli appunti — incollalo (⌘V) in Safari/Chrome:\n\n" +
            url +
            "\n\n[Errore tecnico: " +
            msg +
            "]",
        );
      } catch {
        window.alert(
          "Impossibile aprire il browser di sistema.\n\n" +
            "Apri manualmente questo URL:\n\n" +
            url +
            "\n\n[Errore: " +
            msg +
            "]",
        );
      }
      return;
    }
  }

  // Browser/dev mode
  window.open(url, "_blank", "noopener,noreferrer");
}
