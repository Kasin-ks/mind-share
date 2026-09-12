/**
 * P1b — pg-boss job that loads the seeded Slack/Gmail fixtures (F3,
 * `packages/jobs/fixtures/{jordan,priya}/{slack,gmail}.json`) into the
 * `context_items` table (F1, `packages/database/drizzle/schema/postgres.ts`).
 *
 * Scope: **raw ingestion only**. This job does not classify anything — that
 * is P1c's job (a Mastra classifier step that reads raw `context_items` rows
 * and overwrites `structuredClaim`/`classification` with the real
 * extraction). Every row this job writes uses the sentinel
 * `UNCLASSIFIED_STRUCTURED_CLAIM` / `UNCLASSIFIED_CLASSIFICATION` below so
 * the two stages stay cleanly separable: this job's job is "get the raw text
 * into a row with the right owner/org," P1c's job is "figure out what it
 * means and how sensitive it is."
 *
 * Safe-default classification: NOT "public". Some of this fixture content is
 * genuinely sensitive (comp figures, job-search signals) and hasn't been
 * classified yet when this job runs. Defaulting to "public" would make an
 * unclassified row disclosable to anyone via the firewall's RBAC mapping
 * before P1c ever looks at it — a real information-disclosure bug, not just
 * a placeholder inaccuracy. "private" isn't safe either: per product specification's
 * RBAC mapping (member -> team, admin -> +private, restricted -> never
 * auto-released), an org admin would already have blanket access to
 * "private" rows, including ones that turn out to be comp data, before
 * classification runs. "restricted" is the only enum value that is *never*
 * auto-released to anyone but the owner regardless of role, so it's the only
 * choice that is safe by construction for the un-classified window between
 * this job and P1c's classifier. (The `ContextClassification` enum has no
 * dedicated "unclassified" value — adding one would mean a schema/contract
 * migration touching `packages/database/drizzle/schema/postgres.ts` and
 * `packages/api/modules/mind-share/types.ts`, which are shared, already-
 * landed Step 0/F1 artifacts other in-flight tracks (P1c, P2b) depend on;
 * reusing the existing most-restrictive value avoids destabilizing that
 * shared surface mid-hackathon.)
 *
 * Idempotency: re-running this job must not create duplicate `context_items`
 * rows. There's no unique constraint to lean on (the table has no natural
 * unique key), so this job does an explicit check-then-insert: for each
 * owner, it loads that owner's existing `context_items` rows once, builds a
 * `Set` of `${sourceType}:${rawExcerpt}` keys already present, and skips any
 * fixture item whose derived `rawExcerpt` already has a matching row. Since
 * the fixtures are static files and `rawExcerpt` is derived deterministically
 * from each fixture item's content (Slack: `text` verbatim; Gmail:
 * `subject` + `snippet` joined), the same fixture item always produces the
 * same `rawExcerpt` on every run, making this key stable across runs.
 */

import { contextItems, db } from "@repo/database";
import { logger } from "@repo/logs";
import jordanGmail from "../fixtures/jordan/gmail.json";
import jordanSlack from "../fixtures/jordan/slack.json";
import priyaGmail from "../fixtures/priya/gmail.json";
import priyaSlack from "../fixtures/priya/slack.json";
import type { JobProvider } from "../types";

export const FIXTURE_INGESTION_QUEUE = "fixture-ingestion";

interface SlackFixtureItem {
	channel: string;
	author: string;
	timestamp: string;
	text: string;
}

interface GmailFixtureItem {
	from: string;
	to: string;
	subject: string;
	snippet: string;
	timestamp: string;
}

interface FixtureOwner {
	dir: "jordan" | "priya";
	/** Real seeded email (F2) — resolved to a real `user.id` FK at run time,
	 * never hardcoded as the FK itself. */
	email: string;
	slack: SlackFixtureItem[];
	gmail: GmailFixtureItem[];
}

const FIXTURE_OWNERS: FixtureOwner[] = [
	{
		dir: "jordan",
		email: "jordan.blake@acme-robotics.test",
		slack: jordanSlack as SlackFixtureItem[],
		gmail: jordanGmail as GmailFixtureItem[],
	},
	{
		dir: "priya",
		email: "priya.shah@acme-robotics.test",
		slack: priyaSlack as SlackFixtureItem[],
		gmail: priyaGmail as GmailFixtureItem[],
	},
];

/** Both fixture owners belong to the same seeded org (F2). */
const ORG_SLUG = "acme-robotics";

/**
 * Placeholder `structuredClaim`, standing in until P1c's classifier
 * overwrites it. Still a valid `StructuredClaimSchema` value (non-nullable
 * `decision`/`reason` strings, `confidence` in [0, 1]) — there's no "null"
 * variant in that Zod contract, so this uses empty-string/zero sentinels
 * rather than actual `null`s, which the schema would reject.
 */
const UNCLASSIFIED_STRUCTURED_CLAIM = {
	decision: "",
	reason: "unclassified — pending P1c Mastra classifier",
	confidence: 0,
} as const;

