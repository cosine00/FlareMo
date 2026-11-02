import type { MemoVisibility } from "@flaremo/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe2Icon } from "lucide-react";
import { toast } from "sonner";
import { getAccountPreferences, updateAccountPreferences } from "@/api";
import type { TranslationKey, TranslationParams } from "@/i18n";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { SettingsRow, SettingsSectionGroup } from "./apple-settings-ui";

const OPTIONS: Array<{ value: MemoVisibility; labelKey: TranslationKey }> = [
  { value: "public", labelKey: "settings.defaultVisibility.public" },
  { value: "protected", labelKey: "settings.defaultVisibility.protected" },
  { value: "private", labelKey: "settings.defaultVisibility.private" },
];

/**
 * The account's default visibility for new memos. It writes the same stored
 * row the Memos-compatible `settings/GENERAL` surface uses, so a choice made
 * here is what MoeMemos and every other client starts from too.
 */
export function DefaultVisibilitySection({
  t,
}: {
  t: (key: TranslationKey, params?: TranslationParams) => string;
}) {
  const queryClient = useQueryClient();
  const preferencesQuery = useQuery({
    queryKey: queryKeys.accountPreferences,
    queryFn: getAccountPreferences,
  });
  const mutation = useMutation({
    mutationFn: updateAccountPreferences,
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.accountPreferences, data);
      toast.success(t("settings.defaultVisibility.saved"));
    },
    onError: () => toast.error(t("toast.requestFailed")),
  });
  // No fallback highlight: until the preference resolves nothing is selected,
  // so the control never claims the account prefers a tier it does not.
  const current = preferencesQuery.data?.default_memo_visibility;

  return (
    <SettingsSectionGroup footer={t("settings.defaultVisibility.description")}>
      <SettingsRow
        icon={Globe2Icon}
        label={t("settings.defaultVisibility.title")}
        action={
          <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
            {OPTIONS.map((option) => {
              const selected = current === option.value;
              return (
                <button
                  aria-pressed={selected}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    selected
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                    (mutation.isPending || preferencesQuery.isLoading) &&
                      "pointer-events-none opacity-60",
                  )}
                  disabled={mutation.isPending || preferencesQuery.isLoading}
                  key={option.value}
                  onClick={() =>
                    mutation.mutate({ default_memo_visibility: option.value })
                  }
                  type="button"
                >
                  {t(option.labelKey)}
                </button>
              );
            })}
          </div>
        }
      />
    </SettingsSectionGroup>
  );
}
