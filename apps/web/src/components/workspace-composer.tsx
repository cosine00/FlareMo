import type { MemoVisibility } from "@flaremo/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { createShare, getAccountPreferences } from "@/api";
import { MemoComposer } from "@/components/memo-composer";
import { useMemoMutations } from "@/hooks/use-memo-mutations";
import { useNewMemoCapture } from "@/hooks/use-new-memo-capture";
import { useI18n } from "@/i18n";
import {
  createArticleWithAttachments,
  MAX_ARTICLE_CONTENT_LENGTH,
} from "@/lib/article-submission";
import { focusComposerInput } from "@/lib/composer-focus";
import {
  enqueueMemoSubmission,
  flushQueuedMemoSubmissions,
  getNewMemoDraftId,
  isBrowserOnline,
  isMemoCaptureEmpty,
  type MemoCaptureInput,
} from "@/lib/local-memo-capture";
import { fileScheduledTasks } from "@/lib/memo-schedule";
import {
  shouldContinueQueuedSubmissionAfterFailure,
  shouldQueueAfterFailure,
  validateMemoCaptureSubmission,
} from "@/lib/memo-submission";
import { queryKeys } from "@/lib/query-keys";
import { stripResourceName } from "@/lib/utils";

// The default visibility belongs to the account, not to this browser: it is
// stored server-side so the web composer, the API and MoeMemos all start from
// the same tier. A per-note pick stays a one-shot override for that note. Until
// the preference query resolves, keep the open-web default the instance has
// always shipped with.
const FALLBACK_COMPOSER_VISIBILITY: MemoVisibility = "public";

