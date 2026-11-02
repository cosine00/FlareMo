import { applyFlaremoMigrations, createDb } from "@flaremo/db";
import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  FALLBACK_MEMO_VISIBILITY,
  getDefaultMemoVisibility,
  normalizeMemoVisibility,
  setDefaultMemoVisibility,
} from "./memo-visibility";
import { createMemo } from "./memos";
import type { TeamViewer } from "./team-permissions";
import { createTeamMember, ensureTeamOwner } from "./test-support";

let mf: Miniflare;
let db: ReturnType<typeof createDb>;
let owner: TeamViewer;

beforeEach(async () => {
  mf = new Miniflare({
    script: "export default { fetch() { return new Response('ok') } }",
    modules: true,
    compatibilityDate: "2026-07-10",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: { DB: "flaremo-visibility-test" },
  });
  const database = await mf.getD1Database("DB");
  db = createDb(database);
  await applyFlaremoMigrations(database);
  owner = await ensureTeamOwner(db);
});

afterEach(async () => {
  await mf.dispose();
});

describe("default memo visibility", () => {
  it("keeps the public default for an account that never chose", async () => {
    expect(await getDefaultMemoVisibility(db, owner)).toBe(
      FALLBACK_MEMO_VISIBILITY,
    );
  });

  it("applies a saved preference to creates that omit visibility", async () => {
    await setDefaultMemoVisibility(db, owner, "private");

    const memo = await createMemo(db, owner, {
      content: "a private-first account",
      source: "web",
    });

    expect(memo.visibility).toBe("private");
    // A private memo stays out of the shared team corpus.
    expect(memo.teamId).toBeNull();
  });

  it("never overrides a value the request states explicitly", async () => {
    await setDefaultMemoVisibility(db, owner, "private");

    const memo = await createMemo(db, owner, {
      content: "an explicit public note",
      visibility: "public",
      source: "web",
    });

    expect(memo.visibility).toBe("public");
  });

  it("keeps each account's preference separate", async () => {
    const second = await createTeamMember(db, "Second");
    await setDefaultMemoVisibility(db, owner, "public");
    await setDefaultMemoVisibility(db, second, "private");

    const ownerMemo = await createMemo(db, owner, {
      content: "owner default",
      source: "web",
    });
    const secondMemo = await createMemo(db, second, {
      content: "second default",
      source: "web",
    });

    expect(ownerMemo.visibility).toBe("public");
    expect(secondMemo.visibility).toBe("private");
  });

  it("accepts the Memos wire enum, including LOCAL as the team tier", async () => {
    expect(await setDefaultMemoVisibility(db, owner, "LOCAL")).toBe(
      "protected",
    );
    expect(await setDefaultMemoVisibility(db, owner, "PRIVATE")).toBe(
      "private",
    );
    expect(await getDefaultMemoVisibility(db, owner)).toBe("private");
  });

  it("rejects an unknown tier instead of silently keeping the old one", async () => {
    await setDefaultMemoVisibility(db, owner, "private");
    await expect(setDefaultMemoVisibility(db, owner, "secret")).rejects.toThrow(
      /Unsupported memo visibility/,
    );
    expect(await getDefaultMemoVisibility(db, owner)).toBe("private");
  });

  it("normalizes only the three tiers", () => {
    expect(normalizeMemoVisibility(" Public ")).toBe("public");
    expect(normalizeMemoVisibility("local")).toBe("protected");
    expect(normalizeMemoVisibility("")).toBeNull();
    expect(normalizeMemoVisibility(undefined)).toBeNull();
  });
});
