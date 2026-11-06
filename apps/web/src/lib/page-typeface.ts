/**
 * Reader-chosen page typeface.
 *
 * Palette and dark mode decide how the page looks; this decides how it reads.
 * The choice lands on two custom properties on <html> and nowhere else:
 *
 *   --font-cjk-chosen        → feeds --font-cjk (UI, markdown, editor)
 *   --font-cjk-serif-chosen  → feeds --font-cjk-serif (share-card serif tier)
 *
 * Both are written as `"Family", var(--font-cjk-platform)`, so an unreachable
 * CDN or a font that is still downloading degrades to exactly the platform
 * faces the app shipped with — never to a browser default.
 *
 * Latin stays on Geist: the family is appended after it rather than replacing
 * it, so only Han runs on the chosen face. That is what "page font" means
 * here: a reading face for Chinese, not a redesign of the Latin UI.
 */

export type PageTypefaceId =
  | "system"
  | "wenkai"
  | "zhisong"
  | "zhuque"
  | "jinghua"
  | "xihei";

export type PageTypefaceOption = {
  id: PageTypefaceId;
  /** The typeface's own name — a proper noun, never translated. */
  label: string;
  /** Second line, so the list still reads in a non-Chinese locale. */
  latin: string;
  /** CSS family name; `system` has none and inherits the platform list. */
  family?: string;
  /** Remote stylesheet, imported the first time the face is needed. */
  href?: string;
  /** Bundled stylesheet (chunked woff2 already in the build). */
  load?: () => Promise<unknown>;
};

export const PAGE_TYPEFACES: PageTypefaceOption[] = [
  { id: "system", label: "系统默认", latin: "System" },
  {
    id: "wenkai",
    label: "霞鹜文楷屏幕阅读版",
    latin: "LXGW WenKai Screen",
    family: "LXGW WenKai Screen",
    href: "https://cdn.jsdelivr.net/npm/lxgw-wenkai-screen-webfont@1.1.0/style.css",
  },
  {
    id: "zhisong",
    label: "霞鹜新致宋",
    latin: "LXGW Neo ZhiSong",
    family: "LXGW Neo ZhiSong",
    href: "https://fontsapi.zeoseven.com/22/main/result.css",
  },
  {
    id: "zhuque",
    label: "朱雀仿宋",
    latin: "Zhuque Fangsong",
    family: "Zhuque Fangsong",
    load: () => import("@free-fonts/zhuque-fangsong/zhuque-fangsong.css"),
  },
  {
    id: "jinghua",
    label: "京华老宋体",
    latin: "KingHwa OldSong",
    family: "KingHwaOldSong",
    href: "https://fontsapi.zeoseven.com/309/main/result.css",
  },
  {
    id: "xihei",
    label: "霞鹜新晰黑",
    latin: "LXGW Neo XiHei",
    family: "LXGW Neo XiHei",
    href: "https://fontsapi.zeoseven.com/19/main/result.css",
  },
];

const STORAGE_KEY = "flaremo.page.typeface";
/** Set only after the reader had to escalate to per-element overrides, so the
 *  next load starts at the level that actually worked on this machine. */
const INLINE_KEY = "flaremo.page.typeface.inline";
const LINK_ATTRIBUTE = "data-page-typeface";
const FORCE_STYLE_ID = "flaremo-page-typeface-force";

/** Marks a subtree that must keep its own face even when the page face is
 *  force-applied: the picker's own previews, the share-card sheet. */
export const TYPEFACE_KEEP_ATTRIBUTE = "data-keep-typeface";

export function findPageTypeface(
  id: string | null | undefined,
): PageTypefaceOption {
  return PAGE_TYPEFACES.find((option) => option.id === id) ?? PAGE_TYPEFACES[0];
}

export function readPageTypeface(): PageTypefaceId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && PAGE_TYPEFACES.some((option) => option.id === stored)) {
      return stored as PageTypefaceId;
    }
  } catch {
    // Private mode / storage disabled: fall through to the platform faces.
  }
  return "system";
}

export function rememberPageTypeface(id: PageTypefaceId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Best-effort: the choice still applies to this session.
  }
}

/** `font-family` value that puts the chosen Han face ahead of the platform
 *  list. Useful for previewing an option before it is selected. */
export function pageTypefaceStack(
  option: PageTypefaceOption,
): string | undefined {
  if (!option.family) return undefined;
  return `"${option.family}", var(--font-cjk-platform)`;
}

