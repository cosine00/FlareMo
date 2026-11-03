import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  BrainCircuitIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  HistoryIcon,
  Loader2Icon,
  SaveIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  createInsightPreset,
  deleteInsightPreset,
  deleteInsightReport,
  generateInsight,
  getAiSettings,
  getTagHierarchy,
  listInsightPresets,
  listInsightReports,
  listMemos,
} from "@/api";
import { MemoContent } from "@/components/memo-content";
import { QueryErrorState } from "@/components/query-error-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { WorkspacePageHeader } from "@/components/workspace/workspace-page-header";
import { type TranslationKey, useI18n } from "@/i18n";
import { formatMemoTime, memoTitle } from "@/lib/memo";
import { stripResourceName } from "@/lib/utils";

type Range = "7d" | "30d" | "90d" | "all";
type SelectionMode = "random" | "recent";
type BuiltinPerspective =
  | "default"
  | "affirmation"
  | "action"
  | "meaning"
  | "question"
  | "values"
  | "reverse"
  | "custom";

const PERSPECTIVES: Array<{
  id: BuiltinPerspective;
  label: TranslationKey;
  prompt: string;
}> = [
  {
    id: "default",
    label: "ai.insight.perspective.default",
    prompt:
      "识别反复出现的核心主题、隐藏联系和思维盲点，并留下一个值得继续思考的问题。",
  },
  {
    id: "affirmation",
    label: "ai.insight.perspective.affirmation",
    prompt:
      "像真诚但不说空话的朋友一样，指出这些记录中值得肯定的努力、能力和变化。",
  },
  {
    id: "action",
    label: "ai.insight.perspective.action",
    prompt:
      "从记录中提炼一个最值得推进的方向，并给出克制、具体、可执行的下一步。",
  },
  {
    id: "meaning",
    label: "ai.insight.perspective.meaning",
    prompt: "寻找这些记录背后反复出现的在意、需要和意义感来源，不要泛泛而谈。",
  },
  {
    id: "question",
    label: "ai.insight.perspective.question",
    prompt:
      "不要急着给答案。结合记录提出一个触及核心、能让人停下来思考的问题，并解释依据。",
  },
  {
    id: "values",
    label: "ai.insight.perspective.values",
    prompt:
      "辨认记录中可能冲突或尚未说清的价值取向，帮助我看见真正优先的是什么。",
  },
  {
    id: "reverse",
    label: "ai.insight.perspective.reverse",
    prompt:
      "从相反假设出发审视这些记录，指出一个可能被忽略的解释、限制或反例。",
  },
  {
    id: "custom",
    label: "ai.insight.perspective.custom",
    prompt: "",
  },
];

