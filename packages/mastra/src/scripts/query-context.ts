import { db } from "@repo/database";
import { createContextAgent } from "../agents/context-agent";

/**
 * P2a standalone verification script.
 *
 * Instantiates a Context Agent for one real seeded user (F2: Jordan Blake,
 * `jordan.blake@acme-robotics.test`) and asks it a "moment 1" style question
 * from product specification's demo script — a normal, non-sensitive request — to
 * exercise `queryOwnContext` end-to-end against the live Postgres DB
 * (`context_items`, F1/P1b) and a real Gemini call.
 *
 * This is deliberately a SELF-query (no distinct requester identified in the
 * prompt — see `../agents/context-agent.ts`'s "WHO IS ASKING" instructions):
 * P2a's scope is the Context Agent + `queryOwnContext` tool, not the
 * negotiation flow or the firewall. A self-query exercises the exact tool
 * this track owns without depending on P2b's `checkDisclosurePolicy`, which
 * is still a throwing stub (see `../tools/check-disclosure-policy-tool.ts`)
 * — a third-party framing here would just demonstrate that stub throwing,
 * which isn't this script's job to verify.
 *
 * Looks Jordan's real `user.id` up from the live DB by email (F2's stable
 * seed identity) rather than hardcoding it, so this script stays correct
 * even after a re-seed — unlike `../agents/context-agent.ts`'s
 * `JORDAN_DEMO_OWNER`, which hardcodes the id purely for synchronous
 * registration in `../mastra.ts` (see that file's comment).
 *
 * Usage: `pnpm --filter @repo/mastra query:context` (needs
 * OPENROUTER_API_KEY set — see package.json's script for which env
 * file it loads, same as `classify:fixtures`).
 */

const JORDAN_EMAIL = "jordan.blake@acme-robotics.test";

/** "Moment 1" from product specification's demo script: a normal request that should
 * resolve to public/team content and get a full, non-redacted answer. Mirrors
 * F3's moment-1 fixture content (Jordan's Slack post about the retry-queue
 * fix), phrased as a natural question rather than quoting the fixture text
 * verbatim, so this genuinely exercises the agent's retrieval + reasoning
 * rather than just echoing a known string back. */
const MOMENT_1_QUESTION =
	"What's the latest status on the billing webhooks retry-queue fix — did it ship, and did it help?";

async function main() {
	console.log(`Looking up seeded user "${JORDAN_EMAIL}"...`);
	const jordan = await db.query.user.findFirst({
		where: (user, { eq }) => eq(user.email, JORDAN_EMAIL),
	});
	if (!jordan) {
		throw new Error(
			`User not found for email "${JORDAN_EMAIL}" — run the seed script (F2, "pnpm --filter @repo/scripts seed") first.`,
		);
	}
	console.log(`Found user id=${jordan.id} name=${jordan.name}`);

	const agent = createContextAgent({
		id: jordan.id,
		name: jordan.name,
		email: jordan.email,
	});

	console.log(`\nQuestion (self-query, "moment 1"): ${MOMENT_1_QUESTION}\n`);

	const result = await agent.generate([
		{ role: "user", content: MOMENT_1_QUESTION },
	]);

	console.log("=== Agent answer ===");
	console.log(result.text);

	console.log("\n=== Tool calls ===");
	const toolCalls = result.toolCalls;
	if (!toolCalls || toolCalls.length === 0) {
		console.log(
			"(none — the agent answered without calling queryOwnContext, which would be unexpected for this question)",
		);
	} else {
		for (const call of toolCalls) {
			console.log(
				`- ${call.payload.toolName}(${JSON.stringify(call.payload.args)})`,
			);
		}
	}

	console.log("\n=== Tool results (truncated) ===");
	const toolResults = result.toolResults;
	for (const toolResult of toolResults ?? []) {
		const json = JSON.stringify(toolResult.payload.result);
		console.log(
			`- ${toolResult.payload.toolName}: ${json.length > 500 ? `${json.slice(0, 500)}…` : json}`,
		);
	}
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error("query-context script crashed:", err);
		console.error(
			"\nIf this is an auth/401/403-shaped error from the model provider, " +
				"OPENROUTER_API_KEY is missing or invalid in the env file " +
				"this script loaded — see product specification's P1c/P2a notes (same blocker, " +
				"same verification discipline: confirm it's a real upstream rejection, " +
				"not a code bug, before concluding the agent itself is broken).",
		);
		process.exitCode = 1;
	});
