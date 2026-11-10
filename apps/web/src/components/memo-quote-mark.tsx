import { useI18n } from "@/i18n";

/**
 * How many `^` beaks a mark carries at most. One beak per reference, so a note
 * that quotes three things shows `^`, `^^` and `^^^` in the same order as the
 * cards below it — no digits to decode.
 */
const MAX_PEAKS = 3;

/**
 * Beak geometry, in viewBox units. One beak spans 9.2 units, and the box is
 * 12 wide so a single beak keeps the 1.4 units of breathing room the hand-drawn
 * shape wants on both ends. Kept in step with hug00's `bb-quote.js`: the two
 * surfaces are meant to look like the same mark.
 */
const PEAK_WIDTH = 9.2;
const VIEW_BOX_BASE = 12;
const VIEW_BOX_HEIGHT = 8;

function round1(value: number) {
  return String(Math.round(value * 10) / 10);
}

/** A zigzag of `peaks` beaks, drawn as one continuous stroke. */
function peakPath(peaks: number) {
  const segments = ["M1.4 6.6"];
  for (let i = 0; i < peaks; i += 1) {
    const x = 1.4 + PEAK_WIDTH * i;
    segments.push(`L${round1(x + 4.6)} 2.1`, `L${round1(x + 9.2)} 6.6`);
  }
  return segments.join("");
}

/**
 * The mark that replaces `[ID.1234](/m/1234/)` in the prose once the quote
 * cards are on. Drawn rather than typed: a `^` glyph's size and baseline are
 * whatever the reader's font decides, and its stroke weight never matches the
 * body text, whereas this keeps a constant height across every text size.
 *
 * The box widens with the beak count while the height stays fixed, so three
 * beaks read as one mark rather than three marks in a row.
 */
export function MemoQuoteMark({ index }: { index: number }) {
  const { t } = useI18n();
  const peaks = Math.min(index + 1, MAX_PEAKS);
  const width = VIEW_BOX_BASE + PEAK_WIDTH * (peaks - 1);
  return (
    <svg
      aria-label={t("memo.quoteMarkAria", { index: index + 1 })}
      role="img"
      viewBox={`0 0 ${round1(width)} ${VIEW_BOX_HEIGHT}`}
    >
      <path
        d={peakPath(peaks)}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.7}
      />
    </svg>
  );
}
