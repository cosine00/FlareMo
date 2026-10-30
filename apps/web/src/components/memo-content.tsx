import { Link } from "@tanstack/react-router";
import { ListPlusIcon } from "lucide-react";
import {
  Children,
  type ImgHTMLAttributes,
  isValidElement,
  memo,
  type ReactElement,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import Markdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { ImageLightbox } from "@/components/image-lightbox";
import { MemoImageGallery } from "@/components/memo-image-gallery";
import { MemoImageIcon } from "@/components/memo-image-icon";
import { useI18n } from "@/i18n";
import { createSlugger } from "@/lib/markdown-outline";
import { markdownImages } from "@/lib/memo-media";
import { memoTaskLines } from "@/lib/memo-tasks";
import {
  IMAGE_SLOT_PROPERTY,
  rehypeAppendImageSlot,
} from "@/lib/rehype-append-image-slot";
import { rehypeMergeImageParagraphs } from "@/lib/rehype-merge-image-paragraphs";
import { remarkTags, tagFromHref } from "@/lib/remark-tags";
import {
  isTimestampHref,
  parseTimestampHref,
  toTimestampHrefMarkdown,
} from "@/lib/transcript";
import { cn } from "@/lib/utils";

/**
 * Plain text of rendered children, used to derive heading ids. Headings almost
 * always render as bare text; inline markup is flattened so the id matches the
 * outline, which flattens the raw Markdown the same way.
 */
function nodeText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(nodeText).join("");
  }
  if (typeof node === "object" && "props" in node) {
    return nodeText(
      (node as { props?: { children?: ReactNode } }).props?.children,
    );
  }
  return "";
}

type HeadingTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

type MarkdownImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "alt"> & {
  alt?: string;
  node?: unknown;
  /** Opens the shared viewer; without it the image stays inert. */
  onOpenImage?: (src: string, alt?: string) => void;
  /**
   * A screenshot or a portrait photo: laid out full width and cropped to its
   * middle, so one tall capture cannot turn a note into a two-metre scroll.
   */
  tall?: boolean;
};

/** naturalHeight / naturalWidth above which a picture counts as tall. */
const TALL_IMAGE_RATIO = 1.25;

/**
 * Body images degrade in place: a deleted attachment would otherwise render
 * as a broken-image glyph, so a failed load swaps the element for a caption
 * placeholder carrying the alt text.
 *
 * A loaded image is a control onto the shared viewer — the image itself rather
 * than a button wrapping it, because a shrink-to-fit wrapper resolves the
 * image's `max-width: 100%` against its own content and collapses it.
 */
function MarkdownImage({
  alt,
  node: _node,
  onOpenImage,
  tall: tallHint,
  ...props
}: MarkdownImageProps) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  // Dimensions are only known once the bytes arrive (unless the caller could
  // read them off the attachment), so the crop is decided on load.
  const [tall, setTall] = useState(Boolean(tallHint));
  const src = typeof props.src === "string" ? props.src : undefined;

  if (failed) {
    return (
      <span className="memo-image-broken">
        {alt?.trim() ? alt : t("markdown.imageUnavailable")}
      </span>
    );
  }

  return (
    <img
      {...props}
      alt={alt ?? ""}
      className={cn(props.className, tall && "memo-image-tall")}
      data-memo-image=""
      decoding="async"
      loading="lazy"
      onError={() => setFailed(true)}
      onLoad={(event) => {
        const element = event.currentTarget;
        if (element.naturalWidth > 0) {
          setTall(
            element.naturalHeight / element.naturalWidth > TALL_IMAGE_RATIO,
          );
        }
      }}
      {...(onOpenImage
        ? {
            "aria-label": alt?.trim() ? alt : t("imageViewer.open"),
            onClick: (event: ReactMouseEvent<HTMLImageElement>) => {
              // The card body is a click target of its own; opening the viewer
              // must not also open the note.
              event.preventDefault();
              event.stopPropagation();
              onOpenImage(src ?? "", alt);
            },
            onKeyDown: (event: ReactKeyboardEvent<HTMLImageElement>) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              event.stopPropagation();
              onOpenImage(src ?? "", alt);
            },
            role: "button",
            tabIndex: 0,
            title: t("imageViewer.open"),
          }
        : {})}
    />
  );
}

