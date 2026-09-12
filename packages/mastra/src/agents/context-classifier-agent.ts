import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { DEFAULT_MODEL_ID, openrouter } from "../utils/openrouter";

/**
 * Phase 1 track P1c — Mastra classifier step.
 *
 * Takes one raw ingested item (a Slack message, Gmail snippet, or Drive file
 * excerpt) and turns it into the two pieces `context_items` needs (product specification
 * §1): a `structuredClaim` extraction and a disclosure `classification`.
 *
 * Schemas below intentionally *mirror* (do not import)
 * `packages/api/modules/mind-share/types.ts`'s `StructuredClaimSchema` /
 * `ContextClassificationSchema` — `@repo/api` already depends on
 * `@repo/mastra` (see `packages/api/package.json`), so the reverse import
 * would be circular. This is the same call F1 made for the Drizzle schema
 * (see product specification's F1 notes: "mirrors `packages/api/modules/mind-share/
 * types.ts`"). Keep these two structurally identical to that file's
 * `StructuredClaimSchema` / `ContextClassificationSchema` if either changes.
 *
 * `StructuredClaimSchema` also carries an optional `entities` sub-object
 * (project/people/topics) added by the entities track (see product specification's
 * "P1c-entities" notes, 2026-09-12) — same one-LLM-call classifier, just
 * a richer output schema. `packages/api/modules/mind-share/types.ts`'s
 * `StructuredClaimSchema` was updated to match.
 */

export const RawContextItemSchema = z.object({
	sourceType: z.enum(["drive", "slack", "gmail"]),
	rawExcerpt: z.string(),
});
export type RawContextItem = z.infer<typeof RawContextItemSchema>;

/** Who/what/topic graph extracted alongside the claim, when identifiable.
 * Every field is independently nullable — see the "no-fabrication"
 * discipline note on `instructions` below. Nested inside
 * `StructuredClaimSchema` (not a sibling of it on `ClassifierOutputSchema`)
 * so the whole thing persists as one JSON blob in the existing
 * `structuredClaim` column with no extra merge step required by callers
 * (`packages/jobs/workers/fixture-ingestion-worker.ts`,
 * `packages/mastra/src/scripts/classify-fixtures.ts`) — see this file's
 * P1c-entities notes (2026-09-12) in product specification for why this nesting was
 * chosen over a top-level sibling field.
 *
 * `.nullable()`, not `.optional()`, on every field here (including the
 * `entities` field itself on `StructuredClaimSchema` below) — this was a
 * deliberate fix, not the original design. `.optional()` (property absent
 * from `required`) reproducibly broke structured-output generation against
 * `openai/gpt-4o-mini` via OpenRouter: the model emitted a truncated/
 * malformed token in place of the omitted field (observed raw output:
 * `"entities":":{"` mid-object, a `STRUCTURED_OUTPUT_SCHEMA_VALIDATION_
 * FAILED` Mastra error every time), consistent with OpenAI-style
 * strict-JSON-schema decoding expecting every property to be present in
 * `required` (nullable types included) rather than actually optional.
 * Switching every optional field in this nested shape to `.nullable()`
 * fixed it — reproduced both the failure and the fix live, see product specification's
 * notes for the exact repro. */
const EntitiesSchema = z.object({
	project: z.string().nullable(),
	people: z.array(z.string()).nullable(),
	topics: z.array(z.string()).nullable(),
});

const StructuredClaimSchema = z.object({
	decision: z.string(),
	reason: z.string(),
	confidence: z.number().min(0).max(1),
	entities: EntitiesSchema.nullable(),
});

const ContextClassificationSchema = z.enum([
	"public",
	"team",
	"private",
	"restricted",
]);

export const ClassifierOutputSchema = z.object({
	structuredClaim: StructuredClaimSchema,
	classification: ContextClassificationSchema,
});
export type ClassifierOutput = z.infer<typeof ClassifierOutputSchema>;

/**
 * Instructions encode two judgment calls product specification leaves to us:
 *
 * 1. `decision` covers product specification §1's "decisions, beliefs, commitments,
 *    blockers" framing, but a lot of real Slack/Gmail content (status
 *    updates, FYIs) doesn't cleanly encode one of those — for those, fall
 *    back to a short factual summary rather than forcing a decision-shaped
 *    answer.
 * 2. `classification` is a *security-relevant default, not a UX one*
 *    (product specification P1c task): ties, ambiguity, or partial sensitivity should
 *    round up to the more restrictive bucket, never down.
 */