/** See file-level comment for the "why not public/private" rationale. */
const UNCLASSIFIED_CLASSIFICATION = "restricted" as const;

function gmailRawExcerpt(item: GmailFixtureItem): string {
	return `Subject: ${item.subject}\n\n${item.snippet}`;
}

export interface IngestFixturesResult {
	/** Newly inserted `context_items` rows across both owners. */
	inserted: number;
	/** Fixture items skipped because a matching row already existed. */
	skipped: number;
	/** Total fixture items considered (inserted + skipped). */
	total: number;
}

/**
 * Core ingestion logic: read the 4 fixture files, resolve each owner's real
 * `user.id` + the shared org's `organization.id`, and idempotently insert one
 * `context_items` row per fixture item. Exported separately from the pg-boss
 * worker registration so it can also be invoked directly by a one-off script
 * (`tooling/scripts/src/ingest-fixtures.ts`) without needing a running
 * worker loop.
 */
export async function ingestFixtures(): Promise<IngestFixturesResult> {
	const org = await db.query.organization.findFirst({
		where: (organization, { eq }) => eq(organization.slug, ORG_SLUG),
	});
	if (!org) {
		throw new Error(
			`Organization not found for slug "${ORG_SLUG}" — run the seed script (F2, "pnpm --filter @repo/scripts seed") first.`,
		);
	}

	let inserted = 0;
	let skipped = 0;
	let total = 0;

	for (const owner of FIXTURE_OWNERS) {
		const ownerUser = await db.query.user.findFirst({
			where: (user, { eq }) => eq(user.email, owner.email),
		});
		if (!ownerUser) {
			throw new Error(
				`User not found for email "${owner.email}" (fixture dir "${owner.dir}") — run the seed script (F2) first.`,
			);
		}

		const existingRows = await db.query.contextItems.findMany({
			where: (contextItems, { eq }) =>
				eq(contextItems.ownerId, ownerUser.id),
			columns: { sourceType: true, rawExcerpt: true },
		});
		const existingKeys = new Set(
			existingRows.map((row) => `${row.sourceType}:${row.rawExcerpt}`),
		);

		const rowsToInsert: (typeof contextItems.$inferInsert)[] = [];

		for (const item of owner.slack) {
			total++;
			const rawExcerpt = item.text;
			const key = `slack:${rawExcerpt}`;
			if (existingKeys.has(key)) {
				skipped++;
				continue;
			}
			existingKeys.add(key);
			rowsToInsert.push({
				ownerId: ownerUser.id,
				organizationId: org.id,
				sourceType: "slack",
				rawExcerpt,
				structuredClaim: UNCLASSIFIED_STRUCTURED_CLAIM,
				classification: UNCLASSIFIED_CLASSIFICATION,
			});
		}

		for (const item of owner.gmail) {
			total++;
			const rawExcerpt = gmailRawExcerpt(item);
			const key = `gmail:${rawExcerpt}`;
			if (existingKeys.has(key)) {
				skipped++;
				continue;
			}
			existingKeys.add(key);
			rowsToInsert.push({
				ownerId: ownerUser.id,
				organizationId: org.id,
				sourceType: "gmail",
				rawExcerpt,
				structuredClaim: UNCLASSIFIED_STRUCTURED_CLAIM,
				classification: UNCLASSIFIED_CLASSIFICATION,
			});
		}

		if (rowsToInsert.length > 0) {
			await db.insert(contextItems).values(rowsToInsert);
			inserted += rowsToInsert.length;
		}
	}

	logger.info("Fixture ingestion complete", { inserted, skipped, total });
	return { inserted, skipped, total };
}

/**
 * Registers the `fixture-ingestion` pg-boss queue + worker. Follows the same
 * shape as `registerRateLimitedTaskWorker` (create queue before `work` so
 * pg-boss has the queue before the worker subscribes; return
 * `{ queueName, workerId }` for graceful shutdown in `server.ts`).
 */
export async function registerFixtureIngestionWorker(
	jobProvider: JobProvider,
): Promise<{ queueName: string; workerId: string }> {
	await jobProvider.createQueue(FIXTURE_INGESTION_QUEUE, {
		retryLimit: 2,
		retryBackoff: true,
	});

	const workerId = await jobProvider.work(
		FIXTURE_INGESTION_QUEUE,
		async (jobs) => {
			for (const job of jobs) {
				try {
					const result = await ingestFixtures();
					logger.info("Fixture ingestion job completed", {
						jobId: job.id,
						...result,
					});
					await jobProvider.complete(FIXTURE_INGESTION_QUEUE, job.id);
				} catch (err) {
					logger.error("Fixture ingestion job failed", {
						jobId: job.id,
						error: err,
					});
					await jobProvider.fail(FIXTURE_INGESTION_QUEUE, job.id);
				}
			}
		},
	);

	return { queueName: FIXTURE_INGESTION_QUEUE, workerId };
}
