/** Completed calendar anniversaries between two local YYYY-MM-DD keys. */
export function calendarYearsBetween(from: string, to: string): number {
  const fromYear = Number(from.slice(0, 4));
  const toYear = Number(to.slice(0, 4));
  const anniversaryPassed = to.slice(5) >= from.slice(5);
  return Math.max(0, toYear - fromYear - (anniversaryPassed ? 0 : 1));
}
