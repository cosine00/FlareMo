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

  it("ignores links that are not memo references", () => {
    expect(quoteIdsIn("[x](https://example.com/m/9/) [y](/posts/9/)")).toEqual(
      [],
    );
  });
});

describe("reference marks", () => {
  it("replaces the raw ID in the prose with a superscript index", () => {
    const html = render(
      <MemoContent content={"卖出一半 O9880 [ID.12](/m/12/)。"} quotes />,
    );
    expect(html).toContain('class="memo-quote-mark"');
    expect(html).toContain(">1</a>");
    // 句子里不再出现原始编号；卡片此时还没取到数据，所以整段都没有 ID.12。
    expect(html).not.toContain("ID.12");
  });

  it("numbers several references in the order the cards appear", () => {
    const html = render(
      <MemoContent content={"[ID.5](/m/5/) 与 [ID.8](/m/8/)"} quotes />,
    );
    expect(html).toContain(">1</a>");
    expect(html).toContain(">2</a>");
  });

  it("leaves the plain link alone when the cards are off", () => {
    const html = render(<MemoContent content={"见 [ID.12](/m/12/)。"} />);
    expect(html).not.toContain("memo-quote-mark");
    expect(html).toContain(">ID.12</a>");
  });
});
