// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyForcedPageTypeface,
  applyInlinePageTypeface,
  applyPageTypeface,
  clearForcedPageTypeface,
  clearInlinePageTypeface,
  diagnoseTypeface,
  ensurePageTypefaceStyles,
  findPageTypeface,
  inspectPaintedStack,
  interceptingFamilies,
  isInlinePageTypeface,
  isTypefaceWired,
  PAGE_TYPEFACES,
  pageTypefaceFullStack,
  pageTypefaceStack,
  paintProbe,
  readPageTypeface,
  rememberInlinePageTypeface,
  rememberPageTypeface,
  stackReachesFamily,
  TYPEFACE_KEEP_ATTRIBUTE,
  watchTypefaceGlyphs,
  whenTypefaceReady,
} from "./page-typeface";

beforeEach(() => {
  localStorage.clear();
  const root = document.documentElement;
  root.style.cssText = "";
  delete root.dataset.typeface;
  document.head.querySelectorAll("link[data-page-typeface]").forEach((link) => {
    link.remove();
  });
});

describe("page typeface preference", () => {
  it("starts on the platform faces and ignores stale ids", () => {
    expect(readPageTypeface()).toBe("system");
    localStorage.setItem("flaremo.page.typeface", "comic-sans");
    expect(readPageTypeface()).toBe("system");
  });

  it("remembers a face across reads", () => {
    rememberPageTypeface("jinghua");
    expect(readPageTypeface()).toBe("jinghua");
  });

  it("offers a system option plus every bundled face with a unique id", () => {
    const ids = PAGE_TYPEFACES.map((option) => option.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe("system");
    expect(PAGE_TYPEFACES[0].family).toBeUndefined();
    expect(PAGE_TYPEFACES.filter((option) => option.family).length).toBe(5);
    // Zhuque ships with the app; the rest are remote stylesheets.
    expect(PAGE_TYPEFACES.filter((option) => option.load).length).toBe(1);
  });

  it("writes both CJK tiers with a platform fallback", () => {
    applyPageTypeface("wenkai");
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--font-cjk-chosen")).toContain(
      '"LXGW WenKai Screen", var(--font-cjk-platform)',
    );
    expect(root.style.getPropertyValue("--font-cjk-serif-chosen")).toContain(
      '"LXGW WenKai Screen", var(--font-cjk-serif-platform)',
    );
    expect(root.dataset.typeface).toBe("wenkai");
  });

  it("hands the page back to the platform lists when cleared", () => {
    applyPageTypeface("zhuque");
    applyPageTypeface("system");
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--font-cjk-chosen")).toBe("");
    expect(root.style.getPropertyValue("--font-cjk-serif-chosen")).toBe("");
    expect(root.dataset.typeface).toBeUndefined();
  });

  it("inserts one stylesheet per remote face and none for system", () => {
    ensurePageTypefaceStyles("system");
    expect(
      document.head.querySelectorAll("link[data-page-typeface]").length,
    ).toBe(0);

    ensurePageTypefaceStyles("zhisong");
    ensurePageTypefaceStyles("zhisong");
    const links = document.head.querySelectorAll("link[data-page-typeface]");
    expect(links.length).toBe(1);
    expect((links[0] as HTMLLinkElement).href).toContain(
      "fontsapi.zeoseven.com/22/main/result.css",
    );
  });

  it("falls back to the first option for an unknown id", () => {
    expect(findPageTypeface("nope").id).toBe("system");
    expect(pageTypefaceStack(findPageTypeface("nope"))).toBeUndefined();
  });
});

