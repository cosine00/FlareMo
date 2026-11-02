import type { MemoVisibility } from "@flaremo/contracts";
import type { Editor } from "@tiptap/react";
import { ImagePlusIcon, Loader2Icon, XIcon } from "lucide-react";
import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import type { Attachment } from "@/api";
import { deleteAttachment, uploadAttachment, uploadImageToBed } from "@/api";
import {
  NO_ACTIVE_FORMATS,
  readActiveFormats,
  sameActiveFormats,
} from "@/components/composer/format-actions";
import { MemoEditorToolbar } from "@/components/memo-card/memo-editor-toolbar";
import { SafeRichComposerEditor } from "@/components/rich-composer-safe";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { filterUnreferencedAttachments } from "@/lib/attachment-refs";
import { markdownImages, removeMarkdownImage } from "@/lib/memo-media";
import {
  attachmentImage,
  bedImage,
  uploadAndInsertImages,
} from "@/lib/rich-editor-upload";
import { cn } from "@/lib/utils";

type MemoCardEditorProps = {
  content: string;
  /** The memo's attachments: unreferenced pictures get a management strip. */
  attachments: Attachment[];
  isSaving: boolean;
  isUploadingInline: boolean;
  setIsUploadingInline: Dispatch<SetStateAction<boolean>>;
  /** The live editor handle; the card owns it so an upload outliving the
	    editor session keeps its target. */
  editorRef: RefObject<Editor | null>;
  /** Uploads bind to this memo, so a cancelled edit leaves an owned file. */
  memoName: string;
  /** Public memos publish images to the public bed; see the upload callback. */
  memoVisibility: MemoVisibility;
  onCancel: () => void;
  onContentChange: (content: string) => void;
  onSave: () => void;
};

/**
 * The card's edit face: the composer, the image tray, save/cancel.
 *
 * The tray is every picture the note holds, as thumbnails in one row under the
 * toolbar, each with a delete control — a picture written into the body is
 * otherwise only removable by parking the caret beside it and backspacing,
 * which is easy to miss and impossible on a touch screen.
 *
 * Two kinds of picture share the row:
 *
 * - Body pictures (`![alt](src)` in the markdown): deleting one drops the
 *   reference from the text. If the picture was an attachment it then reappears
 *   in the row as an unreferenced file, so the bytes can be dropped too.
 * - Attachment-only pictures (imports, API clients): the markdown never
 *   mentions them, so the tray is their only surface. Marking one deletes the
 *   file on save; a cancel keeps it.
 */
