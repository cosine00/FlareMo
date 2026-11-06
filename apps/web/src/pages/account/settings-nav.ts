import {
  ArrowDownUpIcon,
  BellRingIcon,
  BrainIcon,
  FileUpIcon,
  GaugeIcon,
  type LucideIcon,
  MicIcon,
  PaintbrushIcon,
  PuzzleIcon,
  SunMoonIcon,
  UsersIcon,
  WebhookIcon,
} from "lucide-react";
import type { TranslationKey } from "@/i18n";

export type SettingsSection =
  | "account"
  | "appearance"
  | "uploads"
  | "push"
  | "voice"
  | "usage"
  | "transfer"
  | "team"
  | "branding"
  | "plugins"
  | "integrations"
  | "memory";

export type NavItem = {
  id: SettingsSection;
  icon: LucideIcon;
  iconBg: string;
  label: string;
};

export type NavGroup = {
  titleKey?: "settings.group.preferences" | "settings.group.admin";
  items: NavItem[];
};

/** The sidebar's groups for the current viewer: the voice entry appears with
 *  the voice service, and the admin group with the team-admin role.
 *
 *  There used to be two dialogs — "settings" and "system management" — reached
 *  from different places and each showing half of this table. One dialog now
 *  shows everything the viewer may edit, because the split only ever meant
 *  "remember which entry point you used". */
export function settingsNavGroups({
  t,
  showVoiceSettings,
  isTeamAdmin,
  isInstanceOwner,
}: {
  t: (key: TranslationKey) => string;
  showVoiceSettings: boolean;
  isTeamAdmin: boolean;
  isInstanceOwner: boolean;
}): NavGroup[] {
  const preferences: NavGroup = {
    titleKey: "settings.group.preferences",
    items: [
      {
        icon: SunMoonIcon,
        iconBg: "bg-muted text-muted-foreground",
        id: "appearance",
        label: t("settings.nav.appearance"),
      },
      {
        icon: FileUpIcon,
        iconBg: "bg-muted text-muted-foreground",
        id: "uploads",
        label: t("settings.nav.uploads"),
      },
      {
        icon: BellRingIcon,
        iconBg: "bg-muted text-muted-foreground",
        id: "push",
        label: t("settings.nav.push"),
      },
      ...(showVoiceSettings
        ? [
            {
              icon: MicIcon,
              iconBg: "bg-muted text-muted-foreground",
              id: "voice" as const,
              label: t("settings.nav.voice"),
            },
          ]
        : []),
      {
        icon: GaugeIcon,
        iconBg: "bg-muted text-muted-foreground",
        id: "usage",
        label: t("auth.tab.usage"),
      },
      {
        icon: ArrowDownUpIcon,
        iconBg: "bg-muted text-muted-foreground",
        id: "transfer",
        label: t("settings.nav.transfer"),
      },
    ],
  };
  const administration: NavGroup = {
    titleKey: "settings.group.admin",
    items: [
      {
        icon: BrainIcon,
        iconBg: "bg-muted text-muted-foreground",
        id: "memory",
        label: t("nav.memory"),
      },
      {
        icon: UsersIcon,
        iconBg: "bg-muted text-muted-foreground",
        id: "team",
        label: t("auth.tab.admin"),
      },
      ...(isInstanceOwner
        ? [
            {
              icon: PaintbrushIcon,
              iconBg: "bg-muted text-muted-foreground",
              id: "branding" as const,
              label: t("auth.tab.branding"),
            },
            {
              icon: PuzzleIcon,
              iconBg: "bg-muted text-muted-foreground",
              id: "plugins" as const,
              label: t("auth.tab.plugins"),
            },
            {
              icon: WebhookIcon,
              iconBg: "bg-muted text-muted-foreground",
              id: "integrations" as const,
              label: t("settings.nav.integrations"),
            },
          ]
        : []),
    ],
  };

  if (!isTeamAdmin) return [preferences];
  return [preferences, administration];
}
