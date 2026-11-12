import { DomainError } from "@flaremo/domain";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { HonoBindings } from "./context";
import { controlledErrorStatus } from "./memos-compat/errors";

export function jsonError(c: Context<HonoBindings>, error: unknown) {
  if (error instanceof DomainError) {
    return c.json(
      { error: { message: error.message } },
      toContentfulStatus(error.status),
    );
  }

  // Framework errors that carry their own 4xx — Better Auth's APIError is the
  // main source — are client mistakes with a caller-facing message, and
  // flattening them into "Internal server error" hid real causes like a
  // duplicate email. Only 4xx and only a non-empty message qualify; anything
  // else keeps the generic body so driver and internal detail cannot leak.
  const controlledStatus = controlledErrorStatus(error);
  if (controlledStatus !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return c.json(
        { error: { message } },
        toContentfulStatus(controlledStatus),
      );
    }
  }

  console.error(
    JSON.stringify({
      level: "error",
      message: "Unhandled request error",
      error: serializeError(error),
    }),
  );
  return c.json({ error: { message: "Internal server error" } }, 500);
}

function toContentfulStatus(status: number): ContentfulStatusCode {
  if (status >= 200 && status < 300) {
    return 400;
  }
  if (status === 101 || status === 204 || status === 205 || status === 304) {
    return 500;
  }
  if (status >= 100 && status <= 599) {
    return status as ContentfulStatusCode;
  }
  return 500;
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { value: String(error) };
}

/** The subset of the Cache API this module uses. */
type EdgeCache = {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
};

/**
 * `caches.default` is the Workers-only shared cache. The ambient DOM types
 * describe `caches` as a plain `CacheStorage` without it, and the Worker
 * handler also runs in Node during unit tests where no cache exists, so the
 * lookup stays defensive.
 */
function defaultEdgeCache(): EdgeCache | undefined {
  return (globalThis as { caches?: { default?: EdgeCache } }).caches?.default;
}

/**
 * Edge-cache a response that is identical for every reader.
 *
 * Only anonymous GETs qualify. A request carrying `Authorization` or `Cookie`
 * may resolve to a wider read scope, and caching its response would serve one
 * viewer's rows to the next visitor, so those always take the uncached path.
 * The check happens on the request headers before the handler runs, which also
 * means an author never reads a stale copy of their own list.
 *
 * The cache key is the full URL (query string included), so page tokens, tag
 * filters and page sizes stay separate entries.
 */
export async function cacheAnonymousResponse(
  c: Context<HonoBindings>,
  ttlSeconds: number,
  build: () => Promise<Response>,
): Promise<Response> {
  const request = c.req.raw;
  if (
    request.method !== "GET" ||
    request.headers.has("authorization") ||
    request.headers.has("cookie")
  ) {
    return build();
  }
  const cache = defaultEdgeCache();
  if (!cache) return build();

  const key = new Request(request.url, { method: "GET" });
  const hit = await cache.match(key);
  if (hit) return hit;

  const response = await build();
  if (!response.ok) return response;

  const copy = response.clone();
  const cacheable = new Response(copy.body, {
    status: copy.status,
    statusText: copy.statusText,
    headers: copy.headers,
  });
  cacheable.headers.set("Cache-Control", `public, max-age=${ttlSeconds}`);
  const write = cache.put(key, cacheable.clone()).catch(() => undefined);
  try {
    c.executionCtx.waitUntil(write);
  } catch {
    await write;
  }
  return cacheable;
}
