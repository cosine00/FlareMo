import {
  getAttachmentById,
  getMemoByIdForViewer,
  getPublicArticleAttachment,
  getPublicShareByToken,
} from "@flaremo/domain";
import { attachments } from "@flaremo/db";
import { and, eq, isNull } from "drizzle-orm";
import { attachmentToDto, memoToDto, shareToDto } from "@flaremo/memos";
import { Hono } from "hono";
import { attachmentObjectResponse } from "../attachment-http";
import { getFlareMoDb, type HonoBindings } from "../context";
import { jsonError } from "../http";

export const publicApi = new Hono<HonoBindings>();

// Anonymous attachment access for public Memo RSS items. The memo visibility
// is checked on every request, so revoked public access also revokes its images.
publicApi.get("/memos/:memoId/attachments/:id/blob", async (c) => {
  try {
    const db = getFlareMoDb(c.env);
    const memo = await getMemoByIdForViewer(db, null, "memos/" + c.req.param("memoId"));
    if (memo.visibility !== "public" || memo.status !== "normal" || memo.deletedAt !== null) {
      return c.json({ error: { message: "Attachment not found" } }, 404);
    }
    const attachmentId = c.req.param("id").replace(/^attachments\//, "");
    const attachment = await db.select().from(attachments).where(and(
      eq(attachments.id, "attachments/" + attachmentId),
      eq(attachments.memoId, memo.id),
      eq(attachments.state, "ready"),
      isNull(attachments.deletedAt),
    )).get();
    if (!attachment) return c.json({ error: { message: "Attachment not found" } }, 404);
    const response = await attachmentObjectResponse({
      attachment,
      bucket: c.env.ATTACHMENTS,
      cacheControl: "public, max-age=60, must-revalidate",
      inlineRequested: true,
      thumbnailRequested: c.req.query("thumbnail") === "true",
      request: c.req.raw,
    });
    if (!response) return c.json({ error: { message: "Attachment object not found" } }, 404);
    return response;
  } catch (error) {
    return jsonError(c, error);
  }
});

publicApi.get("/shares/:token", async (c) => {
  try {
    const db = getFlareMoDb(c.env);
    const share = await getPublicShareByToken(db, c.req.param("token"));
    const shareDto = shareToDto(share.share);
    return c.json({
      share: {
        name: shareDto.name,
        id: shareDto.id,
        memo: shareDto.memo,
        expires_at: shareDto.expires_at,
        create_time: shareDto.create_time,
      },
      memo: memoToDto(share.memo, share.user, share.user.name),
      attachments: share.attachments.map((attachment) => {
        const blobUrl = `/api/public/shares/${share.share.token}/attachments/${attachment.id.replace(/^attachments\//, "")}/blob`;
        return {
          ...attachmentToDto(attachment),
          download_url: blobUrl,
          preview_url: `${blobUrl}?preview=1`,
          ...(attachment.payload?.thumbnail === true
            ? { thumbnail_url: `${blobUrl}?preview=1&thumbnail=true` }
            : {}),
        };
      }),
    });
  } catch (error) {
    return jsonError(c, error);
  }
});

publicApi.get("/shares/:token/attachments/:id/blob", async (c) => {
  try {
    const db = getFlareMoDb(c.env);
    const share = await getPublicShareByToken(db, c.req.param("token"));
    const attachment = await getAttachmentById(
      db,
      share.user,
      c.req.param("id"),
    );
    if (attachment.memoId !== share.memo.id) {
      return c.json({ error: { message: "Attachment not found" } }, 404);
    }

    const response = await attachmentObjectResponse({
      attachment,
      bucket: c.env.ATTACHMENTS,
      cacheControl: "public, max-age=3600",
      inlineRequested:
        c.req.query("preview") === "1" || c.req.query("thumbnail") === "true",
      thumbnailRequested: c.req.query("thumbnail") === "true",
      request: c.req.raw,
    });
    if (!response) {
      return c.json({ error: { message: "Attachment object not found" } }, 404);
    }
    return response;
  } catch (error) {
    return jsonError(c, error);
  }
});

// Article public blob: binding to the *published* article is the access
// check (mirrors the share-token contract; anonymous + cacheable).
publicApi.get("/articles/:slug/attachments/:id/blob", async (c) => {
  try {
    const db = getFlareMoDb(c.env);
    const { attachment } = await getPublicArticleAttachment(
      db,
      c.req.param("slug"),
      c.req.param("id"),
    );
    const response = await attachmentObjectResponse({
      attachment,
      bucket: c.env.ATTACHMENTS,
      cacheControl: "public, max-age=3600",
      inlineRequested:
        c.req.query("preview") === "1" || c.req.query("thumbnail") === "true",
      thumbnailRequested: c.req.query("thumbnail") === "true",
      request: c.req.raw,
    });
    if (!response) {
      return c.json({ error: { message: "Attachment object not found" } }, 404);
    }
    return response;
  } catch (error) {
    return jsonError(c, error);
  }
});
