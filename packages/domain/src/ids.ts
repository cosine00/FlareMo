import type { FlareMoDb } from "@flaremo/db";
import { memos } from "@flaremo/db";
import { sql } from "drizzle-orm";

/**
 * Local customization: new memos continue the numeric series that the Memos
 * import brought in (`memos/1` … `memos/1234`) instead of getting a UUID. The
 * stored shape is unchanged — `memos/<id>` — so routes, shares, anchors and
 * the MCP surface keep working, and a memo URL reads `/memo/1235`.
 *
 * Allocation is `max + 1` over purely numeric ids; UUID-suffixed ids are
 * excluded because `CAST('7146f065-…' AS INTEGER)` silently yields 7146 and
 * would hand out a colliding number. Reads are not atomic with the insert, so
 * two creates racing inside the same tick could pick the same number and the
 * second batch would fail on the primary key. That window is acceptable on a
 * single-user instance: repeated submits are already de-duplicated by
 * `client_id` before this runs, and a lost race surfaces as a visible error
 * rather than a silent duplicate.
 */
export async function allocateMemoId(db: FlareMoDb): Promise<string> {
  const row = await db
    .select({
      max: sql<number | null>`MAX(CAST(substr(${memos.id}, 7) AS INTEGER))`,
    })
    .from(memos)
    .where(
      sql`${memos.id} GLOB 'memos/[0-9]*' AND substr(${memos.id}, 7) NOT GLOB '*[^0-9]*'`,
    )
    .get();
  return `memos/${Number(row?.max ?? 0) + 1}`;
}

export function createResourceId(
  prefix:
    | "articles"
    | "attachments"
    | "memos"
    | "memories"
    | "projects"
    | "revisions"
    | "shares"
    | "tasks",
) {
  return `${prefix}/${crypto.randomUUID()}`;
}

export function parseResourceName(
  name: string,
  prefix:
    | "articles"
    | "attachments"
    | "memos"
    | "memories"
    | "projects"
    | "revisions"
    | "shares"
    | "tasks",
) {
  if (name.startsWith(`${prefix}/`)) {
    return name;
  }
  return `${prefix}/${name}`;
}

export function createToken(byteLength = 24) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}
