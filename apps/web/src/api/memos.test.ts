import { beforeEach, describe, expect, it, vi } from "vitest";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("./client", () => ({ apiRequest: request }));

import { listMemos } from "./memos";

function requestedParams() {
  const [path] = request.mock.calls.at(-1) ?? [];
  return new URL(String(path), "http://flaremo.test").searchParams;
}

beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue({ memos: [], next_page_token: undefined });
});

describe("listMemos author scope", () => {
  it("defaults to the viewer's own memos", async () => {
    await listMemos();

    // The workspace is a personal journal: every list it renders must agree
    // with the sidebar counters, which only ever count the viewer's rows.
    expect(requestedParams().get("author")).toBe("me");
  });

  it("leaves the team space shared", async () => {
    await listMemos({ space: "team" });

    expect(requestedParams().get("space")).toBe("team");
    expect(requestedParams().get("author")).toBe("all");
  });

  it("lets a caller opt back into the full read boundary", async () => {
    await listMemos({ author: "all" });

    expect(requestedParams().get("author")).toBe("all");
  });

  it("keeps the remaining list parameters intact", async () => {
    await listMemos({
      page_size: 10,
      page_token: "next",
      q: "quartz",
      tag: "work",
      untagged: true,
      state: "archived",
      include_deleted: true,
    });

    const params = requestedParams();
    expect(params.get("page_size")).toBe("10");
    expect(params.get("page_token")).toBe("next");
    expect(params.get("q")).toBe("quartz");
    expect(params.get("tag")).toBe("work");
    expect(params.get("untagged")).toBe("true");
    expect(params.get("state")).toBe("archived");
    expect(params.get("include_deleted")).toBe("true");
    expect(params.get("author")).toBe("me");
  });
});
