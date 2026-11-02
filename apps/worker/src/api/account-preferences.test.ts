import type { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAppTestHarness, json } from "../test-support/app";
import { createTestRuntime } from "../test-support/runtime";

let mf: Miniflare;
let env: Env;
let sessionCookie: string;

const { fetchApp, fetchCurrent, bootstrapAndSignIn } = createAppTestHarness(
  () => ({
    env,
    sessionCookie,
  }),
);

function savePreference(visibility: string) {
  return fetchApp("http://flaremo.test/api/app/account/preferences", {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      origin: "http://flaremo.test",
    },
    body: JSON.stringify({ default_memo_visibility: visibility }),
  });
}

describe("account preferences", () => {
  beforeEach(async () => {
    ({ runtime: mf, env } = await createTestRuntime({
      databaseName: "flaremo-preferences-test",
      attachmentsName: "flaremo-preferences-attachments",
    }));
    sessionCookie = await bootstrapAndSignIn();
  });

  afterEach(async () => {
    await mf.dispose();
  });

  it("defaults to public and round-trips a saved tier", async () => {
    const initial = await json(
      await fetchApp("http://flaremo.test/api/app/account/preferences"),
    );
    expect(initial.default_memo_visibility).toBe("public");

    const saved = await json(await savePreference("private"));
    expect(saved.default_memo_visibility).toBe("private");

    const reread = await json(
      await fetchApp("http://flaremo.test/api/app/account/preferences"),
    );
    expect(reread.default_memo_visibility).toBe("private");
  });

  it("rejects a tier outside the three the API accepts", async () => {
    const response = await savePreference("secret");
    expect(response.status).toBe(400);
  });

  it("applies the account default to a current-wire create", async () => {
    await savePreference("private");

    const omitted = await json(
      await fetchCurrent("http://flaremo.test/api/v1/memos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: "written without a tier" }),
      }),
    );
    expect(omitted.visibility).toBe("PRIVATE");

    const explicit = await json(
      await fetchCurrent("http://flaremo.test/api/v1/memos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content: "written as public on purpose",
          visibility: "PUBLIC",
        }),
      }),
    );
    expect(explicit.visibility).toBe("PUBLIC");
  });

  it("applies the account default to a legacy-wire create too", async () => {
    await savePreference("private");

    const created = await json(
      await fetchApp("http://flaremo.test/api/v1/memos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: "legacy writer without a tier" }),
      }),
    );
    expect(created.visibility).toBe("private");
  });

  it("shares one value with the Memos settings surface", async () => {
    await savePreference("private");

    const settings = await json(
      await fetchCurrent(
        "http://flaremo.test/api/v1/users/owner/settings/GENERAL",
      ),
    );
    expect(settings.generalSetting.memoVisibility).toBe("PRIVATE");
  });
});
