import { CheckIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { LocaleSwitcher } from "@/components/locale-switcher";
import {
  PALETTES,
  type Palette,
  type ResolvedTheme,
  type Theme,
  useTheme,
} from "@/components/theme-provider";
import type { TranslationKey, TranslationParams } from "@/i18n";
import { cn } from "@/lib/utils";
import { SettingsSectionGroup } from "./apple-settings-ui";

type AppearancePanelProps = {
  t: (key: TranslationKey, params?: TranslationParams) => string;
};

/**
 * Three colours are enough to tell the palettes apart in a thumbnail: what the
 * page is, what a surface on it is, and what ink looks like. Kept as literals
 * instead of reading the live CSS variables because a preview has to show the
 * palette you are *not* currently on.
 */
const PALETTE_SWATCHES: Record<
  Palette,
  Record<ResolvedTheme, [page: string, surface: string, ink: string]>
> = {
  paper: {
    light: ["#faf9f7", "#fffefc", "#2b2622"],
    dark: ["#0d0c0b", "#1c1b19", "#edece9"],
  },
  graphite: {
    light: ["#f4f5f6", "#fdfefe", "#22262b"],
    dark: ["#15171a", "#1f2226", "#e9ecef"],
  },
  sepia: {
    light: ["#f2e9d8", "#f8f2e5", "#3a2f22"],
    dark: ["#221c15", "#2e271e", "#efe4d3"],
  },
  ink: {
    light: ["#ffffff", "#ffffff", "#121212"],
    dark: ["#0a0a0a", "#171717", "#f7f7f7"],
  },
  nord: {
    light: ["#eff2f7", "#fbfcfe", "#232d3a"],
    dark: ["#1b2330", "#252e3d", "#e4eaf3"],
  },
  moss: {
    light: ["#f0f4e9", "#fafcf4", "#283022"],
    dark: ["#182018", "#222b21", "#e6eede"],
  },
};

function PalettePreview({
  palette,
  mode,
}: {
  palette: Palette;
  mode: ResolvedTheme;
}) {
  const [page, surface, ink] = PALETTE_SWATCHES[palette][mode];

  return (
    <div
      className="relative h-16 w-full overflow-hidden rounded-lg border border-black/10 transition-transform group-hover:scale-[1.02] dark:border-white/10"
      style={{ backgroundColor: page }}
    >
      {/* A page header line, then one sheet with two lines of "text". */}
      <div
        className="absolute inset-x-2 top-2 h-1.5 rounded-full"
        style={{ backgroundColor: ink, opacity: 0.12 }}
      />
      <div
        className="absolute inset-x-2 top-5 bottom-2 rounded-md border"
        style={{
          backgroundColor: surface,
          borderColor: `${ink}1f`,
        }}
      >
        <div
          className="mx-1.5 mt-1.5 h-1 w-8 rounded-full"
          style={{ backgroundColor: ink, opacity: 0.55 }}
        />
        <div
          className="mx-1.5 mt-1 h-1 w-12 rounded-full"
          style={{ backgroundColor: ink, opacity: 0.22 }}
        />
      </div>
    </div>
  );
}

export function AppearancePanel({ t }: AppearancePanelProps) {
  const { theme, setTheme, palette, setPalette, resolvedTheme } = useTheme();

  const themes: {
    id: Theme;
    label: string;
    description: string;
    icon: typeof SunIcon;
  }[] = [
    {
      id: "system",
      label: t("theme.system"),
      description: t("theme.systemDescription"),
      icon: MonitorIcon,
    },
    {
      id: "light",
      label: t("theme.light"),
      description: t("theme.lightDescription"),
      icon: SunIcon,
    },
    {
      id: "dark",
      label: t("theme.dark"),
      description: t("theme.darkDescription"),
      icon: MoonIcon,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <SettingsSectionGroup title={t("theme.title")}>
        <div className="grid grid-cols-1 gap-2 p-2 sm:grid-cols-3">
          {themes.map((item) => {
            const active = theme === item.id;
            const Icon = item.icon;
            return (
              <button
                className={cn(
                  "group relative flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-all cursor-pointer",
                  active
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                    : "border-border/60 bg-card hover:border-border hover:bg-accent/40",
                )}
                key={item.id}
                onClick={() => setTheme(item.id)}
                type="button"
              >
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-md border",
                    item.id === "light" &&
                      "border-amber-200 bg-amber-50 text-amber-600",
                    item.id === "dark" &&
                      "border-slate-700 bg-slate-800 text-slate-200",
                    item.id === "system" &&
                      "border-border/60 bg-background text-foreground",
                  )}
                >
                  <Icon className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-xs text-foreground">
                    {item.label}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                    {item.description}
                  </span>
                </span>
                {active && (
                  <CheckIcon className="size-3.5 shrink-0 text-primary" />
                )}
              </button>
            );
          })}
        </div>
      </SettingsSectionGroup>

      <SettingsSectionGroup
        footer={t("theme.paletteDescription")}
        title={t("theme.palette")}
      >
        <div className="grid grid-cols-2 gap-2 p-2 sm:grid-cols-3">
          {PALETTES.map((id) => {
            const active = palette === id;
            return (
              <button
                aria-pressed={active}
                className={cn(
                  "group relative flex flex-col gap-1.5 rounded-lg border p-2 text-left transition-all cursor-pointer",
                  active
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                    : "border-border/60 bg-card hover:border-border hover:bg-accent/40",
                )}
                key={id}
                onClick={() => setPalette(id)}
                type="button"
              >
                <PalettePreview mode={resolvedTheme} palette={id} />
                <span className="flex items-center gap-1 px-0.5">
                  <span className="min-w-0 flex-1 truncate font-medium text-xs text-foreground">
                    {t(`palette.${id}`)}
                  </span>
                  {active && (
                    <CheckIcon className="size-3.5 shrink-0 text-primary" />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </SettingsSectionGroup>

      <SettingsSectionGroup title={t("theme.language")}>
        <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
          <span className="text-xs text-muted-foreground">
            {t("theme.languageDescription")}
          </span>
          <LocaleSwitcher className="h-8 bg-background" />
        </div>
      </SettingsSectionGroup>

      <SettingsSectionGroup title={t("theme.previewDetails")}>
        <div className="flex items-center justify-between px-4 py-3 text-xs">
          <span className="text-muted-foreground">
            {t("theme.shortcutTip")}
          </span>
          <kbd className="inline-flex h-5 items-center rounded border border-border/80 bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
            D
          </kbd>
        </div>
      </SettingsSectionGroup>
    </div>
  );
}
