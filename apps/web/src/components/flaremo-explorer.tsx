import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  BrainIcon,
  CalendarDaysIcon,
  ChevronRightIcon,
  CompassIcon,
  FileTextIcon,
  FootprintsIcon,
  HashIcon,
  LayoutGridIcon,
  ListChecksIcon,
  MicIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import {
  memo,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  getCaptureStatus,
  type MemoSpace,
  type MemoStatsResponse,
  type TagHierarchyNode,
} from "@/api";
import { authClient } from "@/auth-client";
import { MiniCalendarReminders } from "@/components/flaremo-mini-calendar-panel";
import { FlareMoTimeHorizon } from "@/components/flaremo-time-horizon";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import { currentStreak } from "@/lib/activity";
import { queryKeys } from "@/lib/query-keys";
import {
  readTagEmojiMap,
  TAG_EMOJI_PALETTE,
  type TagEmojiMap,
  tagEmoji,
  withTagEmoji,
} from "@/lib/tag-emoji";
import { TIMELINE_SEARCH } from "@/lib/timeline-search";
import { cn } from "@/lib/utils";

export type ExplorerView = "all" | "archived" | "trashed";

export type TimeView = "trend" | "calendar";

type FlareMoExplorerProps = {
  activeTag?: string;
  footer?: ReactNode;
  /** Top-left slot (the member menu trigger). Branding lives in the favicon
   * and share pages, not here. */
  header?: ReactNode;
  /** Top-right slot (e.g. the desktop collapse-sidebar button). */
  headerAction?: ReactNode;
  hierarchy: TagHierarchyNode[];
  hierarchyPending?: boolean;
  stats: MemoStatsResponse;
  /** Viewer's IANA zone + space scope: the year view anchors its own stats
   * query with them (issue #144). */
  timeZone: string;
  space?: MemoSpace;
  untagged?: boolean;
  onDeleteTag: (tag: string) => void;
  onRenameTag: (from: string, to: string) => void;
  onTagChange: (tag?: string) => void;
  onUntaggedChange: (untagged: boolean) => void;
  /** Jump the timeline to a heatmap day (mini strip + stats). */
  onDaySelect?: (date: string) => void;
  onNavigate?: () => void;
};

/*
 * Ember 2 sidebar item. Inactive rows are quiet ink; the active row is a
 * raised paper chip (card surface + hairline ring + xs shadow) with the icon
 * in ember, so "where am I" reads without washing the row in brand color.
 */
const NAV_ITEM =
  "flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] text-foreground/70 outline-none transition-[background-color,color,box-shadow] duration-150 hover:bg-muted/70 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/25 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground [&>svg]:transition-colors";
const NAV_ACTIVE = {
  className:
    "!bg-card !text-foreground font-medium shadow-xs ring-1 ring-border/70 dark:!bg-muted dark:ring-border [&>svg]:!text-primary",
};

/** Remembers whether the tag block is unfolded. Default: folded. */
const TAGS_OPEN_STORAGE_KEY = "flaremo.explorer.tagsOpen";