describe("page typeface readiness", () => {
  /**
   * A FontFaceSet stand-in: `load` resolves with the faces the browser managed
   * to download, which is the only trustworthy signal — `check()` answers
   * `true` for families it has never heard of.
   */
  const stubFontSet = (families: string[], loaded: string[] = families) => {
    const load = vi
      .fn()
      .mockResolvedValue(loaded.map((family) => ({ family })));
    const set = {
      forEach: (fn: (face: { family: string }) => void) => {
        for (const family of families) fn({ family });
      },
      load,
      check: vi.fn().mockReturnValue(true),
    };
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: set,
    });
    return { load };
  };

  /** jsdom never fires `load` on a <link>, so stand in for a sheet that has
   *  already been applied — the state `whenTypefaceReady` starts from. */
  const pretendSheetApplied = (id: string) => {
    const link = document.createElement("link");
    link.setAttribute("data-page-typeface", id);
    document.head.appendChild(link);
  };

  afterEach(() => {
    Reflect.deleteProperty(document, "fonts");
    Array.from(document.head.querySelectorAll("[data-page-typeface]")).forEach(
      (link) => {
        link.remove();
      },
    );
  });

  it("reports the system option as ready without touching the font set", async () => {
    const { load } = stubFontSet([]);
    await expect(whenTypefaceReady("system")).resolves.toBe("ready");
    expect(load).not.toHaveBeenCalled();
  });

  it("reports a face whose glyphs arrived as ready", async () => {
    pretendSheetApplied("zhisong");
    const { load } = stubFontSet(["LXGW Neo ZhiSong"]);
    await expect(whenTypefaceReady("zhisong", 20)).resolves.toBe("ready");
    expect(load).toHaveBeenCalledWith(
      '16px "LXGW Neo ZhiSong"',
      expect.any(String),
    );
  });

  // The case behind "picked a font, nothing happened": the stylesheet never
  // arrived, so no @font-face exists and the page silently keeps the platform
  // faces. FontFaceSet.check() would have claimed this family was fine.
  it("reports a family with no @font-face as failed", async () => {
    pretendSheetApplied("xihei");
    stubFontSet([]);
    await expect(whenTypefaceReady("xihei", 20)).resolves.toBe("failed");
  });

  // The other half of the same complaint: the stylesheet is fine but the woff2
  // is blocked, so every glyph falls back while the panel looks configured.
  it("reports a declared family whose glyphs never downloaded as failed", async () => {
    pretendSheetApplied("wenkai");
    stubFontSet(["LXGW WenKai Screen"], []);
    await expect(whenTypefaceReady("wenkai", 20)).resolves.toBe("failed");
  });

  // A slow CDN is not a broken one. The panel keeps the "downloading" note and
  // listens for the swap instead of claiming the font failed.
  it("reports a still-downloading family as pending, not failed", async () => {
    pretendSheetApplied("zhisong");
    const set = {
      forEach: (fn: (face: { family: string }) => void) =>
        fn({ family: "LXGW Neo ZhiSong" }),
      load: vi.fn().mockReturnValue(new Promise(() => {})),
      check: vi.fn().mockReturnValue(false),
    };
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: set,
    });
    await expect(whenTypefaceReady("zhisong", 20)).resolves.toBe("pending");
  });

  it("gives up when the stylesheet never arrives", async () => {
    const { load } = stubFontSet(["KingHwaOldSong"]);
    await expect(whenTypefaceReady("jinghua", 20)).resolves.toBe("failed");
    expect(load).not.toHaveBeenCalled();
  });

  it("ignores quotes and case when matching the declared family", async () => {
    pretendSheetApplied("zhuque");
    stubFontSet(["'Zhuque Fangsong'"]);
    await expect(whenTypefaceReady("zhuque", 20)).resolves.toBe("ready");
  });
});

