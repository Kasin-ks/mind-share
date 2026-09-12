import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { weatherTool } from "../tools/weather-tool";
import { DEFAULT_MODEL_ID, openrouter } from "../utils/openrouter";
import { mastraStorage } from "../utils/storage";

export const weatherAgent = new Agent({
	id: "weather-agent",
	name: "Weather Agent",
	instructions:
		"You are a helpful weather assistant. When users ask about weather, use the getWeather tool to fetch current conditions and provide a friendly summary. Always format temperature in Celsius.",
	model: openrouter.chat(DEFAULT_MODEL_ID),
	tools: {
		getWeather: weatherTool,
	},
	memory: new Memory({
		storage: mastraStorage,
		options: {
			lastMessages: 10,
		},
	}),
});
