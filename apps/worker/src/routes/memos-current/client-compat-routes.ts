import { memos, memoTags } from "@flaremo/db";
import {
  createMemoComment,
  getAuthBootstrapStatus,
  getDefaultMemoVisibility,
  listMemoComments,
  NotFoundError,
  setDefaultMemoVisibility,
} from "@flaremo/domain";
import { currentMemoToDto } from "@flaremo/memos";
import { and, count, eq, isNull } from "drizzle-orm";
import type { Hono } from "hono";
import {
  getOptionalRequestContext,
  getRequestContext,
  type HonoBindings,
} from "../../context";
import { currentJsonError } from "../../memos-compat/current-errors";
import { resolveMemoCreator } from "../../memos-compat/memo-creator";
import { normalizeMemoName } from "../../memos-compat/resource-names";
import {
  assertCurrentUserPath,
  currentMemoWithDetails,
  isLegacyWireRequest,
  parsePageSize,
  readCurrentJsonObject,
} from "./helpers";

/**
 * MoeMemos (mudkipme/MoeMemos) talks to the Memos gRPC-gateway REST surface
 * (GET /api/v1/instance/profile, user settings, :getStats, memo comments).
 * The connect dispatch covers the memo/attachment core, but these routes were
 * missing entirely, so the app failed on the very first login request with a
 * 404. Coverage here mirrors the Memos 0.27-0.31 wire shapes MoeMemos reads.
 */

/** MoeMemos only accepts 0.21.x (v0 wire) or 0.27.0-0.31.0 (v1 wire). */
const CLIENT_COMPAT_VERSION = "0.27.2";

/** Domain values to the Memos wire enum; LOCAL is the workspace tier. */
function visibilityToProto(value: unknown): "PRIVATE" | "LOCAL" | "PUBLIC" {
  if (value === "private") return "PRIVATE";
  if (value === "protected") return "LOCAL";
  return "PUBLIC";
}

export function registerClientCompatRoutes(app: Hono<HonoBindings>) {
  app.get("/instance/profile", async (c, next) => {
    if (isLegacyWireRequest(c)) return next();
    try {
      const context = await getOptionalRequestContext(c);
      const bootstrap = await getAuthBootstrapStatus(context.db);
      return c.json({
        version: CLIENT_COMPAT_VERSION,
        demo: false,
        instanceUrl: c.env.FLAREMO_PUBLIC_URL ?? new URL(c.req.url).origin,
        needsSetup: bootstrap.state !== "complete",
      });
    } catch (error) {
      return currentJsonError(c, error);
    }
  });

  app.get("/users/:user/settings/:setting", async (c, next) => {
    if (isLegacyWireRequest(c)) return next();
    try {
      const context = await getRequestContext(c);
      assertCurrentUserPath(c.req.param("user"), context.user.id);
      const setting = c.req.param("setting").toUpperCase();
      if (setting !== "GENERAL") {
        throw new NotFoundError(`Unsupported user setting: ${setting}`);
      }
      const visibility = await getDefaultMemoVisibility(
        context.db,
        context.user,
      );
      return c.json({
        name: `${context.user.id}/settings/GENERAL`,
        generalSetting: { memoVisibility: visibilityToProto(visibility) },
      });
    } catch (error) {
      return currentJsonError(c, error);
    }
  });

  app.patch("/users/:user/settings/:setting", async (c, next) => {
    if (isLegacyWireRequest(c)) return next();
    try {
      const context = await getRequestContext(c);
      assertCurrentUserPath(c.req.param("user"), context.user.id);
      const setting = c.req.param("setting").toUpperCase();
      if (setting !== "GENERAL") {
        throw new NotFoundError(`Unsupported user setting: ${setting}`);
      }
      const body = (await readCurrentJsonObject(c)) as Record<string, unknown>;
      const source = (body.userSetting ?? body) as Record<string, unknown>;
      const generalSetting = source.generalSetting as
        | Record<string, unknown>
        | undefined;
      const memoVisibility = generalSetting?.memoVisibility;
      if (typeof memoVisibility === "string" && memoVisibility.trim()) {
        await setDefaultMemoVisibility(
          context.db,
          context.user,
          memoVisibility,
        );
      }
      const visibility = await getDefaultMemoVisibility(
        context.db,
        context.user,
      );
      return c.json({
        name: `${context.user.id}/settings/GENERAL`,
        generalSetting: {
          memoVisibility: visibilityToProto(visibility),
        },
      });
    } catch (error) {
      return currentJsonError(c, error);
    }
  });

  app.get("/memos/:memo/comments", async (c, next) => {
    if (isLegacyWireRequest(c)) return next();
    try {
      const context = await getOptionalRequestContext(c);
      const memoName = normalizeMemoName(c.req.param("memo"));
      const result = await listMemoComments(
        context.db,
        context.user,
        memoName,
        {
          pageSize: parsePageSize(c.req.query("pageSize"), 50),
          pageToken: c.req.query("pageToken"),
        },
      );
      return c.json({
        memos: await Promise.all(
          result.memos.map(async (memo) =>
            currentMemoToDto(memo, await resolveMemoCreator(context, memo)),
          ),
        ),
        ...(result.nextPageToken
          ? { nextPageToken: result.nextPageToken }
          : {}),
      });
    } catch (error) {
      return currentJsonError(c, error);
    }
  });

  app.post("/memos/:memo/comments", async (c, next) => {
    if (isLegacyWireRequest(c)) return next();
    try {
      const body = (await readCurrentJsonObject(c)) as Record<string, unknown>;
      const content =
        typeof body.content === "string" ? body.content : undefined;
      const context = await getRequestContext(c);
      const comment = await createMemoComment(
        context.db,
        context.user,
        normalizeMemoName(c.req.param("memo")),
        { content },
        { userLimits: context.userLimits, userId: context.user.id },
      );
      return c.json(await currentMemoWithDetails(context, comment));
    } catch (error) {
      return currentJsonError(c, error);
    }
  });
}

/**
 * GET /api/v1/users/{user}:getStats — MoeMemos derives the tag list from
 * `tagCount`. Hono cannot express the `:getStats` suffix as its own route, so
 * the `/users/:user` handler forwards here when the segment ends with it.
 */
export async function currentUserStatsResponse(
  c: Parameters<typeof getRequestContext>[0],
  userParam: string,
) {
  const context = await getRequestContext(c);
  assertCurrentUserPath(userParam, context.user.id);
  const tagRows = await context.db
    .select({ tag: memoTags.tag, total: count() })
    .from(memoTags)
    .innerJoin(memos, eq(memos.id, memoTags.memoId))
    .where(and(eq(memoTags.userId, context.user.id), isNull(memos.deletedAt)))
    .groupBy(memoTags.tag);
  const memoTotal = await context.db
    .select({ total: count() })
    .from(memos)
    .where(and(eq(memos.userId, context.user.id), isNull(memos.deletedAt)));
  return c.json({
    name: context.user.id,
    // Protobuf JSON encodes int64 as a decimal string.
    memos: String(memoTotal[0]?.total ?? 0),
    tagCount: Object.fromEntries(
      tagRows.map((row) => [row.tag, String(row.total)]),
    ),
  });
}
