import { describe, expect, it, vi } from "vitest";
import {
  completeInsightWithinBudget,
  DEFAULT_AI_OUTPUT_TOKENS,
  emptyInsightResponse,
  type InsightCompletion,
  type InsightMessage,
  readInsightCompletion,
  reasoningStarved,
  resolveInsightOutputTokens,
} from "./ai-insight";
import type { FlareMoEnv } from "./env";

const basePrompt: InsightMessage[] = [
  { role: "system", content: "系统提示" },
  { role: "user", content: "记录材料" },
];

function completion(
  overrides: Partial<InsightCompletion> = {},
): InsightCompletion {
  return { content: "", reasoningTokens: 0, ...overrides };
}

describe("insight output budget", () => {
  it("defaults to 8192 and honours FLAREMO_AI_MAX_TOKENS", () => {
    expect(resolveInsightOutputTokens({} as FlareMoEnv)).toBe(
      DEFAULT_AI_OUTPUT_TOKENS,
    );
    expect(
      resolveInsightOutputTokens({
        FLAREMO_AI_MAX_TOKENS: "16384",
      } as FlareMoEnv),
    ).toBe(16_384);
    expect(
      resolveInsightOutputTokens({
        FLAREMO_AI_MAX_TOKENS: "not-a-number",
      } as FlareMoEnv),
    ).toBe(DEFAULT_AI_OUTPUT_TOKENS);
  });

  it("clamps a too-small ceiling, which is what starves the answer", () => {
    expect(
      resolveInsightOutputTokens({
        FLAREMO_AI_MAX_TOKENS: "300",
      } as FlareMoEnv),
    ).toBe(4_096);
    expect(
      resolveInsightOutputTokens({
        FLAREMO_AI_MAX_TOKENS: "999999",
      } as FlareMoEnv),
    ).toBe(131_072);
  });
});

describe("readInsightCompletion", () => {
  it("keeps finish_reason and reasoning tokens for diagnostics", () => {
    expect(
      readInsightCompletion({
        choices: [
          {
            finish_reason: "length",
            message: { content: "", reasoning_content: "想了很久" },
          },
        ],
        usage: { completion_tokens_details: { reasoning_tokens: 8_192 } },
      }),
    ).toEqual({ content: "", finishReason: "length", reasoningTokens: 8_192 });
  });

  it("treats a missing payload as empty instead of throwing", () => {
    expect(readInsightCompletion({})).toEqual({
      content: "",
      finishReason: undefined,
      reasoningTokens: 0,
    });
  });
});

describe("reasoningStarved", () => {
  it("flags an empty answer cut off by the ceiling", () => {
    expect(
      reasoningStarved(
        completion({ finishReason: "length", reasoningTokens: 8_000 }),
        8_192,
      ),
    ).toBe(true);
  });

  it("flags a silent gateway that only reports token usage", () => {
    expect(
      reasoningStarved(completion({ reasoningTokens: 7_500 }), 8_192),
    ).toBe(true);
  });

  it("does not flag a genuinely empty answer", () => {
    expect(reasoningStarved(completion({ finishReason: "stop" }), 8_192)).toBe(
      false,
    );
  });

  it("never flags an answer that already has text", () => {
    expect(
      reasoningStarved(
        completion({ content: "## 标题", finishReason: "length" }),
        8_192,
      ),
    ).toBe(false);
  });
});

describe("completeInsightWithinBudget", () => {
  it("retries once with double the budget when reasoning eats the answer", async () => {
    const budgets: number[] = [];
    const result = await completeInsightWithinBudget(
      async (_messages, maxTokens) => {
        budgets.push(maxTokens);
        return budgets.length === 1
          ? completion({ finishReason: "length", reasoningTokens: 4_096 })
          : completion({ content: "## 洞察", finishReason: "stop" });
      },
      basePrompt,
      4_096,
    );
    expect(budgets).toEqual([4_096, 8_192]);
    expect(result.completion.content).toBe("## 洞察");
    expect(result.budget).toBe(8_192);
    expect(result.messages[0]?.content).toContain("缩短思考");
    expect(result.messages[1]).toEqual(basePrompt[1]);
  });

  it("stops escalating after two retries instead of looping", async () => {
    const budgets: number[] = [];
    const result = await completeInsightWithinBudget(
      async (_messages, maxTokens) => {
        budgets.push(maxTokens);
        return completion({
          finishReason: "length",
          reasoningTokens: maxTokens,
        });
      },
      basePrompt,
      4_096,
    );
    expect(budgets).toEqual([4_096, 8_192, 16_384]);
    expect(result.budget).toBe(16_384);
    expect(result.completion.content).toBe("");
  });

  it("gives up escalating once the request has run too long", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(0);
    let calls = 0;
    const result = await completeInsightWithinBudget(
      async () => {
        calls += 1;
        clock.mockReturnValue(200_000);
        return completion({
          finishReason: "length",
          reasoningTokens: 4_096,
        });
      },
      basePrompt,
      4_096,
    );
    clock.mockRestore();
    expect(calls).toBe(1);
    expect(result.budget).toBe(4_096);
  });

  it("does not retry when the model simply had nothing to say", async () => {
    let calls = 0;
    await completeInsightWithinBudget(
      async () => {
        calls += 1;
        return completion({ finishReason: "stop" });
      },
      basePrompt,
      8_192,
    );
    expect(calls).toBe(1);
  });
});

describe("emptyInsightResponse", () => {
  it("surfaces the provider fingerprint instead of a bare message", () => {
    const error = emptyInsightResponse(
      completion({ finishReason: "length", reasoningTokens: 8_192 }),
      8_192,
    );
    expect(error.status).toBe(502);
    expect(error.message).toContain("finish_reason=length");
    expect(error.message).toContain("reasoning_tokens=8192");
    expect(error.message).toContain("FLAREMO_AI_MAX_TOKENS");
  });
});
