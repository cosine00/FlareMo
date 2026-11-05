import { afterEach, describe, expect, it, vi } from "vitest";
import { listPublicTimeline } from "./public-timeline";

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
