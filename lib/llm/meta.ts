import { z } from "zod";

// Single entry point for all Meta LLM calls. Nothing else in the app may call the model API directly.

export type TextPart = { type: "text"; text: string };
export type ImagePart = { type: "image_url"; image_url: { url: string } };
export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | Array<TextPart | ImagePart>;
};

export type ChatJsonOptions = {
  maxTokens?: number;
  temperature?: number;
  schemaRetries?: number;
};

export class MetaLLMError extends Error {
  cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "MetaLLMError";
    this.cause = cause;
  }
}

function getConfig() {
  const apiKey = process.env.MODEL_API_KEY;
  if (!apiKey) throw new MetaLLMError("Missing MODEL_API_KEY (server env).");
  const baseUrl = (process.env.META_MODEL_API_BASE_URL ?? "https://api.meta.ai/v1").replace(/\/$/, "");
  const model = process.env.META_MODEL ?? "muse-spark-1.3";
  return { apiKey, baseUrl, model };
}

type ChatCompletionResponse = {
  choices?: Array<{
    finish_reason?: string | null;
    message?: { content?: string | null };
  }>;
  error?: { message?: string };
};

async function postChatCompletions(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
  temperature: number,
): Promise<ChatCompletionResponse> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: Math.max(maxTokens, 4000),
      temperature,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new MetaLLMError(`Model API HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`);
  return (await res.json()) as ChatCompletionResponse;
}

function extractContent(data: ChatCompletionResponse): { text: string; cut: boolean } {
  const choice = data.choices?.[0];
  const text = choice?.message?.content ?? "";
  const cut = choice?.finish_reason === "length" || text.trim().length === 0;
  return { text, cut };
}

// Calls the model and returns schema-validated JSON. Retries once with doubled
// max_tokens when the output looks cut, plus up to `schemaRetries` re-asks on JSON/schema errors.
export async function chatJson<T>(
  schema: z.ZodType<T>,
  messages: ChatMessage[],
  opts: ChatJsonOptions = {},
): Promise<T> {
  const { apiKey, baseUrl, model } = getConfig();
  const schemaRetries = opts.schemaRetries ?? 2;
  const temperature = opts.temperature ?? 0.2;
  let maxTokens = opts.maxTokens ?? 4000;
  let grew = false;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= schemaRetries; attempt++) {
    const data = await postChatCompletions(baseUrl, apiKey, model, messages, maxTokens, temperature);
    if (data.error?.message) throw new MetaLLMError(`Model API error: ${data.error.message}`);
    const { text, cut } = extractContent(data);
    if (cut && !grew) {
      grew = true;
      maxTokens *= 2; // hidden reasoning eats into max_tokens; grow once and retry
      continue;
    }
    try {
      return schema.parse(JSON.parse(text));
    } catch (err) {
      lastError = err;
    }
  }
  throw new MetaLLMError("Model output failed schema validation after retries.", lastError);
}

export function userImageMessage(text: string, imageDataUrl: string): ChatMessage {
  return {
    role: "user",
    content: [{ type: "text", text }, { type: "image_url", image_url: { url: imageDataUrl } }],
  };
}
