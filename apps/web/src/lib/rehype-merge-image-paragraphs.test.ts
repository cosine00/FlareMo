import { describe, expect, it } from "vitest";
import { rehypeMergeImageParagraphs } from "./rehype-merge-image-paragraphs";

/**
 * The tree shapes here mirror what remark-rehype emits for the two ways a note
 * ends up holding several pictures: one paragraph with a `<br>` between them,
 * or one paragraph each, separated by insignificant whitespace text nodes.
 */
type Node = {
  children?: Node[];
  properties?: Record<string, unknown>;
  tagName?: string;
  type: string;
  value?: string;
};

const image = (src: string): Node => ({
  type: "element",
  tagName: "img",
  properties: { src },
  children: [],
});
const paragraph = (...children: Node[]): Node => ({
  type: "element",
  tagName: "p",
  properties: {},
  children,
});
const text = (value: string): Node => ({ type: "text", value });
const br = (): Node => ({
  type: "element",
  tagName: "br",
  properties: {},
  children: [],
});

function run(children: Node[]): Node[] {
  const root: Node = { type: "root", children };
  rehypeMergeImageParagraphs()(root);
  return (root.children ?? []).filter((child) => child.type === "element");
}

const imageCount = (node: Node) =>
  (node.children ?? []).filter((child) => child.tagName === "img").length;

describe("rehypeMergeImageParagraphs", () => {
  it("joins picture paragraphs separated by a blank line", () => {
    const elements = run([
      paragraph(image("a.png")),
      text("\n"),
      paragraph(image("b.png")),
    ]);
    expect(elements).toHaveLength(1);
    expect(imageCount(elements[0])).toBe(2);
  });

  it("joins pictures that already share a paragraph", () => {
    const elements = run([paragraph(image("a.png"), br(), image("b.png"))]);
    expect(elements).toHaveLength(1);
    expect(imageCount(elements[0])).toBe(2);
  });

  it("stops a run at prose", () => {
    const elements = run([
      paragraph(image("a.png")),
      text("\n"),
      paragraph(text("说明")),
      paragraph(image("b.png")),
    ]);
    expect(elements).toHaveLength(3);
    expect(elements.map(imageCount)).toEqual([1, 0, 1]);
  });

  it("leaves a lone picture in its own paragraph", () => {
    const elements = run([
      paragraph(image("a.png")),
      text("\n"),
      paragraph(text("说明")),
      paragraph(image("b.png")),
    ]);
    expect(elements[0].tagName).toBe("p");
    expect(imageCount(elements[0])).toBe(1);
  });

  it("splits a run of pictures off the prose it trails", () => {
    // Note 1249: a sentence, then two pictures, no blank line.
    const elements = run([
      paragraph(text("折腾了好久。"), image("a.png"), br(), image("b.png")),
    ]);
    expect(elements).toHaveLength(2);
    expect(elements.map((element) => imageCount(element))).toEqual([0, 2]);
    expect(elements[0].children?.[0].value).toBe("折腾了好久。");
  });

  it("splits a run of pictures that leads the prose", () => {
    const elements = run([
      paragraph(image("a.png"), br(), image("b.png"), text("说明")),
    ]);
    expect(elements).toHaveLength(2);
    expect(elements.map((element) => imageCount(element))).toEqual([2, 0]);
  });

  it("leaves one picture hanging off a sentence where it is", () => {
    const elements = run([paragraph(text("折腾了好久。"), image("a.png"))]);
    expect(elements).toHaveLength(1);
    expect(imageCount(elements[0])).toBe(1);
  });

  it("does not split pictures inside a list item", () => {
    const item = {
      type: "element",
      tagName: "li",
      properties: {},
      children: [paragraph(text("说明"), image("a.png"), image("b.png"))],
    };
    const root: Node = { type: "root", children: [item] };
    rehypeMergeImageParagraphs()(root);
    expect((root.children?.[0].children ?? []).length).toBe(1);
  });

  it("ignores paragraphs that mix pictures with prose", () => {
    const elements = run([
      paragraph(image("a.png"), text(" caption")),
      text("\n"),
      paragraph(image("b.png")),
    ]);
    expect(elements).toHaveLength(2);
  });
});
