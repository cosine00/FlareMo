// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MemoContent } from "./memo-content";

vi.mock("@/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

// Static markup has no router instance; the internal Link only needs to
// surface its resolved href for these assertions.
vi.mock("@tanstack/react-router", () => ({
  Link: (props: {
    to?: string;
    params?: Record<string, string>;
    children?: unknown;
  }) => {
    const href = Object.entries(props.params ?? {}).reduce(
      (target, [key, value]) => target.replace(`$${key}`, value),
      props.to ?? "",
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return require("react").createElement("a", { href }, props.children);
  },
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

  it("renders insight citations as compact superscript links", () => {
    const html = renderToStaticMarkup(
      <MemoContent content="结论[4](#insight-source-current-4)" />,
    );
    expect(html).toContain('href="#insight-source-current-4"');
    expect(html).toContain("align-super");
    expect(html).toContain(">4</a>");
  });

  // The blog's canonical reference format `[ID.1234](/m/1234/)` must open the
  // memo's detail page here instead of 404ing on this host, exactly like the
  // app-native `/memo/` links already did.
  it("routes blog-style /m/ reference links to the memo detail page", () => {
    const html = renderToStaticMarkup(
      <MemoContent content="卖出一半优必选。[ID.1234](/m/1234/)" />,
    );
    expect(html).toContain('href="/memo/1234"');
    expect(html).toContain(">ID.1234</a>");
  });

  it("keeps routing app-style /memo/ links to the detail page", () => {
    const html = renderToStaticMarkup(
      <MemoContent content="回看[昨天的记录](/memo/1234)" />,
    );
    expect(html).toContain('href="/memo/1234"');
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

  // Note 1249: prose, then two pictures with no blank line anywhere. The run
  // lives inside the prose paragraph, so grouping has to split it out rather
  // than wait for a picture-only paragraph to arrive.
  it("merges a run of pictures that trails a sentence", () => {
    const raw = `折腾了好久。![A](${URL_A})\n![B](${URL_B})`;
    const html = renderToStaticMarkup(<MemoContent content={raw} />);
    expect(html).toContain("memo-image-gallery");
    expect(html).toContain(`src="${URL_A}"`);
    expect(html).toContain(`src="${URL_B}"`);
    // The sentence survives the split; the gallery does not eat it.
    expect(html).toContain("折腾了好久。");
  });

  it("keeps a single picture hanging off a sentence inline", () => {
    const raw = `折腾了好久。![A](${URL_A})`;
    const html = renderToStaticMarkup(<MemoContent content={raw} />);
    expect(html).not.toContain("memo-image-gallery");
    expect(html).toContain("折腾了好久。");
    expect(html).toContain(`src="${URL_A}"`);
  });
});