/** D2: the read view's GFM checkboxes are live when a caller opts in. */
type TaskInteraction = {
  /** `lineIndex` is a 0-based index into the raw Markdown source. */
  onToggleTask?: (lineIndex: number, checked: boolean) => void;
  /** Upgrades a to-do line into a FlareMo task linked back to this memo. */
  onConvertTask?: (lineIndex: number, text: string) => void;
};

/** The disabled checkbox remark-gfm renders as a list item's first child. */
function isCheckbox(
  child: ReactNode,
): child is ReactElement<{ type?: string; checked?: boolean }> {
  return (
    isValidElement(child) &&
    child.type === "input" &&
    (child.props as { type?: string }).type === "checkbox"
  );
}

type HastLike = {
  children?: HastLike[];
  properties?: Record<string, unknown>;
  tagName?: string;
  type: string;
  value?: string;
};

/**
 * The images of a paragraph that holds nothing else. Two or more of them are a
 * gallery — the rehype pass has already collapsed adjacent picture-only
 * paragraphs into one, so this is the single place the decision is made.
 */
function paragraphImages(node: HastLike | undefined): {
  alt?: string;
  src: string;
}[] {
  const children = node?.children ?? [];
  const images: { alt?: string; src: string }[] = [];
  for (const child of children) {
    if (child.type === "text" && !child.value?.trim()) continue;
    if (child.type !== "element") return [];
    if (child.tagName === "br") continue;
    if (child.tagName !== "img") return [];
    const src = child.properties?.src;
    if (typeof src !== "string" || src === "") return [];
    const alt = child.properties?.alt;
    images.push({ alt: typeof alt === "string" && alt ? alt : undefined, src });
  }
  return images;
}

