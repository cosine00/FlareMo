import type { FlareMoDb, UserRow } from "@flaremo/db";
import { getStoredSetting, upsertStoredSetting } from "./settings";

export const AI_MODEL_SETTING_KEY = "ai.insightModel";
export const DEFAULT_AI_MODEL = "deepseek-chat";
export const AI_MEMO_URL_TEMPLATE_SETTING_KEY = "ai.memoUrlTemplate";
export const DEFAULT_AI_MEMO_URL_TEMPLATE = "https://hux.ink/m/{id}/";

export async function getAiInsightModel(db: FlareMoDb, user: UserRow) {
  const stored = await getStoredSetting(db, user, AI_MODEL_SETTING_KEY);
  return typeof stored?.value === "string" && stored.value.trim()
    ? stored.value.trim()
    : DEFAULT_AI_MODEL;
}

export async function setAiInsightModel(
  db: FlareMoDb,
  user: UserRow,
  model: string,
) {
  const normalized = model.trim();
  await upsertStoredSetting(db, user, AI_MODEL_SETTING_KEY, normalized);
  return normalized;
}

export async function getAiMemoUrlTemplate(db: FlareMoDb, user: UserRow) {
  const stored = await getStoredSetting(
    db,
    user,
    AI_MEMO_URL_TEMPLATE_SETTING_KEY,
  );
  return typeof stored?.value === "string" && stored.value.includes("{id}")
    ? stored.value
    : DEFAULT_AI_MEMO_URL_TEMPLATE;
}

export async function setAiMemoUrlTemplate(
  db: FlareMoDb,
  user: UserRow,
  template: string,
) {
  const normalized = template.trim();
  await upsertStoredSetting(
    db,
    user,
    AI_MEMO_URL_TEMPLATE_SETTING_KEY,
    normalized,
  );
  return normalized;
}
