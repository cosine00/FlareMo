import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarDaysIcon, PlusIcon } from "lucide-react";
import { useMemo } from "react";
import { getDailyReview, listMemos, type Memo } from "@/api";
import { MemoSnapshotCard } from "@/components/memo-snapshot-card";
import { QueryErrorState } from "@/components/query-error-state";
import { TodayTasks } from "@/components/today-tasks";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { WorkspacePageHeader } from "@/components/workspace/workspace-page-header";
import { type TranslationKey, type TranslationParams, useI18n } from "@/i18n";
import { isoDay, todayKey } from "@/lib/calendar-date";
import { calendarYearsBetween } from "@/lib/calendar-years";

export function DailyReviewPage() {
  const { locale, t } = useI18n();
  const today = useMemo(() => todayKey(), []);
  const tzOffset = useMemo(() => -new Date().getTimezoneOffset(), []);
  const reviewQuery = useQuery({
    queryKey: ["daily-review", today, tzOffset],
    queryFn: () => getDailyReview(today, tzOffset),
    retry: false,
  });

  // Cold-start interval ladder for users in their first year:
  // when "on-this-day" returns nothing, pull earlier memos from recent weeks/months.
  const intervalQuery = useQuery({
    queryKey: ["daily-review-ladder", today],
    queryFn: () => listMemos({ page_size: 12, state: "normal" }),
    enabled: Boolean(reviewQuery.data && reviewQuery.data.memos.length === 0),
    retry: false,
  });

  const rawMemos =
    reviewQuery.data && reviewQuery.data.memos.length > 0
      ? reviewQuery.data.memos
      : (intervalQuery.data?.memos ?? []);

  const groups = useMemo(
    () => buildReviewGroups(rawMemos, today, t),
    [rawMemos, today, t],
  );

  const isInitialLoading = reviewQuery.isLoading;
  // The ladder only runs when on-this-day came back empty; a failed ladder
  // must surface as an error rather than masquerade as "nothing to review".
  const failedQuery = reviewQuery.isError
    ? reviewQuery
    : intervalQuery.isError
      ? intervalQuery
      : null;

  return (
    <WorkspaceLayout
      header={({
        sidebarCollapsed,
        toggleSidebarCollapsed,
        mobileSheetOpen,
        setMobileSheetOpen,
        explorer,
      }) => (
        <WorkspacePageHeader
          explorer={explorer}
          icon={
            <CalendarDaysIcon className="size-4 shrink-0 text-brand-600 dark:text-brand-400" />
          }
          mobileSheetOpen={mobileSheetOpen}
          setMobileSheetOpen={setMobileSheetOpen}
          sidebarCollapsed={sidebarCollapsed}
          title={t("nav.dailyReview")}
          toggleSidebarCollapsed={toggleSidebarCollapsed}
        />
      )}
    >
      <div className="flex flex-col gap-4 py-2">
        <TodayTasks />
        {isInitialLoading && (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}
        {failedQuery && (
          <QueryErrorState
            className="min-h-72 border text-muted-foreground"
            isRetrying={failedQuery.isFetching}
            onRetry={() => void failedQuery.refetch()}
          />
        )}
        {reviewQuery.data &&
          !isInitialLoading &&
          groups.length === 0 &&
          !intervalQuery.isLoading &&
          !intervalQuery.isError && (
            <Empty className="min-h-72 border border-border/60 bg-card/50 motion-safe:animate-rise">
              <EmptyHeader>
                <EmptyMedia
                  className="bg-accent text-accent-foreground"
                  variant="icon"
                >
                  <CalendarDaysIcon className="size-5" />
                </EmptyMedia>
                <EmptyTitle>{t("review.dailyEmptyTitle")}</EmptyTitle>
                <EmptyDescription>
                  {t("review.dailyEmptyDescription")}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button
                  render={
                    <Link
                      search={{
                        compose: true,
                        q: undefined,
                        tag: undefined,
                        view: undefined,
                        space: undefined,
                        untagged: undefined,
                      }}
                      to="/"
                    />
                  }
                  size="sm"
                  variant="outline"
                >
                  <PlusIcon className="size-4" data-icon="inline-start" />
                  {t("review.writeTodayMemo")}
                </Button>
              </EmptyContent>
            </Empty>
          )}
        {groups.map((group) => (
          <section className="flex flex-col gap-3" key={group.key}>
            <h2 className="px-1 text-sm font-medium text-muted-foreground">
              {group.title}
            </h2>
            {group.memos.map((memo) => (
              <MemoSnapshotCard key={memo.name} locale={locale} memo={memo} />
            ))}
          </section>
        ))}
      </div>
    </WorkspaceLayout>
  );
}

type ReviewGroup = {
  key: string;
  title: string;
  memos: Memo[];
};

function buildReviewGroups(
  memos: Memo[],
  todayStr: string,
  t: (key: TranslationKey, params?: TranslationParams) => string,
): ReviewGroup[] {
  const groups: ReviewGroup[] = [];
  // Whole local calendar days between two `YYYY-MM-DD` keys; noon anchors
  // keep a daylight-saving shift from moving the result.
  const daysBetween = (from: string, to: string) =>
    Math.round(
      (new Date(`${to}T12:00:00`).getTime() -
        new Date(`${from}T12:00:00`).getTime()) /
        86_400_000,
    );

  for (const memo of memos) {
    const timeStr = memo.display_time ?? memo.create_time;
    // The memo's day as the author saw it. The stored time is UTC, so
    // slicing the string put a note written at 07:00 in UTC+8 on the
    // previous day, and today's notes leaked into the review.
    const memoDay = isoDay(new Date(timeStr));
    // The review looks back; anything written today is not a memory yet.
    if (memoDay >= todayStr) continue;

    const diffDays = daysBetween(memoDay, todayStr);
    // Count completed calendar anniversaries. Dividing elapsed days by 365.25
    // made an exact non-leap anniversary (365 days) zero years old, and made a
    // two-year span containing one leap day only one year old.
    const yearsAgo = calendarYearsBetween(memoDay, todayStr);

    let key: string;
    let title: string;

    if (yearsAgo >= 1) {
      key = `years-${yearsAgo}`;
      title =
        yearsAgo === 1
          ? t("review.oneYearAgoToday")
          : t("review.yearsAgoToday", { count: yearsAgo });
    } else if (diffDays <= 7) {
      // First-year progressive interval ladder (spaced repetition).
      key = "ladder-7d";
      title = t("review.ladder7d");
    } else if (diffDays <= 30) {
      key = "ladder-30d";
      title = t("review.ladder30d");
    } else if (diffDays <= 90) {
      key = "ladder-90d";
      title = t("review.ladder90d");
    } else {
      key = "ladder-180d";
      title = t("review.ladder180d");
    }

    const existing = groups.find((g) => g.key === key);
    if (existing) {
      existing.memos.push(memo);
    } else {
      groups.push({ key, title, memos: [memo] });
    }
  }

  return groups;
}
