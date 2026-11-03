import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./auth";

export type InsightReportSource = {
  index: number;
  memo: string;
  content: string;
  create_time: string;
};

export const insightReports = sqliteTable(
  "insight_reports",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    model: text("model").notNull(),
    perspective: text("perspective"),
    perspectiveLabel: text("perspective_label"),
    range: text("range").notNull(),
    tag: text("tag"),
    sources: text("sources", { mode: "json" })
      .$type<InsightReportSource[]>()
      .notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("insight_reports_user_created_idx").on(table.userId, table.createdAt),
  ],
);
