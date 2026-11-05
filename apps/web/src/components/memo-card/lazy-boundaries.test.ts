// Contract tests over source text: the point of these is to keep heavyweight
// libraries out of the startup graph, which no runtime assertion can observe.
// Reading the files is the only way to fail fast when someone re-adds a static
// import that quietly pulls the editor (or the markdown pipeline) back in.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

describe("startup graph boundaries", () => {
  it("loads the card editor lazily", () => {
    const card = source("../memo-card.tsx");
    expect(card).toContain('from "@/components/memo-card/memo-card-editor-lazy"');
    expect(card).not.toMatch(
      /import\s*\{[^}]*\}\s*from\s*"@\/components\/memo-card\/memo-card-editor"/,
    );
  });

  it("loads the insight dialog lazily instead of on every card", () => {
    const menu = source("./memo-card-menu.tsx");
    expect(menu).not.toMatch(
      /import\s*\{[^}]*AiInsightDialog[^}]*\}\s*from\s*"@\/components\/ai-insight-dialog"/,
    );
    expect(menu).toMatch(/import\("@\/components\/ai-insight-dialog"\)/);
  });

  it("keeps @floating-ui in its own chunk", () => {
    // TipTap's floating menus depend on it, and Base UI needs it eagerly. When
    // it lived inside vendor-tiptap, every eager Base UI chunk imported the
    // editor chunk back into the startup graph.
    const viteConfig = source("../../../vite.config.ts");
    expect(viteConfig).toMatch(/name: "vendor-floating"[\s\S]{0,200}@floating-ui/);
  });
});
