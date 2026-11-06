import { describe, expect, it } from "vitest";
import {
  shouldVirtualize,
  VIRTUALIZE_THRESHOLD,
} from "@/lib/timeline-virtualization";

describe("shouldVirtualize", () => {
  it("keeps a short list on the plain stack", () => {
    expect(shouldVirtualize(0, false)).toBe(false);
    expect(shouldVirtualize(VIRTUALIZE_THRESHOLD, false)).toBe(false);
  });

  it("switches once the list is longer than the threshold", () => {
    expect(shouldVirtualize(VIRTUALIZE_THRESHOLD + 1, false)).toBe(true);
  });

  it("virtualizes while another page is pending, before the threshold", () => {
    // The first page is exactly one page long, so the old rule kept it plain
    // and swapped the tree only when page two arrived — under the reader, at
    // the bottom of the scroll. The pending page is what makes that swap
    // inevitable, so it has to decide the shape up front.
    expect(shouldVirtualize(30, true)).toBe(true);
  });

  it("does not flip back when the list shrinks", () => {
    // A narrower filter or the final page brings a shorter render. The caller
    // latches the first `true`; this asserts the predicate itself is allowed
    // to fall back, which is exactly why the latch lives in the component.
    expect(shouldVirtualize(12, false)).toBe(false);
  });
});
