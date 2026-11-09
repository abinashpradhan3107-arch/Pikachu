import { useEffect } from "react";

/**
 * Re-run `load` whenever the browser tab regains focus or becomes visible.
 *
 * The Chrome extension syncs watched/completed lecture state in the
 * background, so a Cortex page that is already open would otherwise show a
 * stale "Catch-up backlog" until a manual refresh. Pairing this with each
 * view's load callback keeps watched status (and backlog removal) current
 * with zero manual action; the manual "Mark as watched" button remains only
 * as an optional fallback.
 */
export function useRefreshOnFocus(load: () => void | Promise<void>): void {
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") {
        void load();
      }
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);
}
