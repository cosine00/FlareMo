import type { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAppTestHarness, json } from "../test-support/app";
import { createTestRuntime } from "../test-support/runtime";

let mf: Miniflare;
let env: Env;
let sessionCookie: string;

// The worker handler is invoked in-process here (no workerd), so `caches` does
// not exist. A Map-backed Cache double lets the real helper code — key shape,
// headers, bypass rules — run unchanged.
const edgeStore = new Map<string, Response>();
const fakeCaches = {
  default: {
    match: async (request: Request) => edgeStore.get(request.url)?.clone(),
    put: async (request: Request, response: Response) => {
      edgeStore.set(request.url, response);
    },
  },
};

const { fetchApp, bootstrapAndSignIn } = createAppTestHarness(() => ({
  env,
  sessionCookie,
}));

async function createPublicMemo(content: string) {
  return json<{ name: string }>(
    await fetchApp("http://flaremo.test/api/v1/memos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content, visibility: "public" }),
    }),
  );
}

describe("anonymous memo list cache", () => {
  beforeEach(async () => {
    edgeStore.clear();
    (globalThis as { caches?: unknown }).caches = fakeCaches;
    ({ runtime: mf, env } = await createTestRuntime({
      databaseName: "flaremo-list-cache-test",
      attachmentsName: "flaremo-list-cache-attachments-test",
    }));
    sessionCookie = await bootstrapAndSignIn();
  });

  afterEach(async () => {
    (globalThis as { caches?: unknown }).caches = undefined;
    await mf.dispose();
  });

  it("serves a cached snapshot to anonymous readers for a minute", async () => {
    await createPublicMemo("cached first");
    const url =
      "http://flaremo.test/api/v1/memos?page_size=10&order_by=create_time%20asc";

    const first = await fetchApp(url, undefined, { authenticated: false });
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toContain("max-age=60");
    const firstBody = await first.text();
    expect(firstBody).toContain("cached first");

    await createPublicMemo("cached second");

    const second = await fetchApp(url, undefined, { authenticated: false });
    expect(await second.text()).toBe(firstBody);
    expect(edgeStore.size).toBe(1);

    // A different page size is a different cache key, so it must not be
    // answered from the first entry.
    const other = await fetchApp(
      "http://flaremo.test/api/v1/memos?page_size=1",
      undefined,
      { authenticated: false },
    );
    expect(await other.text()).not.toBe(firstBody);
  });

  it("never answers a signed-in request from the shared entry", async () => {
    await createPublicMemo("live first");
    const url =
      "http://flaremo.test/api/v1/memos?page_size=10&order_by=create_time%20asc";

    const anonymous = await fetchApp(url, undefined, { authenticated: false });
    expect(await anonymous.text()).toContain("live first");

    await createPublicMemo("live second");

    // Same URL, same cache key — but the session cookie must take the live
    // path, and the response must not be stored under that key.
    const signedIn = await fetchApp(url, {
      headers: { "x-flaremo-wire": "current" },
    });
    expect(signedIn.status).toBe(200);
    expect(signedIn.headers.get("cache-control")).toBeNull();
    expect(await signedIn.text()).toContain("live second");

    // The signed-in body was not written under the anonymous key either.
    const cachedCopy = edgeStore.get(url);
    expect(cachedCopy).toBeTruthy();
    expect(await cachedCopy?.text()).not.toContain("live second");
  });
});