describe("page typeface wiring", () => {
  it("trusts the platform option and environments without computed styles", () => {
    expect(isTypefaceWired(findPageTypeface("system"))).toBe(true);
    expect(isTypefaceWired(findPageTypeface("wenkai"))).toBe(true);
  });

  it("flags a stylesheet that ignored the chosen variable", () => {
    const original = window.getComputedStyle;
    window.getComputedStyle = ((node: Element) => {
      const style = original(node);
      // A stylesheet from before the indirection: the resolved list is the
      // platform stack, no matter what the inline property says.
      return new Proxy(style, {
        get(target, prop) {
          if (prop === "getPropertyValue") {
            return (name: string) =>
              name === "--font-cjk" ? '"PingFang SC", "Microsoft YaHei"' : "";
          }
          const value = Reflect.get(target, prop);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    }) as typeof window.getComputedStyle;

    try {
      expect(isTypefaceWired(findPageTypeface("wenkai"))).toBe(false);
    } finally {
      window.getComputedStyle = original;
    }
  });
});

describe("page typeface glyph watcher", () => {
  type Face = { family: string; status: string };

  const stubFontSet = (faces: Face[], isReady: () => boolean) => {
    const check = vi.fn(() => isReady());
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: {
        forEach: (fn: (face: Face) => void) => faces.forEach(fn),
        load: vi.fn(),
        check,
      },
    });
    return { check };
  };

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(document, "fonts");
  });

  it("reports readiness once the glyphs land, then stops polling", async () => {
    vi.useFakeTimers();
    let ready = false;
    const { check } = stubFontSet(
      ["LXGW Neo ZhiSong"].map((family) => ({ family, status: "unloaded" })),
      () => ready,
    );
    const onChange = vi.fn();
    watchTypefaceGlyphs("zhisong", onChange, 1_000, 10);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(onChange).not.toHaveBeenCalled();

    ready = true;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(onChange).toHaveBeenCalledWith("ready");

    const calls = check.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(check.mock.calls.length).toBe(calls);
  });

  it("reports a refused woff2 as failed without waiting it out", async () => {
    vi.useFakeTimers();
    stubFontSet([{ family: "KingHwaOldSong", status: "error" }], () => false);
    const onChange = vi.fn();
    watchTypefaceGlyphs("jinghua", onChange, 1_000, 10);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(onChange).toHaveBeenCalledWith("failed");
  });

  // FontFaceSet.check() answers `true` for a family it has never seen, so a
  // watcher that trusted it would retire the note while the page still paints
  // the fallback — the exact silence this whole path exists to remove.
  it("ignores check() while the family is not declared at all", async () => {
    vi.useFakeTimers();
    stubFontSet([], () => true);
    const onChange = vi.fn();
    watchTypefaceGlyphs("zhisong", onChange, 1_000, 3);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does nothing for the platform stack", async () => {
    vi.useFakeTimers();
    const { check } = stubFontSet([], () => true);
    const onChange = vi.fn();
    watchTypefaceGlyphs("system", onChange, 1_000, 10);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(check).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("page typeface diagnosis", () => {
  /** Only the parts of FontFaceSet the diagnosis reads. */
  const stubFonts = (families: string[], loaded: string[] = families) => {
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: {
        forEach: (fn: (face: { family: string }) => void) => {
          for (const family of families) fn({ family });
        },
        load: vi.fn().mockResolvedValue(loaded.map((family) => ({ family }))),
      },
    });
  };

  /** jsdom has no layout, so a "visible run of text" has to be declared: the
   *  element needs a size and a resolved stack for the sampler to see it. */
  const paintRun = (stack: string, text = "这里是正文里的中文样例。") => {
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    paragraph.getBoundingClientRect = () =>
      ({ width: 240, height: 20 }) as DOMRect;
    document.body.append(paragraph);
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      () =>
        ({
          fontFamily: stack,
          getPropertyValue: () => "",
        }) as unknown as CSSStyleDeclaration,
    );
    document.documentElement.style.fontFamily = stack;
    return paragraph;
  };

  afterEach(() => {
    Reflect.deleteProperty(document, "fonts");
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("reports the platform stack as system", async () => {
    stubFonts([]);
    paintRun('"PingFang SC", sans-serif');
    const result = await diagnoseTypeface(findPageTypeface("system"));
    expect(result.verdict).toBe("system");
  });

  it("reports a face the page is painting as applied", async () => {
    stubFonts(["Zhuque Fangsong"]);
    paintRun('"Geist Variable", "Zhuque Fangsong", sans-serif');
    const result = await diagnoseTypeface(findPageTypeface("zhuque"));
    expect(result.verdict).toBe("applied");
    expect(result.loaded).toBeGreaterThan(0);
    expect(result.samples).toBe(1);
    expect(result.matching).toBe(1);
  });

  // A font-forcing extension keeps the variable, the stylesheet and the cached
  // chunks — and rewrites every family. Only the text on screen shows it.
  it("reports a face the text on screen resolves to something else as overridden", async () => {
    stubFonts(["Zhuque Fangsong"]);
    paintRun('"Microsoft YaHei", sans-serif');
    const result = await diagnoseTypeface(findPageTypeface("zhuque"));
    expect(result.verdict).toBe("overridden");
    expect(result.fallback).toBe("Microsoft YaHei");
  });

  it("reports a family with no @font-face as missing", async () => {
    stubFonts([]);
    paintRun('"LXGW Neo XiHei", sans-serif');
    const result = await diagnoseTypeface(findPageTypeface("xihei"));
    expect(result.verdict).toBe("missing");
  });

  it("reports a declared family whose chunks never arrived as missing", async () => {
    stubFonts(["LXGW WenKai Screen"], []);
    paintRun('"LXGW WenKai Screen", sans-serif');
    const result = await diagnoseTypeface(findPageTypeface("wenkai"));
    expect(result.verdict).toBe("missing");
  });

  it("matches the family regardless of quotes or case", async () => {
    stubFonts(["KingHwaOldSong"]);
    paintRun("'kinghwaoldsong', serif");
    const result = await diagnoseTypeface(findPageTypeface("jinghua"));
    expect(result.verdict).toBe("applied");
  });
});

describe("painted stack sampling", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  const addRun = (text: string, stack: string, tag = "p") => {
    const node = document.createElement(tag);
    node.textContent = text;
    node.getBoundingClientRect = () => ({ width: 120, height: 18 }) as DOMRect;
    node.dataset.stack = stack;
    document.body.append(node);
    return node;
  };

  it("counts only runs that carry Han text and name the family", () => {
    addRun("中文正文", '"LXGW WenKai Screen", sans-serif');
    addRun("only latin text here", '"PingFang SC", sans-serif');
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      (element) =>
        ({
          fontFamily: (element as HTMLElement).dataset.stack ?? "",
        }) as CSSStyleDeclaration,
    );

    const painted = inspectPaintedStack("LXGW WenKai Screen");
    expect(painted.samples).toBe(1);
    expect(painted.matching).toBe(1);
  });

  it("reports the family the page falls back to", () => {
    addRun("中文正文", '"Microsoft YaHei", sans-serif');
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      (element) =>
        ({
          fontFamily: (element as HTMLElement).dataset.stack ?? "",
        }) as CSSStyleDeclaration,
    );

    const painted = inspectPaintedStack("LXGW WenKai Screen");
    expect(painted.samples).toBe(1);
    expect(painted.matching).toBe(0);
    expect(painted.fallback).toBe("Microsoft YaHei");
  });

  it("ignores runs inside a subtree that keeps its own face", () => {
    const preview = document.createElement("div");
    preview.setAttribute(TYPEFACE_KEEP_ATTRIBUTE, "");
    const label = document.createElement("span");
    label.textContent = "霞鹜文楷屏幕阅读版";
    label.getBoundingClientRect = () => ({ width: 90, height: 18 }) as DOMRect;
    label.dataset.stack = '"Zhuque Fangsong", sans-serif';
    preview.append(label);
    document.body.append(preview);
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      (element) =>
        ({
          fontFamily: (element as HTMLElement).dataset.stack ?? "",
        }) as CSSStyleDeclaration,
    );

    expect(inspectPaintedStack("LXGW WenKai Screen").samples).toBe(0);
  });
});