export function MemoCardEditor({
  content,
  attachments,
  isSaving,
  isUploadingInline,
  setIsUploadingInline,
  editorRef,
  memoName,
  memoVisibility,
  onCancel,
  onContentChange,
  onSave,
}: MemoCardEditorProps) {
  const { t } = useI18n();
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(
    () => new Set(),
  );
  const [isDeletingAttachments, setIsDeletingAttachments] = useState(false);
  // Toolbar highlight mirrors the selection; only a flag flip re-renders.
  const [activeFormats, setActiveFormats] = useState(NO_ACTIVE_FORMATS);

  // Editing an existing memo: pasted images upload bound to the memo right
  // away, so a cancelled edit leaves nothing to clean up except an
  // unreferenced (but owned) attachment in the gallery. Each file shows an
  // "uploading…" chip until its reference lands at the chip's position.
  const insertInlineImages = (files: File[], position: number) => {
    if (files.length === 0) return;
    setIsUploadingInline(true);
    void uploadAndInsertImages({
      editorRef,
      files,
      position,
      upload: async (file) => {
        if (memoVisibility === "public") {
          const { url } = await uploadImageToBed({ file });
          return bedImage(url, file.name);
        }
        return attachmentImage(
          await uploadAttachment({ file, memo: memoName }),
        );
      },
      onError: () => toast.error(t("composer.imageUploadFailed")),
    }).finally(() => setIsUploadingInline(false));
  };

  // Attachment pictures the body does not reference (imports, API-created
  // memos). Tracks the live draft: removing an inline reference brings the
  // attachment into the strip so it can be deleted or replaced there.
  const stripAttachments = useMemo(
    () => filterUnreferencedAttachments(attachments, content),
    [attachments, content],
  );
  const stripImages = useMemo(
    () =>
      stripAttachments.filter((attachment) =>
        attachment.content_type?.startsWith("image/"),
      ),
    [stripAttachments],
  );

  // Pictures written into the body, in reading order. The tray shows them so a
  // body picture is deletable without hunting for the caret position: the
  // thumbnail is the handle, not the text.
  const bodyImages = useMemo(() => markdownImages(content), [content]);

  /**
   * Drops a body picture. With the rich editor live the image node is deleted
   * in place (which keeps the caret, the undo stack, and the serialization
   * pipeline intact); without it — the plain-text fallback, or a body whose
   * markdown the editor could not parse — the markdown token is cut directly.
   */
  const removeBodyImage = useCallback(
    (src: string) => {
      const editor = editorRef.current;
      if (editor) {
        const ranges: Array<{ from: number; to: number }> = [];
        editor.state.doc.descendants((node, pos) => {
          if (node.type.name !== "image") return;
          if (node.attrs?.src !== src) return;
          ranges.push({ from: pos, to: pos + node.nodeSize });
        });
        if (ranges.length > 0) {
          // Back to front: deleting an earlier range must not shift the
          // positions computed for the later ones.
          let transaction = editor.state.tr;
          for (const range of [...ranges].reverse()) {
            transaction = transaction.delete(range.from, range.to);
          }
          editor.view.dispatch(transaction);
          return;
        }
      }
      onContentChange(removeMarkdownImage(content, src));
    },
    [content, editorRef, onContentChange],
  );

  const togglePendingDelete = (name: string) => {
    setPendingDeletes((current) => {
      const next = new Set(current);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const handleAddImages = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    // Append at the document end: the strip is a "bring pictures in"
    // affordance, not a cursor-positioned paste.
    const end = editorRef.current?.state.doc.content.size ?? 0;
    insertInlineImages(Array.from(files), end);
  };

  const handleSave = async () => {
    if (pendingDeletes.size > 0) {
      setIsDeletingAttachments(true);
      const targets = [...pendingDeletes];
      setPendingDeletes(new Set());
      const results = await Promise.allSettled(
        targets.map((name) => deleteAttachment(name)),
      );
      setIsDeletingAttachments(false);
      if (results.some((result) => result.status === "rejected")) {
        toast.error(t("editor.attachmentDeleteFailed"));
      }
    }
    onSave();
  };

  const isBusy = isSaving || isDeletingAttachments;

  return (
    <div className="flex flex-col gap-3 motion-safe:animate-fade">
      <SafeRichComposerEditor
        ariaLabel={t("common.edit")}
        autoFocus
        content={content}
        disabled={isBusy}
        editorRef={editorRef}
        onContentChange={onContentChange}
        onEscape={onCancel}
        onImageFiles={insertInlineImages}
        onTransaction={(editor) => {
          const next = readActiveFormats(editor);
          setActiveFormats((current) =>
            sameActiveFormats(current, next) ? current : next,
          );
        }}
        inputId="flaremo-card-editor-input"
        onSubmitRequest={() => {
          if (!isUploadingInline) void handleSave();
        }}
        placeholder={t("composer.placeholder")}
      />
      <MemoEditorToolbar
        activeFormats={activeFormats}
        disabled={isBusy || isUploadingInline}
        inputId="flaremo-card-editor-toolbar-image-input"
        withEditor={(action) => {
          const editor = editorRef.current;
          if (editor) action(editor);
        }}
        onAddFiles={(files) => {
          const end = editorRef.current?.state.doc.content.size ?? 0;
          insertInlineImages(files, end);
        }}
      />
      {(bodyImages.length > 0 ||
        stripImages.length > 0 ||
        isUploadingInline) && (
        <div className="flex flex-wrap items-center gap-2">
          {bodyImages.map((image, index) => (
            <div
              className="group relative size-16 shrink-0 overflow-hidden rounded-lg border bg-muted"
              // The same picture can be referenced twice; position keeps the
              // keys unique.
              // biome-ignore lint/suspicious/noArrayIndexKey: positional by construction.
              key={`body-${index}-${image.src}`}
            >
              <img
                alt={image.alt ?? ""}
                className="size-full object-cover"
                loading="lazy"
                src={image.src}
              />
              <button
                aria-label={t("editor.removeBodyImage")}
                className="absolute end-1 top-1 grid size-5 cursor-pointer place-items-center rounded-full bg-foreground/70 text-background backdrop-blur transition-colors hover:bg-destructive hover:text-destructive-foreground"
                title={t("editor.removeBodyImage")}
                type="button"
                onClick={() => removeBodyImage(image.src)}
              >
                <XIcon className="size-3.5" />
              </button>
            </div>
          ))}
          {stripImages.map((attachment) => {
            const marked = pendingDeletes.has(attachment.name);
            return (
              <div
                className={cn(
                  "group relative size-16 shrink-0 overflow-hidden rounded-lg border bg-muted transition-opacity",
                  marked && "opacity-40 grayscale",
                )}
                key={attachment.name}
              >
                <img
                  alt={attachment.filename}
                  className="size-full object-cover"
                  loading="lazy"
                  src={attachment.thumbnail_url ?? attachment.preview_url}
                />
                <button
                  aria-label={
                    marked ? t("editor.keepImage") : t("editor.removeImage")
                  }
                  className={cn(
                    "absolute end-1 top-1 grid size-5 cursor-pointer place-items-center rounded-full bg-foreground/70 text-background backdrop-blur transition-colors hover:bg-foreground",
                    marked && "bg-destructive hover:bg-destructive",
                  )}
                  type="button"
                  onClick={() => togglePendingDelete(attachment.name)}
                >
                  <XIcon className="size-3.5" />
                </button>
                {marked && (
                  <span className="absolute inset-x-0 bottom-0 bg-foreground/70 px-1 py-0.5 text-center text-[12px] leading-tight text-background">
                    {t("editor.imageMarkedForDeletion")}
                  </span>
                )}
              </div>
            );
          })}
          <label
            aria-label={t("editor.addImages")}
            className="grid size-16 shrink-0 cursor-pointer place-items-center rounded-lg border border-dashed text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            {isUploadingInline ? (
              <Loader2Icon className="size-4 motion-safe:animate-spin" />
            ) : (
              <ImagePlusIcon className="size-5" />
            )}
            <input
              accept="image/*"
              aria-hidden="true"
              className="sr-only"
              multiple
              tabIndex={-1}
              type="file"
              onChange={(event) => {
                handleAddImages(event.target.files);
                event.target.value = "";
              }}
            />
            <span className="sr-only">{t("editor.addImages")}</span>
          </label>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="hidden sm:inline text-xs text-muted-foreground">
          ⌘Enter / Esc
        </span>
        <div className="flex items-center gap-2 ml-auto">
          <Button
            disabled={isBusy}
            size="sm"
            variant="ghost"
            onClick={onCancel}
          >
            {t("common.cancel")}
          </Button>
          <Button
            disabled={isBusy || isUploadingInline || !content.trim()}
            size="sm"
            onClick={() => void handleSave()}
          >
            {isBusy && (
              <Loader2Icon
                className="motion-safe:animate-spin"
                data-icon="inline-start"
              />
            )}
            {t("common.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
