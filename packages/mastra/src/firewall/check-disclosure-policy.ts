import { db } from "@repo/database";
import { writeAuditLogEntry } from "./audit-log";
import { checkInferenceRisk } from "./inference-risk";
import {
	getOwnerOrganizationId,
	getRequesterOrgRole,
	isDisclosableByRole,
} from "./rbac";
import {
	type ContextClassification,
	type DisclosurePolicyDecision,
	DisclosurePolicyDecisionSchema,
	type StructuredClaim,
	StructuredClaimSchema,
} from "./schemas";

/**
 * Phase 2 track P2b — `checkDisclosurePolicy`, the Context Firewall's
 * top-level entry point (product specification §3). Orchestrates RBAC + inference-risk
 * into the final `DisclosurePolicyDecision`.
 *
 * ---------------------------------------------------------------------
 * Design-tension resolution (product specification's "P2b design flag", read in full
 * against `context-classifier-agent.ts` before writing this file):
 * ---------------------------------------------------------------------
 *
 * P1c's classifier prompt floors any recruiter/job-search mention and any
 * explicit comp figure at `restricted`/`private`. Combined with the RBAC
 * mapping below (`restricted` never auto-released, regardless of role),
 * that would mean Jordan's inference-bait items (the recruiter email, the
 * mortgage pre-approval DM — see `packages/jobs/fixtures/jordan/*.json`)
 * get blocked by *classification* alone, before this file's inference-risk
 * check ever runs. That collapses demo moment 3 ("don't tell me the salary,
 * just tell me if they earn above $100k") into an ordinary redaction — the
 * firewall would say "can't share that" for the same reason it can't share
 * the salary doc, instead of the intended "I can't share X, but I also
 * won't let you *derive* X from Y and Z" catch.
 *
 * Resolution: **option (a)** from product specification's note. Classification governs
 * what gets disclosed to a requester verbatim; it does not govern what the
 * owner's own Context Agent can see or reason over internally. Concretely,
 * that split falls across the two shapes `claim` can take (see
 * `CheckDisclosurePolicyInputSchema` in `packages/api/modules/mind-share/
 * types.ts`):
 *
 * - `claim: StructuredClaim` — the agent is about to disclose one specific
 *   context item's structured claim *as-is* (its `decision`/`reason` text,
 *   effectively verbatim from the item). This is the "ordinary redaction"
 *   path: `resolveClassificationForClaim` below looks up that item's real
 *   `classification` from `context_items` and RBAC gates on it directly.
 *   This is what makes demo moment 2 (the salary request) work — Jordan's
 *   comp item is `private`, Priya is `member`-capped at `team`, so RBAC
 *   alone redacts it, correctly, with no inference-risk involvement needed.
 *
 * - `claim: string` — a free-text answer the agent has *synthesized*,
 *   potentially reasoning across several of the owner's own items
 *   (including `restricted` ones it can see but was never going to quote
 *   verbatim — that internal retrieval is P2a's `queryOwnContext`, which
 *   per this resolution is unfiltered by classification, since
 *   classification is a disclosure gate, not a retrieval gate). Since no
 *   single stored item corresponds to synthesized text, there's nothing
 *   meaningful for RBAC to key off of, so its `classification` is treated
 *   as `"public"` (RBAC trivially passes) and the operative gate becomes
 *   the inference-risk check below, run against the synthesized text
 *   itself and the owner's `protected_conclusions`. This is what makes
 *   demo moment 3 work: the agent can internally know about the recruiter
 *   email and the mortgage pre-approval, synthesize something like "I
 *   can't discuss compensation details," and this check independently
 *   evaluates *that sentence* for whether it (or a more leading variant)
 *   would let the requester infer "actively job searching" /
 *   "compensation above $100k" — which is a property of the answer, not of
 *   any one source item's classification.
 *
 * This matches product specification §3's own architecture, which already describes
 * classification (per-item) and the inference-risk check (per-answer,
 * cross-item) as two separate mechanisms — this resolution just makes that
 * separation apply to *retrieval* too, not only to the two checks. It also
 * means P2a's `queryOwnContext` should not filter by classification (it's
 * P2a's file, not touched here — noting this so the two tracks agree on the
 * contract).
 *
 * ---------------------------------------------------------------------
 * Audit logging (P2c) — UPDATED per a follow-up review pass (see product specification's
 * P2b "follow-up fixes" notes): this function DOES now call P2c's
 * `writeAuditLogEntry` (`./audit-log.ts`) as a side effect, for every
 * third-party check (self-queries short-circuit above and are not audited —
 * a person viewing their own data isn't a disclosure event in the sense
 * `context_audit_log`/U4's audit trail page care about).
 *
 * The original design note here (kept for context, since it's still half
 * true) was that `ContextAuditLogEntrySchema`'s `question` field has no
 * direct equivalent in this function's contract (only
 * `claim`/`requesterId`/`purpose` — the real natural-language question only
 * exists one level up, in the future `negotiateContext(fromUserId, toUserId,
 * question, purpose)` orchestration, product specification §5). That's still true, but
 * a review pass concluded product specification's "every check writes to
 * context_audit_log" is a hard architectural requirement that shouldn't wait
 * on `negotiateContext` landing, and `checkDisclosurePolicy` is the one
 * place every disclosure decision — from any future caller — actually flows
 * through. So `question` below is a best-effort reconstruction from
 * `purpose` and the claim text, not the requester's original verbatim
 * question. A future `negotiateContext` that has the real question text is
 * free to write its own, more accurate audit entry in addition to (or
 * instead of relying solely on) this one; this function's write is the
 * floor, not a ceiling.
 */

