// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyPageText,
  applyStoredPageText,
  formatTextScale,
  readPageTextScale,
  readPageTextWeight,
  rememberPageText,
  snapTextScale,
  TEXT_SCALE_DEFAULT,
  TEXT_SCALE_MAX,
  TEXT_SCALE_MIN,
  TEXT_WEIGHT_DEFAULT,
  TEXT_WEIGHTS,
  textWeightAt,
  textWeightIndex,
} from "./page-text";

const SCALE_KEY = "flaremo.page.text.scale";
const WEIGHT_KEY = "flaremo.page.text.weight";
const SCALE_PROPERTY = "--page-text-scale";
const WEIGHT_PROPERTY = "--page-text-weight";

function root() {
  return document.documentElement;
}

beforeEach(() => {
  localStorage.clear();
  root().style.cssText = "";
});

describe("stored text metrics", () => {
  it("starts at 100% / 400 with nothing stored", () => {
    expect(readPageTextScale()).toBe(TEXT_SCALE_DEFAULT);
    expect(readPageTextWeight()).toBe(TEXT_WEIGHT_DEFAULT);
  });

  it("reads what was written", () => {
    rememberPageText(1.15, 500);
    expect(readPageTextScale()).toBe(1.15);
    expect(readPageTextWeight()).toBe(500);
  });

  it("drops a default back to storage instead of pinning it", () => {
    rememberPageText(1.2, 700);
    rememberPageText(TEXT_SCALE_DEFAULT, TEXT_WEIGHT_DEFAULT);
    expect(localStorage.getItem(SCALE_KEY)).toBeNull();
    expect(localStorage.getItem(WEIGHT_KEY)).toBeNull();
  });

  it("ignores values it cannot use", () => {
    localStorage.setItem(SCALE_KEY, "big");
    localStorage.setItem(WEIGHT_KEY, "450");
    expect(readPageTextScale()).toBe(TEXT_SCALE_DEFAULT);
    // 450 is a real CSS weight but not one of the five stops, so it would
    // render as a slider sitting between two of them.
    expect(readPageTextWeight()).toBe(TEXT_WEIGHT_DEFAULT);
  });

  it("clamps a stored value from a wider range", () => {
    localStorage.setItem(SCALE_KEY, "2.4");
    expect(readPageTextScale()).toBe(TEXT_SCALE_MAX);
    localStorage.setItem(SCALE_KEY, "0.2");
    expect(readPageTextScale()).toBe(TEXT_SCALE_MIN);
  });
});

describe("scale arithmetic", () => {
  it("snaps to the slider grid without float noise", () => {
    expect(snapTextScale(1.117)).toBe(1.1);
    expect(snapTextScale(1.1500000001)).toBe(1.15);
    expect(snapTextScale(Number.NaN)).toBe(TEXT_SCALE_DEFAULT);
  });

  it("spells a scale the way the picker shows it", () => {
    expect(formatTextScale(1)).toBe("100%");
    expect(formatTextScale(1.05)).toBe("105%");
    expect(formatTextScale(0.9)).toBe("90%");
  });
});

describe("applying text metrics", () => {
  it("writes both properties onto the document root", () => {
    applyPageText(1.1, 600);
    expect(root().style.getPropertyValue(SCALE_PROPERTY)).toBe("1.1");
    expect(root().style.getPropertyValue(WEIGHT_PROPERTY)).toBe("600");
  });

  it("removes a default rather than writing it", () => {
    applyPageText(1.2, 700);
    applyPageText(TEXT_SCALE_DEFAULT, TEXT_WEIGHT_DEFAULT);
    expect(root().style.getPropertyValue(SCALE_PROPERTY)).toBe("");
    expect(root().style.getPropertyValue(WEIGHT_PROPERTY)).toBe("");
  });

  it("refuses a weight that is not a stop", () => {
    applyPageText(1, 450 as (typeof TEXT_WEIGHTS)[number]);
    expect(root().style.getPropertyValue(WEIGHT_PROPERTY)).toBe("");
  });

  it("applies what was stored", () => {
    rememberPageText(1.25, 300);
    applyStoredPageText();
    expect(root().style.getPropertyValue(SCALE_PROPERTY)).toBe("1.25");
    expect(root().style.getPropertyValue(WEIGHT_PROPERTY)).toBe("300");
  });
});

describe("weight stops", () => {
  it("round-trips every stop through its slider index", () => {
    for (const weight of TEXT_WEIGHTS) {
      expect(textWeightAt(textWeightIndex(weight))).toBe(weight);
    }
  });

  it("falls back to regular for an unknown index", () => {
    expect(textWeightAt(99)).toBe(TEXT_WEIGHT_DEFAULT);
  });
});
