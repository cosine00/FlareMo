export type MarkdownImage = { alt?: string; src: string };

const IMAGE_PATTERN = /!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;

/** Every markdown picture in a note body, in order of appearance. */
export function markdownImages(markdown: string): MarkdownImage[] {
  const images: MarkdownImage[] = [];
  for (const match of markdown.matchAll(IMAGE_PATTERN)) {
    const src = match[2]?.trim();
    if (!src) continue;
    images.push({ alt: match[1]?.trim() || undefined, src });
  }
  return images;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The body with one picture removed: its `![alt](src)` token disappears and
 * the blank line it may have occupied collapses. The editor's image tray calls
 * this when it has no rich editor to drive (the plain-text fallback, where the
 * markdown itself is the document).
 */
export function removeMarkdownImage(markdown: string, src: string): string {
  const token = new RegExp(
    `!\\[[^\\]]*\\]\\(\\s*<?${escapeRegExp(src)}>?(?:\\s+"[^"]*")?\\s*\\)`,
    "g",
  );
  const stripped = markdown.replace(token, "");
  if (stripped === markdown) return markdown;
  return (
    stripped
      .split("\n")
      // A picture mid-sentence leaves trailing spaces behind; a picture that
      // owned its line leaves an empty line. Both are dust, not content.
      .map((line) => line.replace(/[ \t]+$/, ""))
      .join("\n")
      // Two blank lines where the picture was collapse back to the one that
      // separated the paragraphs around it — never to zero, or the paragraphs
      // themselves would run together.
      .replace(/\n{3,}/g, "\n\n")
      .replace(/^\n+|\n+$/g, "")
  );
}

/**
 * The body with its picture syntax removed — for compact surfaces (related
 * notes, search hits) that show a text excerpt plus thumbnails instead of the
 * raw markdown, where a long image URL would crowd out the words.
 */
export function stripMarkdownImages(markdown: string): string {
  return markdown.replace(IMAGE_PATTERN, "").trim();
}
