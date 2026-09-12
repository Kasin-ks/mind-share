import { contextItems, db } from "@repo/database";
import { logger } from "@repo/logs";
import { classifyContextItem } from "@repo/mastra";
import { eq } from "drizzle-orm";

/**
 * Wiring P1c's classifier into `context_items` — a backfill/reclassification
 * script, not a change to the ingestion pipeline itself.
 *
 * Background (product specification's "Current state at a glance", 2026-09-12
 * integration pass): P1b's fixture-ingestion worker
 * (`packages/jobs/workers/fixture-ingestion-worker.ts`) and P1a's drive-
 * ingestion worker both write every row with a sentinel placeholder —
 * `structuredClaim: { decision: "", reason: "unclassified — pending P1c
 * Mastra classifier", confidence: 0 }`, `classification: "restricted"` — by
 * design, so P1c's classifier (`classifyContextItem` in
 * `packages/mastra/src/agents/context-classifier-agent.ts`, re-exported from
 * `@repo/mastra`) could be built and verified independently. P1c verified
 * the classifier itself live (`pnpm --filter @repo/mastra classify:fixtures`,
 * 28/28 classified against the F3 fixtures read straight off disk), but
 * nothing ever fed that output back into the live `context_items` rows —
 * every seeded row stayed stuck at the `restricted` sentinel, which made
 * every `negotiateContext` answer look like a full redaction (see
 * `negotiateContext`'s 2026-09-12 live-verification note for the exact
 * reproduction).
 *
 * **Design decision — backfill script, not wired into the ingestion
 * workers themselves.** Considered calling `classifyContextItem` inline
 * inside `ingestFixtures`/`ingestDriveFiles` right after building each row,
 * so future ingestions never need a separate step. Went with a standalone
 * script instead, for two reasons:
 *   1. P1b's own file-level comment explicitly frames the sentinel as a
 *      deliberate pipeline-separation boundary ("this job's job is 'get the
 *      raw text into a row with the right owner/org,' P1c's job is 'figure
 *      out what it means'") so the two tracks could be built and tested in
 *      parallel without a shared dependency. Folding the LLM call into the
 *      ingestion worker would collapse that boundary and make a pg-boss job
 *      (meant to be a fast, cheap, retryable DB write) also do a slow,
 *      billed, occasionally-failing network call — a different retry/failure
 *      profile that P1b's `retryLimit: 2` config was never designed around.
 *   2. This script is trivially safe to run right after ingestion (as an
 *      explicit next pipeline step, same shape as
 *      `seed:protected-conclusions` following `seed`) and is idempotent by
 *      construction (see below), so there's no real reliability cost to
 *      keeping it separate — only an extra manual/CI step.
 * **This does mean the gap is only partially closed for *future*
 * ingestions**: a fresh `ingest:fixtures`/`ingest:drive` run still leaves new
 * rows at the sentinel until this script (or a scheduled equivalent) is run
 * again afterward. That's an accepted, documented tradeoff, not an
 * oversight — see product specification's notes for this track for the full reasoning.
 *
 * **Selection — only rows still at the unclassified sentinel, not every
 * row.** Re-running this script should never re-spend an LLM call on a row
 * that's already been given a real classification (idempotent + cheap to
 * re-run after new ingestion). The sentinel's `structuredClaim.reason` is a
 * distinctive literal that's part of the sentinel's own contract (see P1b's
 * `UNCLASSIFIED_STRUCTURED_CLAIM`) and is exceedingly unlikely to be the
 * *real* extracted reason for any actual item, so it doubles as a reliable
 * "still needs classification" marker without adding a schema migration
 * (e.g. a dedicated `classifiedAt` column) mid-hackathon. Filtering is done
 * in JS after a single `findMany`, not a JSON-path SQL filter — the table is
 * small (dozens of rows for this hackathon's seeded dataset), so a full
 * table scan filtered in JS is simpler and easier to verify than a
 * `structuredClaim->>'reason' = ...` SQL predicate for no real cost.
 *
 * **What gets sent to the classifier — the stored `rawExcerpt` column
 * as-is**, not a re-derived excerpt with extra Slack/Gmail metadata folded
 * in (unlike `classify:fixtures`, which wraps each fixture item with
 * `[Slack #channel, from X, timestamp]` / `[Gmail from X to Y, timestamp]`
 * headers before classifying). This backfill classifies exactly what's
 * already persisted in `context_items.rawExcerpt` — the same text P2a's
 * `queryOwnContext` tool and the whole disclosure pipeline actually reason
 * over and could ever disclose — so classification is judged against the
 * real disclosable surface, not a richer input the rest of the system never
 * sees. This can occasionally push a borderline item to a different
 * classification than `classify:fixtures`' console-only run did (that run
 * had strictly more context); if that's ever a problem for a real fixture
 * item's demo-readiness, the fix belongs in the ingestion worker's
 * `rawExcerpt` construction, not here.
 *
 * Run via `pnpm --filter @repo/scripts classify:context-items` (new script
 * below, same `dotenv -c -e ../../.env -- tsx` convention as the rest of
 * this package). Safe to re-run any time (including after future
 * `ingest:fixtures`/`ingest:drive` runs) — it only ever touches rows still
 * at the sentinel.
 */

const UNCLASSIFIED_SENTINEL_REASON =
	"unclassified — pending P1c Mastra classifier";

function isUnclassified(structuredClaim: unknown): boolean {
	return (
		typeof structuredClaim === "object" &&
		structuredClaim !== null &&
		"reason" in structuredClaim &&
		(structuredClaim as { reason?: unknown }).reason ===
			UNCLASSIFIED_SENTINEL_REASON
	);
}

async function main() {
	const allRows = await db.query.contextItems.findMany({
		columns: {
			id: true,
			sourceType: true,
			rawExcerpt: true,
			structuredClaim: true,
			classification: true,
			ownerId: true,
		},
	});

	const pending = allRows.filter((row) =>
		isUnclassified(row.structuredClaim),
	);

	logger.info(
		`Found ${allRows.length} context_items rows total, ${pending.length} still unclassified.`,
	);

	let classified = 0;
	let failed = 0;
	const counts: Record<string, number> = {};

	for (const row of pending) {
		try {
			// Sequential on purpose, same reasoning as classify-fixtures.ts:
			// keeps output order stable and stays well under any per-key
			// rate limit for a small (dozens-of-rows) backfill.
			const result = await classifyContextItem({
				sourceType: row.sourceType,
				rawExcerpt: row.rawExcerpt,
			});

			await db
				.update(contextItems)
				.set({
					structuredClaim: result.structuredClaim,
					classification: result.classification,
				})
				.where(eq(contextItems.id, row.id));

			classified += 1;
			counts[result.classification] =
				(counts[result.classification] ?? 0) + 1;
			logger.info(
				`[${row.ownerId}/${row.sourceType}] -> ${result.classification} (was restricted/sentinel)`,
			);
		} catch (err) {
			failed += 1;
			logger.error(`Failed to classify context_items row ${row.id}`, {
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	logger.info("classify-context-items complete", {
		totalRows: allRows.length,
		alreadyClassified: allRows.length - pending.length,
		attempted: pending.length,
		classified,
		failed,
		classificationCounts: counts,
	});

	if (failed > 0) {
		process.exitCode = 1;
	}
}

main()
	.then(() => {
		process.exit(process.exitCode ?? 0);
	})
	.catch((error) => {
		logger.error(error);
		process.exit(1);
	});
