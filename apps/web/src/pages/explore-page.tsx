import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { listPublicTimeline } from "@/api";
import { authClient } from "@/auth-client";
import { FlareMoLogo } from "@/components/flaremo-logo";
import { LazyMemoContent } from "@/components/lazy-memo-content";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import { formatMemoTime } from "@/lib/memo";

/**
 * The anonymous face of the instance: a timeline of every public memo, the way
 * Memos' /explore works. It renders without a session — `/api/v1/memos` limits
 * an anonymous reader to public rows — and offers sign-in without ever
 * bouncing a visitor through the auth guard.
 *
 * Local customization: stock FlareMo had no public timeline; an anonymous
 * visitor landing on `/` was redirected to `/login`, so publishing public notes
 * produced nothing anyone could browse.
 */
export function ExplorePage() {
  const { locale, t } = useI18n();
  const session = authClient.useSession();
  const signedIn = Boolean(session.data?.user);
  const timeline = useInfiniteQuery({
    queryKey: ["public-timeline"],
    queryFn: ({ pageParam }) => listPublicTimeline({ pageToken: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextPageToken,
    retry: 1,
  });
  const memos = timeline.data?.pages.flatMap((page) => page.memos) ?? [];

  return (
    <div className="min-h-svh bg-background px-4 py-6 sm:py-10">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <header className="flex items-center justify-between gap-3 border-b pb-4">
          <div className="flex flex-col gap-1">
            <FlareMoLogo labelClassName="text-lg" markClassName="size-7" />
            <p className="text-xs text-muted-foreground">
              {t("explore.subtitle")}
            </p>
          </div>
          <Button
            render={
              <Link to={signedIn ? "/" : "/login"} />
            }
            size="sm"
            variant="outline"
          >
            {signedIn ? t("explore.enterWorkspace") : t("auth.signIn")}
          </Button>
        </header>

        {timeline.isLoading && (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        )}

        {timeline.isError && (
          <Empty className="min-h-56 border">
            <EmptyHeader>
              <EmptyTitle>{t("explore.loadFailed")}</EmptyTitle>
              <EmptyDescription>{t("common.retry")}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                onClick={() => void timeline.refetch()}
                size="sm"
                variant="outline"
              >
                {t("common.retry")}
              </Button>
            </EmptyContent>
          </Empty>
        )}

        {!timeline.isLoading && !timeline.isError && memos.length === 0 && (
          <Empty className="min-h-56 border">
            <EmptyHeader>
              <EmptyTitle>{t("explore.emptyTitle")}</EmptyTitle>
              <EmptyDescription>
                {t("explore.emptyDescription")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {memos.map((memo) => (
          <article
            className="flex flex-col gap-3 rounded-xl border bg-card p-4"
            key={memo.name}
          >
            <time className="text-xs text-muted-foreground">
              {formatMemoTime(memo.createTime, locale)}
            </time>
            <LazyMemoContent
              className="text-[15px] leading-7 [&_img]:rounded-lg"
              content={memo.content}
            />
            {memo.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {memo.tags.map((tag) => (
                  <span
                    className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                    key={tag}
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </article>
        ))}

        {memos.length > 0 && (
          <div className="flex justify-center py-2">
            {timeline.hasNextPage ? (
              <Button
                disabled={timeline.isFetchingNextPage}
                onClick={() => void timeline.fetchNextPage()}
                size="sm"
                variant="outline"
              >
                {timeline.isFetchingNextPage
                  ? t("common.loading")
                  : t("explore.loadMore")}
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">
                {t("explore.end")}
              </span>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
