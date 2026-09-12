import { Mastra } from "@mastra/core";
import { PinoLogger } from "@mastra/loggers";
import { contextAgent } from "./agents/context-agent";
import { contextClassifierAgent } from "./agents/context-classifier-agent";
import { transcribeAgent } from "./agents/transcribe-agent";
import { weatherAgent } from "./agents/weather-agent";
import { inferenceRiskAgent } from "./firewall/inference-risk";
import { mastraStorage } from "./utils/storage";

export const mastra = new Mastra({
	storage: mastraStorage,
	agents: {
		weatherAgent,
		transcribeAgent,
		contextClassifierAgent,
		// P2a: registers one representative instance (F2's seeded demo owner,
		// Jordan Blake) for Mastra's dev server/playground. Real per-user
		// Context Agents are built on demand via `createContextAgent(owner)`
		// (see `./agents/context-agent.ts`) — e.g. by P2d's MCP exposure at
		// `/api/mcp/[userId]` or the negotiation flow — not read from this
		// registry, since a single registry key can't represent "one agent per
		// user."
		contextAgent,
		// P2b: registered alongside the other single-instance agents so
		// Mastra's dev server/playground can show it too — `checkInferenceRisk`
		// (firewall/inference-risk.ts) calls `inferenceRiskAgent.generate(...)`
		// directly, not via this registry, so this line isn't load-bearing for
		// the firewall to function, only for playground visibility (same
		// pattern as `contextClassifierAgent` above).
		inferenceRiskAgent,
	},
	logger: new PinoLogger({
		name: "Mastra",
		level: "info",
	}),
	// Optional: Add memory configuration if you have Upstash Redis
	// Uncomment and configure when ready to use persistent memory
	// memory: {
	//   provider: "upstash-redis",
	//   config: {
	//     url: process.env.UPSTASH_REDIS_REST_URL || "",
	//     token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
	//   },
	// },
});
