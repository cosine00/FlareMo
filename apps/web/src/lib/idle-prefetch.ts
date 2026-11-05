/**
 * Warm a lazily-imported chunk once the page has finished with its own work.
 *
 * The composer's rich editor is ~160KB gzipped and the focus canvas ~35KB.
 * Both are pre-warmed so a first tap into the composer costs nothing, but a
 * prefetch is still a download: when the visitor asked to save data
 * (`navigator.connection.saveData`) or is on a 2G-class link, the bytes are
 * worth more than the few hundred milliseconds they'd save. The on-demand
 * import runs regardless, so nothing depends on the prefetch having happened.
 *
 * "Idle" alone is not enough of a gate: the browser is idle as soon as the
 * script stops running, which is exactly when the timeline starts pulling its
 * images. On a slow link the warm-up then competes with the pictures the
 * visitor is actually looking at. So wait for `load` first — all the page's own
 * resources are done by then — with a cap, because a page whose images take ten
 * seconds should still get its chunk warmed while the visitor is reading.
 */
const LOAD_WAIT_CAP_MS = 6_000;

export function prefetchWhenIdle(load: () => Promise<unknown>) {
  if (typeof window === "undefined") return;
  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  if (connection?.saveData) return;
  if (connection?.effectiveType && /(^|-)2g$/.test(connection.effectiveType)) {
    return;
  }

  const warm = () => {
    void load().catch(() => undefined);
  };
  const idle = (
    window as Window & {
      requestIdleCallback?: (callback: () => void) => number;
    }
  ).requestIdleCallback;
  const scheduleIdle = () => {
    if (idle) idle(warm);
    else setTimeout(warm, 2000);
  };

  if (document.readyState === "complete") {
    scheduleIdle();
    return;
  }
  let scheduled = false;
  const once = () => {
    if (scheduled) return;
    scheduled = true;
    scheduleIdle();
  };
  const cap = setTimeout(once, LOAD_WAIT_CAP_MS);
  window.addEventListener(
    "load",
    () => {
      clearTimeout(cap);
      once();
    },
    { once: true },
  );
}