describe("forced page typeface", () => {
  const forceStyle = () =>
    document.getElementById("flaremo-page-typeface-force");

  afterEach(() => {
    clearForcedPageTypeface();
    localStorage.clear();
    document.documentElement.style.cssText = "";
  });

  it("writes one !important rule that names the family and exempts keepers", () => {
    applyForcedPageTypeface(findPageTypeface("wenkai"));
    applyForcedPageTypeface(findPageTypeface("wenkai"));
    const styles = document.querySelectorAll("#flaremo-page-typeface-force");
    expect(styles.length).toBe(1);
    const css = styles[0]?.textContent ?? "";
    expect(css).toContain('"LXGW WenKai Screen"');
    expect(css).toContain("!important");
    expect(css).toContain(`:not([${TYPEFACE_KEEP_ATTRIBUTE}])`);
    // Code keeps its monospace tier: the page face is prose, not a redesign.
    expect(css).toContain(":not(code)");
    expect(css).toContain(":not(.font-mono)");
    // The Latin faces keep their lead, so the page does not turn into a
    // hand-written hand for digits and English.
    expect(css.indexOf('"Geist Variable"')).toBeLessThan(
      css.indexOf('"LXGW WenKai Screen"'),
    );
  });

  it("does nothing for the platform stack", () => {
    applyForcedPageTypeface(findPageTypeface("system"));
    expect(forceStyle()).toBeNull();
  });

  it("is written the moment a face is chosen, and dropped with it", () => {
    applyPageTypeface("wenkai");
    expect(forceStyle()?.textContent).toContain('"LXGW WenKai Screen"');

    // Switching faces rewrites the same rule instead of stacking a second one.
    applyPageTypeface("zhuque");
    expect(
      document.querySelectorAll("#flaremo-page-typeface-force").length,
    ).toBe(1);
    expect(forceStyle()?.textContent).toContain('"Zhuque Fangsong"');

    applyPageTypeface("system");
    expect(forceStyle()).toBeNull();
  });
});

