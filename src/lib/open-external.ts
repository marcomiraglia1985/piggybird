/**
 * Apre un URL esterno nel browser di sistema.
 *
 * In Tauri WebView `<a target="_blank">` e `window.open()` sono no-op senza
 * `tauri-plugin-shell` configurato. Il plugin è registrato in `lib.rs` e la
 * permission `shell:allow-open` è in `capabilities/default.json`.
 *
 * Strategia:
 *   1. Prova `invoke('plugin:shell|open')` SEMPRE — se siamo in Tauri funziona,
 *      se siamo in browser/dev viene rejected immediatamente (no IPC channel)
 *      e cadiamo al fallback.
 *   2. Fallback: `window.open` standard (funziona in browser).
 *   3. Last resort: copia URL negli appunti + alert per l'utente.
 *
 * Niente check `__TAURI_INTERNALS__` o `isTauri` — risultati inconsistenti tra
 * versioni Tauri 2.x. Il try/catch è la detection più robusta.
 */
export async function openExternal(url: string): Promise<void> {
  if (typeof window === "undefined") return;

  // 1. Try Tauri shell plugin
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("plugin:shell|open", { path: url });
    return;
  } catch (e) {
    // Non in Tauri o plugin non risponde — provo fallback
    console.warn("[open-external] tauri shell open failed:", e);
  }

  // 2. Try browser window.open (funziona in dev/browser)
  const popup = window.open(url, "_blank", "noopener,noreferrer");
  if (popup) return;

  // 3. Last resort: copy + alert (accade quando siamo in Tauri ma plugin
  //    fallisce — window.open è no-op nella WebView)
  try {
    await navigator.clipboard.writeText(url);
    window.alert(
      `Impossibile aprire il browser di sistema da Piggybird.\n\n` +
        `L'URL è stato copiato negli appunti — incollalo (⌘V) in Safari/Chrome:\n\n${url}`,
    );
  } catch {
    window.alert(
      `Impossibile aprire il browser di sistema da Piggybird.\n\n` +
        `Apri manualmente questo URL:\n\n${url}`,
    );
  }
}
