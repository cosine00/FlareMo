// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MemoContent } from "./memo-content";
import { quoteIdsIn } from "./memo-quote-cards";

vi.mock("@/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

// Static markup has no router; the internal Link only needs its href.
vi.mock("@tanstack/react-router", () => ({
  Link: (props: {
    to?: string;
    params?: Record<string, string>;
    className?: string;
    children?: unknown;
  }) => {
    const href = Object.entries(props.params ?? {}).reduce(
      (target, [key, value]) => target.replace(`$${key}`, value),
      props.to ?? "",
    );
    return require("react").createElement(
      "a",
      { href, className: props.className },
      props.children,
    );
  },
}));

function render(node: React.ReactElement) {
  return renderToStaticMarkup(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      {node}
    </QueryClientProvider>,
  );
}

describe("quoteIdsIn", () => {
  it("collects references in reading order, once each", () => {
    const body = "见 [ID.2](/m/2/)，再看 [ID.9](/m/9/)，还有 [ID.2](/m/2/)。";
    expect(quoteIdsIn(body)).toEqual(["2", "9"]);
  });

  it("stops at three, matching the card limit", () => {
    const body = "[a](/m/1/) [b](/m/2/) [c](/m/3/) [d](/m/4/)";
    expect(quoteIdsIn(body)).toEqual(["1", "2", "3"]);
  });

  it("takes the absolute form the blog hands out", () => {
    expect(quoteIdsIn("[ID.12](https://hux.ink/m/12/) 和 [x](/m/13/)")).toEqual(
      ["12", "13"],
    );
  });

  it("ignores links that are not memo references", () => {
    expect(
      quoteIdsIn("[x](https://example.com/foo/m/9/) [y](/posts/9/)"),
    ).toEqual([]);
  });
});

describe("reference marks", () => {
  it("replaces the raw ID in the prose with a single beak", () => {
    const html = render(
      <MemoContent content={"卖出一半 O9880 [ID.12](/m/12/)。"} quotes />,
    );
    expect(html).toContain('class="memo-quote-mark"');
    expect(html).toContain('viewBox="0 0 12 8"');
    // 句子里不再出现原始编号；卡片此时还没取到数据，所以整段都没有 ID.12。
    expect(html).not.toContain("ID.12");
  });

  it("marks an absolute reference the same as a relative one", () => {
    // 从博客复制过来的引用带着域名，句子里也不该出现 `ID.1234`。
    const html = render(
      <MemoContent
        content={"卖出一半 09880。[ID.1234](https://hux.ink/m/1234/)"}
        quotes
      />,
    );
    expect(html).toContain('class="memo-quote-mark"');
    expect(html).toContain('viewBox="0 0 12 8"');
    expect(html).not.toContain("ID.1234");
  });

  it("adds a beak per reference so each mark matches its card", () => {
    const html = render(
      <MemoContent content={"[ID.5](/m/5/) 与 [ID.8](/m/8/)"} quotes />,
    );
    // 峰数写进 viewBox：一峰 12 宽，两峰 21.2，三峰 30.4，高度始终是 8。
    expect(html).toContain('viewBox="0 0 12 8"');
    expect(html).toContain('viewBox="0 0 21.2 8"');
  });

  it("repeats a reference without adding a beak", () => {
    // 同一条被引两次时只对应一张卡片，两处角标都该是单峰。
    const html = render(
      <MemoContent content={"[ID.5](/m/5/) 又说 [ID.5](/m/5/)"} quotes />,
    );
    expect(html.match(/viewBox="0 0 12 8"/g)).toHaveLength(2);
    expect(html).not.toContain("21.2");
  });

  it("leaves the plain link alone when the cards are off", () => {
    const html = render(<MemoContent content={"见 [ID.12](/m/12/)。"} />);
    expect(html).not.toContain("memo-quote-mark");
    expect(html).toContain(">ID.12</a>");
  });
});
