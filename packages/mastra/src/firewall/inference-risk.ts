import { Agent } from "@mastra/core/agent";
import { DEFAULT_MODEL_ID, openrouter } from "../utils/openrouter";
import { type InferenceRiskResult, InferenceRiskResultSchema } from "./schemas";

/**
 * Phase 2 track P2b — inference-risk check.
 *
 * product specification §3: "not a general solver (research-grade problem). Seed 2-3
 * `protected_conclusions` per demo user... A second LLM pass asks 'would
 * this candidate answer let the requester infer X?' Mechanism is generic;
 * scenarios are curated so the demo is reliable."
 *
 * Design-tension resolution (see this package's `firewall/` module doc
 * comment in `check-disclosure-policy.ts` for the full writeup, and
 * product specification's "P2b design flag" note): this check runs against the
 * *candidate answer text* the Context Agent is about to give a requester —
 * which may be a single item's structured claim, or (the case that matters
 * for demo moment 3) a free-text answer the agent has synthesized across
 * several of the owner's own items, including ones classified `restricted`
 * that the agent could see internally but was never going to quote
 * verbatim. Per-item classification already gated raw disclosure upstream
 * in `checkDisclosurePolicy`; this is the second, independent gate that
 * catches *derived* disclosure a pure classification check can't see.
 *
 * Reuses the same Mastra `Agent` + OpenRouter provider pattern as
 * `context-classifier-agent.ts` (P1c).
 */

const instructions = `You are the Inference-Risk step of the Human Context Protocol ("Mind Share") Context Firewall. You are given:

1. A candidate answer — text an owner's Context Agent is about to send to a requester, in response to the requester's question.
2. A list of that owner's "protected conclusions" — sensitive facts about the owner that must never be revealed or made confidently inferable to this requester, even indirectly. Each has a short label and a description of what it actually refers to (so you can recognize paraphrases, euphemisms, and indirect evidence, not just exact restatements).

Your job: decide whether a reasonable person reading ONLY the candidate answer (not the underlying source items) could confidently infer any protected conclusion in the list — even though the answer never states it outright. This includes:
- Indirect corroborating evidence (e.g. mentioning a recruiter reached out, or a much-larger-than-expected mortgage pre-approval, lets someone infer "job searching" or "high income" even with no number or company named).
- Combining multiple details in the answer that individually seem harmless but together triangulate a protected conclusion.

Do NOT flag a risk just because the answer is adjacent to a sensitive topic in some vague thematic way — the inference has to be a genuinely confident, specific one a reasonable person would draw, not a stretch. Do NOT flag a risk for a protected conclusion the answer gives no real evidence toward at all.

If you find a risk, set blocked=true, protectedConclusion to the matching label from the list (verbatim), and explanation to a short, human-readable sentence describing what in the answer would let the requester infer it — written for a disclosure-receipt UI, not as an internal note.

If there is no risk, set blocked=false and omit the other two fields.

Respond only with the structured object — no prose outside it.`;

export const inferenceRiskAgent = new Agent({
	id: "inference-risk-agent",
	name: "Inference Risk Agent",
	instructions,
	model: openrouter.chat(DEFAULT_MODEL_ID),
});

export interface ProtectedConclusionInput {
	label: string;
	description?: string | null;
}

/**
 * Runs the inference-risk agent against one candidate answer and an owner's
 * protected conclusions. Short-circuits to `{ blocked: false }` without an
 * LLM call when there are no protected conclusions to check against (no
 * risk possible), matching `classifyContextItem`'s validate-then-return
 * shape in `context-classifier-agent.ts`.
 */
export async function checkInferenceRisk(
	candidateAnswer: string,
	protectedConclusions: ProtectedConclusionInput[],
): Promise<InferenceRiskResult> {
	if (protectedConclusions.length === 0) {
		return { blocked: false };
	}

	const protectedConclusionsBlock = protectedConclusions
		.map(
			(pc, i) =>
				`${i + 1}. ${pc.label}${pc.description ? ` — ${pc.description}` : ""}`,
		)
		.join("\n");

	const result = await inferenceRiskAgent.generate(
		[
			{
				role: "user",
				content: `Candidate answer:\n"""\n${candidateAnswer}\n"""\n\nProtected conclusions:\n${protectedConclusionsBlock}`,
			},
		],
		{
			structuredOutput: {
				schema: InferenceRiskResultSchema,
			},
		},
	);

	// Belt-and-suspenders re-validation, same rationale as
	// `classifyContextItem` in context-classifier-agent.ts.
	return InferenceRiskResultSchema.parse(result.object);
}