/**
 * `checkDisclosurePolicy` is the real, testable implementation of the
 * `CheckDisclosurePolicyTool` contract (`packages/api/modules/mind-share/
 * types.ts`) — which itself only takes `(claim, requesterId, purpose)`, no
 * `ownerId`, the same way `QueryOwnContextTool` doesn't either. "Owner" is
 * the identity of the Context Agent instance answering the call, not a
 * parameter the LLM (or MCP caller) supplies — it's bound once when a
 * per-user agent/MCP server is constructed (product specification §4, `/api/mcp/
 * [userId]`). This function intentionally takes `ownerId` as an explicit
 * 4th argument since it can't look up `protected_conclusions`, the
 * requester's org role, or the item's classification without it.
 *
 * The real 3-arg Mastra tool binding P2a's Context Agent actually calls is
 * `createCheckDisclosurePolicyTool(ownerId)` in
 * `../tools/check-disclosure-policy-tool.ts` (P2a's file — the exact Step 0
 * contract shape, `createTool({inputSchema, outputSchema, execute})`), whose
 * `execute` closes over `ownerId` and calls this function. (An earlier
 * version of this file also defined its own same-named bare-function
 * `createCheckDisclosurePolicyTool(ownerId)` closing over this function —
 * removed in the follow-up review pass once it became clear the real
 * integration point is the Mastra tool object P2a's file builds, not a bare
 * function of an incompatible type; see product specification's P2b follow-up notes,
 * fix 1.)
 */
export async function checkDisclosurePolicy(
	claim: StructuredClaim | string,
	requesterId: string,
	purpose: string,
	ownerId: string,
): Promise<DisclosurePolicyDecision> {
	const parsedClaim =
		typeof claim === "string" ? claim : StructuredClaimSchema.parse(claim);

	const { classification, matchedItemId } =
		await resolveClassificationForClaim(ownerId, parsedClaim);

	// An owner querying their own context is never subject to RBAC or
	// inference-risk redaction against themselves — and, per this file's
	// audit-logging doc comment above, self-queries aren't a disclosure event
	// and aren't audit-logged.
	if (requesterId === ownerId) {
		return DisclosurePolicyDecisionSchema.parse({
			requesterId,
			ownerId,
			purpose,
			classification,
			disclosable: true,
		});
	}

	const organizationId = await getOwnerOrganizationId(ownerId);
	const role = await getRequesterOrgRole(requesterId, organizationId);
	const rbacAllowed = isDisclosableByRole(role, classification);

	const protectedConclusionsForOwner =
		await getProtectedConclusionsForOwner(ownerId);
	const candidateAnswer =
		typeof parsedClaim === "string"
			? parsedClaim
			: `${parsedClaim.decision} ${parsedClaim.reason}`.trim();

	// Skip the LLM call entirely when RBAC already denies — no answer is
	// going out either way, so there's nothing to check for derived risk,
	// and it saves a call in the (already-blocked) demo moment 2 path.
	const inferenceRisk = rbacAllowed
		? await checkInferenceRisk(
				candidateAnswer,
				protectedConclusionsForOwner,
			)
		: { blocked: false as const };

	const disclosable = rbacAllowed && !inferenceRisk.blocked;

	let redactionReason: string | undefined;
	if (!rbacAllowed) {
		redactionReason =
			classification === "restricted"
				? `Classified "restricted" — never auto-disclosed regardless of requester role.`
				: `Requester's org role ("${role ?? "none"}") does not permit "${classification}" content.`;
	} else if (inferenceRisk.blocked) {
		redactionReason = `Inference risk: this answer would let the requester derive a protected conclusion${
			inferenceRisk.protectedConclusion
				? ` ("${inferenceRisk.protectedConclusion}")`
				: ""
		}.`;
	}

	const decision = DisclosurePolicyDecisionSchema.parse({
		requesterId,
		ownerId,
		purpose,
		classification,
		disclosable,
		redactionReason,
		// Contract: "populated only when the second LLM pass ran and found a
		// derivable protected conclusion" — omit when not blocked, not just
		// when the check didn't run.
		inferenceRisk: inferenceRisk.blocked ? inferenceRisk : undefined,
	});

	await writeDisclosureAuditLogEntry({
		decision,
		organizationId,
		candidateAnswer,
		matchedItemId,
	});

	return decision;
}

