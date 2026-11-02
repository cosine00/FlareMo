// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MemoContent } from "./memo-content";

vi.mock("@/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

describe("MemoContent", () => {
  it("renders single newline as <br> via remark-breaks", () => {
    const raw = "第一行\n第二行";
    const html = renderToStaticMarkup(<MemoContent content={raw} />);
    expect(html).toContain("第一行<br/>\n第二行");
  });

  it("renders two newlines as distinct paragraphs", () => {
    const raw = "第一段\n\n第二段";
    const html = renderToStaticMarkup(<MemoContent content={raw} />);
    expect(html).toContain("<p>第一段</p>\n<p>第二段</p>");
  });
});

describe("MemoContent image grouping", () => {
  const URL_A = "https://img.hux.ink/image/2026/11/IMG_7163-47187a.jpg";
  const URL_B = "https://img.hux.ink/image/2026/11/IMG_7226-9098af.jpg";

  it("merges prose plus blank-line-separated picture paragraphs into a gallery", () => {
    const raw = [
      "之前旧台式机的机箱太大了，选了一款小机箱来换。",
      "",
      `![IMG_7163.jpeg](${URL_A})`,
      "",
      `![IMG_7226.jpeg](${URL_B})`,
    ].join("\n");
    const html = renderToStaticMarkup(<MemoContent content={raw} />);
    expect(html).toContain("memo-image-gallery");
    expect(html).toContain(`src="${URL_A}"`);
    expect(html).toContain(`src="${URL_B}"`);
  });

  it("merges consecutive picture paragraphs without prose", () => {
    const raw = `![A](${URL_A})\n\n![B](${URL_B})`;
    const html = renderToStaticMarkup(<MemoContent content={raw} />);
    expect(html).toContain("memo-image-gallery");
  });

  it("merges pictures written with single newlines", () => {
    const raw = `![A](${URL_A})\n![B](${URL_B})`;
    const html = renderToStaticMarkup(<MemoContent content={raw} />);
    expect(html).toContain("memo-image-gallery");
  });
});
