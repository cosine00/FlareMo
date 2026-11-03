import {
  dailyReviewQuerySchema,
  randomMemoQuerySchema,
  relatedMemosQuerySchema,
  walkNextQuerySchema,
} from "@flaremo/contracts";
import {
  createInsightPreset,
  createInsightReport,
  deleteInsightPreset,
  deleteInsightReport,
  getMemoById,
  getRandomMemo,
  getWalkNextMemo,
  listDailyReviewMemos,
  listInsightPresets,
  listInsightReports,
  listRelatedMemos,
  semanticSearchMemos,
} from "@flaremo/domain";
import { zValidator } from "@hono/zod-validator";
import type { Hono } from "hono";
import { z } from "zod";
import { generateMemoInsight } from "../../ai-insight";
import { getRequestContext, type HonoBindings } from "../../context";
import {
  createEmbeddingProvider,
  createVectorIndex,
  memoSearchNamespaces,
} from "../../embedding";
import { jsonError } from "../../http";
import { parseExcludeParam, serializeMemosWithAttachments } from "./helpers";

export function registerReviewRoutes(app: Hono<HonoBindings>) {
  app.get("/insights", async (c) => {
    try {
      const { db, user } = await getRequestContext(c);
      return c.json({ reports: await listInsightReports(db, user) });
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.delete("/insights/:id", async (c) => {
    try {
      const { db, user } = await getRequestContext(c);
      await deleteInsightReport(db, user, `insights/${c.req.param("id")}`);
      return c.json({ deleted: true });
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.get("/insight-presets", async (c) => {
    try {
      const { db, user } = await getRequestContext(c);
      return c.json({ presets: await listInsightPresets(db, user) });
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.post("/insight-presets", async (c) => {
    try {
      const input = z
        .object({
          name: z.string().trim().min(1).max(40),
          prompt: z.string().trim().min(1).max(1_000),
        })
        .strict()
        .safeParse(await c.req.json().catch(() => null));
      if (!input.success)
        return c.json({ error: { message: "Invalid insight preset" } }, 400);
      const { db, user } = await getRequestContext(c);
      return c.json(await createInsightPreset(db, user, input.data), 201);
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.delete("/insight-presets/:id", async (c) => {
    try {
      const { db, user } = await getRequestContext(c);
      await deleteInsightPreset(db, user, c.req.param("id"));
      return c.json({ deleted: true });
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.get(
    "/review/daily",
    zValidator("query", dailyReviewQuerySchema),
    async (c) => {
      try {
        const { db, user } = await getRequestContext(c);
        const rows = await listDailyReviewMemos(db, user, c.req.valid("query"));
        return c.json({
          memos: await serializeMemosWithAttachments(db, user, rows),
        });
      } catch (error) {
        return jsonError(c, error);
      }
    },
  );

  app.post("/insights", async (c) => {
    try {
      const input = z
        .object({
          memoIds: z.array(z.string().trim().min(1).max(128)).min(1).max(100),
          perspective: z.string().trim().max(1_000).optional(),
          perspectiveLabel: z.string().trim().max(100).optional(),
          range: z.enum(["7d", "30d", "90d", "all"]),
          tag: z.string().trim().max(200).optional(),
        })
        .strict()
        .safeParse(await c.req.json().catch(() => null));
      if (!input.success)
        return c.json({ error: { message: "Invalid insight request" } }, 400);
      const { db, user } = await getRequestContext(c);
      const rows = [];
      for (const id of new Set(input.data.memoIds)) {
        rows.push(await getMemoById(db, user, `memos/${id}`));
      }
      const sources = rows.map((memo) => ({
        id: memo.id,
        content: memo.content,
        createTime: memo.createdAt,
      }));
      const insight = await generateMemoInsight(
        c.env,
        db,
        user,
        sources,
        input.data.perspective,
      );
      const report = await createInsightReport(db, user, {
        content: insight.content,
        model: insight.model,
        perspective: input.data.perspective,
        perspectiveLabel: input.data.perspectiveLabel,
        range: input.data.range,
        tag: input.data.tag,
        sources: sources.map((source, index) => ({
          index: index + 1,
          memo: source.id,
          content: source.content.slice(0, 240),
          create_time: source.createTime,
        })),
      });
      return c.json({
        ...insight,
        report,
        sources: report.sources,
      });
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.post("/memos/:id/insight", async (c) => {
    try {
      const input = z
        .object({
          scope: z.enum(["current", "related"]).default("current"),
          perspective: z.string().trim().max(500).optional(),
        })
        .strict()
        .safeParse(await c.req.json().catch(() => ({})));
      if (!input.success)
        return c.json({ error: { message: "Invalid insight request" } }, 400);
      const { db, user } = await getRequestContext(c);
      const memoName = `memos/${c.req.param("id")}`;
      const current = await getMemoById(db, user, memoName);
      const related =
        input.data.scope === "related"
          ? await listRelatedMemos(db, user, memoName, { limit: 5 })
          : [];
      const rows = [current, ...related.map((entry) => entry.memo)];
      const sources = rows.map((memo) => ({
        id: memo.id,
        content: memo.content,
        createTime: memo.createdAt,
      }));
      const insight = await generateMemoInsight(
        c.env,
        db,
        user,
        sources,
        input.data.perspective,
      );
      return c.json({
        ...insight,
        sources: sources.map((source, index) => ({
          index: index + 1,
          memo: source.id,
          content: source.content.slice(0, 240),
          create_time: source.createTime,
        })),
      });
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.get(
    "/review/random",
    zValidator("query", randomMemoQuerySchema),
    async (c) => {
      try {
        const { db, user } = await getRequestContext(c);
        const memo = await getRandomMemo(
          db,
          user,
          parseExcludeParam(c.req.valid("query").exclude),
        );
        const [serialized] = memo
          ? await serializeMemosWithAttachments(db, user, [memo])
          : [null];
        return c.json({ memo: serialized ?? null });
      } catch (error) {
        return jsonError(c, error);
      }
    },
  );

  app.get(
    "/review/walk",
    zValidator("query", walkNextQuerySchema),
    async (c) => {
      try {
        const { db, user } = await getRequestContext(c);
        const query = c.req.valid("query");
        const current = await getMemoById(db, user, query.memoId);
        const provider = createEmbeddingProvider(c.env);
        const index = createVectorIndex(c.env, "memo");
        let semanticIds: string[] = [];
        if (provider && index) {
          try {
            semanticIds = (
              await semanticSearchMemos(
                db,
                user,
                {
                  provider,
                  index,
                  namespaces: memoSearchNamespaces(c.env, user),
                },
                current.content,
                20,
              )
            ).map((hit) => hit.id);
          } catch {
            // Semantic infrastructure is optional; tag/relation/random remains
            // a usable degraded walk when an embedding call is unavailable.
          }
        }
        const { memo, via } = await getWalkNextMemo(
          db,
          user,
          query.memoId,
          parseExcludeParam(query.exclude),
          semanticIds,
        );
        const [serialized] = memo
          ? await serializeMemosWithAttachments(db, user, [memo])
          : [null];
        return c.json({ memo: serialized ?? null, via: memo ? via : null });
      } catch (error) {
        return jsonError(c, error);
      }
    },
  );

  app.get(
    "/memos/:id/related",
    zValidator("query", relatedMemosQuerySchema),
    async (c) => {
      try {
        const { db, user } = await getRequestContext(c);
        const related = await listRelatedMemos(
          db,
          user,
          `memos/${c.req.param("id")}`,
          c.req.valid("query"),
        );
        const serialized = await serializeMemosWithAttachments(
          db,
          user,
          related.map((entry) => entry.memo),
        );
        const byId = new Map(serialized.map((memo) => [memo.name, memo]));
        return c.json({
          memos: related.flatMap((entry) => {
            const memo = byId.get(entry.memo.id);
            return memo
              ? [
                  {
                    ...memo,
                    shared_tags: entry.sharedTags,
                    via_relation: entry.viaRelation,
                  },
                ]
              : [];
          }),
        });
      } catch (error) {
        return jsonError(c, error);
      }
    },
  );
}