/**
 * The page's own sans stack with the chosen face spliced in after the Latin
 * ones — the same order `--font-sans` produces.
 *
 * Written as literals rather than `var(--font-cjk-platform)` on purpose: this
 * stack is the escape hatch, so it must not inherit the failure it is there to
 * fix. If the variable were missing (a stylesheet from before it existed, a
 * stale sheet, an extension that nukes custom properties), the whole
 * declaration would be invalid at computed-value time and `font-family` would
 * quietly fall back to "inherit" — a dead button again, this time with no
 * error anywhere. So the platform list is resolved once, here, and inlined.
 *
 * The chosen face sits *second*, right behind Geist, and that position is
 * load-bearing. Font matching is per character and left to right, so every
 * family before the choice gets first refusal on the Han characters as well —
 * and `Segoe UI`, `Arial`, `Tahoma`, `sans-serif` and friends are exactly the
 * names a font-replacing extension (or a browser's own font override) rewrites
 * via `@font-face { unicode-range: U+2E80-FFFF }`. When the choice was listed
 * after them it never got a look at a single glyph: the page painted the
 * substitute, the webfont's chunks were never even requested, and every
 * measurement in this file agreed the face was "applied". Geist leads because
 * it is bundled with the app and ships no Han glyphs, so it cannot intercept.
 */
export function pageTypefaceFullStack(family: string): string {
  return [
    '"Geist Variable"',
    `"${family}"`,
    "-apple-system",
    "BlinkMacSystemFont",
    '"Segoe UI"',
    platformList(),
    '"Noto Sans Arabic Variable"',
    "system-ui",
    "sans-serif",
  ].join(", ");
}

const PLATFORM_FALLBACK =
  '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC"';

function platformList(): string {
  if (typeof document === "undefined") return PLATFORM_FALLBACK;
  try {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue("--font-cjk-platform")
      .trim();
    // jsdom resolves no custom properties (and some suites stub the whole
    // computed style), so an empty read means "unknown", not "no fallback".
    return value || PLATFORM_FALLBACK;
  } catch {
    return PLATFORM_FALLBACK;
  }
}

/**
 * Paint the page face *over* whatever the document asks for.
 *
 * The variable path (`--font-cjk-chosen`) is the polite one: it changes what
 * the app's own stack resolves to, and leaves every tier (mono, serif, share
 * cards) intact. But it is only as good as the stylesheet that reads it — a
 * stale sheet, a cached build, or an extension that rewrites `font-family`
 * with `!important` all leave the variable written and the page unchanged,
 * which from the reader's side looks exactly like a dead button.
 *
 * This rule is the escape hatch: a specific-enough selector with `!important`
 * (three class-level `:not()` guards, so it outranks the usual `*`/`body *`
 * overrides) that cannot be ignored. Subtrees that legitimately need their own
 * face opt out with `data-keep-typeface`; code keeps its mono tier.
 */
export function applyForcedPageTypeface(option: PageTypefaceOption): void {
  if (typeof document === "undefined") return;
  const existing = document.getElementById(FORCE_STYLE_ID);
  if (!option.family) {
    existing?.remove();
    return;
  }

  const selector = [
    "html body *",
    `:not([${TYPEFACE_KEEP_ATTRIBUTE}])`,
    `:not([${TYPEFACE_KEEP_ATTRIBUTE}] *)`,
    ":not(code)",
    ":not(pre)",
    ":not(kbd)",
    ":not(samp)",
    ":not(.font-mono)",
  ].join("");

  const css = `${selector} { font-family: ${pageTypefaceFullStack(
    option.family,
  )} !important; }`;

  if (existing) {
    if (existing.textContent !== css) existing.textContent = css;
    return;
  }
  const style = document.createElement("style");
  style.id = FORCE_STYLE_ID;
  style.textContent = css;
  document.head.appendChild(style);
}

export function clearForcedPageTypeface(): void {
  if (typeof document === "undefined") return;
  document.getElementById(FORCE_STYLE_ID)?.remove();
}

/**
 * The last rung of the ladder: write `font-family` onto the elements themselves
 * with `!important`.
 *
 * A stylesheet rule — however specific — is still *author* level, so one
 * inline `!important` from anywhere above it wins. Setting the property on the
 * element is the top of that stack. It is used only when the rule demonstrably
 * failed on this machine, and the previous inline value is kept so going back
 * to the platform faces really goes back.
 *
 * Code stays monospace, and subtrees that show a face of their own (the picker
 * previews, the share card) are skipped — the page face is prose, not a
 * redesign.
 */
