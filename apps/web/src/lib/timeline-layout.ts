/**
 * The timeline has two faces: the flomo-style card stack the app shipped with,
 * and a dated list modelled on the blog's archive page — one row per note,
 * grouped by year — for skimming a lot of notes at once.
 *
 * The choice is a reading preference, not a route: both faces share the same
 * queries, filters and column width, and only the row rendering differs.
 */
export type TimelineLayout = "cards" | "timeline";

const STORAGE_KEY = "flaremo.timeline.layout";

export function readTimelineLayout(): TimelineLayout {
  try {
    return localStorage.getItem(STORAGE_KEY) === "timeline"
      ? "timeline"
      : "cards";
  } catch {
    // Storage is best-effort; the default layout still applies.
  }
  return "cards";
}

export function writeTimelineLayout(layout: TimelineLayout): void {
  try {
    localStorage.setItem(STORAGE_KEY, layout);
  } catch {
    // Persistence is best-effort; the in-memory choice still applies.
  }
}
