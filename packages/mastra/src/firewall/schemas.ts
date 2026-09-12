import { z } from "zod";

/**
 * Phase 2 track P2b — Context Firewall.
 *
 * Local mirrors of `packages/api/modules/mind-share/types.ts`'s
 * `StructuredClaimSchema` / `ContextClassificationSchema`, and of the org
 * role enum Better Auth's organization plugin uses (`owner | admin |
 * member` — confirmed via `packages/auth/auth.ts`'s
 * `ActiveOrganization["members"][number]["role"]` and the `member.role`
 * Drizzle column's default of `"member"`).
 *
 * These are *mirrored, not imported* for the same reason P1c's
 * `context-classifier-agent.ts` mirrors them: `@repo/api` already depends on
 * `@repo/mastra` (see `packages/api/package.json`), so importing the other
 * direction would be circular. `@repo/mastra` also has no dependency on
 * `@repo/auth` (see `packages/mastra/package.json`), so the org role enum is
 * mirrored here too rather than adding a new cross-package dependency for a
 * 3-value string union. Keep all of these structurally identical to their
 * source-of-truth definitions if either changes.
 */

export const ContextClassificationSchema = z.enum([
	"public",
	"team",
	"private",
	"restricted",
]);
export type ContextClassification = z.infer<typeof ContextClassificationSchema>;

/** `.nullish()`, not `.optional()` — mirrors `packages/api/modules/
 * mind-share/types.ts`'s `EntitiesSchema`; see that file's comment for why
 * (the live classifier emits explicit `null`s, and `.optional()` alone
 * reproducibly broke OpenRouter/gpt-4o-mini's structured-output generation,
 * product specification's "P1c-entities" notes 2026-09-12). */
export const EntitiesSchema = z.object({
	project: z.string().nullish(),
	people: z.array(z.string()).nullish(),
	topics: z.array(z.string()).nullish(),
});
export type Entities = z.infer<typeof EntitiesSchema>;

export const StructuredClaimSchema = z.object({
	decision: z.string(),
	reason: z.string(),
	confidence: z.number().min(0).max(1),
	entities: EntitiesSchema.nullish(),
});
export type StructuredClaim = z.infer<typeof StructuredClaimSchema>;

/** Better Auth organization role, as used by `member.role` (free-text
 * column, default `"member"`) and `auth.api.getFullOrganization`'s
 * `ActiveOrganization["members"][number]["role"]`. */
export const OrgRoleSchema = z.enum(["owner", "admin", "member"]);
export type OrgRole = z.infer<typeof OrgRoleSchema>;

/** Mirrors `DisclosurePolicyDecisionSchema`'s `inferenceRisk` field shape. */
export const InferenceRiskResultSchema = z.object({
	blocked: z.boolean(),
	protectedConclusion: z.string().optional(),
	explanation: z.string().optional(),
});
export type InferenceRiskResult = z.infer<typeof InferenceRiskResultSchema>;

/** Mirrors `DisclosurePolicyDecisionSchema` (the firewall's return shape). */
export const DisclosurePolicyDecisionSchema = z.object({
	requesterId: z.string(),
	ownerId: z.string(),
	purpose: z.string(),
	classification: ContextClassificationSchema,
	disclosable: z.boolean(),
	redactionReason: z.string().optional(),
	inferenceRisk: InferenceRiskResultSchema.optional(),
});
export type DisclosurePolicyDecision = z.infer<
	typeof DisclosurePolicyDecisionSchema
>;
