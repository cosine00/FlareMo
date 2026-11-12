import type { FlareMoEnv } from "./env";

const DEFAULT_REPOSITORY = "cosine00/hug00";
const DEFAULT_REF = "master";
const WORKFLOW_FILE = "fetch-memos.yml";
const GITHUB_API_VERSION = "2022-11-28";
const REQUEST_TIMEOUT_MS = 10_000;

type MemoWriteKind =
  | "create"
  | "update"
  | "delete"
  | "restore"
  | "memo-attachments"
  | "attachment-write"
  | "attachment-delete"
  | "connect-create"
  | "connect-update"
  | "connect-delete"
  | "connect-attachments"
  | "connect-attachment-write"
  | "connect-attachment-delete"
  | undefined;

/** What the blog should do with the memo named in the dispatch inputs. */
export type MemoBlogSyncAction = "upsert" | "remove";

export type MemoBlogSyncTarget = {
  action: MemoBlogSyncAction;
  /** Bare memo id (`1276`), the same value the blog's `static/memos.json` uses. */
  memoId?: string;
  kind: Exclude<MemoWriteKind, undefined>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function classifyMemoWrite(request: Request): MemoWriteKind {
  const method = request.method.toUpperCase();
  const pathname = new URL(request.url).pathname.replace(/\/+$/, "") || "/";

  if (pathname === "/api/app/memos") {
    return method === "POST" ? "create" : undefined;
  }
  if (/^\/api\/app\/memos\/[^/]+$/.test(pathname)) {
    if (method === "PATCH") return "update";
    if (method === "DELETE") return "delete";
  }

  if (pathname === "/api/v1/memos") {
    return method === "POST" ? "create" : undefined;
  }
  if (/^\/api\/v1\/memos\/[^/]+\/revisions\/restore$/.test(pathname)) {
    return method === "POST" ? "restore" : undefined;
  }
  if (/^\/api\/v1\/memos\/[^/]+\/attachments$/.test(pathname)) {
    return method === "PATCH" ? "memo-attachments" : undefined;
  }
  if (/^\/api\/v1\/memos\/[^/]+$/.test(pathname)) {
    if (method === "PATCH") return "update";
    if (method === "DELETE") return "delete";
  }

  if (pathname === "/api/v1/attachments" && method === "POST") {
    return "attachment-write";
  }
  if (/^\/api\/v1\/attachments\/[^/]+$/.test(pathname)) {
    if (method === "PATCH") return "attachment-write";
    if (method === "DELETE") return "attachment-delete";
  }

  const connect =
    /^\/(memos\.api\.v1\.(MemoService|AttachmentService))\/([^/]+)$/.exec(
      pathname,
    );
  if (!connect) return undefined;
  const service = connect[2];
  const rpc = connect[3];
  if (service === "MemoService") {
    if (rpc === "CreateMemo") return "connect-create";
    if (rpc === "UpdateMemo") return "connect-update";
    if (rpc === "DeleteMemo") return "connect-delete";
    if (rpc === "SetMemoAttachments") return "connect-attachments";
  } else {
    if (rpc === "CreateAttachment" || rpc === "UpdateAttachment") {
      return "connect-attachment-write";
    }
    if (rpc === "DeleteAttachment" || rpc === "BatchDeleteAttachments") {
      return "connect-attachment-delete";
    }
  }
  return undefined;
}

async function responseJson(response: Response): Promise<unknown> {
  if (!response.headers.get("content-type")?.toLowerCase().includes("json")) {
    return undefined;
  }
  try {
    return await response.clone().json();
  } catch {
    return undefined;
  }
}

function memoFromDto(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  if (isRecord(value.memo)) return value.memo;
  return value;
}

function visibilityOf(value: unknown): string {
  const memo = memoFromDto(value);
  return typeof memo?.visibility === "string"
    ? memo.visibility.trim().toUpperCase()
    : "";
}

function decodeSegment(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Reduce a memo resource name to the bare id the blog stores. Memo ids are
 * numeric or UUID-shaped, so anything else (a path, a share token) is rejected
 * instead of being forwarded to the workflow.
 */
function bareMemoId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const bare = trimmed.slice(trimmed.lastIndexOf("/") + 1);
  return /^[A-Za-z0-9._~-]{1,64}$/.test(bare) ? bare : undefined;
}

function memoIdFromPath(pathname: string): string | undefined {
  const match = /^\/api\/(?:v1|app)\/memos\/([^/]+)(?:\/.*)?$/.exec(pathname);
  const raw = match?.[1];
  return raw ? bareMemoId(decodeSegment(raw)) : undefined;
}

function memoIdFromDto(value: unknown): string | undefined {
  const memo = memoFromDto(value);
  if (!memo) return undefined;
  return bareMemoId(memo.name ?? memo.id);
}

async function responseAttachedMemoId(
  response: Response,
): Promise<string | undefined> {
  const value = await responseJson(response);
  if (!isRecord(value)) return undefined;
  return bareMemoId(value.memo);
}

/**
 * Decide whether a successful write can change the public blog projection, and
 * which memo it concerns.
 *
 * The dispatch carries no Memo content, only the id and the action, so the blog
 * can pull one memo instead of the whole timeline. When the id cannot be read
 * reliably (binary Connect responses, attachment writes whose response omits
 * the parent memo) the target carries no id and the blog falls back to a full
 * pull — a missing id must never be treated as "nothing changed".
 *
 * Creates are strict: JSON APIs must explicitly return PUBLIC. Updates also
 * trigger when visibility is explicitly changed, so PUBLIC -> PRIVATE removes
 * the old entry. Binary Connect writes are dispatched conservatively because
 * their response is protobuf, not inspectable JSON; the blog-side PUBLIC
 * allowlist remains the final privacy boundary.
 */
export async function memoBlogSyncTarget(
  request: Request,
  response: Response,
): Promise<MemoBlogSyncTarget | null> {
  if (!response.ok) return null;
  const kind = classifyMemoWrite(request);
  if (!kind) return null;
  const pathname = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
  const pathMemoId = memoIdFromPath(pathname);

  switch (kind) {
    case "create": {
      const value = await responseJson(response);
      if (visibilityOf(value) !== "PUBLIC") return null;
      return { action: "upsert", kind, memoId: memoIdFromDto(value) };
    }
    case "connect-create": {
      const isJson = Boolean(
        response.headers.get("content-type")?.toLowerCase().includes("json"),
      );
      if (isJson) {
        const value = await responseJson(response);
        if (visibilityOf(value) !== "PUBLIC") return null;
        return { action: "upsert", kind, memoId: memoIdFromDto(value) };
      }
      // Protobuf response: the memo is public in practice far more often than
      // not, so refresh the projection, but without an id we cannot narrow it.
      return { action: "upsert", kind };
    }
    case "update":
    case "connect-update":
      // The update may be PUBLIC -> PRIVATE/PROTECTED. Always refresh after
      // a successful update; the blog's strict PUBLIC filter decides what
      // remains visible. This also avoids trying to clone a request body that
      // the route handler has already consumed.
      return { action: "upsert", kind, memoId: pathMemoId };
    case "delete":
    case "connect-delete":
      return { action: "remove", kind, memoId: pathMemoId };
    case "restore":
    case "memo-attachments":
    case "connect-attachments":
      return { action: "upsert", kind, memoId: pathMemoId };
    case "attachment-write":
    case "connect-attachment-write": {
      const memoId = await responseAttachedMemoId(response);
      return memoId ? { action: "upsert", kind, memoId } : null;
    }
    case "attachment-delete":
    case "connect-attachment-delete":
      // The response of a delete rarely names the parent memo, so the blog has
      // to re-read the timeline to drop the attachment.
      return { action: "remove", kind };
    default:
      return null;
  }
}

export async function shouldDispatchMemoBlogSync(
  request: Request,
  response: Response,
): Promise<boolean> {
  return (await memoBlogSyncTarget(request, response)) !== null;
}

type GitHubFetch = typeof fetch;

/**
 * Best-effort event trigger. The request carries only the memo id and the
 * action, never Memo content or attachment URLs: the blog re-reads that one
 * memo with its own credentials. Without a resolvable id the dispatch falls
 * back to the daily full pull, so a dropped event is repaired, not lost.
 * The daily GitHub schedule is the recovery path if GitHub itself is
 * unavailable.
 */
export async function dispatchMemoBlogSync(
  env: FlareMoEnv,
  request: Request,
  response: Response,
  fetcher: GitHubFetch = fetch,
): Promise<boolean> {
  const token = env.FLAREMO_MEMO_SYNC_GITHUB_TOKEN?.trim();
  if (!token) return false;
  const target = await memoBlogSyncTarget(request, response);
  if (!target) return false;

  const repository =
    env.FLAREMO_MEMO_SYNC_GITHUB_REPOSITORY?.trim() || DEFAULT_REPOSITORY;
  const repositoryParts = repository.split("/");
  const owner = repositoryParts[0];
  const name = repositoryParts[1];
  if (!owner || !name || repositoryParts.length !== 2) {
    throw new Error("FLAREMO_MEMO_SYNC_GITHUB_REPOSITORY must be owner/repo");
  }
  const ref = env.FLAREMO_MEMO_SYNC_GITHUB_REF?.trim() || DEFAULT_REF;
  const endpoint =
    "https://api.github.com/repos/" +
    encodeURIComponent(owner) +
    "/" +
    encodeURIComponent(name) +
    "/actions/workflows/" +
    WORKFLOW_FILE +
    "/dispatches";

  // The workflow declares `memo_id` and `action` as optional inputs. Sending
  // them makes the run single-memo; omitting them keeps the full pull.
  const body = JSON.stringify({
    ref,
    ...(target.memoId
      ? { inputs: { memo_id: target.memoId, action: target.action } }
      : {}),
  });

  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const result = await fetcher(endpoint, {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
          "User-Agent": "FlareMo-BB-sync",
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
        },
        body,
        signal: controller.signal,
      });
      if (result.ok) {
        console.info(
          JSON.stringify({
            message: "memo blog sync dispatched",
            repository,
            ref,
            action: target.action,
            memoId: target.memoId ?? null,
            scope: target.memoId ? "single" : "full",
          }),
        );
        return true;
      }
      const detail = (await result.text().catch(() => "")).slice(0, 300);
      lastError = new Error(
        "GitHub workflow dispatch failed (" + result.status + "): " + detail,
      );
      if (result.status !== 429 && result.status < 500) break;
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("GitHub workflow dispatch failed");
}