describe("painted pixels", () => {
  /** jsdom has no canvas. The probe only reads one alpha byte per draw, so a
   *  fake context that maps a font shorthand to one value is enough to model
   *  "this family draws its own glyphs" versus "it silently fell back". */
  const stubCanvas = (alphaFor: (font: string) => number) => {
    let font = "";
    const context = {
      get font() {
        return font;
      },
      set font(value: string) {
        font = value;
      },
      textBaseline: "top",
      fillStyle: "#000",
      clearRect() {},
      fillText() {},
      getImageData: (_x: number, _y: number, width: number, height: number) => {
        const data = new Uint8ClampedArray(width * height * 4);
        data[3] = alphaFor(font);
        return { data };
      },
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
  };

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("says a face paints when the canvas draws what the fallback does not", () => {
    stubCanvas((font) => (font.includes("Zhuque") ? 210 : 120));
    const probe = paintProbe("Zhuque Fangsong");
    expect(probe.painted).toBe(true);
    expect(probe.twin).toBe("");
    expect(probe.ink).toBeGreaterThan(0);
  });

  // The case behind "it says 已生效 and nothing changed": the declaration is
  // right, the file is cached, and the browser still draws the fallback.
  it("names the system face a family copies instead of painting", () => {
    stubCanvas(() => 120);
    const probe = paintProbe("Zhuque Fangsong");
    expect(probe.painted).toBe(false);
    expect(probe.twin).toBe("serif");
  });
});

describe("a stack that answers with another family", () => {
  /** jsdom has no canvas. Model "the stack paints one thing, the family alone
   *  paints another" by keying the fake pixels on whether the stack is a list:
   *  a single-family stack is the face itself, a list is whatever the page
   *  really resolves to. */
  const stubCanvasByStack = (valueFor: (stack: string) => number) => {
    let font = "";
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      get font() {
        return font;
      },
      set font(value: string) {
        font = value;
      },
      textBaseline: "top",
      fillStyle: "#000",
      clearRect() {},
      fillText() {},
      getImageData: (_x: number, _y: number, w: number, h: number) => {
        const data = new Uint8ClampedArray(w * h * 4);
        data[3] = valueFor(font.replace(/^64px /, ""));
        return { data };
      },
    } as unknown as CanvasRenderingContext2D);
  };

  /** `document.fonts` with the pieces both the diagnosis and the alias scan
   *  read: every declared face, plus a `load()` that hands the family back. */
  const stubFaces = (
    faces: Array<{ family: string; unicodeRange?: string }>,
  ) => {
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: {
        forEach: (
          fn: (face: { family: string; unicodeRange: string }) => void,
        ) => {
          for (const face of faces) {
            fn({ family: face.family, unicodeRange: face.unicodeRange ?? "" });
          }
        },
        load: vi.fn().mockResolvedValue([{ family: "Zhuque Fangsong" }]),
      },
    });
  };

  afterEach(() => {
    Reflect.deleteProperty(document, "fonts");
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  // The state that produced "已生效 · painted true" while the page was painted
  // in Microsoft YaHei: the face works on its own, the stack never reaches it.
  it("says the stack does not reach a face it never consults", () => {
    stubCanvasByStack((stack) => (stack.includes(",") ? 90 : 200));
    expect(stackReachesFamily("Zhuque Fangsong")).toBe(false);
  });

  it("says the stack reaches a face that paints both ways", () => {
    stubCanvasByStack(() => 200);
    expect(stackReachesFamily("Zhuque Fangsong")).toBe(true);
  });

  it("accuses nothing when the canvas cannot measure", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    expect(stackReachesFamily("Zhuque Fangsong")).toBe(true);
  });

  // Regression guard for the real bug: the chosen face must come before every
  // legacy Latin name, because a font-replacing extension redefines those with
  // a CJK `unicode-range` and they answer for the Han characters first.
  it("lists the chosen face before the families that get replaced", () => {
    const stack = pageTypefaceFullStack("Zhuque Fangsong");
    expect(stack.indexOf('"Zhuque Fangsong"')).toBeLessThan(
      stack.indexOf('"Segoe UI"'),
    );
    // Latin still leads, so the page does not turn handwritten.
    expect(stack.startsWith('"Geist Variable"')).toBe(true);
  });

  it("names a legacy family that claimed the Han block", () => {
    stubFaces([
      { family: "Segoe UI", unicodeRange: "U+2E80-FFFF" },
      { family: "Georgia", unicodeRange: "U+2E80-FFFF" },
    ]);
    expect(interceptingFamilies()).toEqual(["Segoe UI", "Georgia"]);
  });

  it("ignores real webfonts and Latin-only substitutions", () => {
    stubFaces([
      { family: "LXGW WenKai Screen", unicodeRange: "U+2E80-FFFF" },
      { family: "Microsoft YaHei" },
      { family: "Calibri", unicodeRange: "U+0-FF" },
    ]);
    expect(interceptingFamilies()).toEqual([]);
  });

  it("reports the interception instead of 已生效", async () => {
    stubFaces([
      { family: "Zhuque Fangsong", unicodeRange: "U+4E00-9FFF" },
      { family: "Segoe UI", unicodeRange: "U+2E80-FFFF" },
    ]);
    const run = document.createElement("p");
    run.textContent = "正文里的中文";
    run.dataset.stack =
      '"Geist Variable", "Zhuque Fangsong", "Segoe UI", sans-serif';
    run.getBoundingClientRect = () => ({ width: 240, height: 20 }) as DOMRect;
    document.body.append(run);
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      (element) =>
        ({
          fontFamily: (element as HTMLElement).dataset?.stack ?? "",
          getPropertyValue: () => "",
        }) as unknown as CSSStyleDeclaration,
    );
    stubCanvasByStack((stack) => (stack.includes(",") ? 90 : 200));

    const result = await diagnoseTypeface(findPageTypeface("zhuque"));
    expect(result.reaches).toBe(false);
    expect(result.alias).toBe("Segoe UI");
    expect(result.verdict).toBe("overridden");
  });
});

