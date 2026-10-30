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

/**
 * The body with its picture syntax removed — for compact surfaces (related
 * notes, search hits) that show a text excerpt plus thumbnails instead of the
 * raw markdown, where a long image URL would crowd out the words.
 */
export function stripMarkdownImages(markdown: string): string {
  return markdown.replace(IMAGE_PATTERN, "").trim();
}
