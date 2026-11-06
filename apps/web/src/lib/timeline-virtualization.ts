/**
 * Below this many rendered cards the plain map is cheaper than virtualization:
 * the whole list is mounted anyway, and the extra wrappers would only add
 * measurement work. Above it, a few hundred cards is where the DOM — not the
 * network — becomes the bottleneck.
 */
export const VIRTUALIZE_THRESHOLD = 40;

/**
 * Whether a timeline should render through the virtualizer.
 *
 * `hasNextPage` counts because the decision has to be made *before* the reader
 * scrolls, not when the list happens to grow past the threshold. The plain
 * stack and the virtualized one are different DOM trees — a flex column versus
 * absolutely positioned rows sized from `estimateSize` — so swapping them
 * mid-scroll drops the reader at a height the browser then clamps, which reads
 * as the timeline jumping upwards the moment the next page lands. A list with
 * another page queued will cross the threshold anyway, so it starts
 * virtualized and never swaps.
 *
 * The answer is latched by the caller: once true, a shorter render (a narrow
 * tag, the final page) keeps the same tree.
 */
export function shouldVirtualize(count: number, hasNextPage: boolean): boolean {
  return hasNextPage || count > VIRTUALIZE_THRESHOLD;
}
