import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BrainCircuitIcon, Loader2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getAiSettings, updateAiSettings } from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n";
import { errorMessage } from "@/lib/error";
import { SettingsRow, SettingsSectionGroup } from "./apple-settings-ui";

export function AiSettingsCard() {
  const { t } = useI18n();
  const cache = useQueryClient();
  const query = useQuery({ queryKey: ["ai-settings"], queryFn: getAiSettings });
  const [model, setModel] = useState("");
  useEffect(() => {
    if (query.data?.model) setModel(query.data.model);
  }, [query.data?.model]);
  const mutation = useMutation({
    mutationFn: () => updateAiSettings(model),
    onSuccess: (value) => {
      cache.setQueryData(["ai-settings"], value);
      toast.success(t("ai.settings.saved"));
    },
    onError: (error) =>
      toast.error(errorMessage(error, t("ai.settings.error"))),
  });
  return (
    <SettingsSectionGroup
      title={t("ai.settings.title")}
      footer={t("ai.settings.secretHint")}
    >
      <SettingsRow
        icon={BrainCircuitIcon}
        label={t("ai.settings.status")}
        description={t("ai.settings.description")}
        value={
          query.data?.configured
            ? t("ai.settings.configured")
            : t("ai.settings.unconfigured")
        }
      />
      <SettingsRow
        label={t("ai.settings.model")}
        action={
          <div className="flex items-center gap-2">
            <Input
              aria-label={t("ai.settings.model")}
              className="h-8 w-44 sm:w-56"
              maxLength={128}
              value={model}
              onChange={(event) => setModel(event.target.value)}
            />
            <Button
              disabled={!model.trim() || mutation.isPending}
              size="sm"
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending && <Loader2Icon className="animate-spin" />}
              {t("common.save")}
            </Button>
          </div>
        }
      />
    </SettingsSectionGroup>
  );
}
