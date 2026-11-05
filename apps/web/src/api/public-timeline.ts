/**
 * Public timeline reads for the anonymous explore page.
 *
 * The app API (`/api/app/memos`) requires a session, so the explore page reads
 * the Memos-compatible surface instead: `/api/v1/memos` already narrows an
 * anonymous viewer to normal public memos (see `memoReadScope` in the domain
 * package). A bare `fetch` is deliberate — `apiRequest` fires the global
 * authentication-required event on a 401, which would bounce an anonymous
 * visitor straight to the login page.
 */
export type PublicTimelineMemo = {
  content: string;
  createTime: string;
  /** `memos/<id>` — the same identity the share pages use. */
  name: string;
  tags: string[];
  updateTime: string;
};

export type PublicTimelinePage = {
  memos: PublicTimelineMemo[];
  nextPageToken?: string;
};

export async function listPublicTimeline(
  params: { pageSize?: number; pageToken?: string } = {},
): Promise<PublicTimelinePage> {
  const search = new URLSearchParams({
    pageSize: String(params.pageSize ?? 20),
  });
  if (params.pageToken) search.set("pageToken", params.pageToken);
  // Explore is the one surface where other people's notes belong, and it has
  // to mean "public" to a signed-in visitor too. Without the filter the read
  // boundary widens to everything the viewer can see, so their own private
  // drafts would appear in what looks like a public feed.
  search.set("filter", 'visibility == "PUBLIC"');

  const response = await fetch(`/api/v1/memos?${search.toString()}`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`public timeline unavailable (${response.status})`);
  }

  const payload = (await response.json()) as {
    memos?: PublicTimelineMemo[];
    nextPageToken?: string;
  };
  return {
    memos: payload.memos ?? [],
    nextPageToken: payload.nextPageToken,
  };
}
