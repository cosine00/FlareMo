import type { MemoVisibility } from "@flaremo/contracts";
import type { Editor } from "@tiptap/react";
import { ImagePlusIcon, Loader2Icon, XIcon } from "lucide-react";
import { useMemo, useState, type Dispatch, type RefObject, type SetStateAction, Suspense } from "react";
import { toast } from "sonner";
import type { Attachment } from "@/api";
import { deleteAttachment, uploadAttachment, uploadImageToBed } from "@/api";
import { RichComposerEditor } from "@/components/rich-composer-editor-lazy";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { filterUnreferencedAttachments } from "@/lib/attachment-refs";
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
 * The card's edit face: the composer, the attachment-image strip, save/cancel.
 *
 * Pictures that live only as attachments (imports, app clients) are invisible
 * to the markdown editor, so the strip is their only management surface: mark
 * one for deletion (a save deletes it for real, a cancel keeps it) or add new
 * pictures, which ride the same upload pipeline as paste/drop.
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
			<Suspense
				fallback={<div className="min-h-32 bg-muted/30" aria-hidden="true" />}
			>
				<RichComposerEditor
					ariaLabel={t("common.edit")}
					autoFocus
					content={content}
					disabled={isBusy}
					editorRef={editorRef}
					onContentChange={onContentChange}
					onEscape={onCancel}
					onImageFiles={insertInlineImages}
					inputId="flaremo-card-editor-input"
					onSubmitRequest={() => {
						if (!isUploadingInline) void handleSave();
					}}
					placeholder={t("composer.placeholder")}
				/>
			</Suspense>
			{(stripImages.length > 0 || isUploadingInline) && (
				<div className="flex flex-wrap items-center gap-2">
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
										marked
											? t("editor.keepImage")
											: t("editor.removeImage")
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
									<span className="absolute inset-x-0 bottom-0 bg-foreground/70 px-1 py-0.5 text-center text-[10px] leading-tight text-background">
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
