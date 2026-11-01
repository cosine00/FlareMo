import { describe, expect, it, vi } from "vitest";
import {
  dispatchMemoBlogSync,
  shouldDispatchMemoBlogSync,
} from "./memo-blog-sync";
import type { FlareMoEnv } from "./env";

function request(
  method: string,
  path: string,
  body?: unknown,
  contentType = "application/json",
) {
  return new Request("https://flaremo.test" + path, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: body === undefined ? {} : { "content-type": contentType },
  });
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("public Memo blog sync trigger", () => {
  it("dispatches after a public Memo is created through either JSON API", async () => {
    expect(
      await shouldDispatchMemoBlogSync(
        request("POST", "/api/v1/memos"),
        jsonResponse({ visibility: "PUBLIC" }),
      ),
    ).toBe(true);
    expect(
      await shouldDispatchMemoBlogSync(
        request("POST", "/api/app/memos"),
        jsonResponse({ visibility: "public" }, 201),
      ),
    ).toBe(true);
  });

  it("does not dispatch for new private or protected JSON Memos", async () => {
    for (const visibility of ["PRIVATE", "PROTECTED", ""]) {
      expect(
        await shouldDispatchMemoBlogSync(
          request("POST", "/api/v1/memos"),
          jsonResponse({ visibility: visibility }),
        ),
      ).toBe(false);
    }
    expect(
      await shouldDispatchMemoBlogSync(
        request("POST", "/api/v1/memos"),
        jsonResponse({ content: "visibility missing" }),
      ),
    ).toBe(false);
  });

  it("dispatches public edits and visibility changes, but not private content edits", async () => {
    expect(
      await shouldDispatchMemoBlogSync(
        request("PATCH", "/api/v1/memos/memos%2F123", { content: "edit" }),
        jsonResponse({ visibility: "PUBLIC" }),
      ),
    ).toBe(true);
    expect(
      await shouldDispatchMemoBlogSync(
        request("PATCH", "/api/app/memos/123", { content: "private edit" }),
        jsonResponse({ visibility: "PRIVATE" }),
      ),
    ).toBe(false);
    expect(
      await shouldDispatchMemoBlogSync(
        request("PATCH", "/api/v1/memos/memos%2F123", {
          memo: { visibility: "PRIVATE" },
        }),
        jsonResponse({ visibility: "PRIVATE" }),
      ),
    ).toBe(true);
  });

  it("dispatches memo deletion, restoration and attachment binding", async () => {
    expect(
      await shouldDispatchMemoBlogSync(
        request("DELETE", "/api/v1/memos/memos%2F123"),
        new Response(null, { status: 200 }),
      ),
    ).toBe(true);
    expect(
      await shouldDispatchMemoBlogSync(
        request("POST", "/api/v1/memos/memos%2F123/revisions/restore"),
        jsonResponse({ visibility: "PRIVATE" }),
      ),
    ).toBe(true);
    expect(
      await shouldDispatchMemoBlogSync(
        request("PATCH", "/api/v1/memos/memos%2F123/attachments", {
          attachments: ["attachments/a"],
        }),
        jsonResponse({ attachments: [] }),
      ),
    ).toBe(true);
  });

  it("dispatches only attachment changes that belong to a Memo", async () => {
    expect(
      await shouldDispatchMemoBlogSync(
        request("POST", "/api/v1/attachments"),
        jsonResponse({ name: "attachments/a" }),
      ),
    ).toBe(false);
    expect(
      await shouldDispatchMemoBlogSync(
        request("POST", "/api/v1/attachments"),
        jsonResponse({ name: "attachments/a", memo: "memos/123" }),
      ),
    ).toBe(true);
    expect(
      await shouldDispatchMemoBlogSync(
        request("PATCH", "/api/v1/attachments/a"),
        jsonResponse({ name: "attachments/a", memo: "memos/123" }),
      ),
    ).toBe(true);
  });

  it("supports Connect JSON and binary Memo writes", async () => {
    expect(
      await shouldDispatchMemoBlogSync(
        request("POST", "/memos.api.v1.MemoService/CreateMemo"),
        jsonResponse({ visibility: "PUBLIC" }),
      ),
    ).toBe(true);
    expect(
      await shouldDispatchMemoBlogSync(
        request("POST", "/memos.api.v1.MemoService/CreateMemo"),
        jsonResponse({ visibility: "PRIVATE" }),
      ),
    ).toBe(false);
    expect(
      await shouldDispatchMemoBlogSync(
        request(
          "POST",
          "/memos.api.v1.MemoService/CreateMemo",
          "binary payload",
          "application/proto",
        ),
        new Response("binary response", {
          status: 200,
          headers: { "content-type": "application/proto" },
        }),
      ),
    ).toBe(true);
    expect(
      await shouldDispatchMemoBlogSync(
        request("POST", "/memos.api.v1.MemoService/SetMemoAttachments"),
        new Response(null, { status: 200 }),
      ),
    ).toBe(true);
  });

  it("does not dispatch for failed writes or unrelated endpoints", async () => {
    expect(
      await shouldDispatchMemoBlogSync(
        request("POST", "/api/v1/memos"),
        jsonResponse({ visibility: "PUBLIC" }, 400),
      ),
    ).toBe(false);
    expect(
      await shouldDispatchMemoBlogSync(
        request("POST", "/api/app/tasks"),
        jsonResponse({ visibility: "PUBLIC" }),
      ),
    ).toBe(false);
  });

  it("calls only the workflow dispatch endpoint and sends the configured ref", async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(null, { status: 204 }),
    );
    const env = {
      FLAREMO_MEMO_SYNC_GITHUB_TOKEN: "github-token",
      FLAREMO_MEMO_SYNC_GITHUB_REPOSITORY: "cosine00/hug00",
      FLAREMO_MEMO_SYNC_GITHUB_REF: "master",
    } as FlareMoEnv;
    const dispatched = await dispatchMemoBlogSync(
      env,
      request("POST", "/api/v1/memos"),
      jsonResponse({ visibility: "PUBLIC" }),
      fetcher,
    );
    expect(dispatched).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://api.github.com/repos/cosine00/hug00/actions/workflows/fetch-memos.yml/dispatches",
    );
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer github-token",
    );
    expect(JSON.parse(String(init?.body))).toEqual({ ref: "master" });
  });

  it("does nothing until a Worker secret has been configured", async () => {
    const fetcher = vi.fn();
    const dispatched = await dispatchMemoBlogSync(
      {} as FlareMoEnv,
      request("POST", "/api/v1/memos"),
      jsonResponse({ visibility: "PUBLIC" }),
      fetcher,
    );
    expect(dispatched).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
