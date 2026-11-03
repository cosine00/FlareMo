import type { FlareMoDb, UserRow } from "@flaremo/db";
import {
  DomainError,
  getAiInsightModel,
  getAiMemoUrlTemplate,
  readIntegrationConfig,
} from "@flaremo/domain";
import { z } from "zod";
import type { FlareMoEnv } from "./env";
import {
  integrationEncryptionSecret,
  maskSecret,
  openIntegrationCredentials,
} from "./integrations/secret-box";

export type InsightSource = { id: string; content: string; createTime: string };

const aiCredentialsSchema = z
  .object({ apiKey: z.string().trim().min(1).max(1024) })
  .strict();

export type AiInsightCredentials = z.infer<typeof aiCredentialsSchema>;

export function parseAiInsightCredentials(value: unknown) {
  return aiCredentialsSchema.parse(value);
}

async function resolveAiInsightCredentials(env: FlareMoEnv, db: FlareMoDb) {
  const environmentApiKey = env.DEEPSEEK_API_KEY?.trim();
  if (environmentApiKey) {
    return {
      apiKey: environmentApiKey,
      source: "environment" as const,
      preview: null,
      unreadable: false,
    };
  }

  const row = await readIntegrationConfig(db, "ai");
  if (!row?.enabled || !row.ciphertext) {
    return {
      apiKey: null,
      source: "none" as const,
      preview: null,
      unreadable: false,
    };
  }
  try {
    const credentials = await openIntegrationCredentials(
      "ai",
      integrationEncryptionSecret(env),
      row.ciphertext,
      parseAiInsightCredentials,
    );
    return {
      apiKey: credentials.apiKey,
      source: "database" as const,
      preview: maskSecret(credentials.apiKey),
      unreadable: false,
    };
  } catch (error) {
    console.warn("[ai-insight] stored credentials unreadable", error);
    return {
      apiKey: null,
      source: "none" as const,
      preview: null,
      unreadable: true,
    };
  }
}

export async function resolveAiInsightConfig(
  env: FlareMoEnv,
  db: FlareMoDb,
  user: UserRow,
) {
  const credentials = await resolveAiInsightCredentials(env, db);
  return {
    configured: Boolean(credentials.apiKey),
    model: await getAiInsightModel(db, user),
    memoUrlTemplate: await getAiMemoUrlTemplate(db, user),
    source: credentials.source,
    apiKeyPreview: credentials.preview,
    unreadable: credentials.unreadable,
  };
}

export async function generateMemoInsight(
  env: FlareMoEnv,
  db: FlareMoDb,
  user: UserRow,
  sources: InsightSource[],
  perspective?: string,
) {
  const { apiKey } = await resolveAiInsightCredentials(env, db);
  if (!apiKey) {
    throw new DomainError(
      "AI insight is not configured. Add an API key in settings first.",
      503,
    );
  }
  const model = await getAiInsightModel(db, user);
  const memoUrlTemplate = await getAiMemoUrlTemplate(db, user);
  const sourceCharacterLimit = Math.max(
    1_200,
    Math.floor(120_000 / sources.length),
  );
  const materials = sources
    .map(
      (source, index) =>
        `[${index + 1}] ${source.createTime}\n${source.content.slice(0, sourceCharacterLimit)}`,
    )
    .join("\n\n");
  const endpoint =
    env.FLAREMO_AI_BASE_URL?.trim() ||
    "https://api.deepseek.com/chat/completions";
  const systemPrompt =
    "你是个人记录的洞察伙伴。只依据提供的记录工作，不要逐条复述或泛泛总结。先给出一个简短标题，再提出 2 到 4 个有证据的发现，识别核心主题、隐藏联系或思维盲点，最后留下一个值得继续思考的问题或克制的下一步。不要诊断、说教、套话或虚构。使用与记录相同的主要语言，每个关键判断都用 [1] 这样的编号引用依据。必须完整写完每个句子和章节，不要突然中断。输出简洁 Markdown。";
  const userPrompt = `${perspective?.trim() ? `视角：${perspective.trim()}\n\n` : ""}${materials}`;
  const request = async (
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  ) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: "POST",
          signal: AbortSignal.timeout(120_000),
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model,
            temperature: 0.5,
            max_tokens: 3_000,
            messages,
          }),
        });
      } catch (error) {
        if (attempt < 2 && error instanceof DOMException) continue;
        throw new DomainError(
          "AI provider request timed out. Please retry.",
          504,
        );
      }
      if (response.ok) {
        return (await response.json()) as {
          choices?: Array<{
            finish_reason?: string;
            message?: { content?: string };
          }>;
        };
      }
      const detail = (await response.text()).slice(0, 500);
      if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 2) {
        await new Promise((resolve) =>
          setTimeout(resolve, 500 * (attempt + 1)),
        );
        continue;
      }
      throw new DomainError(
        `AI provider returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
        502,
      );
    }
    throw new DomainError("AI provider is temporarily unavailable.", 503);
  };
  const messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];
  const first = await request(messages);
  let content = first.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new DomainError("AI provider returned an empty response", 502);
  }
  let finishReason = first.choices?.[0]?.finish_reason;
  // A provider may stop at its output-token ceiling mid-sentence. Continue at
  // most twice, keeping the same source numbering and avoiding an endless or
  // unexpectedly expensive generation loop.
  for (
    let attempt = 0;
    finishReason === "length" && attempt < 2;
    attempt += 1
  ) {
    const continuation = await request([
      ...messages,
      { role: "assistant", content },
      {
        role: "user",
        content:
          "上一段因为长度限制被截断。请从被截断的位置直接续写，不要重复已有内容，并完整结束报告。",
      },
    ]);
    const next = continuation.choices?.[0]?.message?.content;
    if (!next?.trim()) break;
    content += next;
    finishReason = continuation.choices?.[0]?.finish_reason;
  }
  const sourceIds = sources.map((source) => source.id.replace(/^memos\//, ""));
  content = content.replace(
    /\[(\d{1,3})\](?!\()/g,
    (match, rawIndex: string) => {
      const index = Number(rawIndex);
      const id = sourceIds[index - 1];
      if (!id) return match;
      const url = memoUrlTemplate.replaceAll("{id}", encodeURIComponent(id));
      return `[${index}](${url} "insight-citation")`;
    },
  );
  return { content, model };
}
