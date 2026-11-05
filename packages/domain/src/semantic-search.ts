import type { FlareMoDb, MemoRow, UserRow } from "@flaremo/db";
import { memos } from "@flaremo/db";
import { and, eq, inArray } from "drizzle-orm";
import { chunkForD1, d1IdsPerStatement } from "./d1-limits";
import type { EmbeddingProvider, VectorIndex } from "./embedding";
import { scopedReadScope } from "./team-permissions";

export type SemanticSearchDeps = {
  provider: EmbeddingProvider;
  index: VectorIndex;
  /**
   * Scopes the vector query to tenant buckets inside a shared index (one
   * bucket per searched partition, e.g. the caller's personal namespace plus
   * the team namespace). Omitted namespaces are simply not queried.
   */
  namespaces?: string[];
  /**
   * Which partition the hits belong to. A personal (or unspecified) search is
   * narrowed to the viewer's own rows; the team partition keeps team-wide
   * visibility. See `semanticSearchScope`.
   */
  space?: "personal" | "team";
};

/**
 * The D1 boundary for semantic hits.
 *
 * Deliberately narrower than `memoReadScope`, which also admits other people's
 * public rows: the workspace search is a view of one person's journal, and
 * letting a public row through made search disagree with the timeline and the
 * sidebar counters.
 */
function semanticSearchScope(
  user: UserRow,
  space: "personal" | "team" | undefined,
) {
  return space === "team"
    ? scopedReadScope(user, "team")
    : eq(memos.userId, user.id);
}

export type SemanticMemoHit = {
  id: string;
  score: number;
};

// A memo is chunked as `memos/{id}#chunks/{idx}`. Strip the chunk suffix to
// recover the owning memo id.
function memoIdFromVectorId(vectorId: string): string {
  const separator = vectorId.indexOf("#chunks/");
  return separator === -1 ? vectorId : vectorId.slice(0, separator);
}

/**
 * Semantic memo search. Vectorize only supplies candidate ids + scores; every
 * hit is re-read from D1 and filtered by owner/status so a stale or
 * unauthorized vector can never surface content on its own.
 */
export async function semanticSearchMemos(
  db: FlareMoDb,
  user: UserRow,
  deps: SemanticSearchDeps,
  query: string,
  limit = 10,
): Promise<SemanticMemoHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const [queryVector] = await deps.provider.embed([trimmed]);
  if (!queryVector || queryVector.length === 0) return [];

  // Memo embeddings are partitioned per visibility bucket (personal namespaces
  // plus one shared team namespace), so each query only scans the partitions
  // the caller is entitled to search — no pool dilution from other tenants.
  // Vectorize only supplies candidates; the D1 scope below remains the
  // authorization boundary and drops anything else. (Memory embeddings keep
  // per-user namespaces because memory recall is scoped to the caller's own
  // items.) The top-K budget is split across buckets; matches are merged by
  // best chunk score per memo.
  const namespaces = deps.namespaces?.length ? deps.namespaces : [undefined];
  const bucketTopK = Math.min(
    Math.ceil(Math.min(limit * 5, 100) / namespaces.length),
    100,
  );
  const queried = await Promise.all(
    namespaces.map((namespace) =>
      deps.index.query(queryVector, bucketTopK, namespace),
    ),
  );
  const matches = queried.flat();
  if (matches.length === 0) return [];

  const candidateIds = [
    ...new Set(matches.map((match) => memoIdFromVectorId(match.id))),
  ];
  // The probe exists only to drop ids the caller may not read (the D1 scope is
  // the authorization boundary; Vectorize candidates are untrusted). Selecting
  // the id alone keeps the dropped rows — content and payload blobs — out of
  // the read. Candidate ids come from every queried namespace, so the list can
  // exceed D1's per-statement binding cap and has to be chunked.
  const allowed = new Set<string>();
  for (const idChunk of chunkForD1(candidateIds, d1IdsPerStatement(4))) {
    const rows = await db
      .select({ id: memos.id })
      .from(memos)
      .where(
        and(
          semanticSearchScope(user, deps.space),
          inArray(memos.id, idChunk),
          inArray(memos.status, ["normal", "archived"]),
        ),
      );
    for (const row of rows) allowed.add(row.id);
  }

  // Aggregate the best chunk score per memo, preserving vector order relevance.
  const scored = new Map<string, number>();
  for (const match of matches) {
    const memoId = memoIdFromVectorId(match.id);
    if (!allowed.has(memoId)) continue;
    const current = scored.get(memoId);
    if (current === undefined || match.score > current) {
      scored.set(memoId, match.score);
    }
  }

  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id, score]) => ({ id, score }));
}

/**
 * Read back the candidate memos for a semantic search result set, preserving
 * the caller's hit order. The scope mirrors the vector pre-filter: a personal
 * search rehydrates only the viewer's own rows, a team search the team
 * partition. It is deliberately narrower than `memoReadScope` — that boundary
 * also admits other people's public rows, which the workspace search must not
 * surface — and it remains the single D1 authorization boundary for
 * rehydrating hits, so routes must not query the memos table directly.
 */
export async function getSemanticSearchMemos(
  db: FlareMoDb,
  user: UserRow,
  candidateIds: string[],
  options: { space?: "personal" | "team" } = {},
): Promise<MemoRow[]> {
  if (candidateIds.length === 0) return [];
  const scope = semanticSearchScope(user, options.space);
  const byId = new Map<string, MemoRow>();
  for (const idChunk of chunkForD1(candidateIds, d1IdsPerStatement(4))) {
    const rows = await db
      .select()
      .from(memos)
      .where(
        and(
          scope,
          inArray(memos.id, idChunk),
          inArray(memos.status, ["normal", "archived"]),
        ),
      );
    for (const row of rows) byId.set(row.id, row);
  }
  return candidateIds
    .map((id) => byId.get(id))
    .filter((row): row is MemoRow => row !== undefined);
}
