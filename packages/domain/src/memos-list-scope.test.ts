import {
  applyFlaremoMigrations,
  attachments,
  createDb,
  type MemoRow,
  memos,
} from "@flaremo/db";
import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listAttachmentsForMemosForViewer } from "./attachments-list";
import { createMemo, listMemosForViewer } from "./memos";
import { updateMemo } from "./memos-write";
import type { TeamViewer } from "./team-permissions";
import { createTeamMember, ensureTeamOwner } from "./test-support";

let mf: Miniflare;
let db: ReturnType<typeof createDb>;
let owner: TeamViewer;
let member: TeamViewer;

beforeEach(async () => {
  mf = new Miniflare({
    script: "export default { fetch() { return new Response('ok') } }",
    modules: true,
    compatibilityDate: "2026-07-10",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: { DB: "flaremo-list-scope-test" },
  });
  const database = await mf.getD1Database("DB");
  db = createDb(database);
  await applyFlaremoMigrations(database);
  owner = await ensureTeamOwner(db);
  member = await createTeamMember(db, "Author");
});

afterEach(async () => {
  await mf.dispose();
});

/** A single-user deployment: no team organization, so the read scope is
 * exactly `own OR public` — the shape listMemosForViewer splits into two
 * ordered branches. */
function soloViewer(viewer: TeamViewer): TeamViewer {
  return { ...viewer, teamOrganizationId: null };
}

function timelineOrder(a: MemoRow, b: MemoRow): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  const byCreated = b.createdAt.localeCompare(a.createdAt);
  if (byCreated !== 0) return byCreated;
  return b.id.localeCompare(a.id);
}

describe("listMemosForViewer own-or-public split", () => {
  let expected: MemoRow[];

  beforeEach(async () => {
    // Seeding needs a real team membership; only the *read* is done through
    // the single-user scope above.
    const author = owner;
    // The author's own rows: both visibilities count for the author.
    for (let index = 0; index < 6; index += 1) {
      await createMemo(db, author, {
        content: `own public ${index}`,
        visibility: "public",
        source: "web",
      });
      await createMemo(db, author, {
        content: `own private ${index}`,
        visibility: "private",
        source: "web",
      });
    }
    // Another author's rows: only the public one is readable here.
    for (let index = 0; index < 4; index += 1) {
      await createMemo(db, member, {
        content: `other public ${index}`,
        visibility: "public",
        source: "web",
      });
      await createMemo(db, member, {
        content: `other private ${index}`,
        visibility: "private",
        source: "web",
      });
    }
    // A pinned row and an archived row, both of which have to keep their
    // existing meaning: pinned leads the timeline, archived stays out of it.
    const pinned = await createMemo(db, author, {
      content: "own pinned",
      visibility: "public",
      source: "web",
    });
    await updateMemo(db, author, pinned.id, { pinned: true });
    const archived = await createMemo(db, author, {
      content: "own archived",
      visibility: "public",
      source: "web",
    });
    await updateMemo(db, author, archived.id, { status: "archived" });

    const all = await db.select().from(memos);
    expected = all
      .filter(
        (memo) =>
          memo.status === "normal" &&
          (memo.userId === author.id ||
            (memo.visibility === "public" && memo.status === "normal")),
      )
      .sort(timelineOrder);
  });

  it("returns the whole scope in timeline order, once each", async () => {
    const page = await listMemosForViewer(db, soloViewer(owner), {
      page_size: 100,
      order_by: "created_at desc",
      include_deleted: false,
    });
    const ids = page.memos.map((memo) => memo.id);
    expect(ids).toEqual(expected.map((memo) => memo.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(6 + 6 + 4 + 1);
  });

  it("paginates without dropping or repeating a row across the split", async () => {
    const viewer = soloViewer(owner);
    const seen: string[] = [];
    let pageToken: string | undefined;
    for (let guard = 0; guard < 20; guard += 1) {
      const page = await listMemosForViewer(db, viewer, {
        page_size: 3,
        order_by: "created_at desc",
        include_deleted: false,
        ...(pageToken ? { page_token: pageToken } : {}),
      });
      seen.push(...page.memos.map((memo) => memo.id));
      pageToken = page.nextPageToken;
      if (!pageToken) break;
    }
    expect(seen).toEqual(expected.map((memo) => memo.id));
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("keeps the team scope on the single-statement path intact", async () => {
    // The owner has a team organization here, so the split is skipped and the
    // original OR predicate answers. Blog-team rows must still be reachable.
    const teamMemo = await createMemo(db, member, {
      content: "team only",
      visibility: "protected",
      source: "web",
    });
    const page = await listMemosForViewer(db, owner, {
      page_size: 100,
      order_by: "created_at desc",
      include_deleted: false,
    });
    const ids = page.memos.map((memo) => memo.id);
    expect(ids).toContain(teamMemo.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("listAttachmentsForMemosForViewer scope", () => {
  async function seedAttachment(
    memoId: string,
    author: TeamViewer,
    filename: string,
  ) {
    await db.insert(attachments).values({
      id: `attachments/${filename}`,
      userId: author.id,
      memoId,
      r2Key: `attachments/${filename}`,
      filename,
      size: 12,
      state: "ready",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  it("never returns an attachment the viewer may not read", async () => {
    const viewer = soloViewer(owner);
    const ownPrivate = await createMemo(db, owner, {
      content: "private note",
      visibility: "private",
      source: "web",
    });
    const publicNote = await createMemo(db, owner, {
      content: "public note",
      visibility: "public",
      source: "web",
    });
    const foreignPrivate = await createMemo(db, member, {
      content: "someone else's private note",
      visibility: "private",
      source: "web",
    });

    await seedAttachment(ownPrivate.id, owner, "own-private.png");
    await seedAttachment(publicNote.id, owner, "public.png");
    await seedAttachment(foreignPrivate.id, member, "foreign-private.png");

    const ids = [ownPrivate.id, publicNote.id, foreignPrivate.id];

    const asOwner = await listAttachmentsForMemosForViewer(db, viewer, ids);
    expect(asOwner.map((row) => row.filename).sort()).toEqual([
      "own-private.png",
      "public.png",
    ]);

    // The anonymous viewer only reaches the public memo.
    const anonymously = await listAttachmentsForMemosForViewer(db, null, ids);
    expect(anonymously.map((row) => row.filename)).toEqual(["public.png"]);
  });

  it("hydrates a full 100-id page without exceeding the parameter cap", async () => {
    const viewer = soloViewer(owner);
    const ids = Array.from({ length: 100 }, (_, index) => `memos/${index + 1}`);
    await expect(
      listAttachmentsForMemosForViewer(db, viewer, ids),
    ).resolves.toEqual([]);
  });
});
