import type { FlareMoDb, UserRow } from "@flaremo/db";
import { DomainError, getAiInsightModel } from "@flaremo/domain";
import type { FlareMoEnv } from "./env";

export type InsightSource = { id: string; content: string; createTime: string };

export function aiInsightConfigured(env: FlareMoEnv) {
  return Boolean(env.DEEPSEEK_API_KEY?.trim());
}

export async function resolveAiInsightConfig(
  env: FlareMoEnv,
  db: FlareMoDb,
  user: UserRow,
) {
  return {
    configured: aiInsightConfigured(env),
    model: await getAiInsightModel(db, user),
  };
}

export async function generateMemoInsight(
  env: FlareMoEnv,
  db: FlareMoDb,
  user: UserRow,
  sources: InsightSource[],
  perspective?: string,
) {
  const apiKey = env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    throw new DomainError(
      "AI insight is not configured. Add DEEPSEEK_API_KEY first.",
      503,
    );
  }
  const model = await getAiInsightModel(db, user);
  const materials = sources
    .map(
      (source, index) =>
        `[${index + 1}] ${source.createTime}\n${source.content.slice(0, 8_000)}`,
    )
    .join("\n\n");
  const response = await fetch(
    env.FLAREMO_AI_BASE_URL?.trim() ||
      "https://api.deepseek.com/chat/completions",
    {
      method: "POST",
      signal: AbortSignal.timeout(30_000),
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.5,
        max_tokens: 1_200,
        messages: [
          {
            role: "system",
            content:
              "你是个人记录的洞察伙伴。只依据提供的记录，识别核心主题、隐藏联系或盲点，并提出一个值得继续思考的问题。不要诊断、说教或虚构。使用与记录相同的主要语言。引用依据时使用 [1] 这样的编号。输出简洁 Markdown。",
          },
          {
            role: "user",
            content: `${perspective?.trim() ? `视角：${perspective.trim()}\n\n` : ""}${materials}`,
          },
        ],
      }),
    },
  );
  if (!response.ok) {
    throw new DomainError(`AI provider returned HTTP ${response.status}`, 502);
  }
  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = body.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new DomainError("AI provider returned an empty response", 502);
  }
  return { content, model };
}
