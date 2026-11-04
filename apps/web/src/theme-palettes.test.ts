import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PALETTES } from "@/components/theme-provider";

/**
 * A palette is declared in three places that must agree: the `Palette` union
 * (which drives the settings grid), the token blocks in index.css, and the
 * inline bootstrap in index.html that applies the stored choice before first
 * paint. Adding one to the union and forgetting the CSS is silent — the card
 * simply does nothing when clicked — so the pieces are pinned together here.
 */
const css = readFileSync(
  new URL("./index.css", import.meta.url),
  "utf8",
).replace(/\r\n/g, "\n");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

describe("page palettes", () => {
  it("defines a light and a dark block for every palette but the default", () => {
    for (const id of PALETTES) {
      if (id === "paper") continue;
      expect(css).toContain(`[data-palette='${id}'] {`);
      expect(css).toContain(`.dark[data-palette='${id}'] {`);
    }
  });

  it("lets :root stay the only definition of the default palette", () => {
    // `paper` deliberately owns no block: it is what the base tokens already
    // describe, so a block would only be a second source of truth to drift.
    expect(css).not.toContain("[data-palette='paper'] {");
  });

  it("pre-paints the stored palette before the app mounts", () => {
    for (const id of PALETTES) {
      expect(html).toContain(`"${id}"`);
    }
  });
});
