import { Agent } from "@mastra/core/agent";
import { DEFAULT_MODEL_ID, openrouter } from "../utils/openrouter";

export const transcribeAgent = new Agent({
	id: "transcribe-agent",
	name: "Transcribe Agent",
	instructions: "You are a helpful transcribe assistant.",
	model: openrouter.chat(DEFAULT_MODEL_ID),
});