const instructions = `You are the Context Classifier step of the Human Context Protocol ("Mind Share"). You read one raw excerpt (a Slack message, Gmail snippet, or Drive file excerpt) belonging to one person and extract two things from it.

1. structuredClaim — your best structured read of the excerpt:
   - decision: a short (one sentence) summary of the decision, belief, commitment, or blocker the text encodes (e.g. "Moved the Postgres 16 migration a sprint earlier due to RDS deprecation."). If the text doesn't clearly encode a decision/belief/commitment/blocker, use a short factual summary of what it says instead (e.g. "Confirmed comp adjustment: new base salary and bonus target.") — never force a decision-shaped answer onto a plain status update.
   - reason: the "why" behind it, if the text states or implies one. If no reason is stated, write a brief note saying so (e.g. "No reason stated in the excerpt.") rather than inventing one.
   - confidence: 0-1, your confidence in this extraction given how explicit/clear the excerpt is.
   - entities: a who/what/topic graph for the excerpt, extracted with the same no-fabrication discipline as decision/reason. Every sub-field is independently nullable — set any you can't clearly support from the text to null, rather than guessing:
     - project: the name of one specific project/initiative the excerpt is clearly about (a ticket key, codename, or named initiative, e.g. "Postgres 16 migration", "PROJ-482"). Set to null if no specific project is named.
     - people: names or handles of people mentioned or clearly implicated *in the excerpt's own body text* — not the sender/recipient/channel metadata already given to you in the "Source type"/header line, which is captured separately. Only list someone here if the excerpt's text itself names them (e.g. "loop in Sam before you ship this"). Set to null if the body names no one.
     - topics: 2-5 short topical keywords/tags for the excerpt (e.g. "billing", "SSO", "compensation", "recruiting"). Set the field to null if you can't identify at least one clear topic rather than forcing generic tags.
   If none of project/people/topics apply, set entities itself to null rather than an object of nulls.

2. classification — the disclosure sensitivity of the excerpt's content, one of:
   - "public": safe for anyone, inside or outside the org, to see (rare — most work content is at least "team").
   - "team": normal work content — project status, technical decisions, process updates. Fine for coworkers/teammates to see, not necessarily outsiders.
   - "private": sensitive personal or HR/financial information — compensation figures (salary, bonus, equity), personal financial details (mortgage, major purchases, personal tax/legal matters), health information, or anything a reasonable person would not want broadcast to coworkers by default.
   - "restricted": highly sensitive material that should essentially never be auto-disclosed — active job search / recruiter conversations, employment-contract-sensitive material, or content whose disclosure could seriously harm the person (e.g. actively interviewing elsewhere while employed).

Be conservative: this is a security-relevant default, not a UX one. When you are unsure between two adjacent levels, pick the more restrictive one. Any explicit compensation figure (a salary/bonus/equity number) must be at least "private". Any explicit mention of the person currently interviewing, talking to a recruiter about a new role, or evaluating a job offer must be "restricted", even if phrased casually.

Do not try to infer or state secondary conclusions that aren't explicit in the text (e.g. don't write "this implies they are job searching" into the decision/reason of an unrelated item) — classify only the excerpt in front of you. Downstream inference-risk protection across multiple items is a separate system; your job is single-item classification only.

Respond only with the structured object — no prose outside it.`;

export const contextClassifierAgent = new Agent({
	id: "context-classifier-agent",
	name: "Context Classifier Agent",
	instructions,
	model: openrouter.chat(DEFAULT_MODEL_ID),
});

/**
 * Runs the classifier agent on one raw item and returns a validated
 * `{ structuredClaim, classification }` pair (P1c's contract). Does not read
 * or write `context_items` — wiring the result into that table is P1b's (or
 * a later wiring step's) job; this is a pure `rawItem -> classification`
 * function so it can be called standalone (see `src/scripts/
 * classify-fixtures.ts`) or from inside an ingestion job.
 */
export async function classifyContextItem(
	item: RawContextItem,
): Promise<ClassifierOutput> {
	const parsedInput = RawContextItemSchema.parse(item);

	const result = await contextClassifierAgent.generate(
		[
			{
				role: "user",
				content: `Source type: ${parsedInput.sourceType}\n\nRaw excerpt:\n"""\n${parsedInput.rawExcerpt}\n"""`,
			},
		],
		{
			structuredOutput: {
				schema: ClassifierOutputSchema,
			},
		},
	);

	// Belt-and-suspenders: `structuredOutput` already validates against the
	// schema internally, but re-validate the returned object against our own
	// exported schema so a Mastra/AI SDK version bump that changes shape
	// fails loudly here rather than silently downstream in `context_items`.
	return ClassifierOutputSchema.parse(result.object);
}
