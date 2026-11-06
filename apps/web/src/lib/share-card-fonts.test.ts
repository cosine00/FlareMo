import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CARD_FONT_OPTIONS,
  cardFontVars,
  ensureCardFont,
  findCardFont,
  readCardFont,
  rememberCardFont,
} from "./share-card-fonts";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("card font preference", () => {
  it("defaults to the card's own typography", () => {
    expect(readCardFont()).toBe("system");
    expect(cardFontVars("system")).toBeUndefined();
  });

  it("remembers the chosen face and ignores stale ids", () => {
    rememberCardFont("zhuque");
    expect(readCardFont()).toBe("zhuque");
    store.set("flaremo.share.cardFont", "not-a-font");
    expect(readCardFont()).toBe("system");
  });

  it("overrides every tier the document resolves through", () => {
    const vars = cardFontVars("zhuque");
    expect(vars).toBeDefined();
    expect(vars?.["--card-font-sans"]).toContain("Zhuque Fangsong");
    expect(vars?.["--card-font-serif"]).toContain("Zhuque Fangsong");
    // Monospace cards follow too, so the choice reads as one face across the
    // card rather than "everything except the ticket".
    expect(vars?.["--card-font-mono"]).toContain("Zhuque Fangsong");
    // Titles move too: a card set half in the chosen face reads as a bug.
    expect(vars?.["--card-font-heading"]).toContain("Zhuque Fangsong");
  });

  it("falls back to the first option for an unknown id", () => {
    expect(findCardFont("nope").id).toBe("system");
    expect(findCardFont(null).id).toBe("system");
  });

  it("offers a default plus bundled and system faces", () => {
    const ids = CARD_FONT_OPTIONS.map((option) => option.id);
    expect(ids[0]).toBe("system");
    expect(ids).toContain("zhuque");
    expect(ids).toContain("kai");
    // Bundled faces load a stylesheet; the system ones must not need one.
    expect(CARD_FONT_OPTIONS.filter((option) => option.load).length).toBe(1);
  });

  it("resolves without touching the document for the default face", async () => {
    const load = vi.fn();
    vi.stubGlobal("document", { fonts: { load } });
    await ensureCardFont("system");
    expect(load).not.toHaveBeenCalled();
  });
});
