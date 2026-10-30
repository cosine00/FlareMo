import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useI18n } from "@/i18n";

/**
 * Justified multi-image layout, ported from the Hugo blog this app mirrors.
 *
 * Every row is scaled to one shared height so the pictures in it read as a
 * single band across the column — the shape Flickr/Google Photos popularised —
 * rather than a stack of unrelated full-width blocks. Rows are chosen by a
 * short dynamic program over row-breaking costs: a row's score is how far its
 * height lands from the target, so two tall screenshots pair up, three wide
 * panoramas pair up, and nothing is ever left alone in a row.
 *
 * Sizing is decided here, in pixels, from each image's natural ratio: CSS
 * cannot express "same height, widths proportional to aspect ratio, total equal
 * to the container" without a measurement pass anyway.
 */

const GAP = 8;
/** A row never grows past this many pictures, however narrow they are. */
const MAX_PER_ROW = 5;
/** Row height target: 28% of the column, clamped to a comfortable band. */
function targetRowHeight(width: number): number {
  return Math.min(260, Math.max(150, width * 0.28));
}

export type GalleryImage = { alt?: string; src: string };

type Sized = GalleryImage & { height: number; ratio: number; width: number };
type Row = { height: number; images: Sized[] };

function rowHeight(ratios: number[], width: number): number {
  const total = ratios.reduce((sum, ratio) => sum + ratio, 0);
  return (width - GAP * (ratios.length - 1)) / total;
}

/** Cost of breaking a row here: log-distance from the target height, plus a
 *  penalty for rows that would end up squashed or doubled. */
function rowCost(ratios: number[], width: number, target: number): number {
  const height = rowHeight(ratios, width);
  const deviation = Math.log(height / target);
  let cost = deviation * deviation + 0.04;
  if (height > target * 2) cost += (height / target - 2) ** 2;
  if (height < target * 0.55) cost += (0.55 - height / target) ** 2 * 2;
  return cost;
}

function splitRows(ratios: number[], width: number): number[][] {
  const count = ratios.length;
  const target = targetRowHeight(width);
  const best: Array<{ cost: number; previous: number } | undefined> = [];
  best[0] = { cost: 0, previous: -1 };

  for (let end = 2; end <= count; end += 1) {
    for (let length = 2; length <= MAX_PER_ROW && length <= end; length += 1) {
      const start = end - length;
      const head = best[start];
      if (!head) continue;
      const cost = head.cost + rowCost(ratios.slice(start, end), width, target);
      const existing = best[end];
      if (!existing || cost < existing.cost) {
        best[end] = { cost, previous: start };
      }
    }
  }

  if (!best[count]) return [ratios.map((_, index) => index)];
  const rows: number[][] = [];
  let cursor = count;
  while (cursor > 0) {
    const previous = best[cursor]?.previous ?? 0;
    rows.unshift(
      Array.from(
        { length: cursor - previous },
        (_, offset) => previous + offset,
      ),
    );
    cursor = previous;
  }
  return rows;
}

function layout(
  images: GalleryImage[],
  ratios: Record<string, number>,
  width: number,
): Row[] {
  if (width < 1) return [];
  const usable = images.filter((image) => (ratios[image.src] ?? 0) > 0);
  if (usable.length === 0) return [];

  const target = targetRowHeight(width);
  const rows = splitRows(
    usable.map((image) => ratios[image.src] ?? 4 / 3),
    width,
  );

  return rows.map((indexes) => {
    const picked = indexes.map((index) => usable[index]).filter(Boolean);
    const ideal = rowHeight(
      picked.map((image) => ratios[image.src] ?? 4 / 3),
      width,
    );
    // Two very wide pictures in one row would otherwise balloon past the fold.
    const height = Math.min(ideal, target * 2);
    const sized = picked.map((image) => {
      const ratio = ratios[image.src] ?? 4 / 3;
      return {
        ...image,
        ratio,
        height: Math.round(height),
        width: Math.round(height * ratio),
      };
    });
    return { height, images: sized };
  });
}

/**
 * A run of pictures inside one note. Sizing waits for the natural dimensions,
 * which is why the first paint is a 1px probe row: the browser has to decode
 * the files before the ratios exist, and a wrong guess would flash a stack of
 * full-width images on every scroll.
 */
export function MemoImageGallery({
  images,
  onOpenImage,
}: {
  images: GalleryImage[];
  onOpenImage?: (src: string, alt?: string) => void;
}) {
  const { t } = useI18n();
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const [failed, setFailed] = useState<Record<string, true>>({});
  const [width, setWidth] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);

  // A ref callback rather than an effect: the gallery mounts inside a lazily
  // rendered note, so an effect keyed on mount can fire before the node exists.
  const attach = useCallback((element: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!element) return;
    const measure = () => setWidth(element.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    observerRef.current = observer;
  }, []);

  const visible = useMemo(
    () => images.filter((image) => !failed[image.src]),
    [images, failed],
  );
  const ready = visible.length > 0 && visible.every((i) => ratios[i.src]);
  const rows = useMemo(
    () => (ready ? layout(visible, ratios, width) : []),
    [ready, visible, ratios, width],
  );

  const handleRatio = useCallback((src: string, element: HTMLImageElement) => {
    if (!element.naturalWidth || !element.naturalHeight) return;
    const ratio = element.naturalWidth / element.naturalHeight;
    setRatios((current) =>
      current[src] === ratio ? current : { ...current, [src]: ratio },
    );
  }, []);

  const open = useCallback(
    (src: string, alt?: string) => {
      onOpenImage?.(src, alt);
    },
    [onOpenImage],
  );

  if (visible.length === 0) return null;

  const renderImage = (
    image: GalleryImage,
    index: number,
    size?: { height: number; width: number },
  ) => (
    <img
      alt={image.alt ?? ""}
      key={`${image.src}-${index}`}
      aria-label={image.alt?.trim() ? image.alt : t("imageViewer.open")}
      className="memo-image-gallery-item"
      data-memo-image=""
      decoding="async"
      height={size?.height}
      loading="lazy"
      role={onOpenImage ? "button" : undefined}
      src={image.src}
      style={size}
      tabIndex={onOpenImage ? 0 : undefined}
      title={t("imageViewer.open")}
      onClick={(event: ReactMouseEvent<HTMLImageElement>) => {
        event.preventDefault();
        event.stopPropagation();
        open(image.src, image.alt);
      }}
      onError={() =>
        setFailed((current) => ({ ...current, [image.src]: true }))
      }
      onKeyDown={(event: ReactKeyboardEvent<HTMLImageElement>) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        open(image.src, image.alt);
      }}
      onLoad={(event) => handleRatio(image.src, event.currentTarget)}
    />
  );

  return (
    <div className="memo-image-gallery" ref={attach}>
      {ready ? (
        rows.map((row, rowIndex) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional by construction.
            key={`row-${rowIndex}`}
            className="memo-image-gallery-row"
          >
            {row.images.map((image, index) =>
              renderImage(image, index, {
                height: image.height,
                width: image.width,
              }),
            )}
          </div>
        ))
      ) : (
        // Ratios arrive with the bytes. Until then the pictures stack one per
        // line — visible right away, and re-flowed into rows a beat later.
        <div className="memo-image-gallery-pending">
          {visible.map((image, index) => renderImage(image, index))}
        </div>
      )}
    </div>
  );
}
