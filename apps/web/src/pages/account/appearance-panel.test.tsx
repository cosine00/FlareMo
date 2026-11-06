// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const setTypeface = vi.fn();

vi.mock("@/components/page-typeface-provider", () => ({
  usePageTypeface: () => ({ setTypeface, typeface: "wenkai" }),
}));

vi.mock("@/components/theme-provider", () => ({
  PALETTES: ["paper"],
  useTheme: () => ({
    palette: "paper",
    resolvedTheme: "light",
    setPalette: vi.fn(),
    setTheme: vi.fn(),
    theme: "light",
  }),
}));

vi.mock("@/components/locale-switcher", () => ({
  LocaleSwitcher: () => null,
}));

const { AppearancePanel } = await import("./appearance-panel");

const t = (key: string) => key;

beforeEach(() => {
  localStorage.clear();
  document.documentElement.style.cssText = "";
});

describe("appearance panel: text size and weight", () => {
  it("renders the section at the shipped values", () => {
    const html = renderToStaticMarkup(<AppearancePanel t={t} />);

    expect(html).toContain("theme.reading");
    expect(html).toContain("theme.textSize");
    expect(html).toContain("theme.textWeight");
    expect(html).toContain("100%");
    // Weight row prints the number and the name of the stop it is on.
    expect(html).toContain("400 · theme.textWeightRegular");
  });

  it("previews the note at the chosen numbers, not the sheet's", () => {
    localStorage.setItem("flaremo.page.text.scale", "1.2");
    localStorage.setItem("flaremo.page.text.weight", "600");

    const html = renderToStaticMarkup(<AppearancePanel t={t} />);

    expect(html).toContain("font-size:calc(15px * 1.2)");
    expect(html).toContain("line-height:calc(28px * 1.2)");
    expect(html).toContain("font-weight:600");
    expect(html).toContain("120%");
    expect(html).toContain("600 · theme.textWeightSemibold");
    // A non-default setting can be undone.
    expect(html).toContain("theme.textReset");
  });

  it("hides the reset button while the defaults are in force", () => {
    const html = renderToStaticMarkup(<AppearancePanel t={t} />);
    expect(html).not.toContain("theme.textReset");
  });

  it("gives both sliders a range the reader can actually reach", () => {
    const html = renderToStaticMarkup(<AppearancePanel t={t} />);
    expect(html).toContain('aria-label="theme.textSize"');
    expect(html).toContain('aria-label="theme.textWeight"');
    // Size: 85–130% in 5% steps, starting at 100.
    expect(html).toContain('max="130" min="85" step="5"');
    expect(html).toContain('aria-valuenow="100"');
    // Weight: five positional stops, starting on regular.
    expect(html).toContain('max="4" min="0" step="1"');
    expect(html).toContain('aria-valuenow="1"');
    expect(html.match(/type="range"/g)?.length).toBe(2);
  });
});
