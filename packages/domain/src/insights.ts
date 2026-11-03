import { type FlareMoDb, insightReports, type UserRow } from "@flaremo/db";
import { and, desc, eq } from "drizzle-orm";
import { NotFoundError } from "./errors";
import { getStoredSetting, upsertStoredSetting } from "./settings";

export type InsightPreset = { id: string; name: string; prompt: string };
const PRESETS_KEY = "ai.insightPresets";

export async function listInsightReports(db: FlareMoDb, user: UserRow) {
  return db.query.insightReports.findMany({
    where: eq(insightReports.userId, user.id),
    orderBy: [desc(insightReports.createdAt)],
    limit: 50,
  });
}

export async function createInsightReport(
  db: FlareMoDb,
  user: UserRow,
  input: Omit<
    typeof insightReports.$inferInsert,
    "id" | "userId" | "createdAt"
  >,
) {
  const row = {
    ...input,
    id: `insights/${crypto.randomUUID()}`,
    userId: user.id,
    createdAt: new Date().toISOString(),
  };
  await db.insert(insightReports).values(row);
  return row;
}

export async function deleteInsightReport(
  db: FlareMoDb,
  user: UserRow,
  id: string,
) {
  const result = await db
    .delete(insightReports)
    .where(and(eq(insightReports.id, id), eq(insightReports.userId, user.id)))
    .returning({ id: insightReports.id });
  if (!result.length) throw new NotFoundError("Insight report not found");
}

export async function listInsightPresets(db: FlareMoDb, user: UserRow) {
  const stored = await getStoredSetting(db, user, PRESETS_KEY);
  if (!Array.isArray(stored?.value)) return [];
  return stored.value.filter(
    (item): item is InsightPreset =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as InsightPreset).id === "string" &&
      typeof (item as InsightPreset).name === "string" &&
      typeof (item as InsightPreset).prompt === "string",
  );
}

export async function createInsightPreset(
  db: FlareMoDb,
  user: UserRow,
  input: { name: string; prompt: string },
) {
  const presets = await listInsightPresets(db, user);
  const preset = { id: crypto.randomUUID(), ...input };
  await upsertStoredSetting(
    db,
    user,
    PRESETS_KEY,
    [...presets, preset].slice(-20),
  );
  return preset;
}

export async function deleteInsightPreset(
  db: FlareMoDb,
  user: UserRow,
  id: string,
) {
  const presets = await listInsightPresets(db, user);
  const next = presets.filter((item) => item.id !== id);
  if (next.length === presets.length)
    throw new NotFoundError("Insight preset not found");
  await upsertStoredSetting(db, user, PRESETS_KEY, next);
}
