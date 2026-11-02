import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from "react";
import { useMemo, useState } from "react";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

export type GalleryImage = { alt?: string; src: string };

/**
 * A stable, count-driven collage for a run of pictures inside one note.
 *
 * The template is known from the Markdown alone, before image bytes or natural
 * dimensions arrive: two pictures split the row, three use one hero plus two
 * small tiles, four form a 2×2 grid, and larger sets keep the three-picture
 * template with a +N overlay. `object-cover` absorbs mixed portrait/landscape
 * ratios while the lightbox keeps every uncropped original reachable.
 */
export function MemoImageGallery({
  images,
  onOpenImage,
}: {
  images: GalleryImage[];
  onOpenImage?: (src: string, alt?: string) => void;
}) {
  const { t } = useI18n();
  const [failed, setFailed] = useState<Record<string, true>>({});
  const visible = useMemo(
    () => images.filter((image) => !failed[image.src]),
    [images, failed],
  );

  if (visible.length === 0) return null;

  const shown = visible.slice(0, visible.length > 4 ? 3 : 4);
  const hiddenCount = visible.length - shown.length;
  const template =
    shown.length === 2
      ? "grid-cols-2 aspect-[8/3]"
      : shown.length === 4
        ? "grid-cols-2 grid-rows-2 aspect-[4/3]"
        : "grid-cols-2 grid-rows-2 aspect-[16/9]";

  return (
    <div
      className={cn(
        "memo-image-gallery grid gap-2 overflow-hidden rounded-lg",
        template,
      )}
    >
      {shown.map((image, index) => {
        const hero = shown.length === 3 && index === 0;
        const overlay = hiddenCount > 0 && index === shown.length - 1;
        return (
          <button
            aria-label={image.alt?.trim() ? image.alt : t("imageViewer.open")}
            className={cn(
              "group relative min-h-0 min-w-0 cursor-zoom-in overflow-hidden bg-muted text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60",
              hero && "row-span-2",
            )}
            key={image.src}
            type="button"
            onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
              event.preventDefault();
              event.stopPropagation();
              onOpenImage?.(image.src, image.alt);
            }}
            onKeyDown={(event: ReactKeyboardEvent<HTMLButtonElement>) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              event.stopPropagation();
              onOpenImage?.(image.src, image.alt);
            }}
          >
            <img
              alt={image.alt ?? ""}
              className="m-0 size-full object-cover motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out-expo group-hover:scale-[1.015]"
              data-memo-image=""
              decoding="async"
              loading="lazy"
              src={image.src}
              onError={() =>
                setFailed((current) => ({ ...current, [image.src]: true }))
              }
            />
            {overlay && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-lg font-semibold text-white backdrop-blur-[1px]">
                +{hiddenCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
