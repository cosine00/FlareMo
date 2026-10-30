import { describe, expect, it } from "vitest";
import {
  IMAGE_SLOT_PROPERTY,
  rehypeAppendImageSlot,
} from "./rehype-append-image-slot";

type HastNode = {
  children?: HastNode[];
  properties?: Record<string, unknown>;
  tagName?: string;
  type: string;
  value?: string;
};

const text = (value: string): HastNode => ({ type: "text", value });
const element = (
  tagName: string,
  children: HastNode[] = [],
  properties: Record<string, unknown> = {},
): HastNode => ({ type: "element", tagName, properties, children });
const root = (children: HastNode[]): HastNode => ({ type: "root", children });

function run(tree: HastNode): HastNode {
  rehypeAppendImageSlot()(tree);
  return tree;
}

/** Every node carrying the marker property, depth-first. */
function markers(node: HastNode): HastNode[] {
  const found: HastNode[] = [];
  if (node.properties && IMAGE_SLOT_PROPERTY in node.properties)
    found.push(node);
  for (const child of node.children ?? []) found.push(...markers(child));
  return found;
}

describe("rehypeAppendImageSlot", () => {
  it("appends the marker to the last paragraph of prose", () => {
    const tree = run(
      root([element("p", [text("first")]), element("p", [text("second")])]),
    );
    const last = tree.children?.[1];
    expect(markers(tree)).toHaveLength(1);
    expect(last?.children?.at(-1)?.properties).toEqual({
      [IMAGE_SLOT_PROPERTY]: "",
    });
  });

  it("skips a trailing picture paragraph, which icon mode drops", () => {
    const tree = run(
      root([
        element("p", [text("words")]),
        element("p", [element("img", [], { src: "/a.png" })]),
      ]),
    );
    const host = tree.children?.[0];
    expect(markers(tree)).toHaveLength(1);
    expect(host?.children?.at(-1)?.properties).toEqual({
      [IMAGE_SLOT_PROPERTY]: "",
    });
  });

  it("clears the line break and the dropped picture before the marker", () => {
    const tree = run(
      root([
        element("p", [
          text("words"),
          element("br"),
          element("img", [], { src: "/a.png" }),
        ]),
      ]),
    );
    const children = tree.children?.[0]?.children ?? [];
    expect(children.map((child) => child.tagName ?? child.type)).toEqual([
      "text",
      "span",
    ]);
  });

  it("reaches into the last list item and the last quote", () => {
    const tree = run(
      root([
        element("ul", [
          element("li", [text("one")]),
          element("li", [text("two")]),
        ]),
      ]),
    );
    const items = tree.children?.[0]?.children ?? [];
    expect(markers(items[0] as HastNode)).toHaveLength(0);
    expect(markers(items[1] as HastNode)).toHaveLength(1);
  });

  it("falls back to its own paragraph when the note holds only pictures", () => {
    const tree = run(
      root([element("p", [element("img", [], { src: "/a.png" })])]),
    );
    expect(tree.children).toHaveLength(2);
    expect(tree.children?.[1]?.tagName).toBe("p");
    expect(markers(tree)).toHaveLength(1);
  });

  it("never hangs the glyph inside a code block", () => {
    const tree = run(
      root([
        element("p", [text("words")]),
        element("pre", [element("code", [text("x = 1")])]),
      ]),
    );
    expect(markers(tree.children?.[0] as HastNode)).toHaveLength(1);
    expect(markers(tree.children?.[1] as HastNode)).toHaveLength(0);
  });
});