const inlineRestore = new Map<HTMLElement, [string, string]>();
let inlineObserver: MutationObserver | null = null;
let inlineOption: PageTypefaceOption | null = null;
let inlineFrame = 0;

const INLINE_SKIP =
  "script, style, link, meta, code, pre, kbd, samp, .font-mono, canvas";

function paintInline(node: HTMLElement, stack: string): void {
  if (node.closest(`[${TYPEFACE_KEEP_ATTRIBUTE}]`)) return;
  if (node.matches(INLINE_SKIP)) return;
  if (!inlineRestore.has(node)) {
    inlineRestore.set(node, [
      node.style.getPropertyValue("font-family"),
      node.style.getPropertyPriority("font-family"),
    ]);
  }
  node.style.setProperty("font-family", stack, "important");
}

function sweepInline(root: ParentNode, stack: string): number {
  let touched = 0;
  for (const node of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
    if (node.closest(`[${TYPEFACE_KEEP_ATTRIBUTE}]`)) continue;
    if (node.matches(INLINE_SKIP)) continue;
    paintInline(node, stack);
    touched += 1;
  }
  return touched;
}

/** Keep the overrides on nodes React (or the editor) adds later. Batched into
 *  one frame: a memo list re-render is one mutation burst, not hundreds. */
function watchInline(stack: string): void {
  if (typeof MutationObserver === "undefined" || !document.body) return;
  if (inlineObserver) return;
  inlineObserver = new MutationObserver((records) => {
    if (inlineFrame) return;
    inlineFrame = requestAnimationFrame(() => {
      inlineFrame = 0;
      for (const record of records) {
        for (const added of Array.from(record.addedNodes)) {
          if (added.nodeType !== Node.ELEMENT_NODE) continue;
          const element = added as HTMLElement;
          paintInline(element, stack);
          for (const child of Array.from(
            element.querySelectorAll<HTMLElement>("*"),
          )) {
            paintInline(child, stack);
          }
        }
      }
    });
  });
  inlineObserver.observe(document.body, { childList: true, subtree: true });
}

export function applyInlinePageTypeface(option: PageTypefaceOption): number {
  if (typeof document === "undefined" || !option.family || !document.body) {
    return 0;
  }
  inlineOption = option;
  const stack = pageTypefaceFullStack(option.family);
  const touched = sweepInline(document.body, stack);
  watchInline(stack);
  return touched;
}

export function clearInlinePageTypeface(): void {
  inlineObserver?.disconnect();
  inlineObserver = null;
  inlineOption = null;
  if (typeof document === "undefined") return;
  for (const [node, [value, priority]] of inlineRestore) {
    if (!node.isConnected) continue;
    if (value) node.style.setProperty("font-family", value, priority);
    else node.style.removeProperty("font-family");
  }
  inlineRestore.clear();
}

export function inlineOverrideCount(): number {
  return inlineOption ? inlineRestore.size : 0;
}

/** What the escape hatch currently looks like in the document — one number
 *  that answers "is the rule that makes this work even there?". */
export function forcedRuleInfo(): { present: boolean; length: number } {
  if (typeof document === "undefined") return { present: false, length: 0 };
  const style = document.getElementById(FORCE_STYLE_ID);
  return { present: Boolean(style), length: style?.textContent?.length ?? 0 };
}

export function rememberInlinePageTypeface(id: PageTypefaceId | null): void {
  try {
    if (id) localStorage.setItem(INLINE_KEY, id);
    else localStorage.removeItem(INLINE_KEY);
  } catch {
    // Best-effort: the override still holds for this session.
  }
}

export function isInlinePageTypeface(id: PageTypefaceId): boolean {
  try {
    return localStorage.getItem(INLINE_KEY) === id;
  } catch {
    return false;
  }
}

const imports = new Map<PageTypefaceId, Promise<unknown>>();
/** One pending promise per inserted <link>, so a second caller waits for the
 *  same sheet instead of resolving before its `@font-face` rules exist. */
const sheetLoads = new WeakMap<HTMLLinkElement, Promise<void>>();

/**
 * Fetch the stylesheet for a face. Called when an option is hovered or picked,
 * never on first paint: a reader who keeps the system faces downloads none of
 * these stylesheets, and the woff2 chunks only come when glyphs are used.
 *
 * Resolves once the sheet has been applied (or has failed) so callers can ask
 * the font set about a family only after its `@font-face` rules exist — asking
 * before that would look like "no such face" for every remote typeface.
 */
