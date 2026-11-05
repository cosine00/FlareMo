import {
  ArchiveIcon,
  BrainCircuitIcon,
  Edit3Icon,
  Globe2Icon,
  ImageIcon,
  MoreHorizontalIcon,
  PinIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react";
import { lazy, Suspense, useState } from "react";
import type { Memo } from "@/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/i18n";

// The share-image dialog pulls in html-to-image and the plugin card registry;
// keep it out of the entry chunk — it only downloads on first open.
const ShareImageDialog = lazy(() =>
  import("@/components/share-image-dialog").then((module) => ({
    default: module.ShareImageDialog,
  })),
);

// The insight dialog renders the memo through `memo-content`, i.e. the whole
// markdown pipeline. Keeping it static put those bytes in the startup graph
// for every card on the timeline; it now loads the first time a menu opens it.
const AiInsightDialog = lazy(() =>
  import("@/components/ai-insight-dialog").then((module) => ({
    default: module.AiInsightDialog,
  })),
);

type MemoCardMenuProps = {
  memo: Memo;
  id: string;
  isTrashed: boolean;
  canManage: boolean;
  canGovern: boolean;
  onArchive: (id: string) => void;
  onHardDelete: (id: string) => Promise<void>;
  onPin: (id: string, pinned: boolean) => void;
  onRestore: (id: string) => void;
  onStartEditing: () => void;
  onTrash: (id: string) => void;
  /** Opens the visibility dialog owned by the card header. */
  onOpenVisibility: () => void;
  onRequestDelete?: (memo: Memo) => void;
  onRequestShareImage?: (memo: Memo) => void;
  onRequestVisibility?: (memo: Memo) => void;
};

/**
 * The ⋯ menu. Delete and share-image are dual-channel: when the list passes a
 * callback it renders one singleton dialog for the whole timeline, otherwise
 * the dialogs below serve this card.
 */
export function MemoCardMenu({
  memo,
  id,
  isTrashed,
  canManage,
  canGovern,
  onArchive,
  onHardDelete,
  onPin,
  onRestore,
  onStartEditing,
  onTrash,
  onOpenVisibility,
  onRequestDelete,
  onRequestShareImage,
  onRequestVisibility,
}: MemoCardMenuProps) {
  const { t } = useI18n();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isShareImageOpen, setIsShareImageOpen] = useState(false);
  const [isInsightOpen, setIsInsightOpen] = useState(false);
  // Latch: mount the lazy dialog on first open, then keep it mounted so the
  // close animation still plays (the chunk stays out of the entry graph).
  const [shareImageMounted, setShareImageMounted] = useState(false);
  // Same latch for the insight dialog: its chunk may only arrive after the
  // dialog has been asked to open, so keep it mounted once it has appeared.
  const [insightMounted, setInsightMounted] = useState(false);
  return (
    <>
      {(canManage || canGovern) && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                aria-label={t("common.actions")}
                className="opacity-100 motion-safe:transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                size="icon-sm"
                variant="ghost"
              >
                <MoreHorizontalIcon />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="min-w-[140px]">
            {isTrashed ? (
              <DropdownMenuGroup>
                {canGovern && (
                  <DropdownMenuItem onClick={() => onRestore(id)}>
                    <RotateCcwIcon />
                    {t("memo.restore")}
                  </DropdownMenuItem>
                )}
                {canManage && (
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() =>
                      onRequestDelete
                        ? onRequestDelete(memo)
                        : setIsDeleteDialogOpen(true)
                    }
                  >
                    <Trash2Icon />
                    {t("memo.deleteForever")}
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
            ) : (
              <>
                {canManage && (
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={onStartEditing}>
                      <Edit3Icon />
                      {t("common.edit")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onPin(id, !memo.pinned)}>
                      <PinIcon />
                      {memo.pinned ? t("memo.unpin") : t("memo.pin")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        onRequestVisibility
                          ? onRequestVisibility(memo)
                          : onOpenVisibility()
                      }
                    >
                      <Globe2Icon />
                      {t("memo.visibilityAndShare")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        if (onRequestShareImage) {
                          onRequestShareImage(memo);
                        } else {
                          setShareImageMounted(true);
                          setIsShareImageOpen(true);
                        }
                      }}
                    >
                      <ImageIcon />
                      {t("share.imageCard")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setInsightMounted(true);
                        setIsInsightOpen(true);
                      }}
                    >
                      <BrainCircuitIcon />
                      {t("ai.insight.title")}
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                )}
                {canGovern && (
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => onArchive(id)}>
                      <ArchiveIcon />
                      {memo.state === "archived"
                        ? t("memo.moveToTimeline")
                        : t("view.archive")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => onTrash(id)}
                    >
                      <Trash2Icon />
                      {t("memo.moveToTrash")}
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {!onRequestDelete && (
        <AlertDialog
          open={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
        >
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("memo.deleteConfirmTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("memo.deleteConfirmDescription")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel variant="ghost">
                {t("common.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => void onHardDelete(id)}
              >
                {t("memo.deleteForever")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      {!onRequestShareImage && shareImageMounted && (
        <Suspense fallback={null}>
          <ShareImageDialog
            memo={memo}
            open={isShareImageOpen}
            onOpenChange={setIsShareImageOpen}
          />
        </Suspense>
      )}
      {insightMounted && (
        <Suspense fallback={null}>
          <AiInsightDialog
            memo={memo}
            open={isInsightOpen}
            onOpenChange={setIsInsightOpen}
          />
        </Suspense>
      )}
    </>
  );
}
