/**
 * Groups the images of a note so consecutive pictures can be laid out as one
 * justified row instead of one full-width block each.
 *
 * Three shapes arrive from the markdown parser, all meaning "these belong
 * together":
 *
 * 1. One paragraph holding several `img` nodes (pictures pasted in a row).
 * 2. One paragraph per picture, separated by blank lines.
 * 3. Prose with a run of pictures hanging off it — the shape a phone client
 *    writes when the author types a sentence and then attaches screenshots.
 *    Note 1249 is this case: text, then two pictures, no blank line.
 *
 * (3) is split here into a prose paragraph plus a picture paragraph, (2) is
 * merged by `mergeRun`, and the paragraph renderer only has to look at (1).
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

/** Whitespace-only text and `<br>` do not break a run of pictures. */
function isGap(node: HastNode): boolean {
  if (node.type === "text") return !node.value?.trim();
  return node.type === "element" && node.tagName === "br";
}

function isImage(node: HastNode): boolean {
  return node.type === "element" && node.tagName === "img";
}

/** Drops leading/trailing gaps so a split never leaves an empty `<p>`. */
function trimGaps(nodes: HastNode[]): HastNode[] {
  const copy = [...nodes];
  while (copy.length > 0 && isGap(copy[0])) copy.shift();
  while (copy.length > 0 && isGap(copy[copy.length - 1])) copy.pop();
  return copy;
}

function hasContent(nodes: HastNode[]): boolean {
  return nodes.some((node) => !isGap(node));
}

/**
 * The longest contiguous run of pictures in a paragraph — `null` when the run
 * holds a single picture, because one picture keeps the full column width and
 * must not be promoted to a gallery of its own.
 */
function longestImageRun(children: HastNode[]): [number, number] | null {
  let best: [number, number] | null = null;
  let bestLength = 1;
  let index = 0;

  while (index < children.length) {
    if (!isImage(children[index])) {
      index += 1;
      continue;
    }
    let cursor = index;
    let count = 0;
    let lastImage = index;
    while (cursor < children.length) {
      const node = children[cursor];
      if (isImage(node)) {
        count += 1;
        lastImage = cursor;
        cursor += 1;
        continue;
      }
      if (isGap(node)) {
        cursor += 1;
        continue;
      }
      break;
    }
    if (count > bestLength) {
      bestLength = count;
      best = [index, lastImage];
    }
    index = cursor;
  }

  return best;
}

/**
 * Prose and pictures in one paragraph are two blocks wearing one set of tags:
 * the pictures belong in a justified band of their own, the words stay a
 * paragraph. Splitting here — before rendering, on the tree — keeps the
 * decision out of the paragraph renderer, which only has React children to
 * look at and cannot tell an image node from a text node cheaply.
 */
function splitMixedParagraph(paragraph: HastNode): HastNode[] | null {
  const children = paragraph.children ?? [];
  const run = longestImageRun(children);
  if (!run) return null;
  const [start, end] = run;

  const images = children.slice(start, end + 1).filter((node) => isImage(node));
  const before = trimGaps(children.slice(0, start));
  const after = trimGaps(children.slice(end + 1));

  const parts: HastNode[] = [];
  if (hasContent(before)) parts.push({ ...paragraph, children: before });
  parts.push({ ...paragraph, children: images });
  if (hasContent(after)) parts.push({ ...paragraph, children: after });
  return parts;
}

/**
 * Walks the tree and splits every mixed paragraph. List items are skipped:
 * a split there would put a second paragraph inside an `<li>`, which reads as
 * a new bullet rather than as the same sentence's pictures.
 */
function splitMixedParagraphs(parent: HastNode): void {
  const children = parent.children ?? [];
  const next: HastNode[] = [];
  for (const child of children) {
    if (child.type === "element") {
      splitMixedParagraphs(child);
      if (child.tagName === "p" && parent.tagName !== "li") {
        const parts = splitMixedParagraph(child);
        if (parts) {
          next.push(...parts);
          continue;
        }
      }
    }
    next.push(child);
  }
  parent.children = next;
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
    // Split first: a paragraph that both carries prose and holds a run of
    // pictures becomes a picture paragraph, and that paragraph can then join
    // the run of picture paragraphs around it.
    splitMixedParagraphs(tree);
    mergeRun(tree);
  };
}
