import { apiRequest } from "./client";

export type AiSettings = { configured: boolean; model: string };
export type MemoInsight = {
  content: string;
  model: string;
  sources: Array<{
    index: number;
    memo: string;
    content: string;
    create_time: string;
  }>;
};

export function getAiSettings() {
  return apiRequest<AiSettings>("/api/app/admin/ai-settings", {
    cache: "no-store",
  });
}

export function updateAiSettings(model: string) {
  return apiRequest<AiSettings>("/api/app/admin/ai-settings", {
    method: "PUT",
    body: JSON.stringify({ model }),
  });
}

export function generateMemoInsight(
  memoId: string,
  input: { scope: "current" | "related"; perspective?: string },
) {
  return apiRequest<MemoInsight>(
    `/api/app/memos/${encodeURIComponent(memoId)}/insight`,
    { method: "POST", body: JSON.stringify(input) },
  );
}