export function ensurePageTypefaceStyles(id: PageTypefaceId): Promise<void> {
  const option = findPageTypeface(id);
  if (!option.family || typeof document === "undefined") {
    return Promise.resolve();
  }

  if (option.load) {
    let pending = imports.get(option.id);
    if (!pending) {
      // A failed import is forgotten so the next hover or pick retries it.
      pending = option.load().catch((error: unknown) => {
        imports.delete(option.id);
        throw error;
      });
      imports.set(option.id, pending);
    }
    return pending.then(
      () => undefined,
      () => undefined,
    );
  }

  if (!option.href) return Promise.resolve();

  const existing = document.head.querySelector<HTMLLinkElement>(
    `link[${LINK_ATTRIBUTE}="${option.id}"]`,
  );
  if (existing) return sheetLoads.get(existing) ?? Promise.resolve();

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = option.href;
  link.setAttribute(LINK_ATTRIBUTE, option.id);
  // Resolve either way: a blocked CDN is "the face never arrived", which the
  // caller reports; it is not an exception worth throwing.
  const loaded = new Promise<void>((resolve) => {
    link.addEventListener("load", () => resolve());
    // A blocked CDN must not leave a dead <link> behind, so a re-pick can
    // retry the request from scratch.
    link.addEventListener("error", () => {
      link.remove();
      resolve();
    });
  });
  sheetLoads.set(link, loaded);
  document.head.appendChild(link);
  return loaded;
}

/** Write the choice onto <html>. Passing `system` clears both overrides, which
 *  hands the page back to the language-scoped platform lists untouched. */
export function applyPageTypeface(id: PageTypefaceId): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const option = findPageTypeface(id);

  if (!option.family) {
    root.style.removeProperty("--font-cjk-chosen");
    root.style.removeProperty("--font-cjk-serif-chosen");
    delete root.dataset.typeface;
    clearForcedPageTypeface();
    clearInlinePageTypeface();
    return;
  }

  void ensurePageTypefaceStyles(option.id);
  root.style.setProperty(
    "--font-cjk-chosen",
    `"${option.family}", var(--font-cjk-platform)`,
  );
  root.style.setProperty(
    "--font-cjk-serif-chosen",
    `"${option.family}", var(--font-cjk-serif-platform)`,
  );
  root.dataset.typeface = option.id;
  // Both paths at once, on purpose. The variable path keeps every tier the
  // stylesheet defines; the forced rule is what makes the choice unconditional,
  // so a stale sheet, a cached build or a font-forcing extension cannot turn a
  // click into "nothing happened". Forcing is the default rather than a
  // fallback because the fallback can only be reached by a measurement that is
  // itself the thing that kept lying.
  applyForcedPageTypeface(option);
  // A machine that already needed per-element overrides gets them straight
  // away, so the page never loads in the platform face and then swaps.
  if (isInlinePageTypeface(option.id)) applyInlinePageTypeface(option);
}

/** Applied before React mounts, so the first frame is already in the reader's
 *  face instead of flashing the system one. */
export function applyStoredPageTypeface(): void {
  applyPageTypeface(readPageTypeface());
}

/** A short Han sample: enough glyphs to cover the subset the face ships for
 *  ordinary prose, without waiting on the whole family. */
const READINESS_SAMPLE = "永和九年岁在癸丑";

/**
 * Does the live stylesheet route `--font-cjk` through the chosen face?
 *
 * The page only reacts to the choice because `--font-cjk` is written as
 * `var(--font-cjk-chosen, …)`. A stylesheet from before that indirection —
 * a tab left open across the change, a stale service worker — would accept the
 * inline property and then ignore it, which reads as "picked a font, nothing
 * happened". Checking the computed value turns that silence into a message.
 */
export function isTypefaceWired(option: PageTypefaceOption): boolean {
  if (!option.family || typeof document === "undefined") return true;
  const computed = getComputedStyle(document.documentElement).getPropertyValue(
    "--font-cjk",
  );
  // jsdom (tests) does not resolve custom properties; trust the CSS there
  // rather than reporting every pick as unwired.
  if (!computed) return true;
  return computed.includes(option.family);
}

/**
 * Bumped whenever this wiring changes. It is rendered in the picker so a
 * screenshot answers the question "is this browser even running that code?" —
 * the one thing that cannot be settled from the outside.
 */
export const TYPEFACE_REVISION = "r7";

export type TypefaceVerdict =
  | "system"
  /** The page's own stack still names the chosen face, and its chunks arrived. */
  | "applied"
  /** Declared and downloading; the page is still on the fallback. */
  | "pending"
  /** Nothing to paint: no @font-face, or every chunk was refused. */
  | "missing"
  /** The stack names the face, but the glyphs it draws are the fallback's. */
  | "notpainting"
  /** Chunks arrived, but the page is no longer asking for the family. */
  | "overridden";

