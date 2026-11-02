import { describe, expect, it } from "vitest";
import { calendarYearsBetween } from "./calendar-years";

describe("calendarYearsBetween", () => {
  it("counts exact calendar anniversaries without averaging year length", () => {
    expect(calendarYearsBetween("2025-11-03", "2026-11-03")).toBe(1);
    expect(calendarYearsBetween("2024-11-03", "2026-11-03")).toBe(2);
    expect(calendarYearsBetween("2023-11-03", "2026-11-03")).toBe(3);
  });

  it("does not count the next year until the anniversary has passed", () => {
    expect(calendarYearsBetween("2025-11-04", "2026-11-03")).toBe(0);
    expect(calendarYearsBetween("2024-11-04", "2026-11-03")).toBe(1);
  });

  it("handles leap-day anniversaries by calendar date", () => {
    expect(calendarYearsBetween("2024-02-29", "2025-02-28")).toBe(0);
    expect(calendarYearsBetween("2024-02-29", "2025-03-01")).toBe(1);
  });
});