/**
 * Resolves the classification to gate on for a given claim, per the
 * design-tension resolution above:
 *
 * - Structured claims are matched back to a real `context_items` row for
 *   `ownerId` (by deep-equality on the `structuredClaim` JSON, which is
 *   stable for this hackathon's small, static seeded dataset) and use that
 *   row's real `classification`. If no matching row is found (shouldn't
 *   happen for a claim that actually came from `queryOwnContext`, but is
 *   possible for a hand-constructed/test claim), fail closed to
 *   `"restricted"` — the same safe-default convention P1b's ingestion job
 *   uses for not-yet-classified rows (see product specification's P1b notes).
 * - Free-text (synthesized) claims are treated as `"public"` for RBAC
 *   purposes — see the design-tension write-up above for why: the
 *   inference-risk check, not RBAC, is the intended gate for these —
 *   *unless* the string looks like a near-verbatim copy of one of the
 *   owner's own `restricted`/`private` items, in which case it's treated as
 *   that item's real classification instead (see
 *   `resolveClassificationForStringClaim`'s doc comment, fix 3).
 *
 * Returns the resolved `classification` plus, when a specific
 * `context_items` row was matched (either the structured-claim exact match,
 * or fix 3's near-verbatim match), that row's `id` — threaded through to the
 * audit log entry as `shared`/`redacted[].contextItemId`.
 */
async function resolveClassificationForClaim(
	ownerId: string,
	claim: StructuredClaim | string,
): Promise<{ classification: ContextClassification; matchedItemId?: string }> {
	if (typeof claim === "string") {
		return resolveClassificationForStringClaim(ownerId, claim);
	}

	const rows = await db.query.contextItems.findMany({
		where: (ci, { eq }) => eq(ci.ownerId, ownerId),
		columns: { id: true, structuredClaim: true, classification: true },
	});

	const match = rows.find(
		(row) =>
			row.structuredClaim.decision === claim.decision &&
			row.structuredClaim.reason === claim.reason &&
			row.structuredClaim.confidence === claim.confidence,
	);

	return {
		classification: match?.classification ?? "restricted",
		matchedItemId: match?.id,
	};
}

/**
 * Fix 3 (follow-up review pass, see product specification's P2b follow-up notes) — RBAC
 * bypass backstop for free-text claims.
 *
 * A `string` claim is treated as `"public"` for RBAC by design (the
 * inference-risk check, not RBAC, is the intended gate for a *synthesized*
 * answer — see this file's top-of-file design-tension write-up). Taken
 * alone, that meant nothing stopped an agent from passing verbatim
 * `restricted`/`private` text through as a `string` and having it sail past
 * RBAC unconditionally, relying solely on the (weaker, LLM-judgment-based)
 * inference-risk check to catch it — a materially different guarantee than
 * RBAC's hard, deterministic block.
 *
 * This is a cheap, deliberately unsophisticated backstop, proportionate to
 * a hackathon timeline: before treating a string claim as `"public"`, check
 * whether it's a near-verbatim match (case-insensitive substring
 * containment either direction, or a normalized-token-overlap ratio for
 * close paraphrases — see `isNearVerbatimMatch`) against any of the owner's
 * `restricted`/`private` `context_items.rawExcerpt` values. If it matches,
 * treat the claim as that item's real classification (RBAC-gate it) instead
 * of `"public"`.
 *
 * This is a SAFETY BACKSTOP, not a replacement for prompt discipline: it
 * only catches near-verbatim copies of a *stored* item, not every possible
 * leak (a sufficiently reworded paraphrase can still slip through to the
 * inference-risk check alone, same as before this fix). The real fix for
 * that is the Context Agent's system prompt correctly distinguishing
 * "disclosing one item verbatim" from "synthesizing an answer" in the first
 * place (`../agents/context-agent.ts`, fix 2) — this guard exists in case
 * that prompt discipline fails or is bypassed.
 */