export type TypefaceDiagnosis = {
  verdict: TypefaceVerdict;
  /** Faces the stylesheet declares for the family. */
  declared: number;
  /** Faces `fonts.load()` actually returned. */
  loaded: number;
  /** The stack the document root is painted with. */
  usedStack: string;
  /** Text runs the choice was measured against, and how many agree. */
  samples: number;
  matching: number;
  /** The family the page resolves to when it ignores the choice. */
  fallback: string;
  /** Whether the canvas drew this family, and which system face it copied if
   *  it did not. */
  painted: boolean;
  twin: string;
  /** Whether the *whole* stack still ends up on the family: false when an
   *  earlier family answers for the Han characters, which is what a
   *  font-replacing `@font-face` does. */
  reaches: boolean;
  /** The family that answers first when `reaches` is false. */
  alias: string;
  /** Which text the stack was read from. */
  scope: "page" | "dialog" | "none";
};

const HAN_RUN = /[\u3400-\u9fff]{2,}/;
const INSPECT_SELECTOR =
  "p,div,span,li,a,h1,h2,h3,h4,button,td,th,label,time,figcaption";
/** The settings sheet is not "the page": it covers the page, and sampling it
 *  would answer a question nobody asked ("does this dialog use the face?"). */
const SELF_CONTAINERS =
  '[data-slot="dialog-content"], [data-slot="dialog-overlay"]';

/**
 * Draw `sample` in `stack` on a canvas and hash the result.
 *
 * Canvas has the same per-character fallback the page does but none of its
 * cascade, so this is the only measurement here that looks at *output*. An
 * empty string means "could not measure" (no canvas, tainted context), never
 * "painted nothing".
 */
function paintSignature(stack: string, sample: string): string {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 260;
    canvas.height = 110;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return "";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = `64px ${stack}`;
    ctx.textBaseline = "top";
    ctx.fillStyle = "#000";
    ctx.fillText(sample, 2, 6);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let hash = 2166136261;
    let ink = 0;
    for (let i = 3; i < data.length; i += 4) {
      const alpha = data[i] ?? 0;
      if (alpha > 8) {
        ink += 1;
        hash = ((hash ^ alpha) * 16777619) >>> 0;
      }
    }
    return ink > 0 ? `${ink}:${hash}` : "";
  } catch {
    // No canvas / tainted context: trust the cascade rather than accusing the
    // font of something that was never measured.
    return "";
  }
}

/**
 * Does the whole stack drawn by the page still end up on the chosen face?
 *
 * The family on its own always paints itself, so comparing it with `serif`
 * answers "does this face work here" — and that is the question this probe
 * used to answer, which is exactly how a page could report "已生效" while every
 * glyph came from somewhere else. The stack is a list, not a name: font
 * matching walks it per character, and a font-replacing `@font-face`
 * (`Segoe UI` rewritten with `unicode-range: U+2E80-FFFF`, the standard trick of
 * "make Chinese render in YaHei" extensions) answers for the Han characters
 * before the chosen family is ever consulted. So paint the same sentence twice —
 * once with the family alone, once with the stack the page really uses — and
 * call it reached only when the pixels agree.
 */
export function stackReachesFamily(
  family: string,
  sample = "永和九年岁在癸丑",
): boolean {
  if (typeof document === "undefined") return true;
  const alone = paintSignature(`"${family}"`, sample);
  const stacked = paintSignature(pageTypefaceFullStack(family), sample);
  // Unmeasured on either side: do not turn a missing canvas into an accusation.
  if (!alone || !stacked) return true;
  return alone === stacked;
}

/**
 * Families that a font-replacing extension has redefined for Han characters.
 *
 * `document.fonts` only lists `@font-face` rules — an installed family never
 * appears there — so a rule *named* `Segoe UI`, `Arial` or `sans-serif` that
 * also claims the CJK block is somebody substituting a face, not a webfont.
 * Naming it turns "浏览器未采用" into something the reader can act on: the
 * offending rule is injected by a "强制雅黑"-style extension.
 */
