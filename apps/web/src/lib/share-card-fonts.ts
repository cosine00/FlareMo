/**
 * Reader-chosen faces for share cards.
 *
 * The card JSON composes its own typography, so a font preference cannot be a
 * card option: it has to override the two tiers every document resolves
 * through (`--card-font-sans` / `--card-font-serif`). Doing it with custom
 * properties keeps the override out of the sandboxed cards (they render in
 * their own iframe) and out of the app chrome, which never sees the dialog's
 * wrapper element.
 *
 * Bundled CJK faces ship as chunked `unicode-range` webfonts and are imported
 * on demand: a reader who never picks 朱雀仿宋 downloads none of its chunks,
 * and a reader who does only fetches the blocks their own note needs.
 */

export type CardFontId = "system" | "zhuque" | "wenkai" | "song" | "kai";

export type CardFontOption = {
  id: CardFontId;
  /** Shown as-is: these are typeface names, not UI copy to translate. */
  label: string;
  /** CSS family name used when asking the font loader for glyphs. */
  family?: string;
  /** Applied to both tiers; `system` leaves the card's own stack alone. */
  stack?: string;
  /** Chunked webfont stylesheet, imported the first time it is selected. */
  load?: () => Promise<unknown>;
};

const CJK_FALLBACK = "var(--font-cjk), sans-serif";

export const CARD_FONT_OPTIONS: CardFontOption[] = [
  { id: "system", label: "__default__" },
  {
    id: "zhuque",
    label: "朱雀仿宋",
    family: "Zhuque Fangsong",
    stack: `"Zhuque Fangsong", ${CJK_FALLBACK}`,
    load: () => import("@free-fonts/zhuque-fangsong/zhuque-fangsong.css"),
  },
  {
    id: "song",
    label: "宋体",
    stack:
      '"Songti SC", "STSong", SimSun, "Noto Serif CJK SC", var(--font-cjk-serif), serif',
  },
  {
    id: "kai",
    label: "楷体",
    stack:
      '"Kaiti SC", STKaiti, KaiTi, "Noto Serif CJK SC", var(--font-cjk-serif), serif',
  },
];

const STORAGE_KEY = "flaremo.share.cardFont";

export function findCardFont(id: string | null | undefined): CardFontOption {
  return (
    CARD_FONT_OPTIONS.find((option) => option.id === id) ?? CARD_FONT_OPTIONS[0]
  );
}

export function readCardFont(): CardFontId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && CARD_FONT_OPTIONS.some((option) => option.id === stored)) {
      return stored as CardFontId;
    }
  } catch {
    // Private mode / storage disabled: fall through to the default face.
  }
  return "system";
}

export function rememberCardFont(id: CardFontId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Best-effort: the choice still applies to this dialog.
  }
}

/** Custom properties for the wrapper around a card document. */
export function cardFontVars(
  id: CardFontId,
): Record<string, string> | undefined {
  const stack = findCardFont(id).stack;
  if (!stack) return undefined;
  // Every tier moves together: a reader who picks a face expects the whole
  // card in it, headings included. Cards that never name a face inherit from
  // the wrapper, so they are covered without touching their JSON.
  return {
    "--card-font-sans": stack,
    "--card-font-serif": stack,
    "--card-font-mono": stack,
    "--card-font-heading": stack,
  };
}

const loaded = new Set<CardFontId>();

/**
 * Fetch the face and wait until the glyphs `sample` needs are usable. A card
 * exported before that would rasterize with a fallback face and bake it in.
 */
export async function ensureCardFont(
  id: CardFontId,
  sample?: string,
): Promise<void> {
  const option = findCardFont(id);
  if (!option.family) return;
  try {
    if (option.load && !loaded.has(id)) {
      await option.load();
      loaded.add(id);
    }
    if (document.fonts) {
      await document.fonts.load(
        `400 16px "${option.family}"`,
        sample?.slice(0, 512) || "莫",
      );
    }
  } catch {
    // A missing chunk or a blocked stylesheet just means the fallback face;
    // the export still works and the toast path stays reserved for real
    // failures.
  }
}
