import {
  canManageInstanceIntegrations,
  ForbiddenError,
  setAiInsightModel,
} from "@flaremo/domain";
import { Hono } from "hono";
import { z } from "zod";
import { resolveAiInsightConfig } from "../ai-insight";
import { getBrowserRequestContext, type HonoBindings } from "../context";
import { jsonError } from "../http";

export const aiSettingsApi = new Hono<HonoBindings>();

aiSettingsApi.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  try {
    const { user } = await getBrowserRequestContext(c);
    if (!canManageInstanceIntegrations(user))
      throw new ForbiddenError("Owner access is required.");
    return await next();
  } catch (error) {
    return jsonError(c, error);
  }
});

aiSettingsApi.get("/", async (c) => {
  try {
    const { db, user } = await getBrowserRequestContext(c);
    return c.json(await resolveAiInsightConfig(c.env, db, user));
  } catch (error) {
    return jsonError(c, error);
  }
});

aiSettingsApi.put("/", async (c) => {
  try {
    const input = z
      .object({ model: z.string().trim().min(1).max(128) })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!input.success)
      return c.json({ error: { message: "Invalid AI model" } }, 400);
    const { db, user } = await getBrowserRequestContext(c);
    return c.json({
      configured: Boolean(c.env.DEEPSEEK_API_KEY?.trim()),
      model: await setAiInsightModel(db, user, input.data.model),
    });
  } catch (error) {
    return jsonError(c, error);
  }
});
