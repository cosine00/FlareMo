import { applyFlaremoMigrations, createDb } from "@flaremo/db";
import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listAttachmentsForMemosForViewer } from "./attachments-list";
import { ensureTeamOwner } from "./test-support";

let mf: Miniflare;
let db: ReturnType<typeof createDb>;

describe("listAttachmentsForMemosForViewer chunking", () => {
  beforeEach(async () => {
    mf = new Miniflare({
      script: "export default { fetch() { return new Response('ok') } }",
      modules: true,
      compatibilityDate: "2026-07-10",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: { DB: "flaremo-attachments-list-test" },
    });
    const database = await mf.getD1Database("DB");
    db = createDb(database);
    await applyFlaremoMigrations(database);
  });

  afterEach(async () => {
    await mf.dispose();
  });

  // A memo page is hydrated in one pass, and the D1 cap is 100 bound
  // parameters per statement. At reserve 2 the statement bound 98 ids plus the
  // viewer scope and `GET /api/v1/memos?pageSize=98` answered 500 on
  // production while 97 still worked, which broke every client that requests a
  // full page (MoeMemos and the Obsidian sync both ask for 1000).
  for (const size of [98, 100]) {
    it(`hydrates ${size} memo ids without exceeding the parameter cap`, async () => {
      const ids = Array.from({ length: size }, (_, index) => `memos/${index + 1}`);

      await expect(
        listAttachmentsForMemosForViewer(db, null, ids),
      ).resolves.toEqual([]);

      const user = await ensureTeamOwner(db);
      await expect(
        listAttachmentsForMemosForViewer(db, user, ids),
      ).resolves.toEqual([]);
    });
  }
});
