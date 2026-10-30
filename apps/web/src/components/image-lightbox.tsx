import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/i18n";

export type LightboxImage = { alt?: string; src: string };

type ImageLightboxProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Single-image callers (an attachment tile) pass `src`; notes pass a set. */
  src?: string;
  alt?: string;
  images?: LightboxImage[];
  /** Which entry of `images` opens first. */
  index?: number;
  /** Alt text fallback for a picture that carries none of its own. */
  filename?: string;
};

/**
 * Full-screen picture viewer.
 *
 * The model is the blog's ViewImage: the page dims and blurs behind the photo,
 * the photo is fitted to the viewport at its own aspect ratio, and one small
 * translucent toolbar sits at the bottom — position counter, previous/next,
 * close. Clicking the empty space around the photo closes it; arrows and Esc
 * work from the keyboard. No zoom: the surrounding page already offers the
 * full-size file, and a fit-to-window view is what makes a 3000px screenshot
 * legible at a glance.
 */
export function ImageLightbox({
  open,
  onOpenChange,
  src,
  alt,
  images,
  index = 0,
  filename,
}: ImageLightboxProps) {
  const { t } = useI18n();
  const items = useMemo<LightboxImage[]>(() => {
    if (images && images.length > 0) return images;
    return src ? [{ src, alt }] : [];
  }, [images, src, alt]);

  const [current, setCurrent] = useState(index);

  // Reopening always starts on the picture that was clicked, even when the
  // dialog instance is reused for the next one.
  useEffect(() => {
    if (open) setCurrent(index);
  }, [open, index]);

  const count = items.length;
  const step = useCallback(
    (delta: number) => {
      if (count < 2) return;
      setCurrent((previous) => (previous + delta + count) % count);
    },
    [count],
  );

  useEffect(() => {
    if (!open || count < 2) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        step(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        step(1);
      }
    };
    // Capture phase: the dialog primitive handles its own arrow keys on the
    // popup and stops propagation there, so a bubble-phase listener never ran.
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [open, count, step]);

  const active = items[current] ?? items[0];

  // The neighbours are one keystroke away; warming them keeps the flip instant.
  useEffect(() => {
    if (!open || count < 2) return;
    for (const delta of [1, -1]) {
      const neighbour = items[(current + delta + count) % count];
      if (neighbour) {
        const image = new Image();
        image.src = neighbour.src;
      }
    }
  }, [open, current, count, items]);

  if (!active) return null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xl transition-opacity duration-300 data-closed:opacity-0" />
        <DialogPrimitive.Popup className="fixed inset-0 z-50 flex select-none flex-col p-4 outline-none">
          {/* The photo owns everything above the bar. Clicking anywhere in
              this area that is not the photo closes the viewer — the same
              "click outside to dismiss" the blog viewer offers. The dismissal
              is a real button filling the surface, with the photo layered on
              top: a div with a click handler would be an inaccessible control
              on a static element. */}
          <div className="relative min-h-0 flex-1">
            <button
              aria-label={t("common.close")}
              className="absolute inset-0 cursor-zoom-out outline-none"
              type="button"
              onClick={() => onOpenChange(false)}
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <img
                alt={active.alt ?? filename ?? ""}
                className="pointer-events-auto max-h-full max-w-full rounded-[3px] object-contain shadow-2xl motion-safe:animate-fade"
                decoding="async"
                key={active.src}
                src={active.src}
              />
            </div>
          </div>

          <div className="relative mx-auto mt-3 flex w-full max-w-[600px] items-center justify-between rounded-[5px] bg-white/15 px-2.5 py-2 text-white backdrop-blur-md">
            <span className="flex w-[60px] items-center justify-center font-mono text-xs tabular-nums">
              <b className="font-semibold">{current + 1}</b>
              <span className="opacity-60">/{count}</span>
            </span>
            <div className="flex items-center gap-2">
              {count > 1 && (
                <>
                  <button
                    aria-label={t("imageViewer.previous")}
                    className="flex size-8 items-center justify-center rounded-[3px] bg-white/20 text-white transition-colors hover:bg-white/40"
                    title={t("imageViewer.previous")}
                    type="button"
                    onClick={() => step(-1)}
                  >
                    <ChevronLeftIcon className="size-5" />
                  </button>
                  <button
                    aria-label={t("imageViewer.next")}
                    className="flex size-8 items-center justify-center rounded-[3px] bg-white/20 text-white transition-colors hover:bg-white/40"
                    title={t("imageViewer.next")}
                    type="button"
                    onClick={() => step(1)}
                  >
                    <ChevronRightIcon className="size-5" />
                  </button>
                </>
              )}
              <button
                aria-label={t("common.close")}
                className="flex size-8 items-center justify-center rounded-[3px] bg-white/20 text-white transition-colors hover:bg-white/40"
                title={t("common.close")}
                type="button"
                onClick={() => onOpenChange(false)}
              >
                <XIcon className="size-4" />
              </button>
            </div>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
