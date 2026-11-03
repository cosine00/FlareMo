import { apiRequest } from "./client";

export type AiSettings = {
  configured: boolean;
  model: string;
  memoUrlTemplate: string;
  source: "environment" | "database" | "none";
  apiKeyPreview: string | null;
  unreadable: boolean;
};
export type MemoInsight = {
  content: string;
  model: string;
  sources: Array<{
    index: number;
    memo: string;
    content: string;
    create_time: string;
  }>;
  report?: InsightReport;
};
export type InsightReport = {
  id: string;
  content: string;
  model: string;
  perspective: string | null;
  perspectiveLabel: string | null;
  range: "7d" | "30d" | "90d" | "all";
  tag: string | null;
  sources: MemoInsight["sources"];
  createdAt: string;
};
export type InsightPreset = { id: string; name: string; prompt: string };

export function getAiSettings() {
  return apiRequest<AiSettings>("/api/app/admin/ai-settings", {
    cache: "no-store",
  });
}

export function updateAiSettings(input: {
  model: string;
  memoUrlTemplate: string;
  apiKey?: string;
}) {
  return apiRequest<AiSettings>("/api/app/admin/ai-settings", {
    method: "PUT",
    body: JSON.stringify(input),
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

export function generateInsight(input: {
  memoIds: string[];
  perspective?: string;
  perspectiveLabel?: string;
  range: InsightReport["range"];
  tag?: string;
}) {
  return apiRequest<MemoInsight>("/api/app/insights", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listInsightReports() {
  return apiRequest<{ reports: InsightReport[] }>("/api/app/insights");
}

export function deleteInsightReport(id: string) {
  return apiRequest<{ deleted: true }>(
    `/api/app/insights/${encodeURIComponent(id.replace(/^insights\//, ""))}`,
    { method: "DELETE" },
  );
}

export function listInsightPresets() {
  return apiRequest<{ presets: InsightPreset[] }>("/api/app/insight-presets");
}

export function createInsightPreset(input: { name: string; prompt: string }) {
  return apiRequest<InsightPreset>("/api/app/insight-presets", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteInsightPreset(id: string) {
  return apiRequest<{ deleted: true }>(
    `/api/app/insight-presets/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}
