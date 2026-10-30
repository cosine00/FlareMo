/**
 * The explorer's tag glyphs.
 *
 * A sidebar of forty `#tag` rows is a wall of identical marks; one emoji per
 * tag turns it into something scannable at a glance. The mapping is a display
 * preference only — note bodies keep their literal `#tag` — and it lives in
 * localStorage next to the tree's other per-browser choices.
 */

const STORAGE_KEY = "flaremo.explorer.tagEmoji";

/**
 * The default palette. Deliberately generic and quiet: these stand in for a
 * hash mark, not for a taxonomy, so they should read as decoration until the
 * reader assigns something meaningful.
 */
export const TAG_EMOJI_PALETTE = [
  "🍀",
  "🌿",
  "🍃",
  "🌸",
  "🌻",
  "🍊",
  "🍋",
  "🍜",
  "🍵",
  "☕",
  "🕯️",
  "🌙",
  "⭐",
  "☀️",
  "🌊",
  "🔥",
  "💡",
  "🎯",
  "🚀",
  "🧭",
  "🗺️",
  "📌",
  "📚",
  "📝",
  "📷",
  "🎧",
  "🎬",
  "🎨",
  "🧩",
  "🧘",
  "🏃",
  "🧠",
  "💰",
  "📈",
  "🛠️",
  "🪴",
  "🐚",
  "🪄",
  "💎",
  "🔖",
] as const;

export type TagEmojiMap = Record<string, string>;

export function readTagEmojiMap(): TagEmojiMap {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const map: TagEmojiMap = {};
        for (const [tag, emoji] of Object.entries(parsed)) {
          if (typeof emoji === "string" && emoji.trim() !== "") {
            map[tag] = emoji;
          }
        }
        return map;
      }
    }
  } catch {
    // Storage unavailable: the deterministic default still applies.
  }
  return {};
}

export function writeTagEmojiMap(map: TagEmojiMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Best-effort persistence; the in-memory choice still applies.
  }
}

/** FNV-1a, so a tag keeps the same glyph across reloads and devices. */
function hash(value: string): number {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193);
  }
  return result >>> 0;
}

/** The glyph a tag gets before the reader picks one. */
export function defaultTagEmoji(tag: string): string {
  const palette = TAG_EMOJI_PALETTE;
  return palette[hash(tag) % palette.length] as string;
}

/** The glyph to draw: the reader's choice, else the stable default. */
export function tagEmoji(tag: string, map: TagEmojiMap): string {
  return map[tag] ?? defaultTagEmoji(tag);
}

/** Records a choice (or clears it, for `null`) and returns the new map. */
export function withTagEmoji(
  map: TagEmojiMap,
  tag: string,
  emoji: string | null,
): TagEmojiMap {
  const next = { ...map };
  if (emoji === null) delete next[tag];
  else next[tag] = emoji;
  writeTagEmojiMap(next);
  return next;
}
