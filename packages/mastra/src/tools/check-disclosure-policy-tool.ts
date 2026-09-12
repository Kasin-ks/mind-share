import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { checkDisclosurePolicy } from "../firewall/check-disclosure-policy";

/**
 * ============================================================================
 * REAL — wraps P2b's Context Firewall (`../firewall/check-disclosure-policy.ts`).
 * ============================================================================
 *
 * This file started as a P2a-authored STUB whose `execute` always threw
 * `DisclosurePolicyNotImplementedError`, matching the exact
 * `checkDisclosurePolicy` signature from the Step 0 contracts
 * (`packages/api/modules/mind-share/types.ts`:
 * `CheckDisclosurePolicyInputSchema` / `DisclosurePolicyDecisionSchema`) so
 * the Context Agent's (P2a) tool list was complete and the codebase compiled
 * end-to-end before P2b's firewall logic existed.
 *
 * A follow-up review pass (see product specification's P2b follow-up notes, fix 1) made
 * this real: `execute` now calls P2b's `checkDisclosurePolicy` (RBAC mapping
 * + inference-risk check + the audit-log write — see that file for all of
 * it) instead of throwing. This is the file P2a's `context-agent.ts` (and
 * `packages/mastra/index.ts`'s barrel export) actually wires in as the
 * `checkDisclosurePolicy` tool — P2b's own `../firewall/` module never
 * exported a same-shaped Mastra tool object itself (it exported the plain
 * `checkDisclosurePolicy(claim, requesterId, purpose, ownerId)` function
 * this file's `execute` now calls).
 *
 * The `inputSchema`/`outputSchema` below are unchanged from the original
 * stub, per the hand-off contract's own instruction #3 — they still mirror
 * (do not import) `packages/api/modules/mind-share/types.ts`'s
 * `CheckDisclosurePolicyInputSchema` / `DisclosurePolicyDecisionSchema`, same
 * circular-import reasoning as `query-own-context-tool.ts` and P1c's
 * classifier agent (`@repo/api` depends on `@repo/mastra`).
 */

const ContextClassificationSchema = z.enum([
	"public",
	"team",
	"private",
	"restricted",
]);
/** `.nullish()`, not `.optional()` — see `packages/api/modules/mind-share/
 * types.ts`'s `EntitiesSchema` comment (product specification "P1c-entities" notes,
 * 2026-09-12) for why. */
const EntitiesSchema = z.object({
	project: z.string().nullish(),
	people: z.array(z.string()).nullish(),
	topics: z.array(z.string()).nullish(),
});
const StructuredClaimSchema = z.object({
	decision: z.string(),
	reason: z.string(),
	confidence: z.number().min(0).max(1),
	entities: EntitiesSchema.nullish(),
});

export const CheckDisclosurePolicyInputSchema = z.object({
	claim: z.union([StructuredClaimSchema, z.string()]),
	requesterId: z.string(),
	purpose: z.string(),
});
export type CheckDisclosurePolicyInput = z.infer<
	typeof CheckDisclosurePolicyInputSchema
>;

export const DisclosurePolicyDecisionSchema = z.object({
	requesterId: z.string(),
	ownerId: z.string(),
	purpose: z.string(),
	classification: ContextClassificationSchema,
	disclosable: z.boolean(),
	redactionReason: z.string().optional(),
	inferenceRisk: z
		.object({
			blocked: z.boolean(),
			protectedConclusion: z.string().optional(),
			explanation: z.string().optional(),
		})
		.optional(),
});
export type DisclosurePolicyDecision = z.infer<
	typeof DisclosurePolicyDecisionSchema
>;

/**
 * Builds a `checkDisclosurePolicy` tool bound to one owner. Mirrors
 * `createQueryOwnContextTool`'s per-owner factory shape so both tools attach
 * to a `createContextAgent(owner)` instance the same way. `execute` closes
 * over `ownerId` and delegates to P2b's real `checkDisclosurePolicy`, which
 * runs RBAC + inference-risk, writes the `context_audit_log` side effect,
 * and returns the `DisclosurePolicyDecision`.
 *
 * `boundRequesterId` (review fix, `negotiateContext` track) — when the
 * CALLER already knows the requester's real, authenticated identity, pass it
 * here and it overrides whatever `requesterId` the model puts in its tool
 * call. This matters because `requesterId` is otherwise relayed by the LLM
 * from prompt text that includes client-supplied strings
 * (`negotiateContext`'s `question`/`purpose`), so an injected instruction
 * could make the agent pass a different id — and `checkDisclosurePolicy`
 * short-circuits to `disclosable: true` (skipping RBAC, inference-risk AND
 * the audit write) whenever `requesterId === ownerId`, which is an id the
 * requester necessarily knows, since they chose it as `toUserId`. Binding
 * the real identity makes that unreachable by construction rather than by
 * prompt discipline. Omitted (the default) for callers that genuinely have
 * no authenticated identity to bind — P2d's MCP exposure, whose documented
 * "SECURITY / AUTH GAP" is exactly that it has none.
 */
export function createCheckDisclosurePolicyTool(
	ownerId: string,
	boundRequesterId?: string,
) {
	return createTool({
		id: "check-disclosure-policy",
		description:
			"Decides whether a claim about the context owner (a specific item's structured claim, or a free-text answer you've synthesized) may be disclosed to a given requester for a stated purpose. Runs RBAC (based on the requester's org role and the item's classification) and, for synthesized free-text answers, an inference-risk check against the owner's protected conclusions. Always obey the returned decision exactly — never disclose content it marks as not disclosable.",
		inputSchema: CheckDisclosurePolicyInputSchema,
		outputSchema: DisclosurePolicyDecisionSchema,
		execute: async ({
			claim,
			requesterId,
			purpose,
		}: {
			claim: z.infer<typeof StructuredClaimSchema> | string;
			requesterId: string;
			purpose: string;
		}) =>
			checkDisclosurePolicy(
				claim,
				boundRequesterId ?? requesterId,
				purpose,
				ownerId,
			),
	});
}