const REPLACEABLE_LATIN = [
  "arial",
  "arial black",
  "calibri",
  "cambria",
  "candara",
  "comic sans ms",
  "consolas",
  "constantia",
  "corbel",
  "courier",
  "courier new",
  "georgia",
  "helvetica",
  "impact",
  "lucida console",
  "lucida grande",
  "microsoft sans serif",
  "monaco",
  "ms sans serif",
  "palatino linotype",
  "segoe ui",
  "tahoma",
  "times",
  "times new roman",
  "trebuchet ms",
  "verdana",
  "sans-serif",
  "serif",
  "monospace",
  "system-ui",
];

/** `"U+4E00-9FFF, U+3000"` → does it include any Han character? Empty range in
 *  CSS means "everything", so it counts too. */
function rangeCoversHan(range: string): boolean {
  if (!range) return true;
  for (const part of range.split(",")) {
    const [start, end] = part.trim().replace(/^u\+/i, "").split("-");
    const low = Number.parseInt(start ?? "", 16);
    if (Number.isNaN(low)) continue;
    const high = end ? Number.parseInt(end, 16) : low;
    if (high >= 0x3400 && low <= 0x9fff) return true;
  }
  return false;
}

export function interceptingFamilies(): string[] {
  if (typeof document === "undefined" || !document.fonts) return [];
  const found = new Set<string>();
  document.fonts.forEach((face) => {
    const name = normaliseFamily(face.family ?? "");
    if (!name || !REPLACEABLE_LATIN.includes(name)) return;
    if (name === "sans-serif" || name === "serif" || name === "monospace") {
      // A generic keyword redefined as a face is the loudest version of this.
      found.add(face.family);
      return;
    }
    if (rangeCoversHan("unicodeRange" in face ? face.unicodeRange : "")) {
      found.add(face.family);
    }
  });
  return Array.from(found);
}

/**
 * Draw the sentence to a canvas and compare pixels.
 *
 * `getComputedStyle` reports the stack the cascade resolved — which is true
 * even when the font file never arrived, because a missing family simply falls
 * back per glyph. Canvas has the same fallback behaviour and no cascade at all:
 * if `"Family"` draws exactly what `serif` draws, the family is not painting,
 * whatever the CSS says. Canvas is also the only way to see this from inside
 * the page, without devtools or a browser-automation harness.
 */
export function paintProbe(
  family: string,
  sample = "永和九年岁在癸丑",
): { painted: boolean; twin: string; ink: number } {
  const unknown = { painted: true, twin: "", ink: 0 };
  if (typeof document === "undefined") return unknown;

  const mine = paintSignature(`"${family}"`, sample);
  if (!mine) return unknown;
  const twins: Array<[string, string]> = [
    ["serif", paintSignature("serif", sample)],
    ["sans-serif", paintSignature("sans-serif", sample)],
    ["monospace", paintSignature("monospace", sample)],
  ];
  const twin = twins.find(([, signature]) => signature && signature === mine);
  return {
    painted: !twin,
    twin: twin?.[0] ?? "",
    ink: Number.parseInt(mine.split(":")[0] ?? "0", 10) || 0,
  };
}

