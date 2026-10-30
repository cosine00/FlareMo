import type { Editor } from "@tiptap/react";
import type { RefObject } from "react";
import { inlineImageMarkdown } from "@/lib/image-insert";

/**
 * The upload-placeholder helpers import the ProseMirror plugin runtime
 * (`@tiptap/pm/state` + `/view`). Load them lazily: this pipeline only runs
 * once a TipTap editor is already on screen (its async chunk is live), so the
 * import resolves from cache — while the eager app shell stays free of
 * prosemirror.
 */
async function loadUploadPlaceholderModule() {
  return import("@/components/upload-placeholder-extension");
}

/**
 * A settled upload, normalized across both stores. `src` is what the editor
 * renders (a `/file/...` path for the private attachment store, an absolute URL
 * for the public image bed) and `markdown` is what the saved content carries.
 */
export type UploadedImage = {
  src: string;
  /** Alt text, also the markdown label. */
  alt: string;
  markdown: string;
  /**
   * Attachment resource name when the file also lives in the attachment store.
   * Absent for image-bed uploads: those must never enter the memo's bind list,
   * or the submit would reference an attachment the server does not know.
   */
  attachmentName?: string;
};

/** Adapter for the private attachment store (`uploadAttachment`). */
export function attachmentImage(attachment: {
  id: string;
  filename: string;
  name: string;
}): UploadedImage {
  return {
    src: `/file/attachments/${attachment.id}/${encodeURIComponent(attachment.filename)}`,
    alt: attachment.filename.replace(/[[\]]/g, ""),
    markdown: inlineImageMarkdown(attachment.id, attachment.filename),
    attachmentName: attachment.name,
  };
}

/** Adapter for a public image-bed upload (`uploadImageToBed`). */
export function bedImage(url: string, filename: string): UploadedImage {
  const alt = filename.replace(/[[\]]/g, "");
  return { src: url, alt, markdown: `![${alt}](${url})` };
}

export type UploadAndInsertOptions = {
  editorRef: RefObject<Editor | null>;
  files: File[];
  /** Document position captured when the paste/drop happened. */
  position: number;
  /** Upload call; the composer uploads unbound, the card binds to the memo. */
  upload: (file: File) => Promise<UploadedImage>;
  /** Called per settled file so callers can keep their own bookkeeping. */
  onUploaded?: (image: UploadedImage, markdown: string) => void;
  /** User-facing failure; stops the remaining files. */
  onError: () => void;
};

/**
 * Shared paste/drop image pipeline for the composer and the card editor. Each
 * file immediately shows an inline "uploading…" chip at the recorded position
 * (mapped through later edits); a settled upload swaps the chip for the real
 * reference in place, and a failure removes it. The document model never
 * contains an upload in flight, so markdown stays clean.
 */
export async function uploadAndInsertImages(
  options: UploadAndInsertOptions,
): Promise<void> {
  const { editorRef, files, position, upload, onUploaded, onError } = options;
  const editor = editorRef.current;
  if (!editor || files.length === 0) return;

  const {
    addUploadPlaceholder,
    findUploadPlaceholder,
    removeUploadPlaceholder,
  } = await loadUploadPlaceholderModule();

  const placeholders = files.map((file, index) => ({
    file,
    id: addUploadPlaceholder(editor, position + index, file.name),
  }));

  for (const placeholder of placeholders) {
    let image: UploadedImage;
    try {
      image = await upload(placeholder.file);
    } catch {
      onError();
      // The failure stops the whole batch: the failing chip and every not-yet-
      // started chip must go, or stale "uploading…" widgets would linger in
      // the editor forever (they also leak into the editor's text content).
      const editorNow = editorRef.current;
      if (editorNow) {
        for (const stale of placeholders) {
          removeUploadPlaceholder(editorNow, stale.id);
        }
      }
      return;
    }
    const editorNow = editorRef.current;
    if (!editorNow) return;
    // Read the chip's mapped position before removing it: the insertion point
    // tracks any edits the user made while the network was pending. A chip
    // that vanished inserts at the document end rather than dropping the image.
    const pos = findUploadPlaceholder(editorNow, placeholder.id);
    removeUploadPlaceholder(editorNow, placeholder.id);
    if (pos === null) continue;
    // Insert as a JSON image node, not by re-parsing markdown: the markdown
    // path yields a doc-level node and trips the inline-only schema.
    editorNow
      .chain()
      .insertContentAt(Math.min(pos, editorNow.state.doc.content.size), {
        type: "image",
        attrs: { src: image.src, alt: image.alt },
      })
      .run();
    onUploaded?.(image, image.markdown);
  }
}
