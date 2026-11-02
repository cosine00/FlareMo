import { describe, expect, it } from "vitest";
import { markdownImages, removeMarkdownImage } from "./memo-media";

const A = "https://img.hux.ink/image/2026/11/IMG_7163-47187a.jpg";
const B = "https://img.hux.ink/image/2026/11/IMG_7226-9098af.jpg";

describe("markdownImages", () => {
  it("reads pictures in order of appearance", () => {
    expect(markdownImages(`text ![one](${A}) mid ![two](${B})`)).toEqual([
      { alt: "one", src: A },
      { alt: "two", src: B },
    ]);
  });
});

describe("removeMarkdownImage", () => {
  it("drops a picture that trails a sentence", () => {
    const raw = `折腾了好久。![IMG](${A})\n![IMG2](${B})`;
    expect(removeMarkdownImage(raw, A)).toBe(`折腾了好久。\n![IMG2](${B})`);
  });

  it("collapses the blank line a picture owned", () => {
    const raw = `第一行\n\n![IMG](${A})\n\n结尾`;
    expect(removeMarkdownImage(raw, A)).toBe("第一行\n\n结尾");
  });

  it("leaves the rest of the body alone", () => {
    expect(removeMarkdownImage("只有文字，没有图片。", A)).toBe(
      "只有文字，没有图片。",
    );
  });

  it("treats the url as a literal, not a pattern", () => {
    // A `.` in the url must not match any character of another picture.
    const raw = `![x](aXb)\n![y](a.b)`;
    expect(removeMarkdownImage(raw, "a.b")).toBe("![x](aXb)");
  });

  it("removes every reference to the same picture", () => {
    const raw = `![x](${A})\n\n![x](${A})`;
    expect(removeMarkdownImage(raw, A)).toBe("");
  });
});
