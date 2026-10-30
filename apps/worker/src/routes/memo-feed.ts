import { memoRelations, memos, users } from "@flaremo/db";
import { getBranding } from "@flaremo/domain";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { Feed } from "feed";
import type { Context, Hono } from "hono";
import { getFlareMoDb, type HonoBindings } from "../context";
import { contentToPlainText, createSanitizedMarked, truncate } from "./markdown-render";

const FEED_SIZE = 50;
const FEED_CACHE_CONTROL = "public, max-age=300, must-revalidate";
const DEFAULT_MEMO_FEED_BLOG_URL = "https://hux.ink/bb/";

type MemoFeedEnv = Context<HonoBindings>["env"];

function publicOrigin(env: MemoFeedEnv, request: Request): string {
  return env.FLAREMO_PUBLIC_URL?.trim().replace(/\/+$/, "") || new URL(request.url).origin;
}

function memoBlogBaseUrl(env: MemoFeedEnv): string {
  const configured = env.FLAREMO_MEMO_FEED_BLOG_URL?.trim() || DEFAULT_MEMO_FEED_BLOG_URL;
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" && url.protocol !== "http:") return DEFAULT_MEMO_FEED_BLOG_URL;
    url.hash = "";
    return url.toString();
  } catch {
    return DEFAULT_MEMO_FEED_BLOG_URL;
  }
}

function memoItemUrl(base: string, id: string): string {
  const url = new URL(base);
  url.hash = "memo-" + id;
  return url.toString();
}

/** Rewrites only local Markdown attachment destinations; image-bed URLs remain unchanged. */
export function rewriteMemoFileUrls(content: string, memoId: string, origin: string): string {
  const base = origin.replace(/\/+$/, "");
  let inFence = false;
  return content.split("\n").map((line) => {
    if (/^\s*(?:\x60{3}|~{3})/.test(line)) {
      inFence = !inFence;
      return line;
    }
    if (inFence) return line;
    return line.replace(/(\]\(\/file\/attachments\/[^\s)]*)/g, (match) => {
      const id = /\/file\/attachments\/([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(match)?.[1];
      if (!id) return match;
      const query = match.includes("?") ? "?" + match.split("?").slice(1).join("?") : "";
      return "](" + base + "/api/public/memos/" + encodeURIComponent(memoId) +
        "/attachments/" + id + "/blob" + query;
    });
  }).join("\n");
}

export function registerMemoFeed(app: Hono<HonoBindings>): void {
  app.get("/memos.xml", async (c) => {
    const db = getFlareMoDb(c.env);
    const origin = publicOrigin(c.env, c.req.raw);
    const blogBaseUrl = memoBlogBaseUrl(c.env);
    let product = "FlareMo";
    try {
      product = (await getBranding(db)).product;
    } catch {
      // Keep syndication available if branding has not been configured.
    }

    const rows = await db.select({ memo: memos, authorName: users.name })
      .from(memos)
      .innerJoin(users, eq(memos.userId, users.id))
      .where(and(
        eq(memos.visibility, "public"),
        eq(memos.status, "normal"),
        isNull(memos.deletedAt),
        sql\`NOT EXISTS (
          SELECT 1 FROM \${memoRelations}
          WHERE \${memoRelations.memoId} = \${memos.id}
            AND \${memoRelations.type} = 'comment'
        )\`,
      ))
      .orderBy(desc(memos.createdAt), desc(memos.id))
      .limit(FEED_SIZE);

    const latestUpdatedAt = rows.reduce<string | undefined>(
      (latest, row) => !latest || row.memo.updatedAt > latest ? row.memo.updatedAt : latest,
      undefined,
    );
    const feed = new Feed({
      title: product + " Memo",
      description: product + " 的公开随手记录",
      id: origin + "/memos.xml",
      link: blogBaseUrl,
      language: "zh-CN",
      favicon: origin + "/brand/flaremo-mark-light-300.png",
      copyright: "© " + new Date().getFullYear() + " " + product,
      updated: latestUpdatedAt ? new Date(latestUpdatedAt) : new Date(0),
      generator: "FlareMo",
      feedLinks: { rss: origin + "/memos.xml" },
    });
    const marked = createSanitizedMarked({});
    for (const { memo, authorName } of rows) {
      const memoId = memo.id.replace(/^memos\//, "");
      const plain = contentToPlainText(memo.content).replace(/\s+/g, " ").trim();
      const payloadTitle = memo.payload?.property?.title;
      const title = typeof payloadTitle === "string" && payloadTitle.trim()
        ? payloadTitle.trim() : truncate(plain, 80) || "随手记";
      const tags = Array.isArray(memo.payload?.tags)
        ? memo.payload.tags.filter((tag): tag is string => typeof tag === "string" && !!tag.trim())
        : [];
      const html = marked.parse(rewriteMemoFileUrls(memo.content, memoId, origin), { async: false });
      const guid = "urn:flaremo:memo:" + memoId;
      feed.addItem({
        title,
        id: guid,
        link: memoItemUrl(blogBaseUrl, memoId),
        description: truncate(plain, 200),
        content: html,
        date: new Date(memo.updatedAt || memo.createdAt),
        published: new Date(memo.createdAt),
        author: [{ name: authorName || product }],
        category: tags.map((name) => ({ name })),
      });
    }
    return new Response(feed.rss2(), {
      headers: {
        "content-type": "application/rss+xml; charset=utf-8",
        "cache-control": FEED_CACHE_CONTROL,
      },
    });
  });
}
