import { Hono } from "hono";
import { MAX_ATTACHMENT_BYTES } from "../../attachment-http";
import { getRequestContext, type HonoBindings } from "../../context";
import { jsonError } from "../../http";

/**
 * Local customization: publish images to the owner's public image bed.
 *
 * The stock upload path writes to the private attachment store and returns a
 * `/file/attachments/...` reference the app serves behind auth. That keeps a
 * private memo private, but a public memo's image then can't be reused by the
 * Hugo blog — different host, different URL, auth required. This endpoint
 * writes to the R2 bucket bound as `IMAGES`, which is already published at
 * `FLAREMO_IMAGE_BED_URL`, so the returned URL is the same one the blog
 * references and needs no rewrite step.
 *
 * Nothing is recorded in D1 on purpose: the bed has no per-memo lifecycle, and
 * deleting a memo must not delete an asset the blog may still point at.
 */

const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  "image/avif": "avif",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/webp": "webp",
};

function extensionFor(contentType: string, filename: string): string {
  const fromType = CONTENT_TYPE_EXTENSIONS[contentType.toLowerCase()];
  if (fromType) return fromType;
  const match = /\.([a-z0-9]{2,5})$/i.exec(filename);
  return match?.[1]?.toLowerCase() ?? "bin";
}

/** `image/YYYY/MM/<readable-name>-<rand>.<ext>` — the bed's existing layout. */
function buildImageKey(filename: string, contentType: string): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const stem =
    filename
      .replace(/\.[^.]+$/, "")
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^[-.]+|-+$/g, "")
      .slice(0, 60) || "image";
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 6);
  return `image/${year}/${month}/${stem}-${suffix}.${extensionFor(contentType, filename)}`;
}

export function registerImageRoutes(app: Hono<HonoBindings>) {
  app.post("/images", async (c) => {
    try {
      // Resolving the request context is also the auth gate: it throws when the
      // caller has neither a session nor a token.
      await getRequestContext(c);

      const bucket = c.env.IMAGES;
      const publicBase = c.env.FLAREMO_IMAGE_BED_URL?.trim().replace(/\/+$/, "");
      if (!bucket || !publicBase) {
        return c.json(
          {
            error: {
              message:
                "Image bed is not configured (needs the IMAGES R2 binding and FLAREMO_IMAGE_BED_URL)",
            },
          },
          503,
        );
      }

      const formData = await c.req.formData();
      const file = formData.get("file");
      if (!(file instanceof File)) {
        return c.json({ error: { message: "file is required" } }, 400);
      }
      const contentType = (file.type || "").toLowerCase();
      if (!contentType.startsWith("image/")) {
        return c.json({ error: { message: "Only images are accepted" } }, 415);
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        return c.json(
          { error: { message: "Image exceeds the 25 MiB limit" } },
          413,
        );
      }

      const key = buildImageKey(file.name || "image", contentType);
      await bucket.put(key, file, {
        // The key carries a random suffix, so a given URL never changes
        // meaning; long-lived immutable caching is safe.
        httpMetadata: {
          contentType,
          cacheControl: "public, max-age=31536000, immutable",
        },
      });

      return c.json(
        {
          url: `${publicBase}/${key}`,
          key,
          size: file.size,
          content_type: contentType,
        },
        201,
      );
    } catch (error) {
      return jsonError(c, error);
    }
  });
}
