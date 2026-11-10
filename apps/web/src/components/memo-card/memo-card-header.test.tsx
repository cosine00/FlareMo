// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Memo } from "@/api";
import { MemoCardHeader } from "./memo-card-header";

vi.mock("@/i18n", () => ({
  useI18n: () => ({
    locale: "zh-CN",
    t: (key: string) => key,
  }),
}));

// Static markup has no router; the header only needs the href.
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

// The row's neighbours (⋯ menu, visibility dialog) are Base UI portals and
// have their own tests; this one is about the meta line.
vi.mock("./memo-card-menu", () => ({ MemoCardMenu: () => null }));
vi.mock("@/components/memo-visibility-dialog", () => ({
  MemoVisibilityDialog: () => null,
}));

const memo = {
  id: "1268",
  content: "幸亏不是写成“田”。",
  create_time: "2026-11-10T00:58:00.000Z",
  display_time: "2026-11-10T00:58:00.000Z",
  pinned: false,
  state: "normal",
  visibility: "public",
} as unknown as Memo;

function render(id = "1268") {
  return renderToStaticMarkup(
    <MemoCardHeader
      canGovern
      canManage
      id={id}
      isTrashed={false}
      memo={memo}
      onArchive={() => {}}
      onHardDelete={async () => {}}
      onPin={() => {}}
      onRestore={() => {}}
      onShare={async () => ({}) as never}
      onStartEditing={() => {}}
      onTrash={() => {}}
      onUpdateVisibility={async () => {}}
      prefetchDetail={() => {}}
    />,
  );
}

describe("memo card meta line", () => {
  it("carries the note id the reference syntax uses", () => {
    // The hover layer replaces the relative time with the absolute instant;
    // the id rides along so `[ID.…](/m/…)` can be written from the timeline.
    const html = render("1268");
    expect(html).toContain("ID.1268");
  });

  it("shows the id only in the hover layer, not beside the relative time", () => {
    const html = render("1268");
    // Both layers stack in one grid area; only the second one — the absolute
    // instant, revealed on group hover — spells the id out.
    expect(html.match(/ID\.1268/g)).toHaveLength(1);
  });
});