// Keep draft updates and upload progress inside the capture boundary. This
// component stays mounted across workspace filters so drafts and offline
// synchronization survive a visit to the archive or trash.
export const WorkspaceComposer = memo(function WorkspaceComposer({
  visible,
  composeRequested,
  tags,
  captureAvailable,
}: {
  visible: boolean;
  composeRequested: boolean;
  tags?: Array<{ name: string; count: number }>;
  captureAvailable?: boolean;
}) {
  const { locale, t } = useI18n();
  const navigate = useNavigate({ from: "/" });
  const [newMemoDraftId] = useState(getNewMemoDraftId);
  const preferencesQuery = useQuery({
    queryKey: queryKeys.accountPreferences,
    queryFn: getAccountPreferences,
    staleTime: 5 * 60_000,
  });
  const preferredVisibility =
    preferencesQuery.data?.default_memo_visibility ??
    FALLBACK_COMPOSER_VISIBILITY;
  const capture = useNewMemoCapture({
    draftId: newMemoDraftId,
    initialVisibility: preferredVisibility,
  });
  const { createMemoAsync, isCreatingMemo, handleMutationError } =
    useMemoMutations();
  const queryClient = useQueryClient();
  // A scheduled memo files its to-dos as tasks once the memo exists. The
  // memo is the durable part: a task failure is reported, never rolled back
  // into a lost note. Returns the toast the send should show.
  const createMemoAndSchedule = useCallback(
    async (submission: MemoCaptureInput) => {
      const memo = await createMemoAsync(submission);
      // Local customization: a memo published as public gets its share link
      // right away, matching what the visibility dialog does when you flip an
      // existing memo to public. Best-effort on purpose — the note is already
      // saved, so a share failure must not turn the send into an error.
      if (submission.visibility === "public") {
        try {
          await createShare(memo.name);
        } catch {
          toast.error(t("toast.requestFailed"));
        }
      }
      if (!submission.schedule) return { memo, message: t("toast.saved") };
      try {
        const count = await fileScheduledTasks(
          memo.name,
          submission.content,
          submission.schedule,
        );
        void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
        void queryClient.invalidateQueries({ queryKey: ["projects"] });
        return {
          memo,
          message:
            count > 0 ? t("toast.scheduledTasks", { count }) : t("toast.saved"),
        };
      } catch {
        toast.error(t("toast.scheduleFailed"));
        return { memo, message: undefined };
      }
    },
    [createMemoAsync, queryClient, t],
  );
  const isQueueFlushing = useRef(false);
  const isQueueFlushPending = useRef(false);
  const isCaptureSubmitting = useRef(false);
  const restoredDraftNotified = useRef(false);
  const [isCaptureSubmissionPending, setIsCaptureSubmissionPending] =
    useState(false);

  // Following the space into a different corpus retargets an untouched draft.
  // A draft with content keeps the visibility its author already chose.
  const lastVisibilitySource = useRef(preferredVisibility);
  // biome-ignore lint/correctness/useExhaustiveDependencies: retarget on preference change, not on every draft keystroke; the capture object is stable across renders
  useEffect(() => {
    if (lastVisibilitySource.current === preferredVisibility) return;
    lastVisibilitySource.current = preferredVisibility;
    if (!isMemoCaptureEmpty(capture.draft)) return;
    capture.updateDraft((current) => ({
      ...current,
      visibility: preferredVisibility,
    }));
  }, [preferredVisibility]);

  const flushQueuedCaptures = useCallback(async () => {
    if (!isBrowserOnline()) return;
    // An "online" event that lands while a flush is running (e.g. the mount
    // flush) must schedule another pass instead of being swallowed.
    if (isQueueFlushing.current) {
      isQueueFlushPending.current = true;
      return;
    }

    isQueueFlushing.current = true;
    try {
      let submitted = 0;
      let failed = 0;
      do {
        isQueueFlushPending.current = false;
        const result = await flushQueuedMemoSubmissions(
          async (submission) => (await createMemoAndSchedule(submission)).memo,
          {
            shouldContinueAfterFailure:
              shouldContinueQueuedSubmissionAfterFailure,
          },
        );
        submitted += result.submittedIds.length;
        failed += result.failedIds.length;
      } while (isQueueFlushPending.current && isBrowserOnline());
      if (submitted > 0) {
        toast.success(t("toast.queueSynced"));
      }
      if (failed > 0) {
        toast.error(t("toast.queueNeedsAttention", { count: failed }));
      }
    } finally {
      isQueueFlushing.current = false;
    }
  }, [createMemoAndSchedule, t]);

  useEffect(() => {
    void flushQueuedCaptures();
    const handleOnline = () => void flushQueuedCaptures();
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [flushQueuedCaptures]);

  useEffect(() => {
    if (!capture.didRestoreStoredDraft || restoredDraftNotified.current) return;
    restoredDraftNotified.current = true;
    toast.success(t("toast.draftRestored"));
  }, [capture.didRestoreStoredDraft, t]);

  // The PWA "new note" shortcut lands on `/?compose=1`. Focus the composer and
  // strip the flag so a later reload does not steal focus again.
  useEffect(() => {
    if (!composeRequested || !visible) return;
    focusComposerInput();
    void navigate({
      replace: true,
      search: (current) => ({ ...current, compose: undefined }),
    });
  }, [composeRequested, navigate, visible]);

  const handleCaptureSubmit = async (input: MemoCaptureInput) => {
    if (isCaptureSubmitting.current) return;

    isCaptureSubmitting.current = true;
    setIsCaptureSubmissionPending(true);
    const submission = {
      ...input,
      content: input.content || t("toast.untitledAttachment"),
    };
    try {
      const validationError = validateMemoCaptureSubmission(submission, t);
      if (validationError) {
        handleMutationError(validationError);
        throw validationError;
      }

      if (!isBrowserOnline()) {
        const queued = await enqueueMemoSubmission(submission);
        if (!queued) {
          const error = new Error(t("toast.offlineStorageUnavailable"));
          handleMutationError(error);
          throw error;
        }
        await capture.discardDraft();
        toast.success(t("toast.queuedForSync"));
        return;
      }

      try {
        const { message } = await createMemoAndSchedule(submission);
        await capture.discardDraft();
        if (message) toast.success(message);
      } catch (error) {
        if (!shouldQueueAfterFailure(error)) {
          handleMutationError(error);
          throw error;
        }

        const queued = await enqueueMemoSubmission(submission);
        if (!queued) {
          handleMutationError(error);
          throw error;
        }
        await capture.discardDraft();
        toast.success(t("toast.queuedForSync"));
      }
    } finally {
      isCaptureSubmitting.current = false;
      setIsCaptureSubmissionPending(false);
    }
  };

  const handleArticleSubmit = async (input: MemoCaptureInput) => {
    if (isCaptureSubmitting.current) return;

    if (!isBrowserOnline()) {
      toast.error(t("composer.article.offlineBlocked"));
      return;
    }

    if (input.content.length > MAX_ARTICLE_CONTENT_LENGTH) {
      toast.error(t("composer.article.tooLong"));
      return;
    }

    isCaptureSubmitting.current = true;
    setIsCaptureSubmissionPending(true);
    try {
      const article = await createArticleWithAttachments(input, {
        title: input.title,
        lang: locale,
      });
      await capture.discardDraft();
      toast.success(t("toast.saved"));
      navigate({
        to: "/articles/$articleId/edit",
        params: { articleId: stripResourceName(article.id, "articles") },
      });
    } catch (error) {
      if (error instanceof Error && error.message === "article-too-long") {
        toast.error(t("composer.article.tooLong"));
      } else {
        toast.error(t("article.createFailed"));
      }
    } finally {
      isCaptureSubmitting.current = false;
      setIsCaptureSubmissionPending(false);
    }
  };

  if (!visible) return null;
  return (
    <MemoComposer
      draft={capture.draft}
      isPending={isCreatingMemo || isCaptureSubmissionPending}
      showVisibility
      tags={tags}
      captureAvailable={captureAvailable}
      onDraftChange={capture.updateDraft}
      onSubmit={handleCaptureSubmit}
      onSubmitArticle={handleArticleSubmit}
    />
  );
});
