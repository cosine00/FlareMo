import { describe, expect, it } from "vitest";
import { validatePluginManifest } from "./validate";

/** A minimal valid manifest; each test replaces one field. */
const base = {
  specVersion: 1,
  id: "test-pack",
  version: "1.0.0",
  name: { "en-US": "Test pack" },
  author: { name: "Tester" },
  contributes: {
    shareCardTemplates: [
      {
        id: "test-card",
        kind: "document",
        name: { "en-US": "Card" },
        document: "cards/card.json",
      },
    ],
  },
};

function manifestWithSize(size: unknown) {
  return {
    ...base,
    contributes: {
      shareCardTemplates: [{ ...base.contributes.shareCardTemplates[0], size }],
    },
  };
}

describe("share card size", () => {
  it("keeps a plain width/height frame", () => {
    const { manifest, problems } = validatePluginManifest(
      manifestWithSize({ width: 340, height: 420 }),
    );
    expect(problems).toStrictEqual([]);
    expect(manifest?.contributes.shareCardTemplates?.[0]?.size).toStrictEqual({
      width: 340,
      height: 420,
    });
  });

  it("carries autoHeight through so the renderer can measure the card", () => {
    const { manifest, problems } = validatePluginManifest(
      manifestWithSize({ width: 340, height: 290, autoHeight: true }),
    );
    expect(problems).toStrictEqual([]);
    expect(manifest?.contributes.shareCardTemplates?.[0]?.size).toStrictEqual({
      width: 340,
      height: 290,
      autoHeight: true,
    });
  });

  it("drops a false autoHeight rather than storing noise", () => {
    const { manifest } = validatePluginManifest(
      manifestWithSize({ width: 340, height: 290, autoHeight: false }),
    );
    expect(manifest?.contributes.shareCardTemplates?.[0]?.size).toStrictEqual({
      width: 340,
      height: 290,
    });
  });

  it("rejects a non-boolean autoHeight", () => {
    const { manifest, problems } = validatePluginManifest(
      manifestWithSize({ width: 340, height: 290, autoHeight: "yes" }),
    );
    expect(manifest).toBeNull();
    expect(problems.join(" ")).toContain("size must be within");
  });
});
