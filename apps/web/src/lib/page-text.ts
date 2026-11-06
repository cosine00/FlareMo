/**
 * Reader-chosen text size and weight.
 *
 * The page face decides *which* glyphs are drawn; these two decide how large
 * and how heavy they are. Both land on <html> as custom properties, because
 * that is the one place every tier of the stylesheet already reads from:
 *
 *   --page-text-scale   → multiplies the named text utilities (`--text-*`) and
 *                         the reading surfaces' own 15px/28px pair
 *   --page-text-weight  → inherited from <body>, so prose, editor and chrome
 *                         share one weight unless an element asks otherwise
 *
 * Scaling the *type* variables instead of `html { font-size }` is deliberate.
 * Root font-size is the unit Tailwind's spacing utilities are written in, so
 * raising it multiplies every padding, gap and width as well — turning "make
 * the text bigger" into "zoom the whole app" and reflowing the layout at 85%
 * or 130%. Only the type moves here; the boxes stay exactly where they were.
 */

export const TEXT_SCALE_MIN = 0.85;
export const TEXT_SCALE_MAX = 1.3;
export const TEXT_SCALE_STEP = 0.05;
export const TEXT_SCALE_DEFAULT = 1;

/** The five stops the weight slider offers. 300 and 700 are cuts most system
 *  faces ship; 500 and 600 are where a single-weight webfont (WenKai, ZhiSong)
 *  shows nothing at all, which the picker says out loud rather than letting the
 *  reader find out on the homepage. */
export const TEXT_WEIGHTS = [300, 400, 500, 600, 700] as const;
export type PageTextWeight = (typeof TEXT_WEIGHTS)[number];
export const TEXT_WEIGHT_DEFAULT: PageTextWeight = 400;

const SCALE_KEY = "flaremo.page.text.scale";
const WEIGHT_KEY = "flaremo.page.text.weight";
const SCALE_PROPERTY = "--page-text-scale";
const WEIGHT_PROPERTY = "--page-text-weight";

function readStore(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    // Private mode / storage disabled: the defaults still apply.
    return null;
  }
}

function writeStore(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Best-effort: the choice still applies to this session.
  }
}

/** Snap to the slider's grid so a stored 1.117 (a hand-edited value, an older
 *  range) cannot render as "112%" between two stops. */
export function snapTextScale(scale: number): number {
  if (!Number.isFinite(scale)) return TEXT_SCALE_DEFAULT;
  const snapped =
    Math.round(scale / TEXT_SCALE_STEP) * TEXT_SCALE_STEP + Number.EPSILON;
  const bounded = Math.min(TEXT_SCALE_MAX, Math.max(TEXT_SCALE_MIN, snapped));
  // Float arithmetic leaves 1.1500000000000001 behind; the picker prints it.
  return Math.round(bounded * 100) / 100;
}

export function readPageTextScale(): number {
  const stored = readStore(SCALE_KEY);
  if (stored === null) return TEXT_SCALE_DEFAULT;
  const parsed = Number.parseFloat(stored);
  return Number.isFinite(parsed) ? snapTextScale(parsed) : TEXT_SCALE_DEFAULT;
}

export function readPageTextWeight(): PageTextWeight {
  const stored = readStore(WEIGHT_KEY);
  const parsed = stored === null ? Number.NaN : Number.parseInt(stored, 10);
  return (TEXT_WEIGHTS as readonly number[]).includes(parsed)
    ? (parsed as PageTextWeight)
    : TEXT_WEIGHT_DEFAULT;
}

/** `1.15` → `"115%"`. One place decides how the number is spelled. */
export function formatTextScale(scale: number): string {
  return `${Math.round(snapTextScale(scale) * 100)}%`;
}

/**
 * Write both properties onto the document root.
 *
 * A default is *removed* rather than written as `1` / `400`: an inline custom
 * property outranks every stylesheet, so leaving it behind would keep the page
 * pinned to a value after a future default change, and would show up in the
 * inspector as a reader choice the reader never made.
 */
export function applyPageText(
  scale: number,
  weight: PageTextWeight = TEXT_WEIGHT_DEFAULT,
): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const nextScale = snapTextScale(scale);
  const nextWeight = (TEXT_WEIGHTS as readonly number[]).includes(weight)
    ? weight
    : TEXT_WEIGHT_DEFAULT;

  if (nextScale === TEXT_SCALE_DEFAULT) {
    root.style.removeProperty(SCALE_PROPERTY);
  } else {
    root.style.setProperty(SCALE_PROPERTY, String(nextScale));
  }

  if (nextWeight === TEXT_WEIGHT_DEFAULT) {
    root.style.removeProperty(WEIGHT_PROPERTY);
  } else {
    root.style.setProperty(WEIGHT_PROPERTY, String(nextWeight));
  }
}

export function rememberPageText(scale: number, weight: PageTextWeight): void {
  const nextScale = snapTextScale(scale);
  writeStore(
    SCALE_KEY,
    nextScale === TEXT_SCALE_DEFAULT ? null : String(nextScale),
  );
  writeStore(
    WEIGHT_KEY,
    weight === TEXT_WEIGHT_DEFAULT ? null : String(weight),
  );
}

/** Applied before React mounts, so the first frame is already at the reader's
 *  size instead of reflowing a beat later. */
export function applyStoredPageText(): void {
  applyPageText(readPageTextScale(), readPageTextWeight());
}

/** Which stop of the weight slider this value is, for a 0-based slider. */
export function textWeightIndex(weight: PageTextWeight): number {
  const index = (TEXT_WEIGHTS as readonly number[]).indexOf(weight);
  return index === -1 ? 1 : index;
}

export function textWeightAt(index: number): PageTextWeight {
  return TEXT_WEIGHTS[index] ?? TEXT_WEIGHT_DEFAULT;
}
