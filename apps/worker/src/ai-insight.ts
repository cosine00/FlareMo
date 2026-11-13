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

// Thinking models bill the hidden reasoning trace against `max_tokens`, so a
// small ceiling lets the model "think itself empty": the provider answers 200
// with an empty `content` and `finish_reason: "length"`. 3_000 was too tight
// for a 120k-character prompt, so the default now leaves room for both the
// reasoning trace and the report.
export const DEFAULT_AI_OUTPUT_TOKENS = 8_192;
const MIN_AI_OUTPUT_TOKENS = 4_096;
const MAX_AI_OUTPUT_TOKENS = 131_072;
// Escalating past this stops being a reliability fix and starts being an
// expensive way to paper over an over-long prompt.
const MAX_ESCALATED_OUTPUT_TOKENS = 32_768;
// Escalations are full regenerations, so a slow provider could otherwise keep
// the browser waiting for several minutes. Past this window the caller gets the
// diagnostic error instead of a third attempt.
const ESCALATION_WINDOW_MS = 180_000;

export type InsightMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type InsightCompletion = {
  content: string;
  finishReason?: string;
  reasoningTokens: number;
};

type InsightPayload = {
  choices?: Array<{
    finish_reason?: string;
    message?: { content?: string | null; reasoning_content?: string | null };
  }>;
  usage?: {
    completion_tokens?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
  };
};

export type InsightRequest = (
  messages: InsightMessage[],
  maxTokens: number,
) => Promise<InsightCompletion>;

export function resolveInsightOutputTokens(env: FlareMoEnv) {
  const configured = Number.parseInt(env.FLAREMO_AI_MAX_TOKENS ?? "", 10);
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_AI_OUTPUT_TOKENS;
  }
  return Math.min(
    Math.max(configured, MIN_AI_OUTPUT_TOKENS),
    MAX_AI_OUTPUT_TOKENS,
  );
}

export function readInsightCompletion(
  payload: InsightPayload,
): InsightCompletion {
  const choice = payload.choices?.[0];
  return {
    content: choice?.message?.content?.trim() ?? "",
    finishReason: choice?.finish_reason,
    reasoningTokens:
      payload.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
  };
}

// The fingerprint of a starved generation: no visible text, and either the
// provider admits the ceiling was hit or the reasoning trace alone consumed
// nearly the entire budget.
export function reasoningStarved(
  completion: InsightCompletion,
  maxTokens: number,
): boolean {
  if (completion.content) return false;
  if (completion.finishReason === "length") return true;
  return (
    completion.reasoningTokens > 0 &&
    completion.reasoningTokens >= maxTokens * 0.9
  );
}

export function emptyInsightResponse(
  completion: InsightCompletion,
  maxTokens: number,
) {
  const detail = [
    completion.finishReason ? `finish_reason=${completion.finishReason}` : null,
    completion.reasoningTokens > 0
      ? `reasoning_tokens=${completion.reasoningTokens}`
      : null,
    `max_tokens=${maxTokens}`,
  ]
    .filter(Boolean)
    .join(", ");
  return new DomainError(
    `AI provider returned an empty response (${detail}). The model likely spent the whole output budget on reasoning; shorten the perspective, send fewer materials, or raise FLAREMO_AI_MAX_TOKENS.`,
    502,
  );
}

// Retries with a larger ceiling when the first attempt was truncated inside
// the reasoning trace. Bounded to two escalations so a pathological prompt
// cannot turn into an open-ended, expensive generation loop.
export async function completeInsightWithinBudget(
  send: InsightRequest,
  messages: InsightMessage[],
  initialBudget: number,
) {
  let budget = initialBudget;
  let current = messages;
  const startedAt = Date.now();
  let completion = await send(current, budget);
  for (
    let escalation = 0;
    escalation < 2 &&
    reasoningStarved(completion, budget) &&
    Date.now() - startedAt < ESCALATION_WINDOW_MS;
    escalation += 1
  ) {
    budget = Math.min(budget * 2, MAX_ESCALATED_OUTPUT_TOKENS);
    current = [
      {
        role: "system",
        content: `${current[0]?.content ?? ""}\n\n补充要求：上一轮把输出额度消耗在思考上，正文没有产出。这一轮请缩短思考，把额度留给最终报告，直接完整写出结论。`,
      },
      ...current.slice(1),
    ];
    console.warn(
      "[ai-insight] output budget exhausted by reasoning, retrying",
      JSON.stringify({ budget, reasoningTokens: completion.reasoningTokens }),
    );
    completion = await send(current, budget);
  }
  return { completion, messages: current, budget };
}

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
    messages: InsightMessage[],
    maxTokens: number,
  ): Promise<InsightCompletion> => {
    const reasoningEffort = env.FLAREMO_AI_REASONING_EFFORT?.trim();
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
            max_tokens: maxTokens,
            // Only sent when configured: not every OpenAI-compatible gateway
            // accepts the field, and the default (provider-side thinking
            // level) is the safest fallback.
            ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
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
        return readInsightCompletion((await response.json()) as InsightPayload);
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
  const first = await completeInsightWithinBudget(
    request,
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    resolveInsightOutputTokens(env),
  );
  let content = first.completion.content;
  if (!content) {
    throw emptyInsightResponse(first.completion, first.budget);
  }
  let finishReason = first.completion.finishReason;
  // A provider may stop at its output-token ceiling mid-sentence. Continue at
  // most twice, keeping the same source numbering and avoiding an endless or
  // unexpectedly expensive generation loop.
  for (
    let attempt = 0;
    finishReason === "length" && attempt < 2;
    attempt += 1
  ) {
    const continuation = await request(
      [
        ...first.messages,
        { role: "assistant", content },
        {
          role: "user",
          content:
            "上一段因为长度限制被截断。请从被截断的位置直接续写，不要重复已有内容，并完整结束报告。",
        },
      ],
      first.budget,
    );
    if (!continuation.content) break;
    content += continuation.content;
    finishReason = continuation.finishReason;
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
