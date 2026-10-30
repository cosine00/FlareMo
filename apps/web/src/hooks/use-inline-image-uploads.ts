import type { Editor } from "@tiptap/react";
import { type RefObject, useRef, useState } from "react";
import { toast } from "sonner";
import { uploadAttachment, uploadImageToBed } from "@/api";
import { useI18n } from "@/i18n";
import type { MemoCaptureInput } from "@/lib/local-memo-capture";
import {
  attachmentImage,
  bedImage,
  uploadAndInsertImages,
} from "@/lib/rich-editor-upload";

type UseInlineImageUploadsOptions = {
  editorRef: RefObject<Editor | null>;
  /** Live draft: the async chain would otherwise write into a stale closure. */
  draftRef: RefObject<MemoCaptureInput>;
  /** Draft patch writer, called as each settled file binds its attachment. */
  commitDraft: (patch: Partial<MemoCaptureInput>) => void;
};

export type UseInlineImageUploadsResult = {
  /** An inline upload batch is in flight; sending now would lose the files. */
  isUploadingImages: boolean;
  enqueueInlineUploads: (files: File[], position: number) => void;
  /** Inline reference per preuploaded attachment, for pruning on edit. */
  preuploadMarkdownRef: RefObject<Map<string, string>>;
};

/**
 * Pasted/dropped images show an inline "uploading…" chip immediately, then
 * their references land where the chip sits once the upload settles. Tasks
 * chain so two rapid pastes never interleave.
 */
export function useInlineImageUploads({
  editorRef,
  draftRef,
  commitDraft,
}: UseInlineImageUploadsOptions): UseInlineImageUploadsResult {
  const { t } = useI18n();
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const pendingUploadsRef = useRef(0);
  const uploadChainRef = useRef<Promise<void>>(Promise.resolve());
  // Inline markdown per preuploaded attachment, so a content edit can tell
  // which references were deleted and prune the bind list (otherwise a
  // deleted image would be re-bound on submit).
  const preuploadMarkdownRef = useRef(new Map<string, string>());

  const enqueueInlineUploads = (files: File[], position: number) => {
    if (files.length === 0) return;
    pendingUploadsRef.current += files.length;
    setIsUploadingImages(true);
    uploadChainRef.current = uploadChainRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          // Local customization: a public memo publishes its images to the
          // public bed so the same URL works in the app, the share page and the
          // blog. Everything else (private, team) stays in the attachment store,
          // where reads are auth-checked.
          const useImageBed = draftRef.current.visibility === "public";
          await uploadAndInsertImages({
            editorRef,
            files,
            position,
            upload: async (file) => {
              if (!useImageBed) {
                return attachmentImage(await uploadAttachment({ file }));
              }
              const { url } = await uploadImageToBed({ file });
              return bedImage(url, file.name);
            },
            onUploaded: (image, markdown) => {
              // Bed uploads have no attachment to bind, and adding one would
              // make the submit reference an attachment the server never saw.
              if (!image.attachmentName) return;
              preuploadMarkdownRef.current.set(image.attachmentName, markdown);
              commitDraft({
                preuploadedAttachmentNames: [
                  ...(draftRef.current.preuploadedAttachmentNames ?? []),
                  image.attachmentName,
                ],
              });
            },
            onError: () => toast.error(t("composer.imageUploadFailed")),
          });
        } finally {
          // A failed batch also releases the files skipped after the failure.
          pendingUploadsRef.current -= files.length;
          setIsUploadingImages(pendingUploadsRef.current > 0);
        }
      });
  };

  return { isUploadingImages, enqueueInlineUploads, preuploadMarkdownRef };
}
