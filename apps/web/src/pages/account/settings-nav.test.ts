import { describe, expect, it } from "vitest";
import type { TranslationKey } from "@/i18n";
import { settingsNavGroups } from "./settings-nav";

const t = (key: TranslationKey) => key;

describe("settingsNavGroups", () => {
  it("keeps the admin group out of a plain member's dialog", () => {
    const groups = settingsNavGroups({
      isInstanceOwner: false,
      isTeamAdmin: false,
      showVoiceSettings: false,
      t,
    });

    expect(groups.map((group) => group.titleKey)).toEqual([
      "settings.group.preferences",
    ]);
    expect(
      groups.flatMap((group) => group.items.map((item) => item.id)),
    ).toEqual(["appearance", "uploads", "push", "usage", "transfer"]);
  });

  it("serves an administrator everything from the one dialog", () => {
    // The split into "settings" and "system management" used to hide the admin
    // sections behind a second entry point; the groups table is what every
    // entry point now shares, so its shape is the behaviour worth pinning.
    const groups = settingsNavGroups({
      isInstanceOwner: true,
      isTeamAdmin: true,
      showVoiceSettings: false,
      t,
    });

    expect(groups.map((group) => group.titleKey)).toEqual([
      "settings.group.preferences",
      "settings.group.admin",
    ]);
    expect(
      groups.flatMap((group) => group.items.map((item) => item.id)),
    ).toEqual([
      "appearance",
      "uploads",
      "push",
      "usage",
      "transfer",
      "memory",
      "team",
      "branding",
      "plugins",
      "integrations",
    ]);
  });

  it("only offers instance-wide sections to the instance owner", () => {
    const groups = settingsNavGroups({
      isInstanceOwner: false,
      isTeamAdmin: true,
      showVoiceSettings: true,
      t,
    });
    const ids = groups.flatMap((group) => group.items.map((item) => item.id));

    expect(ids).toContain("voice");
    expect(ids).toContain("team");
    expect(ids).not.toContain("branding");
    expect(ids).not.toContain("integrations");
  });
});
