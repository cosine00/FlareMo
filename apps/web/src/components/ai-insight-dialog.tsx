import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BrainCircuitIcon, Loader2Icon } from "lucide-react";
import { useState } from "react";
import { generateMemoInsight, type Memo } from "@/api";
import { MemoContent } from "@/components/memo-content";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n";
import { errorMessage } from "@/lib/error";
import { stripResourceName } from "@/lib/utils";

export function AiInsightDialog({
  memo,
  open,
  onOpenChange,
}: {
  memo: Memo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const [scope, setScope] = useState<"current" | "related">("current");
  const [perspective, setPerspective] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      generateMemoInsight(memo.id, {
        scope,
        perspective: perspective.trim() || undefined,
      }),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <BrainCircuitIcon className="size-4 text-primary" />
            <DialogTitle>{t("ai.insight.title")}</DialogTitle>
          </div>
          <DialogDescription>{t("ai.insight.description")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={scope === "current" ? "default" : "outline"}
              onClick={() => setScope("current")}
            >
              {t("ai.insight.current")}
            </Button>
            <Button
              size="sm"
              variant={scope === "related" ? "default" : "outline"}
              onClick={() => setScope("related")}
            >
              {t("ai.insight.related")}
            </Button>
          </div>
          <Input
            maxLength={500}
            placeholder={t("ai.insight.perspective")}
            value={perspective}
            onChange={(event) => setPerspective(event.target.value)}
          />
          <Button
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <BrainCircuitIcon />
            )}
            {t("ai.insight.generate")}
          </Button>
          {mutation.isError && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {errorMessage(mutation.error, t("ai.insight.error"))}
            </p>
          )}
          {mutation.data && (
            <div className="flex max-h-[55vh] flex-col gap-3 overflow-y-auto rounded-xl border border-border/60 bg-muted/20 p-4">
              <MemoContent content={mutation.data.content} />
              <div className="border-t border-border/60 pt-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  {t("ai.insight.sources")}
                </p>
                <div className="flex flex-col gap-1.5">
                  {mutation.data.sources.map((source) => (
                    <Link
                      className="rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                      key={source.memo}
                      params={{
                        memoId: stripResourceName(source.memo, "memos"),
                      }}
                      to="/memo/$memoId"
                    >
                      [{source.index}] {source.content}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
