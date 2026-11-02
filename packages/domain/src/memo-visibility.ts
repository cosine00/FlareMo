import type { MemoVisibility } from "@flaremo/contracts";
import type { FlareMoDb, UserRow } from "@flaremo/db";
import { ValidationError } from "./errors";
import { getStoredSetting, upsertStoredSetting } from "./settings";

/**
 * One key, two front ends: the Memos-compatible `users/{id}/settings/GENERAL`
 * surface (what MoeMemos reads and writes) and the FlareMo account API share
 * this row, so a preference set on the phone applies in the web composer and
 * the other way round. Never introduce a second key for the same choice.
 */
export const DEFAULT_MEMO_VISIBILITY_KEY = "clients.defaultMemoVisibility";

/**
 * Accounts that never expressed a preference keep the open-web behaviour the
 * instance shipped with; only an explicit choice moves them off it.
 */
export const FALLBACK_MEMO_VISIBILITY: MemoVisibility = "public";

export function normalizeMemoVisibility(value: unknown): MemoVisibility | null {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase();
  if (raw === "PRIVATE") return "private";
  if (raw === "PROTECTED" || raw === "LOCAL") return "protected";
  if (raw === "PUBLIC") return "public";
  return null;
}

/** The account's default visibility, falling back when it never chose one. */
export async function getDefaultMemoVisibility(
  db: FlareMoDb,
  user: UserRow,
): Promise<MemoVisibility> {
  const stored = await getStoredSetting(db, user, DEFAULT_MEMO_VISIBILITY_KEY);
  return normalizeMemoVisibility(stored?.value) ?? FALLBACK_MEMO_VISIBILITY;
}

/** Persists the account default; invalid input is rejected, never silently kept. */
export async function setDefaultMemoVisibility(
  db: FlareMoDb,
  user: UserRow,
  value: unknown,
): Promise<MemoVisibility> {
  const normalized = normalizeMemoVisibility(value);
  if (!normalized) {
    throw new ValidationError(`Unsupported memo visibility: ${String(value)}`);
  }
  await upsertStoredSetting(db, user, DEFAULT_MEMO_VISIBILITY_KEY, normalized);
  return normalized;
}
