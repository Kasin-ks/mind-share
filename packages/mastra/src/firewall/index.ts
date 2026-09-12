/**
 * Phase 2 track P2b — Context Firewall barrel.
 *
 * `audit-log.ts` (P2c, `context_audit_log` writes) IS re-exported here as of
 * the `negotiateContext` track (product specification's "Converges last" table):
 * `checkDisclosurePolicy` already calls `writeAuditLogEntry` internally
 * (follow-up review pass, fix 4) as a side effect on every third-party
 * check, but that write uses a best-effort reconstructed `question` (see
 * `check-disclosure-policy.ts`'s doc comment) since that function's own
 * contract has no real question text. `negotiateContext`
 * (`packages/api/modules/mind-share/lib/negotiate.ts`) DOES have the real
 * question, and needs to call `writeAuditLogEntry` itself to write a more
 * accurate supplementary entry — and, for negotiations where the agent made
 * no `checkDisclosurePolicy` calls at all (a fully public answer), to write
 * the ONLY audit entry for that negotiation, so "every negotiation produces
 * ... an audit log entry" (product specification §1) holds unconditionally, not just
 * for negotiations that happened to hit the firewall.
 *
 * `createCheckDisclosurePolicyTool` is deliberately NOT exported from here
 * (a prior version of this file did) — the real, contract-shaped Mastra
 * tool factory of that name lives in
 * `../tools/check-disclosure-policy-tool.ts` (P2a's file, made real in the
 * follow-up review pass, fix 1) and is re-exported from
 * `packages/mastra/index.ts`. A second, differently-typed function of the
 * same name in this barrel would collide with that export.
 */

export type { AuditLogEntry, AuditLogEntryInsert } from "./audit-log";
export { writeAuditLogEntry } from "./audit-log";
export {
	checkDisclosurePolicy,
	findNearVerbatimOwnerItem,
} from "./check-disclosure-policy";
export type { ProtectedConclusionInput } from "./inference-risk";
export { checkInferenceRisk, inferenceRiskAgent } from "./inference-risk";
export {
	getOwnerOrganizationId,
	getRequesterOrgRole,
	isDisclosableByRole,
	rbacCeiling,
} from "./rbac";
export type {
	ContextClassification,
	DisclosurePolicyDecision,
	Entities,
	InferenceRiskResult,
	OrgRole,
	StructuredClaim,
} from "./schemas";
export {
	ContextClassificationSchema,
	DisclosurePolicyDecisionSchema,
	EntitiesSchema,
	InferenceRiskResultSchema,
	OrgRoleSchema,
	StructuredClaimSchema,
} from "./schemas";
