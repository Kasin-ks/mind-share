import { createOpenAI } from "@ai-sdk/openai";

/**
 * OpenRouter exposes an OpenAI-compatible Chat Completions endpoint (not the
 * newer Responses API `@ai-sdk/openai`'s bare `openai(modelId)` factory
 * defaults to), so this is `createOpenAI` pointed at OpenRouter's base URL,
 * used via its `.chat(modelId)` model to hit `/chat/completions`. Avoids
 * adding a new provider package for a one-line base-URL swap.
 */
export const openrouter = createOpenAI({
	apiKey: process.env.OPENROUTER_API_KEY,
	baseURL: "https://openrouter.ai/api/v1",
});

/** OpenRouter model slug ("<provider>/<model>") used by every Mind Share
 * agent. Change here to switch models repo-wide. */
export const DEFAULT_MODEL_ID = "openai/gpt-4o-mini";