export function AiInsightPage() {
  const { locale, t } = useI18n();
  const queryClient = useQueryClient();
  const [range, setRange] = useState<Range>("30d");
  const [tag, setTag] = useState("");
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("random");
  const [sampleSize, setSampleSize] = useState(60);
  const [sampleSeed, setSampleSeed] = useState(() => Date.now());
  const [perspective, setPerspective] = useState("default");
  const [customPerspective, setCustomPerspective] = useState("");
  const [customName, setCustomName] = useState("");
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const q = useMemo(() => rangeQuery(range), [range]);
  const memosQuery = useQuery({
    queryKey: ["ai-insight", "materials", range, tag],
    queryFn: () => loadInsightPool(q, tag),
    retry: false,
  });
  const tagsQuery = useQuery({
    queryKey: ["tag-hierarchy", "all"],
    queryFn: () => getTagHierarchy("all"),
    staleTime: 30_000,
  });
  const tags = useMemo(
    () => flattenTags(tagsQuery.data?.tags ?? []),
    [tagsQuery.data?.tags],
  );
  const presetsQuery = useQuery({
    queryKey: ["ai-insight", "presets"],
    queryFn: listInsightPresets,
  });
  const historyQuery = useQuery({
    queryKey: ["ai-insight", "history"],
    queryFn: listInsightReports,
  });
  const aiSettingsQuery = useQuery({
    queryKey: ["ai-settings"],
    queryFn: getAiSettings,
  });
  const memoUrlTemplate =
    aiSettingsQuery.data?.memoUrlTemplate ?? "https://hux.ink/m/{id}/";
  const memoPool = memosQuery.data ?? [];
  const memos = useMemo(
    () => selectInsightMemos(memoPool, sampleSize, selectionMode, sampleSeed),
    [memoPool, sampleSeed, sampleSize, selectionMode],
  );
  const selectedPerspective = PERSPECTIVES.find(
    (item) => item.id === perspective,
  );
  const perspectivePrompt =
    perspective === "custom"
      ? customPerspective.trim()
      : (selectedPerspective?.prompt ??
        presetsQuery.data?.presets.find((item) => item.id === perspective)
          ?.prompt);
  const perspectiveLabel = selectedPerspective
    ? t(selectedPerspective.label)
    : (presetsQuery.data?.presets.find((item) => item.id === perspective)
        ?.name ?? customName.trim());
  const mutation = useMutation({
    mutationFn: () =>
      generateInsight({
        memoIds: memos.map((memo) => memo.id),
        perspective: perspectivePrompt || undefined,
        perspectiveLabel: perspectiveLabel || undefined,
        range,
        tag: tag || undefined,
      }),
    onSuccess: () => {
      setSourcesOpen(false);
      return queryClient.invalidateQueries({
        queryKey: ["ai-insight", "history"],
      });
    },
  });
  const savePresetMutation = useMutation({
    mutationFn: () =>
      createInsightPreset({
        name: customName.trim(),
        prompt: customPerspective.trim(),
      }),
    onSuccess: (preset) => {
      void queryClient.invalidateQueries({
        queryKey: ["ai-insight", "presets"],
      });
      setPerspective(preset.id);
      setCustomName("");
      setCustomPerspective("");
    },
  });
  const deletePresetMutation = useMutation({
    mutationFn: deleteInsightPreset,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["ai-insight", "presets"] }),
  });
  const deleteReportMutation = useMutation({
    mutationFn: deleteInsightReport,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["ai-insight", "history"] }),
  });

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
            <BrainCircuitIcon className="size-4 shrink-0 text-brand-600 dark:text-brand-400" />
          }
          mobileSheetOpen={mobileSheetOpen}
          setMobileSheetOpen={setMobileSheetOpen}
          sidebarCollapsed={sidebarCollapsed}
          title={t("nav.aiInsight")}
          toggleSidebarCollapsed={toggleSidebarCollapsed}
        />
      )}
    >
      <div className="flex flex-col gap-4 py-2">
        <div>
          <h2 className="font-heading text-xl font-semibold tracking-tight">
            {t("ai.insight.pageTitle")}
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {t("ai.insight.pageDescription")}
          </p>
        </div>

        <Card>
          <CardContent className="flex flex-col gap-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label
                className="flex flex-col gap-1.5 text-sm font-medium"
                htmlFor="ai-insight-range"
              >
                {t("ai.insight.range")}
                <Select
                  id="ai-insight-range"
                  value={range}
                  onChange={(event) => {
                    setRange(event.target.value as Range);
                    mutation.reset();
                  }}
                >
                  <option value="7d">{t("ai.insight.range7d")}</option>
                  <option value="30d">{t("ai.insight.range30d")}</option>
                  <option value="90d">{t("ai.insight.range90d")}</option>
                  <option value="all">{t("ai.insight.rangeAll")}</option>
                </Select>
              </label>
              <label
                className="flex flex-col gap-1.5 text-sm font-medium"
                htmlFor="ai-insight-selection-mode"
              >
                {t("ai.insight.selectionMode")}
                <Select
                  id="ai-insight-selection-mode"
                  value={selectionMode}
                  onChange={(event) => {
                    setSelectionMode(event.target.value as SelectionMode);
                    setSampleSeed(Date.now());
                    mutation.reset();
                  }}
                >
                  <option value="random">
                    {t("ai.insight.selectionRandom")}
                  </option>
                  <option value="recent">
                    {t("ai.insight.selectionRecent")}
                  </option>
                </Select>
              </label>
              <label
                className="flex flex-col gap-1.5 text-sm font-medium"
                htmlFor="ai-insight-sample-size"
              >
                {t("ai.insight.sampleSize")}
                <Select
                  id="ai-insight-sample-size"
                  value={sampleSize}
                  onChange={(event) => {
                    setSampleSize(Number(event.target.value));
                    mutation.reset();
                  }}
                >
                  <option value={30}>30</option>
                  <option value={60}>60</option>
                  <option value={100}>100</option>
                </Select>
              </label>
              <label
                className="flex flex-col gap-1.5 text-sm font-medium"
                htmlFor="ai-insight-tag"
              >
                {t("explorer.tags")}
                <Select
                  id="ai-insight-tag"
                  value={tag}
                  onChange={(event) => {
                    setTag(event.target.value);
                    mutation.reset();
                  }}
                >
                  <option value="">{t("ai.insight.allTags")}</option>
                  {tags.map((item) => (
                    <option key={item} value={item}>
                      #{item}
                    </option>
                  ))}
                </Select>
              </label>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">
                {t("ai.insight.choosePerspective")}
              </p>
              <div className="flex flex-wrap gap-2">
                {PERSPECTIVES.map((item) => (
                  <Button
                    key={item.id}
                    size="sm"
                    variant={perspective === item.id ? "default" : "outline"}
                    onClick={() => {
                      setPerspective(item.id);
                      mutation.reset();
                    }}
                  >
                    {t(item.label)}
                  </Button>
                ))}
                {presetsQuery.data?.presets.map((item) => (
                  <span className="inline-flex" key={item.id}>
                    <Button
                      className="rounded-r-none"
                      size="sm"
                      variant={perspective === item.id ? "default" : "outline"}
                      onClick={() => {
                        setPerspective(item.id);
                        mutation.reset();
                      }}
                    >
                      {item.name}
                    </Button>
                    <Button
                      aria-label={t("ai.insight.deletePreset")}
                      className="rounded-l-none border-l-0 px-2"
                      size="sm"
                      variant="outline"
                      onClick={() => deletePresetMutation.mutate(item.id)}
                    >
                      <Trash2Icon className="size-3.5" />
                    </Button>
                  </span>
                ))}
              </div>
              {perspective === "custom" && (
                <div className="grid gap-2 sm:grid-cols-[minmax(0,12rem)_1fr_auto]">
                  <Input
                    maxLength={40}
                    placeholder={t("ai.insight.customNamePlaceholder")}
                    value={customName}
                    onChange={(event) => setCustomName(event.target.value)}
                  />
                  <Input
                    maxLength={1_000}
                    placeholder={t("ai.insight.customPlaceholder")}
                    value={customPerspective}
                    onChange={(event) => {
                      setCustomPerspective(event.target.value);
                      mutation.reset();
                    }}
                  />
                  <Button
                    variant="outline"
                    disabled={
                      !customName.trim() ||
                      !customPerspective.trim() ||
                      savePresetMutation.isPending
                    }
                    onClick={() => savePresetMutation.mutate()}
                  >
                    <SaveIcon /> {t("ai.insight.savePreset")}
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {memosQuery.isPending && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}
        {memosQuery.isError && (
          <QueryErrorState
            className="min-h-48 border text-muted-foreground"
            isRetrying={memosQuery.isFetching}
            onRetry={() => void memosQuery.refetch()}
          />
        )}
        {memosQuery.data && memoPool.length === 0 && (
          <Empty className="min-h-56 border border-border/60 bg-card/50">
            <EmptyHeader>
              <EmptyMedia className="bg-accent" variant="icon">
                <BrainCircuitIcon className="size-5" />
              </EmptyMedia>
              <EmptyTitle>{t("ai.insight.noMaterials")}</EmptyTitle>
              <EmptyDescription>
                {t("ai.insight.noMaterialsHint")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {memos.length > 0 && (
          <Card>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">
                  {t("ai.insight.materialSelection", {
                    selected: memos.length,
                    total: memoPool.length,
                  })}
                </p>
                {selectionMode === "random" &&
                  memoPool.length > memos.length && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSampleSeed(Date.now());
                        mutation.reset();
                      }}
                    >
                      {t("ai.insight.resample")}
                    </Button>
                  )}
              </div>
              <div className="divide-y divide-border/60 rounded-lg border border-border/60">
                {memos.slice(0, 6).map((memo, index) => (
                  <Link
                    className="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted/50"
                    key={memo.id}
                    params={{ memoId: memo.id }}
                    to="/memo/$memoId"
                  >
                    <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {memoTitle(memo.content) ||
                        formatMemoTime(memo.create_time, locale)}
                    </span>
                  </Link>
                ))}
              </div>
              {memos.length > 6 && (
                <p className="text-center text-xs text-muted-foreground">
                  {t("ai.insight.moreMaterials", { count: memos.length - 6 })}
                </p>
              )}
              <Button
                disabled={
                  mutation.isPending ||
                  (perspective === "custom" && !customPerspective.trim())
                }
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending ? (
                  <Loader2Icon className="animate-spin" />
                ) : (
                  <SparklesIcon />
                )}
                {t("ai.insight.generate")}
              </Button>
            </CardContent>
          </Card>
        )}

        {mutation.isError && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {t("ai.insight.error")}
            {mutation.error instanceof Error && `：${mutation.error.message}`}
          </p>
        )}
        {mutation.data && (
          <Card className="border-brand-300/40 ring-1 ring-brand-400/10 dark:border-brand-400/25">
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <SparklesIcon className="size-4 text-brand-600 dark:text-brand-400" />
                <h2 className="font-heading text-lg font-semibold">
                  {t("ai.insight.report")}
                </h2>
              </div>
              <MemoContent
                content={formatInsightCitations(
                  mutation.data.content,
                  mutation.data.sources,
                  memoUrlTemplate,
                )}
              />
              <div className="border-t border-border/60 pt-2">
                <Button
                  className="px-1 text-muted-foreground"
                  size="sm"
                  variant="ghost"
                  onClick={() => setSourcesOpen((open) => !open)}
                >
                  {sourcesOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
                  {t("ai.insight.sources")} · {mutation.data.sources.length}
                </Button>
                {sourcesOpen && (
                  <div className="mt-1 flex flex-col gap-1.5">
                    {mutation.data.sources.map((source) => (
                      <a
                        className="rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                        href={memoPublicUrl(source.memo, memoUrlTemplate)}
                        key={source.memo}
                        rel="noreferrer noopener"
                        target="_blank"
                      >
                        {source.index}. {source.content}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <Button
          className="mt-2 w-fit px-1"
          variant="ghost"
          onClick={() => setHistoryOpen((open) => !open)}
        >
          {historyOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
          <HistoryIcon className="size-4 text-muted-foreground" />
          <span className="font-heading text-lg font-semibold">
            {t("ai.insight.history")}
          </span>
          <span className="text-xs text-muted-foreground">
            {historyQuery.data?.reports.length ?? 0}
          </span>
        </Button>
        {historyOpen && historyQuery.data?.reports.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {t("ai.insight.noHistory")}
          </p>
        )}
        {historyOpen && (
          <div className="flex flex-col gap-3">
            {historyQuery.data?.reports.map((report) => (
              <details
                className="group rounded-xl border border-border/60 bg-card"
                key={report.id}
              >
                <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
                  <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {insightTitle(report.content)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Intl.DateTimeFormat(locale, {
                        dateStyle: "medium",
                      }).format(new Date(report.createdAt))}
                    </p>
                  </div>
                  <Button
                    aria-label={t("ai.insight.deleteHistory")}
                    size="icon-sm"
                    variant="ghost"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      deleteReportMutation.mutate(report.id);
                    }}
                  >
                    <Trash2Icon />
                  </Button>
                </summary>
                <div className="flex flex-col gap-4 border-t border-border/60 px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">
                        {report.perspectiveLabel ||
                          t("ai.insight.perspective.default")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Intl.DateTimeFormat(locale, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(report.createdAt))}{" "}
                        · {report.model}
                      </p>
                    </div>
                  </div>
                  <MemoContent
                    content={formatInsightCitations(
                      report.content,
                      report.sources,
                      memoUrlTemplate,
                    )}
                  />
                  <details className="border-t border-border/60 pt-2">
                    <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                      {t("ai.insight.sources")} · {report.sources.length}
                    </summary>
                    <div className="mt-2 flex flex-col gap-1">
                      {report.sources.map((source) => (
                        <a
                          className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                          href={memoPublicUrl(source.memo, memoUrlTemplate)}
                          key={source.memo}
                          rel="noreferrer noopener"
                          target="_blank"
                        >
                          {source.index}. {source.content}
                        </a>
                      ))}
                    </div>
                  </details>
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </WorkspaceLayout>
  );
}

function rangeQuery(range: Range) {
  if (range === "all") return undefined;
  const days = Number.parseInt(range, 10);
  const date = new Date();
  date.setDate(date.getDate() - days + 1);
  return `after:${date.toISOString().slice(0, 10)}`;
}

async function loadInsightPool(q: string | undefined, tag: string) {
  const memos: Awaited<ReturnType<typeof listMemos>>["memos"] = [];
  let pageToken: string | undefined;
  do {
    const page = await listMemos({
      page_size: 100,
      state: "normal",
      ...(q ? { q } : {}),
      ...(tag ? { tag } : {}),
      ...(pageToken ? { page_token: pageToken } : {}),
    });
    memos.push(...page.memos);
    pageToken = page.next_page_token || undefined;
  } while (pageToken && memos.length < 2_000);
  return memos;
}

function selectInsightMemos<T>(
  memos: T[],
  limit: number,
  mode: SelectionMode,
  seed: number,
) {
  if (mode === "recent" || memos.length <= limit) return memos.slice(0, limit);
  const shuffled = [...memos];
  let state = seed >>> 0;
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    const target = state % (index + 1);
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled.slice(0, limit);
}

type TagNode = { name: string; children: TagNode[] };

function flattenTags(nodes: TagNode[]): string[] {
  return nodes.flatMap((node) => [node.name, ...flattenTags(node.children)]);
}

export function formatInsightCitations(
  content: string,
  sources: Array<{ index: number; memo: string }>,
  template: string,
) {
  return content.replace(/\[(\d{1,3})\](?!\()/g, (match, rawIndex: string) => {
    const index = Number(rawIndex);
    const source = sources.find((item) => item.index === index);
    return source
      ? `[${index}](${memoPublicUrl(source.memo, template)} "insight-citation")`
      : match;
  });
}

function memoPublicUrl(memo: string, template: string) {
  return template.replaceAll(
    "{id}",
    encodeURIComponent(stripResourceName(memo, "memos")),
  );
}

function insightTitle(content: string) {
  const line = content
    .split("\n")
    .map((item) => item.trim())
    .find(Boolean);
  return line?.replace(/^#{1,6}\s*/, "").replace(/\*\*/g, "") || "AI 洞察";
}