async function resolveClassificationForStringClaim(
	ownerId: string,
	claim: string,
): Promise<{ classification: ContextClassification; matchedItemId?: string }> {
	const match = await findNearVerbatimOwnerItem(ownerId, claim);

	if (match) {
		return {
			classification: match.classification,
			matchedItemId: match.id,
		};
	}

	return { classification: "public" };
}

/**
 * Does `text` look like a near-verbatim copy of one of `ownerId`'s own
 * `private`/`restricted` `context_items`? Returns the matched row's id +
 * real classification, or `null` if nothing matched.
 *
 * Extracted from `resolveClassificationForStringClaim` (fix 3 above) so the
 * same deterministic containment check can also be applied one level up, to
 * an agent's FINAL free-text answer, by
 * `packages/api/modules/mind-share/lib/negotiate.ts` — see that file's
 * "final-answer containment backstop" note. Fix 3 only protects claims the
 * agent voluntarily routes through `checkDisclosurePolicy`; an agent that
 * skips the firewall entirely (model error, or a prompt-injected
 * `question`/`purpose`) never reaches this file at all, so `negotiateContext`
 * needs to run the same check itself on whatever text it is about to hand
 * back to the requester.
 *
 * Same caveats as `isNearVerbatimMatch`: this catches verbatim/near-verbatim
 * content dumps, not arbitrary paraphrases. It is a deterministic backstop
 * under the (LLM-judgment-based) prompt discipline, not a replacement for it.
 */
export async function findNearVerbatimOwnerItem(
	ownerId: string,
	text: string,
): Promise<{ id: string; classification: ContextClassification } | null> {
	const sensitiveRows = await db.query.contextItems.findMany({
		where: (ci, { and, eq, inArray }) =>
			and(
				eq(ci.ownerId, ownerId),
				inArray(ci.classification, ["restricted", "private"]),
			),
		columns: { id: true, rawExcerpt: true, classification: true },
	});

	const match = sensitiveRows.find((row) =>
		isNearVerbatimMatch(text, row.rawExcerpt),
	);

	return match
		? { id: match.id, classification: match.classification }
		: null;
}

const MIN_COMPARISON_LENGTH = 15;
const MIN_TOKENS_FOR_OVERLAP_CHECK = 5;
const TOKEN_OVERLAP_THRESHOLD = 0.7;

