/**
 * Groups the images of a note so consecutive pictures can be laid out as one
 * justified row instead of one full-width block each.
 *
 * A note written by pasting pictures arrives as a single paragraph holding
 * several `img` nodes; a note written with blank lines between them arrives as
 * one paragraph per picture. Both are the same visual intent — "these belong
 * together" — so the runs are merged here, before rendering, and the paragraph
 * renderer only has to look at one shape.
 *
 * Minimal structural types keep this file free of a direct `hast` dependency;
 * unified only hands it a tree and reads the tree back.
 */

type HastNode = {
  children?: HastNode[];
  properties?: Record<string, unknown>;
  tagName?: string;
  type: string;
  value?: string;
};

const MERGEABLE = new Set(["br", "img"]);

/** Counts a paragraph's images, or returns 0 when it holds anything else. */
function imageCount(paragraph: HastNode): number {
  if (paragraph.type !== "element" || paragraph.tagName !== "p") return 0;
  let count = 0;
  for (const child of paragraph.children ?? []) {
    if (child.type === "text" && !child.value?.trim()) continue;
    if (child.type !== "element") return 0;
    if (!MERGEABLE.has(child.tagName ?? "")) return 0;
    if (child.tagName === "img") count += 1;
  }
  return count;
}

/**
 * Collapses a run of image-only paragraphs into the first one. Runs of one are
 * left alone: a single picture keeps its own paragraph (and its own block
 * spacing), which is what the reading view already looked like.
 */
function mergeRun(parent: HastNode): void {
  const children = parent.children ?? [];
  for (const child of children) mergeRun(child);

  const next: HastNode[] = [];
  let run: HastNode[] = [];
  const flush = () => {
    if (run.length < 2) {
      next.push(...run);
    } else {
      const [head, ...rest] = run;
      const images = [head, ...rest]
        .flatMap((paragraph) => paragraph.children ?? [])
        .filter((node) => node.type === "element" && node.tagName === "img");
      next.push({ ...head, children: images });
    }
    run = [];
  };

  for (const child of children) {
    // Inter-block whitespace is a text node here. It must not break a run —
    // two picture paragraphs separated by a blank line are still one group —
    // and is dropped when the paragraphs around it merge.
    if (child.type === "text" && !child.value?.trim()) {
      if (run.length === 0) next.push(child);
      continue;
    }
    if (imageCount(child) > 0) {
      run.push(child);
      continue;
    }
    flush();
    next.push(child);
  }
  flush();

  parent.children = next;
}

export function rehypeMergeImageParagraphs() {
  return (tree: HastNode) => {
    mergeRun(tree);
  };
}
