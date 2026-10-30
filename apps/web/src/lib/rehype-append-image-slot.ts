/**
 * Icon-mode attachment marker.
 *
 * The dense timeline collapses a note's pictures into one glyph, and that
 * glyph reads as the last thing the note says — so it belongs at the end of
 * the last line of prose, not on a line of its own. React-markdown renders
 * blocks one at a time, so "the last line of prose" is not something a
 * component can know about; this pass finds it in the tree instead and drops a
 * marker element there for the renderer to recognise.
 */

type HastNode = {
  children?: HastNode[];
  properties?: Record<string, unknown>;
  tagName?: string;
  type: string;
  value?: string;
};

/** Property the renderer looks for on the marker element. */
export const IMAGE_SLOT_PROPERTY = "dataFlaremoImageSlot";

/** Blocks that hold their text inline, and so can host the marker directly. */
const INLINE_HOSTS = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "td",
  "th",
  "dd",
  "figcaption",
]);

/** Blocks that are never a place to hang a glyph — code and tabular data. */
const SKIP_HOSTS = new Set(["pre", "table", "hr"]);

function hasText(node: HastNode): boolean {
  if (node.type === "text") return Boolean(node.value?.trim());
  return (node.children ?? []).some(hasText);
}

function marker(): HastNode {
  return {
    children: [],
    properties: { [IMAGE_SLOT_PROPERTY]: "" },
    tagName: "span",
    type: "element",
  };
}

/**
 * Strips what a note's tail leaves behind: soft-wrap line breaks, and the
 * pictures that icon mode renders as nothing anyway. Without this the marker
 * lands after a `<br>` (or after a dropped image) and opens a line of its own —
 * exactly the stray row this pass exists to avoid.
 */
function trimTail(node: HastNode): void {
  const children = node.children;
  if (!children) return;
  while (children.length > 0) {
    const last = children.at(-1);
    if (!last) break;
    if (last.type === "text" && !last.value?.trim()) children.pop();
    else if (last.type === "element" && last.tagName === "br") children.pop();
    else if (last.type === "element" && last.tagName === "img") children.pop();
    else break;
  }
}

/**
 * The host at the very end of `node` that carries prose: the node itself for a
 * paragraph or a heading, the last item for a list or a quote, and nothing at
 * all for a code block or a table.
 */
function tailHost(node: HastNode): HastNode | null {
  if (node.type !== "element") return null;
  const tagName = node.tagName ?? "";
  if (SKIP_HOSTS.has(tagName)) return null;
  if (INLINE_HOSTS.has(tagName)) return hasText(node) ? node : null;
  const children = node.children ?? [];
  for (let index = children.length - 1; index >= 0; index -= 1) {
    const host = tailHost(children[index] as HastNode);
    if (host) return host;
  }
  return null;
}

/**
 * Appends the marker to the last block of prose in `tree`. A note that holds
 * nothing but pictures gets a paragraph of its own, so the glyph is never
 * dropped.
 */
export function rehypeAppendImageSlot() {
  return (tree: HastNode) => {
    const children = tree.children ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const host = tailHost(children[index] as HastNode);
      if (!host) continue;
      trimTail(host);
      host.children = [...(host.children ?? []), marker()];
      return;
    }
    tree.children = [
      ...children,
      { children: [marker()], properties: {}, tagName: "p", type: "element" },
    ];
  };
}
