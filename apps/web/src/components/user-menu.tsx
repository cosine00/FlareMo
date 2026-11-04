import {
  CheckIcon,
  ChevronDownIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SunIcon,
} from "lucide-react";
import type { CurrentFlareMoUser } from "@/api";
import { useTheme } from "@/components/theme-provider";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSignOut } from "@/hooks/use-sign-out";
import { useI18n } from "@/i18n";

// The sidebar's single identity affordance, flomo-style: the topbar shows
// only the member's name; email, settings, notifications and sign-out all live
// inside this menu. No logo, no avatars, no icon row.
export function UserMenu({
  user,
  onOpenSettings,
  onOpenSystemManagement,
}: {
  user?: CurrentFlareMoUser | null;
  onOpenSettings: () => void;
  onOpenSystemManagement: () => void;
}) {
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();

  const label = user
    ? user.name || user.username || user.email
    : t("auth.accountTitle");

  const handleSignOut = useSignOut();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label={label}
              className="relative h-7 max-w-full gap-1.5 px-1.5 sm:max-w-[14rem]"
              size="sm"
              variant="ghost"
            >
              {user ? (
                <>
                  <Avatar
                    className="size-4.5 shrink-0"
                    name={user.name || user.username}
                    size="xs"
                    src={user.avatar_url}
                  />
                  <span className="min-w-0 truncate font-medium">
                    {user.name || user.username || user.email}
                  </span>
                </>
              ) : (
                <>
                  <span
                    aria-hidden="true"
                    className="size-4.5 shrink-0 rounded-full bg-muted"
                  />
                  <span
                    aria-hidden="true"
                    className="h-4 w-20 rounded bg-muted"
                  />
                </>
              )}
              <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground" />
            </Button>
          }
        />
        <DropdownMenuContent align="start" className="w-64">
          {user && (
            <>
              <DropdownMenuLabel className="font-normal">
                <div className="flex items-center gap-2.5 py-0.5">
                  <Avatar
                    className="size-8 shrink-0"
                    name={user.name || user.username}
                    size="md"
                    src={user.avatar_url}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-sm text-foreground">
                      {user.name || user.username}
                    </p>
                    {user.email && (
                      <p className="truncate text-xs text-muted-foreground">
                        {user.email}
                      </p>
                    )}
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onClick={onOpenSettings}>
            <SettingsIcon />
            {t("auth.accountTitle")}
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              {theme === "light" ? (
                <SunIcon />
              ) : theme === "dark" ? (
                <MoonIcon />
              ) : (
                <MonitorIcon />
              )}
              <span className="min-w-0 flex-1 truncate">
                {t("theme.title")}
              </span>
              <span className="text-xs text-muted-foreground">
                {theme === "light"
                  ? t("theme.light")
                  : theme === "dark"
                    ? t("theme.dark")
                    : t("theme.system")}
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onClick={() => setTheme("system")}>
                <MonitorIcon />
                <span className="flex-1">{t("theme.system")}</span>
                {theme === "system" && <CheckIcon className="ml-auto" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("light")}>
                <SunIcon />
                <span className="flex-1">{t("theme.light")}</span>
                {theme === "light" && <CheckIcon className="ml-auto" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("dark")}>
                <MoonIcon />
                <span className="flex-1">{t("theme.dark")}</span>
                {theme === "dark" && <CheckIcon className="ml-auto" />}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          {(user?.role === "owner" || user?.role === "admin") && (
            <DropdownMenuItem onClick={onOpenSystemManagement}>
              <ShieldCheckIcon />
              {t("settings.group.admin")}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void handleSignOut()}>
            <LogOutIcon />
            {t("auth.signOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
