import { useEffect, useState } from "react";

type UseHideOnScrollOptions = {
  /** Distance from the top the reader must pass before the bar may hide. */
  hideAfter?: number;
  /**
   * Scroll distance, in px, that counts as a direction change. A few pixels of
   * tolerance keeps iOS momentum jitter from flickering the bar in and out.
   */
  tolerance?: number;
};

/**
 * Reports whether a top bar should tuck itself away: true while the document is
 * being scrolled down, false at the top of the page or as soon as the reader
 * scrolls back up.
 *
 * The document is the scroll container (see the app shell), so this listens on
 * `window` and coalesces events into one read per frame — the bar only needs to
 * know the direction, not every intermediate offset.
 */
export function useHideOnScroll(options: UseHideOnScrollOptions = {}) {
  const { hideAfter = 64, tolerance = 8 } = options;
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let lastY = Math.max(window.scrollY, 0);
    let frame = 0;

    const evaluate = () => {
      frame = 0;
      const y = Math.max(window.scrollY, 0);
      const delta = y - lastY;
      lastY = y;

      // Always come back near the top: a hidden bar there would leave the
      // reader with no way to reach the scope switcher or the search.
      if (y <= hideAfter) {
        setHidden(false);
        return;
      }
      if (delta > tolerance) setHidden(true);
      else if (delta < -tolerance) setHidden(false);
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(evaluate);
    };

    evaluate();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [hideAfter, tolerance]);

  return hidden;
}
