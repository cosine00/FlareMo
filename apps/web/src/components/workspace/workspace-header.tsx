import { LayoutListIcon, PanelLeftOpenIcon, Rows3Icon } from "lucide-react";
import type { MemoSpace } from "@/api";
import type { ExplorerView } from "@/components/flaremo-explorer";
import { ScopeSwitcher } from "@/components/scope-switcher";
import { SpotlightSearchTrigger } from "@/components/spotlight-search";
import { Button } from "@/components/ui/button";
import {
  WorkspaceMobileSidebar,
  type WorkspaceSidebarContent,
} from "@/components/workspace/workspace-sidebar";
import { useI18n } from "@/i18n";
import type { TranslationKey } from "@/i18n/key";
import type { TimelineLayout } from "@/lib/timeline-layout";
import { cn } from "@/lib/utils";

/** The two timeline layouts, in the order the segmented control shows them. */
const LAYOUT_OPTIONS: {
  label: TranslationKey;
  value: TimelineLayout;
  icon: typeof Rows3Icon;
}[] = [
  { value: "cards", icon: Rows3Icon, label: "timeline.layoutCards" },
  { value: "timeline", icon: LayoutListIcon, label: "timeline.layoutTimeline" },
];

/**
 * The timeline top bar: sidebar toggle, scope switcher, the layout picker
 * (card stack or dated list) and the two spotlight entries (desktop pill,
 * mobile icon), plus the mobile sidebar trigger.
 */
export function WorkspaceHeader({
  activeQuery,
  explorer,
  isTimelineScrolled,
  layout,
  mobileSheetOpen,
  setLayout,
  setMobileSheetOpen,
  setQuery,
  setSpace,
  setSpotlightOpen,
  setView,
  sidebarCollapsed,
  space,
  team,
  toggleSidebarCollapsed,
  view,
}: {
  /** Query shown in the spotlight pill; empty while a date filter owns it. */
  activeQuery: string;
  explorer: WorkspaceSidebarContent;
  isTimelineScrolled: boolean;
  layout: TimelineLayout;
  mobileSheetOpen: boolean;
  setLayout: (layout: TimelineLayout) => void;
  setMobileSheetOpen: (open: boolean) => void;
  setQuery: (q: string) => void;
  setSpace: (space: MemoSpace) => void;
  setSpotlightOpen: (open: boolean) => void;
  setView: (view: ExplorerView) => void;
  sidebarCollapsed: boolean;
  space: MemoSpace;
  team: { id: string; name: string } | null;
  toggleSidebarCollapsed: () => void;
  view: ExplorerView;
}) {
  const { t } = useI18n();

  return (
    <header
      className={cn(
        "z-20 shrink-0 border-b bg-background/90 backdrop-blur-md motion-safe:transition-[border-color,box-shadow] motion-safe:duration-200",
        isTimelineScrolled ? "border-border shadow-xs" : "border-transparent",
      )}
    >
      {/* The row shares the content column's measure and left edge, so the
          scope switcher and the search pill line up with the notes below
          instead of drifting to the window's far right. */}
      <div
        className="flex h-14 items-center gap-2 px-5 lg:px-3 motion-safe:transition-[max-width,padding] motion-safe:duration-250 motion-safe:ease-signal"
        style={{ maxWidth: layout === "timeline" ? 672 : 640 }}
      >
        <div
          className={cn(
            "hidden lg:flex items-center overflow-hidden motion-safe:transition-[width,opacity,margin] motion-safe:duration-250 motion-safe:ease-signal",
            sidebarCollapsed
              ? "w-8 opacity-100"
              : "w-0 opacity-0 pointer-events-none -mr-2",
          )}
        >
          <Button
            aria-label={t("sidebar.expand")}
            size="icon-sm"
            title={t("sidebar.expand")}
            variant="ghost"
            onClick={toggleSidebarCollapsed}
          >
            <PanelLeftOpenIcon />
          </Button>
        </div>
        <WorkspaceMobileSidebar
          explorer={explorer}
          open={mobileSheetOpen}
          onOpenChange={setMobileSheetOpen}
        />
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <ScopeSwitcher
            activeSpace={space}
            activeView={view}
            team={team}
            onSpaceChange={setSpace}
            onViewChange={setView}
          />
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Layout picker: a segmented control rather than a cycling button,
              so the current arrangement is visible instead of remembered. */}
          <div
            aria-label={t("timeline.layout")}
            className="hidden items-center gap-0.5 rounded-lg border border-border/60 p-0.5 md:flex"
            role="group"
          >
            {LAYOUT_OPTIONS.map(({ label, value, icon: Icon }) => (
              <Button
                aria-label={t(label)}
                aria-pressed={layout === value}
                className={cn(
                  "size-6 rounded-md p-0",
                  layout === value &&
                    "bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground",
                )}
                key={value}
                size="icon-sm"
                title={t(label)}
                type="button"
                variant="ghost"
                onClick={() => setLayout(value)}
              >
                <Icon className="size-3.5" />
              </Button>
            ))}
          </div>
          <SpotlightSearchTrigger
            className="hidden md:flex"
            onClick={() => setSpotlightOpen(true)}
            activeQuery={activeQuery}
            onClear={() => setQuery("")}
          />
          {/* Small screens search from the box above the timeline, which
              also carries the semantic toggle; a second icon here was a
              duplicate way into the same thing. */}
        </div>
      </div>
    </header>
  );
}
