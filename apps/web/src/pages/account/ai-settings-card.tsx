import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BrainCircuitIcon, Loader2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getAiSettings, updateAiSettings } from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { useI18n } from "@/i18n";
import { errorMessage } from "@/lib/error";
import { SettingsRow, SettingsSectionGroup } from "./apple-settings-ui";

export function AiSettingsCard() {
  const { t } = useI18n();
  const cache = useQueryClient();
  const query = useQuery({ queryKey: ["ai-settings"], queryFn: getAiSettings });
  const [model, setModel] = useState("");
  const [memoUrlTemplate, setMemoUrlTemplate] = useState("");
  const [apiKey, setApiKey] = useState("");
  useEffect(() => {
    if (query.data?.model) setModel(query.data.model);
  }, [query.data?.model]);
  useEffect(() => {
    if (query.data?.memoUrlTemplate)
      setMemoUrlTemplate(query.data.memoUrlTemplate);
  }, [query.data?.memoUrlTemplate]);
  const mutation = useMutation({
    mutationFn: () =>
      updateAiSettings({
        model,
        memoUrlTemplate,
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      }),
    onSuccess: (value) => {
      cache.setQueryData(["ai-settings"], value);
      setApiKey("");
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
          <Input
            aria-label={t("ai.settings.model")}
            className="h-8 w-44 sm:w-56"
            maxLength={128}
            value={model}
            onChange={(event) => setModel(event.target.value)}
          />
        }
      />
      <SettingsRow
        label={t("ai.settings.memoUrlTemplate")}
        description={t("ai.settings.memoUrlTemplateHint")}
        action={
          <Input
            aria-label={t("ai.settings.memoUrlTemplate")}
            className="h-8 w-56 sm:w-80"
            maxLength={500}
            value={memoUrlTemplate}
            onChange={(event) => setMemoUrlTemplate(event.target.value)}
          />
        }
      />
      <SettingsRow
        label={t("ai.settings.apiKey")}
        action={
          <div className="flex items-center gap-2">
            <div className="w-44 sm:w-56">
              <PasswordInput
                aria-label={t("ai.settings.apiKey")}
                autoComplete="new-password"
                className="h-8"
                disabled={query.data?.source === "environment"}
                maxLength={1024}
                placeholder={
                  query.data?.source === "environment"
                    ? t("ai.settings.managedByEnvironment")
                    : (query.data?.apiKeyPreview ?? "sk-...")
                }
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
              />
            </div>
            <Button
              disabled={
                !model.trim() ||
                !memoUrlTemplate.includes("{id}") ||
                mutation.isPending
              }
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