describe("last-resort per-element override", () => {
  afterEach(() => {
    clearInlinePageTypeface();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("writes an inline !important and keeps the value it replaced", () => {
    const paragraph = document.createElement("p");
    paragraph.style.setProperty("font-family", '"Inter"');
    const code = document.createElement("pre");
    const preview = document.createElement("span");
    preview.setAttribute(TYPEFACE_KEEP_ATTRIBUTE, "");
    document.body.append(paragraph, code, preview);

    const count = applyInlinePageTypeface(findPageTypeface("wenkai"));
    expect(count).toBeGreaterThan(0);
    expect(paragraph.style.getPropertyPriority("font-family")).toBe(
      "important",
    );
    expect(paragraph.style.getPropertyValue("font-family")).toContain(
      "LXGW WenKai Screen",
    );
    // Code keeps its own tier, and a subtree that shows a face on purpose is
    // not part of "the page".
    expect(code.style.getPropertyValue("font-family")).toBe("");
    expect(preview.style.getPropertyValue("font-family")).toBe("");

    clearInlinePageTypeface();
    expect(paragraph.style.getPropertyValue("font-family")).toBe('"Inter"');
  });

  it("only remembers the escalation for the face that needed it", () => {
    rememberInlinePageTypeface("zhuque");
    expect(isInlinePageTypeface("zhuque")).toBe(true);
    expect(isInlinePageTypeface("wenkai")).toBe(false);

    applyPageTypeface("wenkai");
    expect(document.body.querySelector("p")).toBeNull();
    rememberInlinePageTypeface(null);
    expect(isInlinePageTypeface("zhuque")).toBe(false);
  });
});

describe("diagnosis when the cascade and the pixels disagree", () => {
  const stubFonts = (families: string[]) => {
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: {
        forEach: (fn: (face: { family: string }) => void) => {
          for (const family of families) fn({ family });
        },
        load: vi.fn().mockResolvedValue(families.map((family) => ({ family }))),
      },
    });
  };

  const addRun = (
    text: string,
    stack: string,
    into: HTMLElement = document.body,
  ) => {
    const node = document.createElement("p");
    node.textContent = text;
    node.dataset.stack = stack;
    node.getBoundingClientRect = () => ({ width: 240, height: 20 }) as DOMRect;
    into.append(node);
    return node;
  };

  const stubCanvas = (
    alphaFor: (font: string) => number = (font) =>
      font.includes("Zhuque") ? 200 : 120,
  ) => {
    let font = "";
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      get font() {
        return font;
      },
      set font(value: string) {
        font = value;
      },
      textBaseline: "top",
      fillStyle: "#000",
      clearRect() {},
      fillText() {},
      getImageData: (_x: number, _y: number, w: number, h: number) => {
        const data = new Uint8ClampedArray(w * h * 4);
        data[3] = alphaFor(font);
        return { data };
      },
    } as unknown as CanvasRenderingContext2D);
  };

  /** Everything draws the fallback's pixels, so the family never paints. */
  const stubFallbackCanvas = () => stubCanvas(() => 120);

  afterEach(() => {
    Reflect.deleteProperty(document, "fonts");
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("reports a face the browser refuses to draw as not painting", async () => {
    stubFonts(["Zhuque Fangsong"]);
    addRun("正文里的中文", '"Geist Variable", "Zhuque Fangsong", sans-serif');
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      (element) =>
        ({
          fontFamily: (element as HTMLElement).dataset.stack ?? "",
        }) as CSSStyleDeclaration,
    );
    stubFallbackCanvas(); // every stack draws the same bytes → it fell back

    const result = await diagnoseTypeface(findPageTypeface("zhuque"));
    expect(result.verdict).toBe("notpainting");
    expect(result.painted).toBe(false);
    expect(result.twin).toBe("serif");
    expect(result.matching).toBe(1);
  });

  it("samples the page instead of the sheet that covers it", async () => {
    stubFonts(["Zhuque Fangsong"]);
    // The dialog covers the page and shows the fallback; the page behind it is
    // already in the chosen face. Reading the dialog would have said "override".
    const sheet = document.createElement("div");
    sheet.dataset.slot = "dialog-content";
    document.body.append(sheet);
    addRun("设置里的中文", '"Microsoft YaHei", sans-serif', sheet);
    addRun("主页里的中文", '"Zhuque Fangsong", sans-serif');
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      (element) =>
        ({
          fontFamily: (element as HTMLElement).dataset.stack ?? "",
        }) as CSSStyleDeclaration,
    );
    stubCanvas();

    const result = await diagnoseTypeface(findPageTypeface("zhuque"));
    expect(result.scope).toBe("page");
    expect(result.samples).toBe(1);
    expect(result.matching).toBe(1);
    expect(result.verdict).toBe("applied");
  });
});
