import {
  applyFlaremoMigrations,
  articles,
  attachments,
  createDb,
  memoRelations,
  memos,
  users,
} from "@flaremo/db";
import { eq } from "drizzle-orm";
import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
// Parity check against the web app's attachment-ref helpers (no imports, so
// the module loads directly).
import { extractReferencedAttachmentIds as webExtractRefs } from "../../web/src/lib/attachment-refs";
import app, { createFlareMoApp } from "./index";
import {
  rewriteArticleFileUrls,
  extractReferencedAttachmentIds as workerExtractRefs,
} from "./routes/article-page";
import { rewriteMemoFileUrls } from "./routes/memo-feed";

let mf: Miniflare;
let env: Env;

const SLUG = "hello-flaremo-article";

async function seedArticle(
  options: {
    status?: "draft" | "published";
    deleted?: boolean;
    suffix?: string;
  } = {},
) {
  const db = createDb(env.DB);
  const now = "2026-09-01T00:00:00.000Z";
  const suffix = options.suffix ? `-${options.suffix}` : "";
  const slug = `${SLUG}${suffix}`;
  const articleId = `articles/e2e-article${suffix}`;
  const attachmentId = `attachments/e2e-article-image${suffix}`;
  const userId = "users/e2e-article-owner";
  await db
    .insert(users)
    .values({
      id: userId,
      email: "owner@example.com",
      name: "Owner",
      status: "active",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
  await db.delete(attachments).where(eq(attachments.id, attachmentId));
  await db.delete(articles).where(eq(articles.id, articleId));
  await db.insert(articles).values({
    id: articleId,
    userId,
    slug,
    title: "我的第一篇中文文章",
    description: "用于 SEO 验证的文章描述。",
    content:
      "# 你好 FlareMo\n\n正文段落，含 **加粗**。\n\n```ts\nconst a = 1;\n```\n\n[危险链接](javascript:alert(1))\n\n![配图](/file/attachments/e2e-article-image/photo.png)",
    status: options.status ?? "published",
    publishedAt: options.status === "draft" ? null : now,
    createdAt: now,
    updatedAt: now,
    deletedAt: options.deleted ? now : null,
  });
  await db.insert(attachments).values({
    id: attachmentId,
    userId,
    articleId,
    r2Key: "articles/e2e-article-image",
    filename: "photo.png",
    contentType: "image/png",
    size: 100,
    state: "ready",
    etag: "e2e",
    payload: { width: 640, height: 480 },
    createdAt: now,
    updatedAt: now,
  });
}

function articleRequest(url = `https://flaremo.example/article/${SLUG}`) {
  return app.fetch(new Request(url), env);
}

async function seedMemoFeedRows() {
  const db = createDb(env.DB);
  const now = "2026-09-02T00:00:00.000Z";
  const userId = "users/e2e-article-owner";

  await db
    .insert(users)
    .values({
      id: userId,
      email: "owner@example.com",
      name: "Owner",
      status: "active",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();

  await db.insert(memos).values([
    {
      id: "memos/e2e-public-memo",
      userId,
      content: [
        "# Public memo",
        "",
        "![bed](https://img.hux.ink/test.webp)",
        "",
        "![upload](/file/attachments/e2e-image/photo.png)",
      ].join("\n"),
      visibility: "public",
      status: "normal",
      pinned: false,
      source: "web",
      payload: {
        tags: ["生活"],
        property: { title: "公开随手记" },
      },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    },
    {
      id: "memos/e2e-private",
      userId,
      content: "PRIVATE_SENTINEL",
      visibility: "private",
      status: "normal",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "memos/e2e-protected",
      userId,
      content: "PROTECTED_SENTINEL",
      visibility: "protected",
      status: "normal",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "memos/e2e-archived",
      userId,
      content: "ARCHIVED_SENTINEL",
      visibility: "public",
      status: "archived",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "memos/e2e-comment",
      userId,
      content: "COMMENT_SENTINEL",
      visibility: "public",
      status: "normal",
      createdAt: now,
      updatedAt: now,
    },
  ]);

  await db.insert(memoRelations).values({
    memoId: "memos/e2e-comment",
    relatedMemoId: "memos/e2e-public-memo",
    type: "comment",
    createdAt: now,
  });

  await env.ATTACHMENTS.put("memos/e2e-image", new Uint8Array([1, 2, 3]), {
    httpMetadata: { contentType: "image/png" },
  });
  await db.insert(attachments).values({
    id: "attachments/e2e-image",
    userId,
    memoId: "memos/e2e-public-memo",
    articleId: null,
    r2Key: "memos/e2e-image",
    filename: "photo.png",
    contentType: "image/png",
    size: 3,
    state: "ready",
    etag: "test",
    payload: {},
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
}

describe("Article page (standalone SEO HTML)", () => {
  beforeEach(async () => {
    mf = new Miniflare({
      script: "export default { fetch() { return new Response('ok') } }",
      modules: true,
      compatibilityDate: "2026-07-10",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: { DB: "flaremo-article-test" },
      r2Buckets: { ATTACHMENTS: "flaremo-attachments-article-test" },
    });

    const db = await mf.getD1Database("DB");
    const r2 = await mf.getR2Bucket("ATTACHMENTS");
    env = {
      DB: db,
      ATTACHMENTS: r2,
      ASSETS: {
        fetch: async () =>
          new Response("<!doctype html><title>FlareMo</title>", {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" },
          }),
      } as Fetcher,
      FLAREMO_PUBLIC_URL: "https://flaremo.example",
      FLAREMO_MEMO_FEED_BLOG_URL: "https://hux.ink/bb/",
      BETTER_AUTH_SECRET: "test-better-auth-secret-that-is-never-used-in-prod",
      FLAREMO_BOOTSTRAP_SECRET: "test-bootstrap-secret-never-used",
    } as Env;

    await applyFlaremoMigrations(db);
  });

  afterEach(async () => {
    await mf.dispose();
  });

  it("serves a zero-JS standalone document with complete article meta", async () => {
    await seedArticle();
    const response = await articleRequest();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("cache-control")).toContain("max-age=300");

    const html = await response.text();
    expect(html).toContain(
      '<link rel="canonical" href="https://flaremo.example/article/hello-flaremo-article" />',
    );
    // Title from the article's own field, not body truncation.
    expect(html).toContain("<title>我的第一篇中文文章</title>");
    expect(html).toContain('content="index, follow"');
    expect(html).toContain('<meta property="og:type" content="article" />');
    expect(html).toContain(
      '<meta property="article:published_time" content="2026-09-01T00:00:00.000Z" />',
    );
    expect(html).toContain(
      '<meta property="article:modified_time" content="2026-09-01T00:00:00.000Z" />',
    );
    expect(html).toContain("data-flaremo-article");
    expect(html).not.toContain('<div id="root">');
    expect(html).not.toContain("/assets/");
    expect(
      html.match(/<script(?! type="application\/ld\+json")/g) ?? [],
    ).toHaveLength(0);
  });

  it("renders markdown with sanitized heading ids and Shiki highlighting", async () => {
    await seedArticle();
    const html = await articleRequest().then((r) => r.text());
    // gfm-heading-id anchors
    expect(html).toContain('<h1 id="你好-flaremo">');
    // Shiki dual-theme output via CSS variables
    expect(html).toContain(
      'class="shiki shiki-themes github-light github-dark"',
    );
    expect(html).toContain("--shiki-light");
    // Sanitization mirrors the share page: raw HTML dropped, unsafe links
    // neutralized.
    expect(html).not.toContain("<em>原生HTML被丢弃</em>");
    expect(html).toContain('href="#blocked"');
  });

  it("rewrites body attachment refs to the anonymous blob contract", async () => {
    await seedArticle();
    const html = await articleRequest().then((r) => r.text());
    expect(html).toContain(
      '<img src="/api/public/articles/hello-flaremo-article/attachments/e2e-article-image/blob"',
    );
    expect(html).toContain('width="640" height="480"');
  });

  it("emits BlogPosting JSON-LD with the author and dates", async () => {
    await seedArticle();
    const html = await articleRequest().then((r) => r.text());
    expect(html).toContain('"@type":"BlogPosting"');
    expect(html).toContain('"headline":"我的第一篇中文文章"');
    expect(html).toContain('"author":{"@type":"Person","name":"Owner"}');
    expect(html).toContain('"datePublished":"2026-09-01T00:00:00.000Z"');
  });

  it("returns 404 + noindex for drafts, deleted, and unknown slugs", async () => {
    await seedArticle({ status: "draft" });
    const draftResponse = await articleRequest();
    expect(draftResponse.status).toBe(404);
    const draftHtml = await draftResponse.text();
    expect(draftHtml).toContain('content="noindex, nofollow"');
    expect(draftHtml).not.toContain("data-flaremo-article");

    await seedArticle({ status: "published", deleted: true });
    const deletedResponse = await articleRequest();
    expect(deletedResponse.status).toBe(404);

    const unknownResponse = await articleRequest(
      "https://flaremo.example/article/no-such-slug",
    );
    expect(unknownResponse.status).toBe(404);
  });

  it("lists published articles in sitemap-articles.xml with lastmod", async () => {
    await seedArticle();
    await seedArticle({ status: "draft", suffix: "draft" });
    const response = await app.fetch(
      new Request("https://flaremo.example/sitemap-articles.xml"),
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/xml");
    const xml = await response.text();
    expect(xml).toContain(
      "https://flaremo.example/article/hello-flaremo-article</loc>",
    );
    expect(xml).toContain("<lastmod>2026-09-01T00:00:00.000Z</lastmod>");
    expect((xml.match(/<url>/g) ?? []).length).toBe(1);
  });

  it("serves a full-content RSS feed for published articles", async () => {
    await seedArticle();
    const response = await app.fetch(
      new Request("https://flaremo.example/feed.xml"),
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/rss+xml",
    );
    const xml = await response.text();
    expect(xml).toContain("<title><![CDATA[我的第一篇中文文章]]></title>");
    expect(xml).toContain(
      "https://flaremo.example/article/hello-flaremo-article</link>",
    );
    // Full content: rendered HTML (h1 present), not a truncated excerpt.
    expect(xml).toContain("你好 FlareMo");
    expect(xml).toContain("Owner");
    // Image sources must be absolute inside a feed document.
    expect(xml).toContain(
      "https://flaremo.example/api/public/articles/hello-flaremo-article/attachments/e2e-article-image/blob",
    );
  });

  it("serves a public Memo RSS feed and excludes non-public memos", async () => {
    await seedMemoFeedRows();
    const response = await app.fetch(
      new Request("https://flaremo.example/memos.xml"),
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/rss+xml",
    );
    expect(response.headers.get("cache-control")).toContain("max-age=300");
    const xml = await response.text();

    expect(xml).toContain("公开随手记");
    expect(xml).toContain("https://hux.ink/bb/#memo-e2e-public-memo");
    expect(xml).toContain("https://img.hux.ink/test.webp");
    expect(xml).toContain(
      "https://flaremo.example/api/public/memos/e2e-public-memo/attachments/e2e-image/blob",
    );
    expect(xml).toContain("生活");
    for (const secret of [
      "PRIVATE_SENTINEL",
      "PROTECTED_SENTINEL",
      "ARCHIVED_SENTINEL",
      "COMMENT_SENTINEL",
    ]) {
      expect(xml).not.toContain(secret);
    }

    const imageUrl =
      "https://flaremo.example/api/public/memos/e2e-public-memo/attachments/e2e-image/blob";
    const image = await app.fetch(new Request(imageUrl), env);
    expect(image.status).toBe(200);
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );

    await createDb(env.DB)
      .update(memos)
      .set({ visibility: "private" })
      .where(eq(memos.id, "memos/e2e-public-memo"));
    expect((await app.fetch(new Request(imageUrl), env)).status).toBe(404);
  });

  it("rewrites local Markdown attachment URLs but leaves image-bed URLs intact", () => {
    const content = [
      "\x60\x60\x60",
      "![code](/file/attachments/private/photo.png)",
      "\x60\x60\x60",
      "![bed](https://img.hux.ink/a.webp)",
      "![upload](/file/attachments/image/photo.png?thumbnail=true)",
    ].join("\n");
    const result = rewriteMemoFileUrls(
      content,
      "memo-1",
      "https://flaremo.example",
    );

    expect(result).toContain("/file/attachments/private/photo.png");
    expect(result).toContain("https://img.hux.ink/a.webp");
    expect(result).toContain(
      "https://flaremo.example/api/public/memos/memo-1/attachments/image/blob?thumbnail=true",
    );
  });

  it("registers the route on any createFlareMoApp instance", async () => {
    await seedArticle();
    const isolated = createFlareMoApp();
    const response = await isolated.fetch(
      new Request(`https://flaremo.example/article/${SLUG}`),
      env,
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("data-flaremo-article");
  });
});

describe("Article file-URL rewriting (parity with share-page helpers)", () => {
  it("rewrites only markdown link destinations, fences skipped", () => {
    const content = [
      "```",
      "![code fence stays](/file/attachments/raw-id/photo.png)",
      "```",
      "![inline](/file/attachments/e2e-article-image/photo.png)",
      "[link](/file/attachments/e2e-article-image/photo.png)",
      "[queried](/file/attachments/e2e-article-image/photo.png?w=320)",
    ].join("\n");
    const rewritten = rewriteArticleFileUrls(content, "my-slug");
    expect(rewritten).toContain(
      "/api/public/articles/my-slug/attachments/e2e-article-image/blob",
    );
    expect(rewritten).toContain(
      "/api/public/articles/my-slug/attachments/e2e-article-image/blob?w=320)",
    );
    expect(rewritten).toContain("/file/attachments/raw-id/photo.png");
    // Referenced-id extraction agrees with the web helper's contract.
    const workerRefs = workerExtractRefs(content);
    const webRefs = webExtractRefs(content);
    expect(workerRefs).toEqual(webRefs);
  });
});