/** Pictures referenced by a Markdown body, in reading order. */
export const MemoContent = memo(function MemoContent({
  className,
  content,
  onTimestampClick,
  withHeadingIds = false,
  interactiveTaskLists = false,
  imageMode = "full",
  iconImages,
  resolveImageDimensions,
  onToggleTask,
  onConvertTask,
  onTagClick,
  rehypePlugins,
}: {
  className?: string;
  content: string;
  /** Makes in-text `#tags` filter the timeline; without it they are inert. */
  onTagClick?: (tag: string) => void;
  /**
   * Turns timestamp anchors into seek controls. Without it they stay inert,
   * which is what the timeline card wants.
   */
  onTimestampClick?: (seconds: number) => void;
  /**
   * Gives headings stable ids that match the reading view's outline. A fresh
   * slugger is created per render so duplicate headings number identically
   * under StrictMode's double render.
   */
  withHeadingIds?: boolean;
  /**
   * Renders task-list checkboxes enabled so a click can be intercepted
   * upstream (the card layer rewrites the Markdown). Without it they stay
   * disabled decorations, as remark-gfm emits them.
   */
  interactiveTaskLists?: boolean;
  /**
   * "full" renders body pictures in place (single pictures inline, runs of
   * them as a justified band). "icon" drops them for one inline glyph — the
   * dense timeline rail, where a screenshot per note would bury the text.
   */
  imageMode?: "full" | "icon";
  /**
   * Pictures that live beside the body rather than in it — uploaded
   * attachments. Icon mode counts them in the same glyph; the other modes
   * leave them to the attachment gallery.
   */
  iconImages?: { alt?: string; src: string }[];
  /**
   * Maps a body image's src to its attachment's intrinsic dimensions so the
   * rendered box is reserved before the bytes load (no layout shift).
   */
  resolveImageDimensions?: (
    src: string,
  ) => { width: number; height: number } | undefined;
  /**
   * Article-surface extras (Shiki highlighting) passed straight through to
   * the markdown processor. Memo cards never set it.
   */
  rehypePlugins?: import("unified").Pluggable[];
} & TaskInteraction) {
  const { t } = useI18n();
  // One viewer per note: every body image routes through here, so a card with a
  // dozen screenshots still mounts a single dialog. The list is read back off
  // the rendered note, which keeps prev/next in the same order the reader sees
  // — galleries, inline pictures and all.
  const containerRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<{
    images: { alt?: string; src: string }[];
    index: number;
  } | null>(null);
  // Transcript bodies rewrite clock markers into `#flaremo-t=` links before
  // parsing; prose without markers passes through untouched.
  const body = onTimestampClick ? toTimestampHrefMarkdown(content) : content;
  // Every picture the note mentions, in reading order. Icon mode needs it to
  // count and open them; the other modes only fall back to it for the viewer's
  // prev/next list when the rendered note has no picture element to read.
  const noteImages = useMemo(() => markdownImages(body), [body]);
  // Icon mode folds the note's attachments in as well: the glyph speaks for
  // every picture the note holds, whether it was written into the body or
  // uploaded alongside it.
  const inlineImages = useMemo(
    () => (imageMode === "icon" ? [...noteImages, ...(iconImages ?? [])] : []),
    [iconImages, imageMode, noteImages],
  );

  const openPreview = useCallback(
    (src: string, alt?: string) => {
      const rendered = containerRef.current
        ? Array.from(
            containerRef.current.querySelectorAll<HTMLImageElement>(
              "img[data-memo-image]",
            ),
          )
        : [];
      const images =
        rendered.length > 0
          ? rendered
              .map((element) => ({
                alt: element.alt || undefined,
                src: element.getAttribute("src") ?? "",
              }))
              .filter((image) => image.src !== "")
          : // Icon mode strips the pictures from the body, so the viewer's set
            // comes from the markdown itself — otherwise every note would open
            // a one-picture viewer with no way to reach the rest.
            inlineImages.length > 0
            ? inlineImages
            : noteImages;
      const index = images.findIndex((image) => image.src === src);
      setPreview({
        images: images.length > 0 ? images : [{ alt, src }],
        index: Math.max(0, index),
      });
    },
    [inlineImages, noteImages],
  );
  const slug = withHeadingIds ? createSlugger() : undefined;
  const interactiveTasks = Boolean(onToggleTask || onConvertTask);

  const heading = (Tag: HeadingTag) =>
    function Heading({
      children,
      node: _node,
      ...props
    }: {
      children?: ReactNode;
      node?: unknown;
    }) {
      return (
        <Tag
          {...props}
          className="scroll-mt-24"
          id={slug ? slug(nodeText(children)) : undefined}
        >
          {children}
        </Tag>
      );
    };

  return (
    <div
      className={cn("memo-markdown text-[15px] leading-7", className)}
      ref={containerRef}
    >
      <Markdown
        components={{
          p({ children, node, ...props }) {
            const images = paragraphImages(node as HastLike | undefined);
            if (imageMode === "icon") {
              // Every picture is collapsed into the single glyph below the
              // body, so an image-only paragraph must not leave an empty line
              // behind. Paragraphs that do carry text keep it.
              if (images.length > 0 && nodeText(children).trim() === "") {
                return null;
              }
              return <p {...props}>{children}</p>;
            }
            // Two pictures or more become one justified band; a lone picture
            // stays a paragraph so it keeps the reader's full column width.
            if (images.length > 1) {
              return (
                <MemoImageGallery images={images} onOpenImage={openPreview} />
              );
            }
            return <p {...props}>{children}</p>;
          },
          span({ node, children, ...props }) {
            // The marker rehypeAppendImageSlot planted at the end of the last
            // line of prose: the whole note's pictures, folded into one glyph
            // that trails the text instead of taking a line of its own.
            const properties = (node as HastLike | undefined)?.properties;
            if (properties && IMAGE_SLOT_PROPERTY in properties) {
              return (
                <MemoImageIcon images={inlineImages} onOpen={openPreview} />
              );
            }
            return <span {...props}>{children}</span>;
          },
          a({ href, children, node: _node, ...props }) {
            const tag = tagFromHref(href);
            if (tag !== null) {
              return onTagClick ? (
                <button
                  className="memo-tag"
                  type="button"
                  onClick={(event) => {
                    // The card body is not a link; keep the click local.
                    event.stopPropagation();
                    onTagClick(tag);
                  }}
                >
                  {children}
                </button>
              ) : (
                <span className="memo-tag">{children}</span>
              );
            }
            const seconds = isTimestampHref(href)
              ? parseTimestampHref(href ?? "")
              : null;
            if (seconds !== null && !onTimestampClick) {
              return <span className="memo-timestamp-static">{children}</span>;
            }
            if (seconds !== null && onTimestampClick) {
              return (
                <button
                  className="memo-timestamp"
                  data-flaremo-t={seconds}
                  onClick={() => onTimestampClick(seconds)}
                  type="button"
                >
                  {children}
                </button>
              );
            }

            if (href?.startsWith("/memo/")) {
              return (
                <Link
                  className="font-medium text-foreground underline decoration-brand-500/50 underline-offset-2 transition-colors hover:text-brand-600 hover:decoration-brand-500"
                  to={href}
                >
                  {children}
                </Link>
              );
            }

            const external =
              href?.startsWith("http://") || href?.startsWith("https://");
            return (
              <a
                {...props}
                href={href}
                rel={external ? "noreferrer noopener" : undefined}
                target={external ? "_blank" : undefined}
              >
                {children}
              </a>
            );
          },
          h1: heading("h1"),
          h2: heading("h2"),
          h3: heading("h3"),
          h4: heading("h4"),
          h5: heading("h5"),
          h6: heading("h6"),
          input({ node: _node, disabled: _disabled, ...props }) {
            if (!interactiveTaskLists) {
              return <input {...props} disabled type="checkbox" />;
            }
            // The card layer owns toggling (event delegation on the
            // container); readOnly keeps React's controlled-input contract
            // while the click handler prevents the default flip.
            return <input {...props} readOnly type="checkbox" />;
          },
          img({ node: _node, ...props }) {
            // Icon mode collapses every picture into one glyph rendered after
            // the body; the inline ones simply step aside.
            if (imageMode === "icon") return null;
            const dimensions = resolveImageDimensions?.(
              typeof props.src === "string" ? props.src : "",
            );
            return (
              <MarkdownImage
                {...props}
                tall={
                  dimensions
                    ? dimensions.height / dimensions.width > TALL_IMAGE_RATIO
                    : undefined
                }
                {...(dimensions
                  ? {
                      width: dimensions.width,
                      height: dimensions.height,
                      style: {
                        aspectRatio: `${dimensions.width} / ${dimensions.height}`,
                      },
                    }
                  : {})}
                onOpenImage={openPreview}
              />
            );
          },
          li({ className, node, children, ...props }) {
            if (!interactiveTasks) {
              return (
                <li {...props} className={className}>
                  {children}
                </li>
              );
            }
            const items = Children.toArray(children);
            const checkboxIndex = items.findIndex(isCheckbox);
            if (checkboxIndex < 0) {
              return (
                <li {...props} className={className}>
                  {children}
                </li>
              );
            }
            const checkbox = items[checkboxIndex] as ReactElement<{
              checked?: boolean;
            }>;
            const body = items.filter((_, index) => index !== checkboxIndex);
            const checked = Boolean(checkbox.props.checked);
            // The hast node carries its source position; the 1-based line is
            // exactly the `- [ ]` line for a GFM task item.
            const lineIndex = (node?.position?.start.line ?? 1) - 1;
            return (
              <li {...props} className={cn("group/task", className)}>
                {onToggleTask ? (
                  <input
                    aria-label={
                      checked ? t("memo.taskMarkTodo") : t("memo.taskMarkDone")
                    }
                    checked={checked}
                    type="checkbox"
                    onChange={(event) =>
                      onToggleTask(lineIndex, event.target.checked)
                    }
                  />
                ) : (
                  checkbox
                )}
                {body}
                {onConvertTask && (
                  <button
                    aria-label={t("memo.convertToTask")}
                    className="mx-1 inline-flex size-5 items-center justify-center rounded-md align-middle text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 motion-safe:transition-opacity group-hover/task:opacity-100"
                    title={t("memo.convertToTask")}
                    type="button"
                    onClick={() => {
                      const text = memoTaskLines(content).find(
                        (line) => line.lineIndex === lineIndex,
                      )?.text;
                      if (text) onConvertTask(lineIndex, text);
                    }}
                  >
                    <ListPlusIcon className="size-3.5" />
                  </button>
                )}
              </li>
            );
          },
        }}
        rehypePlugins={[
          ...(rehypePlugins ?? []),
          rehypeMergeImageParagraphs,
          ...(inlineImages.length > 0 ? [rehypeAppendImageSlot] : []),
        ]}
        remarkPlugins={[remarkGfm, remarkBreaks, remarkTags]}
        skipHtml
      >
        {body}
      </Markdown>
      {preview && (
        <ImageLightbox
          images={preview.images}
          index={preview.index}
          open
          onOpenChange={(open) => {
            if (!open) setPreview(null);
          }}
        />
      )}
    </div>
  );
});
