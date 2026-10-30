import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from "react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/i18n";

export type InlineImage = { alt?: string; src: string };

/** Hover-preview geometry: same measures the preview stylesheet uses. */
const PREVIEW_WIDTH = 280;
const PREVIEW_GAP = 10;

/**
 * The whole note's pictures, collapsed into one inline glyph — the treatment
 * the blog's microblog page ("哔哔") uses for its own entries.
 *
 * Dense layouts (the timeline rail) cannot afford one screen-height screenshot
 * per note, and they do not need to: the picture is still one hover away, and
 * one click opens the viewer. The badge counts the rest.
 */
export function MemoImageIcon({
  images,
  onOpen,
}: {
  images: InlineImage[];
  onOpen: (src: string, alt?: string) => void;
}) {
  const { t } = useI18n();
  // The preview only mounts while the glyph is hovered or focused, and it is
  // portaled to <body> and positioned against the viewport (fixed): cards
  // both clip their overflow and carry a transform — the transform would even
  // hijack a fixed popup's containing block — so nothing rendered inside the
  // card can escape it. Mounting lazily also keeps the browser from pulling
  // hundreds of screenshots for a list the reader never hovers.
  const [pos, setPos] = useState<{
    above: boolean;
    bottom: number;
    left: number;
    top: number;
  } | null>(null);
  const first = images[0];
  const open = useCallback(() => {
    if (first) onOpen(first.src, first.alt);
  }, [first, onOpen]);

  // The popup is pinned to the viewport, not the flow: any scroll or resize
  // would leave it floating over the wrong spot, so it just closes.
  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [pos]);

  if (!first) return null;

  const show = (el: HTMLButtonElement) => {
    const rect = el.getBoundingClientRect();
    const width = Math.min(PREVIEW_WIDTH, window.innerWidth * 0.58);
    const left = Math.min(
      Math.max(8, rect.left),
      Math.max(8, window.innerWidth - width - 8),
    );
    // Open above the icon when there is room for the shortest useful preview;
    // otherwise drop below it, so a note at the top of the screen still works.
    const above = rect.top >= 170;
    setPos({
      above,
      bottom: window.innerHeight - rect.top + PREVIEW_GAP,
      left,
      top: rect.bottom + PREVIEW_GAP,
    });
  };

  return (
    <button
      aria-label={t("imageViewer.openCount", { count: images.length })}
      className="memo-image-icon group/img relative inline-flex shrink-0 items-center gap-[0.15em] leading-none"
      type="button"
      onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
        // The card body is a click target of its own.
        event.preventDefault();
        event.stopPropagation();
        setPos(null);
        open();
      }}
      onFocus={(event) => show(event.currentTarget)}
      onBlur={() => setPos(null)}
      onKeyDown={(event: ReactKeyboardEvent<HTMLButtonElement>) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        setPos(null);
        open();
      }}
      onMouseEnter={(event) => show(event.currentTarget)}
      onMouseLeave={() => setPos(null)}
    >
      <svg
        aria-hidden="true"
        className="size-[1.15em]"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
        viewBox="0 0 24 24"
      >
        <rect height="16" rx="2" width="18" x="3" y="4" />
        <circle cx="8.5" cy="9" r="1.5" />
        <path d="m4 17 4.5-4.5 3.5 3 2.5-2.5 5.5 5" />
      </svg>
      {/* The count reads as plain text next to the glyph, the way the blog's
          microblog page does it — a badge on a 1em icon is unreadable at any
          realistic text size. */}
      <span className="memo-image-icon-count">{images.length}</span>
      {/* Hover preview: the first picture, at a glance, without leaving the
          row. Hidden on touch, where hover never happens and the click opens
          the viewer anyway. */}
      {pos &&
        createPortal(
          <span
            className="memo-image-icon-preview"
            style={{
              left: pos.left,
              ...(pos.above ? { bottom: pos.bottom } : { top: pos.top }),
            }}
          >
            <img alt={first.alt ?? ""} src={first.src} />
          </span>,
          document.body,
        )}
    </button>
  );
}
