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

  const connect = /^\/(memos\.api\.v1\.(MemoService|AttachmentService))\/([^/]+)$/.exec(
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

async function responseHasAttachedMemo(response: Response): Promise<boolean> {
  const value = await responseJson(response);
  if (!isRecord(value)) return false;
  return typeof value.memo === "string" && value.memo.length > 0;
}

/**
 * Decide whether a successful write can change the public blog projection.
 * Creates are strict: JSON APIs must explicitly return PUBLIC. Updates also
 * trigger when visibility is explicitly changed, so PUBLIC -> PRIVATE removes
 * the old entry. Binary Connect writes are dispatched conservatively because
 * their response is protobuf, not inspectable JSON; the blog-side PUBLIC
 * allowlist remains the final privacy boundary.
 */
export async function shouldDispatchMemoBlogSync(
  request: Request,
  response: Response,
): Promise<boolean> {
  if (!response.ok) return false;
  const kind = classifyMemoWrite(request);
  if (!kind) return false;

  switch (kind) {
    case "create": {
      const value = await responseJson(response);
      return visibilityOf(value) === "PUBLIC";
    }
    case "connect-create": {
      if (
        !response.headers
          .get("content-type")
          ?.toLowerCase()
          .includes("json")
      ) {
        return true;
      }
      return visibilityOf(await responseJson(response)) === "PUBLIC";
    }
    case "update":
    case "connect-update":
      // The update may be PUBLIC -> PRIVATE/PROTECTED. Always refresh after
      // a successful update; the blog's strict PUBLIC filter decides what
      // remains visible. This also avoids trying to clone a request body that
      // the route handler has already consumed.
      return true;
    case "delete":
    case "restore":
    case "memo-attachments":
    case "connect-delete":
    case "connect-attachments":
    case "attachment-delete":
    case "connect-attachment-delete":
      return true;
    case "attachment-write":
    case "connect-attachment-write":
      return responseHasAttachedMemo(response);
    default:
      return false;
  }
}

type GitHubFetch = typeof fetch;

/**
 * Best-effort event trigger. The workflow always pulls the full Memo list, so
 * the request deliberately carries no Memo content. The daily GitHub schedule
 * is the recovery path if GitHub is temporarily unavailable.
 */
export async function dispatchMemoBlogSync(
  env: FlareMoEnv,
  request: Request,
  response: Response,
  fetcher: GitHubFetch = fetch,
): Promise<boolean> {
  const token = env.FLAREMO_MEMO_SYNC_GITHUB_TOKEN?.trim();
  if (!token) return false;
  if (!(await shouldDispatchMemoBlogSync(request, response))) return false;

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
        body: JSON.stringify({ ref }),
        signal: controller.signal,
      });
      if (result.ok) {
        console.info(
          JSON.stringify({
            message: "memo blog sync dispatched",
            repository,
            ref,
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