function normaliseFamily(value: string): string {
  return value.replace(/["']/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function firstFamilyName(stack: string): string {
  return stack.split(",")[0]?.replace(/["']/g, "").trim() ?? "";
}

/**
 * Ask the text on screen — not the document root — which face it resolves to.
 *
 * Reading `<html>`'s stack is not enough: it can name the choice while every
 * visible run is rewritten by a later `!important` rule (a font-forcing
 * extension, a cached sheet, a component that spells out its own stack), and
 * that reads as "it says 已生效 and the page never changed". Sampling the runs
 * that actually carry Han characters is the only check that cannot be fooled:
 * the app's own stylesheet resolves through the chosen variable, so any run
 * that does not name the family is a run the reader sees in the fallback.
 */
export function inspectPaintedStack(family: string): {
  samples: number;
  matching: number;
  fallback: string;
  scope: "page" | "dialog" | "none";
} {
  if (typeof document === "undefined" || !document.body) {
    return { samples: 0, matching: 0, fallback: "", scope: "none" };
  }
  const wanted = normaliseFamily(family);

  const scan = (includeSelf: boolean) => {
    let samples = 0;
    let matching = 0;
    let fallback = "";
    const nodes = Array.from(
      document.body.querySelectorAll<HTMLElement>(INSPECT_SELECTOR),
    );
    for (const node of nodes) {
      if (samples >= 40) break;
      // Previews opt out on purpose: they show a face that is not the page's.
      if (node.closest(`[${TYPEFACE_KEEP_ATTRIBUTE}]`)) continue;
      if (!includeSelf && node.closest(SELF_CONTAINERS)) continue;
      const own = Array.from(node.childNodes)
        .filter((child) => child.nodeType === 3)
        .map((child) => child.textContent ?? "")
        .join("");
      if (!HAN_RUN.test(own)) continue;
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;

      samples += 1;
      const stack = getComputedStyle(node).fontFamily;
      if (normaliseFamily(stack).includes(wanted)) {
        matching += 1;
      } else if (!fallback) {
        fallback = firstFamilyName(stack);
      }
    }
    return { samples, matching, fallback };
  };

  const page = scan(false);
  if (page.samples > 0) return { ...page, scope: "page" };
  // Nothing outside the sheet carries Han text (a bare page behind a modal):
  // the sheet's own text is then the only evidence available, so use it and
  // say so.
  const dialog = scan(true);
  return { ...dialog, scope: dialog.samples > 0 ? "dialog" : "none" };
}

/**
 * Answer the only question that matters when a reader says "nothing happened":
 * is the browser *painting* this face?
 *
 * Every other signal can be right while the page looks unchanged — the choice
 * is on <html>, the stylesheet loaded, the chunks are cached, and then a
 * font-forcing extension quietly rewrites every family to one face. So the
 * verdict is decided by the text, and `forced` is reported honestly when the
 * choice only survives because it was applied with `!important`.
 */
export async function diagnoseTypeface(
  option: PageTypefaceOption,
): Promise<TypefaceDiagnosis> {
  const empty = {
    declared: 0,
    loaded: 0,
    usedStack: "",
    samples: 0,
    matching: 0,
    fallback: "",
    painted: true,
    twin: "",
    reaches: true,
    alias: "",
    scope: "none" as const,
  };
  if (typeof document === "undefined") {
    return { verdict: "system", ...empty };
  }

  const usedStack = getComputedStyle(document.documentElement).fontFamily;
  if (!option.family) {
    return { verdict: "system", ...empty, usedStack };
  }

  const fonts = document.fonts;
  const declared = facesOf(fonts, option.family).length;
  // No `@font-face` at all: asking for the glyphs would only wait on a request
  // that was never made, which is how a blocked CDN turned into a row stuck on
  // the previous verdict.
  if (declared === 0) {
    return { ...empty, verdict: "missing", declared, loaded: 0, usedStack };
  }

  const faces = await withDeadline(
    fonts
      .load(`16px "${option.family}"`, READINESS_SAMPLE)
      .catch(() => [] as FontFace[]),
    6_000,
  );
  const loaded = faces?.length ?? 0;
  const painted = inspectPaintedStack(option.family);
  const probe = paintProbe(option.family);
  const reaches = stackReachesFamily(option.family);
  const alias = interceptingFamilies()[0] ?? "";

  let verdict: TypefaceVerdict;
  if (!faces) {
    verdict = "pending";
  } else if (loaded === 0) {
    verdict = "missing";
  } else if (!reaches) {
    // The face works on its own, the stack does not deliver it: some family
    // listed earlier is answering for these characters. This is the case that
    // used to be reported as "applied" — every declaration was correct, and
    // the reader was looking at a substitute face.
    verdict = "overridden";
  } else if (painted.samples > 0 && painted.matching === 0) {
    // Even the forced rule lost, which means something with higher priority is
    // rewriting the page — worth naming, because the reader can act on it.
    verdict = "overridden";
  } else if (!probe.painted) {
    // The cascade says the face, the pixels say the fallback: the file is
    // declared and "loaded", but this browser cannot use it for these glyphs.
    verdict = "notpainting";
  } else {
    verdict = "applied";
  }

  return {
    verdict,
    declared,
    loaded,
    usedStack,
    samples: painted.samples,
    matching: painted.matching,
    fallback: painted.fallback,
    painted: probe.painted,
    twin: probe.twin,
    reaches,
    alias,
    scope: painted.scope,
  };
}

export type TypefaceReadiness = "ready" | "failed" | "pending";

/** Resolve with the promise's value, or `undefined` once the deadline passes. */
async function withDeadline<T>(
  work: Promise<T>,
  timeoutMs: number,
): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), timeoutMs);
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Does the stylesheet declare any `@font-face` for this family? */
function declaresFamily(fonts: FontFaceSet, family: string): boolean {
  const wanted = family.replace(/["']/g, "").trim().toLowerCase();
  let found = false;
  fonts.forEach((face) => {
    if (face.family.replace(/["']/g, "").trim().toLowerCase() === wanted) {
      found = true;
    }
  });
  return found;
}

/** The declared faces of a family, so their status can be inspected. */
function facesOf(fonts: FontFaceSet, family: string): FontFace[] {
  const wanted = family.replace(/["']/g, "").trim().toLowerCase();
  const faces: FontFace[] = [];
  fonts.forEach((face) => {
    if (face.family.replace(/["']/g, "").trim().toLowerCase() === wanted) {
      faces.push(face);
    }
  });
  return faces;
}

function probeFor(family: string): string {
  return `16px "${family}"`;
}

/**
 * Is the face actually usable for reading?
 *
 * Three separate things can go wrong, and only the last one is visible:
 *
 * 1. the stylesheet never arrives (CDN blocked, offline) — no `@font-face` at
 *    all, so the family silently resolves to nothing;
 * 2. the stylesheet arrives but the woff2 does not — the family *is* declared,
 *    so the page looks configured while every glyph falls back;
 * 3. everything arrives — the page simply swaps faces.
 *
 * `FontFaceSet.check()` alone cannot answer this: for a family it has never
 * heard of it returns `true` (an unknown name is assumed to be installed). So
 * the honest test is to *ask for the glyphs*: `fonts.load()` resolves with the
 * faces it managed to load, and an empty list means nothing arrived.
 *
 * A download that is merely slow is reported as `pending`, never as `failed` —
 * a slow CDN is not a broken one, and a false alarm is worse than a note that
 * retires itself once the woff2 lands (see `watchTypefaceGlyphs`).
 */
export async function whenTypefaceReady(
  id: PageTypefaceId,
  timeoutMs = 6_000,
): Promise<TypefaceReadiness> {
  const option = findPageTypeface(id);
  if (!option.family) return "ready";

  const fonts = typeof document === "undefined" ? undefined : document.fonts;
  if (!fonts) return "ready";

  // A stylesheet is a small file: if it has not parsed after a few seconds it
  // is not coming, and the panel should say so rather than spin.
  const sheetReady = await withDeadline(
    ensurePageTypefaceStyles(option.id).then(() => true),
    Math.min(timeoutMs * 2, 8_000),
  );
  if (!sheetReady || !declaresFamily(fonts, option.family)) return "failed";

  const probe = probeFor(option.family);
  const faces = await withDeadline(
    fonts.load(probe, READINESS_SAMPLE).catch(() => []),
    timeoutMs,
  );
  if (faces === undefined) return "pending";
  if (faces.length > 0) return "ready";

  // `load()` came back empty: either every chunk failed, or the browser has no
  // face to try. Both mean the reader is looking at the fallback.
  return "failed";
}

/**
 * Follow a family whose download is still in flight, so a "正在下载…" note can
 * retire itself — or turn into a real error when the woff2 is refused.
 *
 * Polling, not `loadingdone`: Chrome does not fire that event for requests
 * started by `FontFaceSet.load()`, which is exactly how the glyphs were asked
 * for here — measured on this app, the faces reached "loaded" with the event
 * list still empty. `check()` is cheap and answers the real question.
 *
 * Returns an unsubscribe function; it is a no-op for the platform stack.
 */
export function watchTypefaceGlyphs(
  id: PageTypefaceId,
  onChange: (readiness: "ready" | "failed") => void,
  intervalMs = 1_000,
  maxTicks = 90,
): () => void {
  const option = findPageTypeface(id);
  const fonts = typeof document === "undefined" ? undefined : document.fonts;
  if (!option.family || !fonts) return () => {};
  const family = option.family;
  const probe = probeFor(family);

  let ticks = 0;
  const timer = setInterval(() => {
    ticks += 1;
    const faces = facesOf(fonts, family);
    // Nothing declared yet: the stylesheet may still be in flight, so there is
    // no verdict to give. `check()` must not be consulted here — it answers
    // `true` for a family it has never heard of, which would retire the note
    // while the page still paints the fallback.
    if (faces.length > 0) {
      // Any chunk that arrived means the face is in use from now on; a subset
      // still in flight is not worth a warning.
      if (
        faces.some((face) => face.status === "loaded") ||
        fonts.check(probe, READINESS_SAMPLE)
      ) {
        clearInterval(timer);
        onChange("ready");
        return;
      }
      if (faces.every((face) => face.status === "error")) {
        clearInterval(timer);
        onChange("failed");
        return;
      }
    }
    // Give up quietly rather than polling for the rest of the session; the note
    // stays up, which is the honest state for a request that never settles.
    if (ticks >= maxTicks) clearInterval(timer);
  }, intervalMs);

  return () => clearInterval(timer);
}