function normalizeForComparison(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * Cheap, hackathon-proportionate near-verbatim check (fix 3) — not a
 * general-purpose similarity metric. Two signals, either of which is
 * sufficient:
 *
 * 1. Substring containment (either direction) after normalizing case,
 *    punctuation, and whitespace — catches an answer that's the raw excerpt
 *    (or a short clip of it) pasted in as-is.
 * 2. Normalized-token overlap (intersection / smaller set size) at or above
 *    `TOKEN_OVERLAP_THRESHOLD` — catches close paraphrases that reorder or
 *    lightly reword the source without a plain substring match. Only
 *    applied when both sides have at least `MIN_TOKENS_FOR_OVERLAP_CHECK`
 *    tokens, so short strings can't trivially "overlap" their way to a false
 *    positive.
 *
 * Short strings on either side (below `MIN_COMPARISON_LENGTH` normalized
 * characters) never match — this guard is for verbatim/near-verbatim
 * *content* leaks, not incidental short-word overlap.
 */
function isNearVerbatimMatch(candidate: string, source: string): boolean {
	const normalizedCandidate = normalizeForComparison(candidate);
	const normalizedSource = normalizeForComparison(source);

	if (
		normalizedCandidate.length < MIN_COMPARISON_LENGTH ||
		normalizedSource.length < MIN_COMPARISON_LENGTH
	) {
		return false;
	}

	if (
		normalizedSource.includes(normalizedCandidate) ||
		normalizedCandidate.includes(normalizedSource)
	) {
		return true;
	}

	const candidateTokens = new Set(normalizedCandidate.split(" "));
	const sourceTokens = new Set(normalizedSource.split(" "));
	if (
		candidateTokens.size < MIN_TOKENS_FOR_OVERLAP_CHECK ||
		sourceTokens.size < MIN_TOKENS_FOR_OVERLAP_CHECK
	) {
		return false;
	}

	let overlap = 0;
	for (const token of candidateTokens) {
		if (sourceTokens.has(token)) {
			overlap++;
		}
	}

	const smallerSetSize = Math.min(candidateTokens.size, sourceTokens.size);
	return overlap / smallerSetSize >= TOKEN_OVERLAP_THRESHOLD;
}

async function getProtectedConclusionsForOwner(
	ownerId: string,
): Promise<Array<{ label: string; description?: string | null }>> {
	return db.query.protectedConclusions.findMany({
		where: (pc, { eq }) => eq(pc.ownerId, ownerId),
		columns: { label: true, description: true },
	});
}

/**
 * Fix 4 (follow-up review pass) — the audit-log side effect called from
 * `checkDisclosurePolicy` for every third-party (non-self) check. Writes
 * exactly one `context_audit_log` row per call via P2c's
 * `writeAuditLogEntry` (`./audit-log.ts`), with a `shared` or `redacted`
 * entry (never both — a single `checkDisclosurePolicy` call is a single
 * disclosure decision) reflecting the outcome.
 *
 * `question` is a best-effort reconstruction (`purpose` plus the claim
 * text) — see this file's top-of-file audit-logging doc comment for why
 * `checkDisclosurePolicy`'s contract has no separate real question text to
 * use here — but ONLY when the decision was to disclose; see the
 * `question` construction below. Errors from `writeAuditLogEntry` (e.g. a DB
 * outage) are
 * deliberately NOT swallowed — an audit write that silently fails would
 * defeat the point of an audit trail, so a failure here fails the whole
 * `checkDisclosurePolicy` call rather than returning a decision that was
 * never actually logged.
 */
async function writeDisclosureAuditLogEntry(params: {
	decision: DisclosurePolicyDecision;
	organizationId: string | null;
	candidateAnswer: string;
	matchedItemId?: string;
}): Promise<void> {
	const { decision, organizationId, candidateAnswer, matchedItemId } = params;

	// U4 review fix (2026-09-12): the reconstructed `question` must never
	// carry the claim's own text when the decision was to WITHHOLD it.
	// `candidateAnswer` IS the claim (a synthesized answer, or a matched
	// item's `decision`/`reason`), so embedding it here put the withheld
	// content into a durable row that U4's audit trail page shows to the
	// REQUESTER — `listAuditLog`
	// (`packages/api/modules/mind-share/procedures/list-audit-log.ts`)
	// returns rows where the caller is owner OR requester, and
	// `AuditLogTable` renders `question` verbatim. Reproduced live before
	// fixing: Priya (a `member`) asking about Jordan's `restricted`
	// compensation item got `disclosable: false` and a correctly
	// content-free receipt, while this row's `question` read
	// `... (re: "... base $128,000, target bonus 10% ...")` — i.e. the audit
	// surface handed back exactly what the firewall had just refused to
	// disclose. This is the same invariant `RedactedContextEntrySchema`
	// already states for `summary` ("never includes the withheld content
	// itself"); it has to hold for every field of a withheld row, not just
	// that one.
	const question = decision.disclosable
		? decision.purpose
			? `${decision.purpose} (re: "${candidateAnswer}")`
			: candidateAnswer
		: decision.purpose
			? `${decision.purpose} (re: content withheld by the Context Firewall)`
			: "Disclosure check on content withheld by the Context Firewall";

	const why =
		decision.redactionReason ??
		`Disclosable: classification "${decision.classification}" permitted for this requester; no inference risk detected.`;

	await writeAuditLogEntry({
		requesterId: decision.requesterId,
		ownerId: decision.ownerId,
		organizationId,
		question,
		shared: decision.disclosable
			? [
					{
						contextItemId: matchedItemId,
						content: candidateAnswer,
						classification: decision.classification,
					},
				]
			: [],
		redacted: decision.disclosable
			? []
			: [
					{
						contextItemId: matchedItemId,
						summary: "Content withheld by the Context Firewall.",
						classification: decision.classification,
						reason: why,
					},
				],
		why,
	});
}