function readTagsOpen(): boolean {
  try {
    return localStorage.getItem(TAGS_OPEN_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export const FlareMoExplorer = memo(function FlareMoExplorer({
  activeTag,
  footer,
  header,
  headerAction,
  hierarchy,
  hierarchyPending = false,
  stats,
  timeZone,
  space,
  untagged = false,
  onDeleteTag,
  onRenameTag,
  onTagChange,
  onUntaggedChange,
  onDaySelect,
  onNavigate,
}: FlareMoExplorerProps) {
  const { t } = useI18n();
  const session = authClient.useSession();
  const captureStatus = useQuery({
    queryKey: queryKeys.captureStatus.forUser(session.data?.user.id),
    queryFn: getCaptureStatus,
    enabled: Boolean(session.data?.user),
    staleTime: 30_000,
    retry: false,
  });
  const streak = useMemo(() => currentStreak(stats.activity), [stats.activity]);

  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [tagsOpen, setTagsOpen] = useState<boolean>(readTagsOpen);
  // An active tag filter must stay visible: folding the block over the
  // selection would hide which filter is on.
  const tagsExpanded = tagsOpen || Boolean(activeTag);
  const toggleTags = () =>
    setTagsOpen((open) => {
      const next = !open;
      try {
        localStorage.setItem(TAGS_OPEN_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Ignore quota/private mode errors
      }
      return next;
    });

  return (
    <aside className="flex min-h-full flex-col px-3 py-4 text-sm">
      {/* Sticky so the account menu stays reachable: the tag list routinely
          runs past the viewport (1481px of content in a 960px column), and
          scrolling to the bottom used to take the user's own entry point with
          it. The hairline is what makes that legible — without an edge, a tag
          clipped by the sticky row reads as a rendering fault rather than as
          something scrolled underneath. `-mx-3 px-3` covers the column's
          gutters so tags pass behind the row instead of beside it. */}
      <header className="sticky top-0 z-10 -mx-3 mb-4 flex items-center justify-between gap-2 border-b border-border/50 bg-background px-4 py-2">
        {header}
        {headerAction}
      </header>

      <section className="mb-3 px-1 motion-safe:animate-rise">
        <div className="paper grid grid-cols-3 divide-x divide-border/60 rounded-xl border border-border/60 bg-card py-3 shadow-xs">
          <StatCell label={t("explorer.records")} value={stats.counts.total} />
          <StatCell label={t("explorer.tags")} value={stats.tags.length} />
          <StatCell label={t("explorer.streak")} value={streak} />
        </div>
      </section>

      <section className="mb-2 px-1 motion-safe:animate-fade">
        <MiniCalendarReminders />
        <FlareMoTimeHorizon
          hoveredDate={hoveredDate}
          space={space}
          stats={stats}
          timeZone={timeZone}
          streak={streak}
          onDaySelect={onDaySelect}
          onHoverDate={setHoveredDate}
          onNavigate={onNavigate}
        />
      </section>

      <nav
        aria-label={t("sidebar.navigation")}
        className="mt-3 flex flex-col gap-0.5 border-t border-border/60 pt-3"
      >
        <Link
          activeOptions={{ exact: true }}
          activeProps={NAV_ACTIVE}
          className={NAV_ITEM}
          onClick={onNavigate}
          search={{ ...TIMELINE_SEARCH }}
          to="/"
        >
          <LayoutGridIcon />
          <span className="min-w-0 flex-1 truncate">{t("nav.allMemos")}</span>
        </Link>
        <Link
          activeProps={NAV_ACTIVE}
          className={NAV_ITEM}
          onClick={onNavigate}
          to="/review/daily"
        >
          <CalendarDaysIcon />
          <span className="min-w-0 flex-1 truncate">
            {t("nav.dailyReview")}
          </span>
        </Link>
        <Link
          activeProps={NAV_ACTIVE}
          className={NAV_ITEM}
          onClick={onNavigate}
          to="/review/walk"
        >
          <FootprintsIcon />
          <span className="min-w-0 flex-1 truncate">{t("nav.randomWalk")}</span>
        </Link>
        {/* The public square, one click from the private timeline: it renders
            the same notes the outside world can read, in the same shape. */}
        <Link
          activeProps={NAV_ACTIVE}
          className={NAV_ITEM}
          onClick={onNavigate}
          to="/explore"
        >
          <CompassIcon />
          <span className="min-w-0 flex-1 truncate">{t("nav.explore")}</span>
        </Link>
        {captureStatus.data?.available && (
          <Link
            activeProps={NAV_ACTIVE}
            className={NAV_ITEM}
            onClick={onNavigate}
            to="/capture"
          >
            <MicIcon />
            <span className="min-w-0 flex-1 truncate">{t("nav.capture")}</span>
          </Link>
        )}
        <Link
          activeProps={NAV_ACTIVE}
          className={NAV_ITEM}
          onClick={onNavigate}
          to="/memory"
        >
          <BrainIcon />
          <span className="min-w-0 flex-1 truncate">{t("nav.memory")}</span>
        </Link>
        <Link
          activeProps={NAV_ACTIVE}
          className={NAV_ITEM}
          onClick={onNavigate}
          to="/projects"
        >
          <ListChecksIcon />
          <span className="min-w-0 flex-1 truncate">{t("nav.projects")}</span>
        </Link>
        <Link
          activeProps={NAV_ACTIVE}
          className={NAV_ITEM}
          onClick={onNavigate}
          to="/articles"
        >
          <FileTextIcon />
          <span className="min-w-0 flex-1 truncate">{t("nav.articles")}</span>
        </Link>
      </nav>

      <section className="mt-5 flex flex-col gap-1.5 px-1">
        {/* The tag block starts folded. A mature timeline lists dozens of
            tags, and leaving them open pushed the calendar and the navigation
            off the first screen; the count keeps the section legible while it
            is closed. */}
        <button
          aria-expanded={tagsExpanded}
          aria-label={
            tagsExpanded ? t("explorer.collapse") : t("explorer.expand")
          }
          className="group flex items-center gap-1 rounded-md px-2 pb-0.5 text-xs font-medium text-muted-foreground motion-safe:transition-colors hover:text-foreground"
          type="button"
          onClick={toggleTags}
        >
          <ChevronRightIcon
            className={cn(
              "size-3 shrink-0 motion-safe:transition-transform motion-safe:duration-150",
              tagsExpanded && "rotate-90",
            )}
          />
          <span className="min-w-0 flex-1 text-left">{t("explorer.tags")}</span>
          <span className="tabular-nums opacity-60">{stats.tags.length}</span>
        </button>
        {tagsExpanded && (
          <>
            <button
              aria-pressed={untagged}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-left motion-safe:transition-colors motion-safe:duration-150",
                untagged
                  ? "bg-card font-medium text-foreground shadow-xs ring-1 ring-border/70 dark:bg-muted"
                  : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
              )}
              type="button"
              onClick={() => {
                onUntaggedChange(!untagged);
                onNavigate?.();
              }}
            >
              <HashIcon className="size-3.5 shrink-0 opacity-60" />
              <span className="truncate">{t("explorer.untagged")}</span>
            </button>
            {hierarchyPending ? (
              // Loading state, not the empty state: flashing「无标签」before the
              // real tree expands reads as data loss. Hold a few ghost rows.
              <div aria-hidden="true" className="flex flex-col gap-1.5">
                <Skeleton className="h-5 w-3/5" />
                <Skeleton className="ml-4 h-5 w-2/5" />
                <Skeleton className="h-5 w-1/2" />
              </div>
            ) : hierarchy.length > 0 ? (
              <TagTree
                activeTag={activeTag}
                nodes={hierarchy}
                onDeleteTag={onDeleteTag}
                onRenameTag={onRenameTag}
                onTagChange={onTagChange}
                onNavigate={onNavigate}
              />
            ) : (
              <div className="text-xs text-muted-foreground">
                {t("explorer.noTags")}
              </div>
            )}
          </>
        )}
      </section>
      {footer && <div className="mt-auto px-1 pt-5 pb-1">{footer}</div>}
    </aside>
  );
});

type TagTreeProps = {
  activeTag?: string;
  nodes: TagHierarchyNode[];
  onDeleteTag: (tag: string) => void;
  onRenameTag: (from: string, to: string) => void;
  onTagChange: (tag?: string) => void;
  onNavigate?: () => void;
};

/**
 * Folding is remembered per node. Tags start folded: a matured timeline holds
 * dozens of roots, and an all-expanded tree pushed the calendar and the
 * navigation above it out of the first screen. Users who prefer the open tree
 * get it back by unfolding — that choice is what gets stored, so a later
 * release adding tags cannot reopen the whole list behind their back.
 */
const TAG_EXPANDED_STORAGE_KEY = "flaremo.explorer.expandedTags";

function readExpandedTags(): Set<string> {
  try {
    const stored = localStorage.getItem(TAG_EXPANDED_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return new Set(parsed);
    }
  } catch {
    // Best-effort storage fallback
  }
  return new Set();
}

/**
 * Names of the nodes above `target`. The filter is a query parameter, so a
 * deep link can select a tag whose parent is folded; opening that path keeps
 * the selection visible without unfolding everything else.
 */
function ancestorsOf(nodes: TagHierarchyNode[], target?: string): Set<string> {
  if (!target) return new Set();
  const path: string[] = [];
  const walk = (list: TagHierarchyNode[], trail: string[]): boolean => {
    for (const node of list) {
      if (node.name === target) {
        path.push(...trail);
        return true;
      }
      if (walk(node.children, [...trail, node.name])) return true;
    }
    return false;
  };
  walk(nodes, []);
  return new Set(path);
}

/**
 * The glyph picker behind one tag row. A sheet of emoji rather than a text
 * field: the point is to make the sidebar scannable, and nobody wants to hunt
 * for a codepoint. Picking writes through to storage; the hash mark stays one
 * click away for anyone who liked it.
 *
 * Pinned to the viewport rather than to the row: the tag list lives in a
 * scroller that clips its own overflow, and the tags near the bottom of the
 * sidebar would otherwise open a panel nobody can see.
 */
const EMOJI_PANEL_WIDTH = 226;
const EMOJI_PANEL_HEIGHT = 210;

function TagEmojiPicker({
  anchor,
  current,
  onClose,
  onPick,
}: {
  anchor: DOMRect;
  current: string;
  onClose: () => void;
  onPick: (emoji: string | null) => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    // Capture phase: the row's own buttons stop propagation on click.
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const openUp = anchor.bottom + EMOJI_PANEL_HEIGHT + 8 > window.innerHeight;
  const left = Math.max(
    8,
    Math.min(anchor.left - 4, window.innerWidth - EMOJI_PANEL_WIDTH - 8),
  );
  const top = openUp
    ? Math.max(8, anchor.top - EMOJI_PANEL_HEIGHT - 6)
    : anchor.bottom + 6;

  return (
    <div
      className="fixed z-50 rounded-lg border border-border/70 bg-popover p-1.5 shadow-lg motion-safe:animate-fade"
      data-testid="tag-emoji-picker"
      ref={ref}
      style={{ left, top, width: EMOJI_PANEL_WIDTH }}
    >
      <div className="grid grid-cols-8 place-items-center gap-0.5">
        {TAG_EMOJI_PALETTE.map((emoji) => (
          <button
            aria-label={emoji}
            className={cn(
              "flex size-6 items-center justify-center rounded-md text-[15px] leading-none motion-safe:transition-colors hover:bg-muted",
              emoji === current && "bg-muted ring-1 ring-border",
            )}
            key={emoji}
            type="button"
            onClick={() => onPick(emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>
      <button
        className="mt-1 flex w-full items-center justify-center gap-1 rounded-md py-1 text-xs text-muted-foreground motion-safe:transition-colors hover:bg-muted hover:text-foreground"
        type="button"
        onClick={() => onPick(null)}
      >
        <HashIcon className="size-3" />
        {t("explorer.tagEmojiReset")}
      </button>
    </div>
  );
}

function TagTree({
  activeTag,
  nodes,
  onDeleteTag,
  onRenameTag,
  onTagChange,
  onNavigate,
}: TagTreeProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState<Set<string>>(readExpandedTags);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  // Per-tag glyphs. A display preference, so it sits in storage rather than in
  // the tag itself: the note bodies keep their literal `#tag`.
  const [emojiMap, setEmojiMap] = useState<TagEmojiMap>(readTagEmojiMap);
  const [emojiTarget, setEmojiTarget] = useState<{
    tag: string;
    anchor: DOMRect;
  } | null>(null);
  const activePath = useMemo(
    () => ancestorsOf(nodes, activeTag),
    [nodes, activeTag],
  );

  const toggle = (name: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      try {
        localStorage.setItem(
          TAG_EXPANDED_STORAGE_KEY,
          JSON.stringify(Array.from(next)),
        );
      } catch {
        // Ignore quota/private mode errors
      }
      return next;
    });

  const renderNode = (node: TagHierarchyNode, depth: number) => {
    const name = node.name;
    const hasChildren = node.children.length > 0;
    const isCollapsed =
      hasChildren && !expanded.has(name) && !activePath.has(name);
    const isActive = activeTag === name;
    const label = name.split("/").at(-1) ?? name;
    const glyph = tagEmoji(name, emojiMap);

    return (
      <div className="relative flex flex-col" key={name}>
        <div
          className={cn(
            "group flex h-7 items-center gap-1 rounded-md pe-1 text-[13px] motion-safe:transition-colors motion-safe:duration-150",
            isActive
              ? "bg-card font-medium text-foreground shadow-xs ring-1 ring-border/70 dark:bg-muted"
              : "text-foreground/70 hover:bg-muted/70 hover:text-foreground",
          )}
          style={{ paddingLeft: `${depth * 0.75}rem` }}
        >
          <button
            aria-label={
              hasChildren
                ? isCollapsed
                  ? t("explorer.expand")
                  : t("explorer.collapse")
                : undefined
            }
            className={cn(
              "flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground/70 hover:text-foreground",
              !hasChildren && "invisible",
            )}
            type="button"
            onClick={() => toggle(name)}
          >
            <ChevronRightIcon
              className={cn(
                "h-3.5 w-3.5 motion-safe:transition-transform motion-safe:duration-150",
                !isCollapsed && "rotate-90",
              )}
            />
          </button>
          <button
            aria-label={t("explorer.tagEmoji")}
            className="flex size-5 shrink-0 items-center justify-center rounded-sm text-[13px] leading-none motion-safe:transition-colors hover:bg-muted"
            title={t("explorer.tagEmoji")}
            type="button"
            onClick={(event) => {
              // The row's own button filters the timeline; this one only
              // swaps the glyph.
              event.stopPropagation();
              const anchor = event.currentTarget.getBoundingClientRect();
              setEmojiTarget((current) =>
                current?.tag === name ? null : { tag: name, anchor },
              );
            }}
          >
            <span aria-hidden="true">{glyph}</span>
          </button>
          <button
            aria-pressed={isActive}
            className="flex min-w-0 flex-1 items-center gap-1 text-left"
            type="button"
            onClick={() => {
              onTagChange(isActive ? undefined : name);
              onNavigate?.();
            }}
          >
            <span className="truncate">{label}</span>
            {node.count > 1 && (
              <span className="ms-auto ps-1 text-xs tabular-nums text-muted-foreground/70">
                {node.count}
              </span>
            )}
          </button>
          <div className="flex shrink-0 items-center gap-0.5 opacity-0 motion-safe:transition-opacity motion-safe:duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
            <Button
              aria-label={t("explorer.renameTag")}
              className="size-5 text-muted-foreground hover:text-foreground"
              onClick={() => setEditing(name)}
              size="icon-xs"
              title={t("explorer.renameTag")}
              type="button"
              variant="ghost"
            >
              <PencilIcon className="size-3" />
            </Button>
            <Button
              aria-label={t("explorer.deleteTag")}
              className="size-5 text-muted-foreground hover:text-destructive"
              onClick={() => setDeleteTarget(name)}
              size="icon-xs"
              title={t("explorer.deleteTag")}
              type="button"
              variant="ghost"
            >
              <Trash2Icon className="size-3" />
            </Button>
          </div>
        </div>
        {emojiTarget?.tag === name && (
          <TagEmojiPicker
            anchor={emojiTarget.anchor}
            current={glyph}
            onClose={() => setEmojiTarget(null)}
            onPick={(emoji) => {
              setEmojiMap(withTagEmoji(emojiMap, name, emoji));
              setEmojiTarget(null);
            }}
          />
        )}
        {editing === name && (
          <TagRenameInput
            from={name}
            onCancel={() => setEditing(null)}
            onSave={(to) => {
              onRenameTag(name, to);
              setEditing(null);
            }}
          />
        )}
        {hasChildren && !isCollapsed && (
          <div className="flex flex-col motion-safe:animate-fade">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="flex flex-col gap-0.5">
        {nodes.map((n) => renderNode(n, 0))}
      </div>
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("explorer.deleteTag")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("explorer.tagDeleteConfirm", { tag: deleteTarget ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="ghost">
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleteTarget) onDeleteTag(deleteTarget);
              }}
            >
              {t("explorer.deleteTag")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function TagRenameInput({
  from,
  onCancel,
  onSave,
}: {
  from: string;
  onCancel: () => void;
  onSave: (to: string) => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(from);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <form
      className="flex flex-col gap-1 px-1"
      style={{ paddingLeft: "1.5rem" }}
      onSubmit={(event) => {
        event.preventDefault();
        const to = value.trim();
        if (to && to !== from) onSave(to);
        else onCancel();
      }}
    >
      <Input
        aria-label={t("explorer.renameTagLabel")}
        className="h-7 text-xs md:text-xs"
        onChange={(event) => setValue(event.target.value)}
        placeholder={t("explorer.renameTagPlaceholder")}
        ref={inputRef}
        value={value}
      />
      <div className="flex gap-1">
        <Button size="xs" type="submit">
          {t("common.save")}
        </Button>
        <Button onClick={onCancel} size="xs" type="button" variant="ghost">
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}

function StatCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center justify-center px-1 text-center">
      <div className="text-lg leading-none font-semibold tabular-nums tracking-tight text-foreground">
        {value}
      </div>
      <div className="mt-1.5 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
