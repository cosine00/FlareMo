import type { DataTaskDto } from "@flaremo/contracts";
import type { UseQueryResult } from "@tanstack/react-query";
import {
  DownloadIcon,
  Loader2Icon,
  RefreshCcwIcon,
  UploadIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { downloadExportJson } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDataTransfer } from "@/hooks/use-data-transfer";
import { useMemoMutations } from "@/hooks/use-memo-mutations";
import { type TranslationKey, useI18n } from "@/i18n";
import { SettingsSectionGroup } from "./apple-settings-ui";

type TransferPanelProps = {
  createExportIsPending: boolean;
  dataTasksQuery: UseQueryResult<{ tasks: DataTaskDto[] }, Error>;
  retryExportIsPending: boolean;
  t: (key: TranslationKey) => string;
  onCreateExport: () => void;
  onRetryExport: () => void;
};

/**
 * File in / file out. These were two icon buttons pinned to the bottom of the
 * sidebar — a navigation rail is the wrong place for an action that replaces
 * the whole workspace, and the export can take a while with no room for a
 * label. In settings they sit next to the task list that records them.
 */
function BackupSection() {
  const { t } = useI18n();
  const { handleMutationError, invalidateWorkspace } = useMemoMutations();
  const { handleExport, handleImportFile } = useDataTransfer({
    handleMutationError,
    invalidateWorkspace,
  });
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState<"export" | "import" | null>(null);

  const runExport = async () => {
    setBusy("export");
    try {
      await handleExport();
    } finally {
      setBusy(null);
    }
  };

  const runImport = async (file: File) => {
    setBusy("import");
    try {
      const text = await file.text();
      await handleImportFile(JSON.parse(text) as unknown);
    } catch {
      toast.error(t("toast.invalidImport"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <SettingsSectionGroup
      footer={t("transfer.backupDescription")}
      title={t("transfer.backup")}
    >
      <div className="flex flex-wrap items-center gap-2 p-3">
        <Button
          className="h-8 text-xs"
          disabled={busy !== null}
          onClick={() => void runExport()}
          size="sm"
          variant="outline"
        >
          {busy === "export" ? (
            <Loader2Icon
              className="size-3.5 animate-spin"
              data-icon="inline-start"
            />
          ) : (
            <DownloadIcon className="size-3.5" data-icon="inline-start" />
          )}
          {t("common.export")}
        </Button>
        <Button
          className="h-8 text-xs"
          disabled={busy !== null}
          onClick={() => inputRef.current?.click()}
          size="sm"
          variant="outline"
        >
          {busy === "import" ? (
            <Loader2Icon
              className="size-3.5 animate-spin"
              data-icon="inline-start"
            />
          ) : (
            <UploadIcon className="size-3.5" data-icon="inline-start" />
          )}
          {t("common.import")}
        </Button>
        <input
          accept="application/json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Reset first: picking the same file twice must fire again.
            event.target.value = "";
            if (file) void runImport(file);
          }}
          ref={inputRef}
          type="file"
        />
      </div>
    </SettingsSectionGroup>
  );
}

export function TransferPanel({
  createExportIsPending,
  dataTasksQuery,
  retryExportIsPending,
  t,
  onCreateExport,
  onRetryExport,
}: TransferPanelProps) {
  return (
    <div className="flex flex-col gap-5">
      <BackupSection />
      <SettingsSectionGroup
        title={
          <div className="flex items-center justify-between">
            <span>{t("transfer.title")}</span>
            <Button
              disabled={createExportIsPending}
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={onCreateExport}
            >
              {createExportIsPending ? (
                <Loader2Icon
                  className="animate-spin size-3.5"
                  data-icon="inline-start"
                />
              ) : (
                <DownloadIcon className="size-3.5" data-icon="inline-start" />
              )}
              {t("transfer.newExport")}
            </Button>
          </div>
        }
      >
        {dataTasksQuery.isLoading ? (
          <div className="p-4">
            <Skeleton className="h-16 w-full" />
          </div>
        ) : dataTasksQuery.isError ? (
          <div className="p-4 text-sm text-destructive">
            {t("transfer.loadFailed")}
          </div>
        ) : dataTasksQuery.data?.tasks.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            {t("transfer.empty")}
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-border/40">
            {dataTasksQuery.data?.tasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between gap-3 px-3.5 py-3 transition-colors hover:bg-accent/20"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">
                      {task.kind === "export"
                        ? t("transfer.export")
                        : t("transfer.import")}
                    </p>
                    <Badge
                      variant={
                        task.status === "succeeded"
                          ? "secondary"
                          : task.status === "failed"
                            ? "destructive"
                            : "outline"
                      }
                    >
                      {t(`transfer.status.${task.status}`)}
                    </Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground mt-0.5">
                    {task.phase}
                  </p>
                  {task.status === "failed" && task.error_message && (
                    <p className="mt-1 line-clamp-2 text-xs text-destructive">
                      {task.error_message}
                    </p>
                  )}
                  {task.progress_total > 0 && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-[width]"
                          style={{
                            width: `${Math.min(100, Math.round((task.progress_done / task.progress_total) * 100))}%`,
                          }}
                        />
                      </div>
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        {task.progress_done}/{task.progress_total}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {task.status === "succeeded" && task.kind === "export" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() =>
                        void downloadExportJson(task.id).then((blob) => {
                          const url = URL.createObjectURL(blob);
                          const anchor = document.createElement("a");
                          anchor.href = url;
                          anchor.download = `flaremo-export-${task.id}.json`;
                          anchor.click();
                          setTimeout(() => URL.revokeObjectURL(url), 1000);
                        })
                      }
                    >
                      <DownloadIcon
                        data-icon="inline-start"
                        className="size-3.5"
                      />
                      {t("transfer.download")}
                    </Button>
                  )}
                  {task.status === "failed" && task.kind === "export" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      disabled={retryExportIsPending}
                      onClick={onRetryExport}
                    >
                      <RefreshCcwIcon
                        data-icon="inline-start"
                        className="size-3.5"
                      />
                      {t("transfer.retry")}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SettingsSectionGroup>
    </div>
  );
}
