import { CheckIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { usePageTypeface } from "@/components/page-typeface-provider";
import {
  PALETTES,
  type Palette,
  type ResolvedTheme,
  type Theme,
  useTheme,
} from "@/components/theme-provider";
import { Slider } from "@/components/ui/slider";
import type { TranslationKey, TranslationParams } from "@/i18n";
import {
  applyPageText,
  formatTextScale,
  type PageTextWeight,
  readPageTextScale,
  readPageTextWeight,
  rememberPageText,
  snapTextScale,
  TEXT_SCALE_DEFAULT,
  TEXT_SCALE_MAX,
  TEXT_SCALE_MIN,
  TEXT_SCALE_STEP,
  TEXT_WEIGHT_DEFAULT,
  TEXT_WEIGHTS,
  textWeightAt,
  textWeightIndex,
} from "@/lib/page-text";
import {
  applyInlinePageTypeface,
  diagnoseTypeface,
  ensurePageTypefaceStyles,
  findPageTypeface,
  forcedRuleInfo,
  inlineOverrideCount,
  isTypefaceWired,
  PAGE_TYPEFACES,
  type PageTypefaceOption,
  pageTypefaceStack,
  rememberInlinePageTypeface,
  TYPEFACE_REVISION,
  type TypefaceDiagnosis,
  watchTypefaceGlyphs,
  whenTypefaceReady,
} from "@/lib/page-typeface";
import { cn } from "@/lib/utils";
import { SettingsSectionGroup } from "./apple-settings-ui";

/** One sentence, twice: enough Han to tell two faces apart at a glance. */
const SAMPLE_LINE = "永和九年，岁在癸丑，暮春之初。";

/** The five slider stops, spelled out. Kept beside the weights they name so a
 *  stop cannot be added to `TEXT_WEIGHTS` without giving it a label. */
function weightLabel(
  weight: PageTextWeight,
  t: (key: TranslationKey, params?: TranslationParams) => string,
): string {
  switch (weight) {
    case 300:
      return t("theme.textWeightLight");
    case 500:
      return t("theme.textWeightMedium");
    case 600:
      return t("theme.textWeightSemibold");
    case 700:
      return t("theme.textWeightBold");
    default:
      return t("theme.textWeightRegular");
  }
}

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

const warned = new Set<string>();

/** One warning per face per kind: the settings shell can mount two panels, and
 *  StrictMode double-invokes the effect, so the same failure would otherwise
 *  stack identical toasts. */
function warnOnce(id: string, kind: "failed" | "unwired", message: string) {
  const key = `${id}:${kind}`;
  if (warned.has(key)) return;
  warned.add(key);
  toast.error(message);
}

function forgetWarning(id: string) {
  warned.delete(`${id}:failed`);
  warned.delete(`${id}:unwired`);
}

export function AppearancePanel({ t }: AppearancePanelProps) {
  const { theme, setTheme, palette, setPalette, resolvedTheme } = useTheme();
  const { typeface, setTypeface } = usePageTypeface();

  // Reading size and weight. Held here rather than in a provider: this panel is
  // their only surface, and what they change is the document (two custom
  // properties on <html>), not React state. Storage is read once per mount, so
  // the two panels this dialog can mount always start from the same numbers.
  const [textScale, setTextScale] = useState<number>(readPageTextScale);
  const [textWeight, setTextWeight] =
    useState<PageTextWeight>(readPageTextWeight);

  const commitText = useCallback((scale: number, weight: PageTextWeight) => {
    const next = snapTextScale(scale);
    setTextScale(next);
    setTextWeight(weight);
    applyPageText(next, weight);
    rememberPageText(next, weight);
  }, []);

  // A webfont is fetched on demand, so "still downloading" and "the CDN is
  // blocked" look identical on a page that has already fallen back to the
  // platform faces. Watching the pick until the face is usable (and checking
  // that the stylesheet honours it at all) is what separates a slow network
  // from a stale stylesheet — both of which would otherwise read as "chose a
  // font, nothing happened".
  const [typefaceStatus, setTypefaceStatus] = useState<
    "idle" | "loading" | "pending" | "failed" | "unwired"
  >("idle");
  // The verdict the picker always shows: chosen face + whether the browser is
  // actually painting it. Without this line, "clicked and nothing happened"
  // cannot be told apart from "clicked, but this browser rewrites fonts".
  const [diagnosis, setDiagnosis] = useState<TypefaceDiagnosis | null>(null);

  // Runs one readiness pass and returns its own cancel hook. Kept separate from
  // the effect so the note's retry button can repeat it without re-picking.
  const checkTypeface = useCallback(
    (option: PageTypefaceOption) => {
      let cancelled = false;
      let unwatch: (() => void) | undefined;

      // Measured on every pick: the sampled runs are the only way to notice a
      // browser — or an extension — that rewrites font families behind the
      // app's back.
      const rethink = () => {
        void diagnoseTypeface(option).then((result) => {
          if (!cancelled) setDiagnosis(result);
        });
      };

      if (!option.family) {
        setTypefaceStatus("idle");
        rethink();
        return () => {
          cancelled = true;
        };
      }

      const reportFailure = () => {
        setTypefaceStatus("failed");
        rethink();
        // The dialog mounts more than one panel and StrictMode double-runs
        // effects, so the toast is deduped by face and kind.
        warnOnce(
          option.id,
          "failed",
          t("theme.typefaceFailed", { font: option.label }),
        );
      };

      // The face is usable — but only helps if the stylesheet routes the page
      // through it. A sheet from before that indirection accepts the choice and
      // ignores it, which reads as "picked a font, nothing happened".
      const settle = () => {
        rethink();
        if (isTypefaceWired(option)) {
          setTypefaceStatus("idle");
          forgetWarning(option.id);
          return;
        }
        setTypefaceStatus("unwired");
        warnOnce(option.id, "unwired", t("theme.typefaceStale"));
      };

      // Keep watching even after a verdict: a request that was refused can be
      // retried by the browser and land a second later, and a stale amber note
      // is as misleading as no note at all.
      const watch = () => {
        unwatch = watchTypefaceGlyphs(option.id, (verdict) => {
          if (cancelled) return;
          if (verdict === "failed") {
            reportFailure();
            return;
          }
          settle();
        });
      };

      setTypefaceStatus("loading");
      void whenTypefaceReady(option.id).then((readiness) => {
        if (cancelled) return;
        if (readiness === "failed") {
          reportFailure();
          watch();
          return;
        }
        if (readiness === "pending") {
          // Slow, not broken: keep the note up and let the download retire it,
          // so a stalled CDN ends as a real message instead of endless silence.
          setTypefaceStatus("pending");
          watch();
          return;
        }
        settle();
      });

      return () => {
        cancelled = true;
        unwatch?.();
      };
    },
    [t],
  );

  useEffect(
    () => checkTypeface(findPageTypeface(typeface)),
    [checkTypeface, typeface],
  );

  const activeTypeface = findPageTypeface(typeface);
  const verdict = diagnosis?.verdict ?? null;
  // What the picker reports, in one place: the face's own verdict when the
  // measurement has landed, the readiness pass otherwise.
  const verdictLabel = (() => {
    if (verdict === "system") {
      // A webfont is selected, so "system" would only mean the measurement never
      // ran — printing it would read as if the platform faces were still picked.
      return activeTypeface.family ? null : t("theme.typefaceVerdictSystem");
    }
    if (verdict === "applied") return t("theme.typefaceVerdictApplied");
    if (verdict === "notpainting") return t("theme.typefaceVerdictNotPainting");
    if (verdict === "overridden") return t("theme.typefaceVerdictOverridden");
    if (verdict === "missing") return t("theme.typefaceVerdictMissing");
    if (verdict === "pending") {
      // A request that stalls long enough to give up on is a failure for the
      // reader, and the note under this line already says so.
      return typefaceStatus === "failed"
        ? t("theme.typefaceVerdictMissing")
        : t("theme.typefaceVerdictPending");
    }
    if (typefaceStatus === "loading" || typefaceStatus === "pending") {
      return t("theme.typefaceVerdictPending");
    }
    if (typefaceStatus === "failed") return t("theme.typefaceVerdictMissing");
    return null;
  })();
  const typefaceNote =
    typefaceStatus === "loading"
      ? t("theme.typefaceLoading", { font: activeTypeface.label })
      : typefaceStatus === "pending"
        ? t("theme.typefacePending", { font: activeTypeface.label })
        : typefaceStatus === "failed"
          ? t("theme.typefaceFailed", { font: activeTypeface.label })
          : typefaceStatus === "unwired"
            ? t("theme.typefaceStale")
            : null;

  // Everything needed to tell "old code", "blocked CDN" and "something is
  // rewriting the page" apart, in four lines the reader can screenshot. The
  // revision is the first thing on it: without that, a report from a stale tab
  // is worse than no report.
  const report = (() => {
    const rule = forcedRuleInfo();
    const engine = /chrome\/([\d.]+)/i.exec(navigator.userAgent);
    const brand = /edg\/([\d.]+)/i.test(navigator.userAgent)
      ? "Edge"
      : "Chrome";
    return [
      `${TYPEFACE_REVISION} · ${activeTypeface.id} · ${verdict ?? typefaceStatus}`,
      `declared ${diagnosis?.declared ?? 0} · loaded ${diagnosis?.loaded ?? 0} · runs ${diagnosis?.matching ?? 0}/${diagnosis?.samples ?? 0} (${diagnosis?.scope ?? "none"})`,
      `painted ${diagnosis?.painted ?? "?"} · twin ${diagnosis?.twin || "-"} · inline ${inlineOverrideCount()} · rule ${rule.present ? rule.length : "none"}`,
      `reach ${diagnosis?.reaches === false ? "no" : "yes"} · alias ${diagnosis?.alias || "-"}`,
      `stack ${diagnosis?.usedStack || getComputedStyle(document.documentElement).fontFamily}`,
      `${brand} ${engine?.[1] ?? ""} · ${navigator.userAgent.includes("Windows") ? "Windows" : navigator.platform}`,
    ].join("\n");
  })();

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

      <SettingsSectionGroup
        footer={t("theme.typefaceDescription")}
        title={t("theme.typeface")}
      >
        {/* The note goes *above* the grid on purpose: the picker is tall enough
            that a line below it lands past the bottom edge of the settings
            sheet — which is exactly how "picked a font, nothing happened, and
            nothing said why" managed to stay invisible. */}
        {/* Always on: the arrow of cause and effect should be visible before
            anything goes wrong. If this line says "已选：朱雀仿宋 · 已生效" and
            the page still looks the same, the browser is not honouring the
            family — which is a different problem from "the click did nothing",
            and the only one the app cannot fix for the reader. */}
        <div className="flex items-center gap-2 px-3.5 pt-2.5 pb-1 text-xs">
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              verdict === "applied"
                ? "bg-emerald-500"
                : verdict === "missing" || verdict === "overridden"
                  ? "bg-amber-500"
                  : "bg-muted-foreground/40",
            )}
          />
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            {t("theme.typefaceSelected", {
              font:
                activeTypeface.id === "system"
                  ? t("theme.typefaceSystem")
                  : activeTypeface.label,
            })}
            {verdictLabel ? ` · ${verdictLabel}` : ""}
          </span>
          <span className="shrink-0 rounded border border-border/70 px-1 font-mono text-[10px] leading-4 text-muted-foreground">
            {TYPEFACE_REVISION}
          </span>
        </div>
        {verdict === "overridden" && (
          <p className="px-3.5 pb-2 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
            {t("theme.typefaceOverriddenHint", {
              // The intercepting family is the useful name here: it is the one
              // the reader has to remove (an extension, a browser font
              // setting), not the platform face the stack degrades to.
              font:
                diagnosis?.alias ||
                diagnosis?.fallback ||
                t("theme.typefaceSystem"),
            })}
          </p>
        )}
        {verdict === "notpainting" && (
          <p className="px-3.5 pb-2 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
            {t("theme.typefaceNotPaintingHint", {
              font: diagnosis?.twin || t("theme.typefaceSystem"),
            })}
          </p>
        )}
        {/* The same sentence twice, drawn by the browser itself: the top line
            asks for the chosen family, the bottom one for the platform list.
            Whatever the status row claims, if these two look identical the
            reader can see the face is not arriving — and so can anyone looking
            at a screenshot. */}
        {activeTypeface.family && (
          <div
            className="px-3.5 pb-2"
            data-keep-typeface=""
            // Previews render in a face that is deliberately not the page's.
          >
            <p
              className="truncate text-[15px] leading-relaxed text-foreground"
              style={{ fontFamily: pageTypefaceStack(activeTypeface) }}
            >
              {SAMPLE_LINE}
            </p>
            <p
              className="truncate text-[15px] leading-relaxed text-muted-foreground"
              style={{ fontFamily: "var(--font-cjk-platform)" }}
            >
              {SAMPLE_LINE}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {t("theme.typefaceSampleCaption")}
            </p>
          </div>
        )}
        <details className="px-3.5 pb-2 text-xs">
          <summary className="cursor-pointer select-none text-muted-foreground">
            {t("theme.typefaceDiagnose")}
          </summary>
          <pre className="mt-1.5 max-h-40 overflow-auto rounded-md bg-muted/60 p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all text-muted-foreground">
            {report}
          </pre>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <button
              className="cursor-pointer rounded border border-border/70 px-2 py-0.5 font-medium text-muted-foreground hover:bg-accent"
              onClick={() => {
                void navigator.clipboard?.writeText(report).then(
                  () => toast.success(t("theme.typefaceCopied")),
                  () => toast.error(t("theme.typefaceCopiedFailed")),
                );
              }}
              type="button"
            >
              {t("theme.typefaceCopyReport")}
            </button>
            {activeTypeface.family && verdict !== "applied" && (
              <button
                className="cursor-pointer rounded border border-amber-500/40 px-2 py-0.5 font-medium text-amber-700 hover:bg-amber-500/10 dark:text-amber-400"
                onClick={() => {
                  // Last rung: write the family onto the elements themselves.
                  // Author rules cannot outrank an inline `!important`, so if
                  // the page still ignores the choice, this is why.
                  const count = applyInlinePageTypeface(activeTypeface);
                  rememberInlinePageTypeface(activeTypeface.id);
                  toast.success(
                    t("theme.typefaceEscalated", { count: String(count) }),
                  );
                  void diagnoseTypeface(activeTypeface).then(setDiagnosis);
                }}
                type="button"
              >
                {t("theme.typefaceEscalate")}
              </button>
            )}
          </div>
        </details>
        {typefaceNote && (
          <div
            className={cn(
              "flex items-start gap-2 px-3.5 py-2.5 text-[11px] leading-relaxed",
              typefaceStatus === "loading"
                ? "text-muted-foreground"
                : "bg-amber-500/10 text-amber-700 dark:text-amber-400",
            )}
            role="status"
          >
            <span className="min-w-0 flex-1">{typefaceNote}</span>
            {typefaceStatus !== "loading" && (
              <button
                className="shrink-0 cursor-pointer rounded border border-amber-500/40 px-1.5 py-0.5 font-medium"
                onClick={() => {
                  // A stylesheet from before the indirection cannot be fixed by
                  // re-checking it — only by loading the current one.
                  if (typefaceStatus === "unwired") {
                    window.location.reload();
                    return;
                  }
                  checkTypeface(activeTypeface);
                }}
                type="button"
              >
                {typefaceStatus === "unwired"
                  ? t("theme.typefaceRefresh")
                  : t("theme.typefaceRetry")}
              </button>
            )}
          </div>
        )}
        <div className="grid grid-cols-1 gap-2 p-2 sm:grid-cols-2">
          {PAGE_TYPEFACES.map((option) => {
            const active = typeface === option.id;
            return (
              <button
                aria-pressed={active}
                className={cn(
                  "group relative flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-all cursor-pointer",
                  active
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                    : "border-border/60 bg-card hover:border-border hover:bg-accent/40",
                )}
                key={option.id}
                onClick={() => setTypeface(option.id)}
                // Warming the stylesheet on intent means the face is usually
                // ready by the time the click lands — and a reader who only
                // scrolls past downloads nothing.
                onPointerEnter={() => {
                  void ensurePageTypefaceStyles(option.id);
                }}
                type="button"
              >
                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate text-[13px] text-foreground"
                    // Each card shows *its own* face, so it must survive the
                    // page-wide force rule that makes the chosen face stick.
                    data-keep-typeface=""
                    style={{ fontFamily: pageTypefaceStack(option) }}
                  >
                    {option.id === "system"
                      ? t("theme.typefaceSystem")
                      : option.label}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                    {option.latin}
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
        footer={t("theme.readingDescription")}
        title={t("theme.reading")}
      >
        <div className="px-3.5 py-3">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="font-medium text-foreground">
              {t("theme.textSize")}
            </span>
            <span className="font-mono text-muted-foreground tabular-nums">
              {formatTextScale(textScale)}
            </span>
          </div>
          <Slider
            aria-label={t("theme.textSize")}
            className="mt-2.5"
            max={Math.round(TEXT_SCALE_MAX * 100)}
            min={Math.round(TEXT_SCALE_MIN * 100)}
            onValueChange={(value) => {
              const percent = Array.isArray(value) ? value[0] : value;
              commitText((percent ?? 100) / 100, textWeight);
            }}
            step={Math.round(TEXT_SCALE_STEP * 100)}
            value={[Math.round(textScale * 100)]}
          />
        </div>

        <div className="px-3.5 py-3">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="font-medium text-foreground">
              {t("theme.textWeight")}
            </span>
            <span className="font-mono text-muted-foreground tabular-nums">
              {textWeight} · {weightLabel(textWeight, t)}
            </span>
          </div>
          <Slider
            aria-label={t("theme.textWeight")}
            className="mt-2.5"
            max={TEXT_WEIGHTS.length - 1}
            min={0}
            onValueChange={(value) => {
              const index = Array.isArray(value) ? value[0] : value;
              commitText(textScale, textWeightAt(index ?? 0));
            }}
            step={1}
            value={[textWeightIndex(textWeight)]}
          />
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {t("theme.textWeightHint")}
          </p>
        </div>

        {/* The real thing, at the real numbers, in the real face — set inline
            because the settings sheet itself is pinned at 100% (see
            .page-text-locked): a control that grows while you drag it would
            slide out from under the pointer. */}
        <div className="px-3.5 py-3" data-keep-typeface="">
          <p
            style={{
              fontFamily: pageTypefaceStack(activeTypeface),
              fontSize: `calc(15px * ${textScale})`,
              fontWeight: textWeight,
              lineHeight: `calc(28px * ${textScale})`,
            }}
          >
            {SAMPLE_LINE}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("theme.readingSample")}
          </p>
        </div>

        {(textScale !== TEXT_SCALE_DEFAULT ||
          textWeight !== TEXT_WEIGHT_DEFAULT) && (
          <div className="flex justify-end px-3.5 py-2">
            <button
              className="cursor-pointer rounded border border-border/70 px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-accent"
              onClick={() =>
                commitText(TEXT_SCALE_DEFAULT, TEXT_WEIGHT_DEFAULT)
              }
              type="button"
            >
              {t("theme.textReset")}
            </button>
          </div>
        )}
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
