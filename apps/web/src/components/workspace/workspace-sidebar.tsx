import { useNavigate } from "@tanstack/react-router";
import { MenuIcon, PanelLeftCloseIcon, SettingsIcon } from "lucide-react";
import { useCallback, useMemo } from "react";
import type {
  CurrentFlareMoUser,
  MemoSpace,
  MemoStatsResponse,
  TagHierarchyNode,
} from "@/api";
import { FlareMoExplorer } from "@/components/flaremo-explorer";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { UserMenu } from "@/components/user-menu";
import { useI18n } from "@/i18n";
import { dayFilterQuery } from "@/lib/calendar-date";
import { cn } from "@/lib/utils";

/** Everything the explorer sidebar renders, shared by both drawers. */
export type WorkspaceSidebarContent = {
  activeTag?: string;
  hierarchy: TagHierarchyNode[];
  hierarchyPending: boolean;
  stats: MemoStatsResponse;
  /** Viewer's IANA zone + space scope: the year view anchors its own stats
   * query with them (issue #144). */
  timeZone: string;
  space?: MemoSpace;
  untagged: boolean;
  user: CurrentFlareMoUser | undefined;
  onDeleteTag: (tag: string) => void;
  onOpenSettings: () => void;
  onOpenSystemManagement: () => void;
  onRenameTag: (from: string, to: string) => void;
  onTagChange: (tag?: string) => void;
  onToggleCollapsed: () => void;
  onUntaggedChange: (untagged: boolean) => void;
};

type WorkspaceExplorerPanelProps = WorkspaceSidebarContent & {
  onNavigate?: () => void;
  showCollapse?: boolean;
};

/**
 * One mounted explorer sidebar. Desktop and mobile each render their own, as
 * the single `renderExplorer` helper did before the split.
 */
function WorkspaceExplorerPanel({
  activeTag,
  hierarchy,
  hierarchyPending,
  onDeleteTag,
  onNavigate,
  onOpenSettings,
  onOpenSystemManagement,
  onRenameTag,
  onTagChange,
  onToggleCollapsed,
  onUntaggedChange,
  showCollapse = false,
  space,
  stats,
  timeZone,
  untagged,
  user,
}: WorkspaceExplorerPanelProps) {
  const { t } = useI18n();
  const navigate = useNavigate({ from: "/" });

  // FlareMoExplorer is memoized but its slots are ReactNodes, so identity is
  // the only thing that matters: rebuilding them inline on every parent render
  // (the timeline shell re-renders on scroll, collapse, dialogs…) would re-run
  // the explorer's heatmap for nothing. Each slot and callback below is keyed
  // to exactly what it reads.
  const handleOpenSettings = useCallback(() => {
    onNavigate?.();
    onOpenSettings();
  }, [onNavigate, onOpenSettings]);

  const handleOpenSystemManagement = useCallback(() => {
    onNavigate?.();
    onOpenSystemManagement();
  }, [onNavigate, onOpenSystemManagement]);

  const handleDaySelect = useCallback(
    (date: string) => {
      void navigate({
        replace: true,
        search: (current) => ({
          ...current,
          q: dayFilterQuery(date),
          tag: undefined,
          untagged: undefined,
          view: "all",
        }),
      });
    },
    [navigate],
  );

  const header = useMemo(
    () => (
      <UserMenu
        onOpenSettings={handleOpenSettings}
        onOpenSystemManagement={handleOpenSystemManagement}
        user={user}
      />
    ),
    [handleOpenSettings, handleOpenSystemManagement, user],
  );

  const headerAction = useMemo(
    () =>
      showCollapse ? (
        <Button
          aria-label={t("sidebar.collapse")}
          size="icon-sm"
          title={t("sidebar.collapse")}
          variant="ghost"
          onClick={onToggleCollapsed}
        >
          <PanelLeftCloseIcon />
        </Button>
      ) : undefined,
    [showCollapse, onToggleCollapsed, t],
  );

  // The footer row used to carry the language switcher and the JSON
  // import/export buttons; those are settings and now live inside the panel
  // this button opens. The button itself is back because the tag tree grows
  // taller than the viewport: a reader parked at the bottom of the list had to
  // scroll back up to the account name to reach settings. It opens the same
  // dialog as the account menu, which keeps its entry.
  const footer = useMemo(
    () => (
      <Button
        className="h-8 w-full justify-start gap-2 rounded-lg px-2 text-[13px] font-normal text-foreground/70 hover:bg-muted/70 hover:text-foreground"
        variant="ghost"
        onClick={handleOpenSettings}
      >
        <SettingsIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{t("auth.accountTitle")}</span>
      </Button>
    ),
    [handleOpenSettings, t],
  );

  return (
    <FlareMoExplorer
      activeTag={activeTag}
      footer={footer}
      header={header}
      headerAction={headerAction}
      space={space}
      stats={stats}
      timeZone={timeZone}
      hierarchy={hierarchy}
      hierarchyPending={hierarchyPending}
      untagged={untagged}
      onDeleteTag={onDeleteTag}
      onRenameTag={onRenameTag}
      onTagChange={onTagChange}
      onUntaggedChange={onUntaggedChange}
      onDaySelect={handleDaySelect}
      onNavigate={onNavigate}
    />
  );
}

/** The desktop sidebar column, collapsing to zero width with the header button. */
export function WorkspaceSidebar({
  collapsed,
  explorer,
  shellWidth = 952,
}: {
  collapsed: boolean;
  explorer: WorkspaceSidebarContent;
  /**
   * Width of the centered composition this column belongs to (explorer +
   * content). The column pushes itself to that frame's left edge, so the pair
   * stays centered in the window while the scroller still runs to the window's
   * right edge for the scrollbar.
   */
  shellWidth?: number;
}) {
  return (
    <aside
      aria-hidden={collapsed}
      className={cn(
        "hidden lg:block h-full shrink-0 overflow-hidden motion-safe:transition-[width,opacity] motion-safe:duration-250 motion-safe:ease-signal",
        collapsed
          ? "w-0 opacity-0 pointer-events-none"
          : "w-[312px] opacity-100",
      )}
      style={
        collapsed
          ? undefined
          : // Recenter the original two-column composition. Below the frame
            // width the margin clamps to zero and the columns simply fill the
            // window.
            {
              marginInlineStart: `max(0px, calc((100% - ${shellWidth}px) / 2))`,
            }
      }
    >
      <div className="no-scrollbar h-full w-[312px] overflow-y-auto border-r bg-background">
        <WorkspaceExplorerPanel {...explorer} showCollapse />
      </div>
    </aside>
  );
}

/** The mobile drawer: its trigger sits in the header, its panel in the sheet. */
export function WorkspaceMobileSidebar({
  explorer,
  open,
  onOpenChange,
}: {
  explorer: WorkspaceSidebarContent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger
        render={
          <Button
            aria-label={t("sidebar.toggle")}
            className="lg:hidden"
            size="icon-sm"
            variant="ghost"
          >
            <MenuIcon />
          </Button>
        }
      />
      <SheetContent className="w-[312px] overflow-hidden p-0" side="left">
        <SheetTitle className="sr-only">{t("sidebar.title")}</SheetTitle>
        <div
          className="no-scrollbar h-full overflow-y-auto overscroll-contain"
          data-testid="mobile-sidebar-scroll"
        >
          <WorkspaceExplorerPanel
            {...explorer}
            onNavigate={() => onOpenChange(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
