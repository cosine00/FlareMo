import { afterEach, describe, expect, it, vi } from "vitest";
import { getPublicMemo, listPublicTimeline } from "./public-timeline";

const realFetch = globalThis.fetch;

function stubFetch(response: Partial<Response>) {
  const fetchMock = vi.fn(
    async (_input: string, _init?: RequestInit) => response as Response,
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("listPublicTimeline", () => {
  it("reads the anonymous Memos surface with paging params", async () => {
    const fetchMock = stubFetch({
      ok: true,
      json: async () => ({ memos: [], nextPageToken: undefined }),
    });

    await listPublicTimeline({ pageSize: 5, pageToken: "abc" });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(
      "/api/v1/memos?pageSize=5&pageToken=abc&filter=visibility+%3D%3D+%22PUBLIC%22",
    );
    // A bare fetch keeps a 401 from firing the global auth-required event and
    // bouncing an anonymous visitor to the login page.
    expect(init?.headers).toEqual({ accept: "application/json" });
  });

  it("omits the page token on the first page", async () => {
    const fetchMock = stubFetch({
      ok: true,
      json: async () => ({ memos: [] }),
    });

    await listPublicTimeline();

    const [url] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(
      "/api/v1/memos?pageSize=20&filter=visibility+%3D%3D+%22PUBLIC%22",
    );
  });

  it("pins the feed to public rows so a signed-in visitor sees the same feed", async () => {
    const fetchMock = stubFetch({
      ok: true,
      json: async () => ({ memos: [] }),
    });

    await listPublicTimeline();

    // The read boundary widens for a session holder; the CEL filter keeps
    // their own private drafts out of what is presented as a public feed.
    const [url] = fetchMock.mock.calls[0] ?? [];
    expect(
      new URL(url ?? "", "http://flaremo.test").searchParams.get("filter"),
    ).toBe('visibility == "PUBLIC"');
  });

  it("tolerates a payload without a memos array", async () => {
    stubFetch({ ok: true, json: async () => ({}) });

    await expect(listPublicTimeline()).resolves.toEqual({
      memos: [],
      nextPageToken: undefined,
    });
  });

  it("throws on a non-ok response", async () => {
    stubFetch({ ok: false, status: 500 });

    await expect(listPublicTimeline()).rejects.toThrow(
      "public timeline unavailable (500)",
    );
  });
});

describe("getPublicMemo", () => {
  it("reads one note off the anonymous surface, without the auth event", async () => {
    const fetchMock = stubFetch({
      ok: true,
      json: async () => ({ name: "memos/1266", content: "被引用的正文" }),
    });

    await expect(getPublicMemo("1266")).resolves.toEqual({
      content: "被引用的正文",
    });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/v1/memos/1266");
    expect(init?.headers).toEqual({ accept: "application/json" });
  });

  it("accepts the resource-name form the timeline hands out", async () => {
    const fetchMock = stubFetch({
      ok: true,
      json: async () => ({ content: "正文" }),
    });

    await getPublicMemo("memos/1266");

    const [url] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/v1/memos/1266");
  });

  it("returns null for a note the viewer cannot read", async () => {
    // A quote may point at a deleted or private note; the card has to vanish
    // instead of rendering an empty bracket.
    stubFetch({ ok: false, status: 404 });

    await expect(getPublicMemo("999")).resolves.toBeNull();
  });

  it("returns null when the payload has no text", async () => {
    stubFetch({ ok: true, json: async () => ({ name: "memos/1" }) });

    await expect(getPublicMemo("1")).resolves.toBeNull();
  });
});
