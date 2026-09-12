/**
 * The source-agnostic half of ingestion: `SourceDocument[] -> classifier ->
 * context_items`.
 *
 * Everything upstream of this (talking to Google Drive, reading an uploaded
 * file, a future Gmail/Slack adapter) is the adapter's job; everything from
 * here down is shared, so a new source only has to produce `SourceDocument`s.
 * `packages/jobs/workers/drive-ingestion-worker.ts` and the file-upload
 * procedure in `@repo/api` both end here.
 */

import { contextItems, db } from "@repo/database";
import { logger } from "@repo/logs";
import { classifyContextItem } from "@repo/mastra";
import {
	type ContextSourceType,
	extractSourceId,
	SOURCE_SYSTEM_SOURCE_TYPE,
	type SourceDocument,
	toRawExcerpt,
} from "./source-document";

export interface IngestSourceDocumentsResult {
	/** Documents looked at this run (new + already-ingested). */
	processed: number;
	/** Documents correctly represented in `context_items` — newly inserted
	 * *and* classified, or already present from an earlier run. */
	succeeded: number;
	/** Documents that could not be stored or classified. A failure never
	 * aborts the run. */
	failed: number;
	inserted: number;
	skipped: number;
	total: number;
}

/** Sentinel claim for a row whose classification failed. Matches P1b's
 * `fixture-ingestion-worker.ts` values. */
const UNCLASSIFIED_STRUCTURED_CLAIM = {
	decision: "",
	reason: "unclassified — classifier call failed during ingestion",
	confidence: 0,
} as const;

/** Fail closed. `restricted` is the only classification never auto-released
 * regardless of org role, so a row we could not classify is safe by
 * construction until something re-classifies it. */
const UNCLASSIFIED_CLASSIFICATION = "restricted" as const;

/** How many documents are classified at once. Each is an LLM round trip and
 * a user is watching a button, so this is not fully sequential — but it stays
 * small to sit well inside provider rate limits. */
const INGEST_CONCURRENCY = 4;

interface IngestOwner {
	userId: string;
	organizationId: string;
}

/**
 * Resolves the owner + org every `context_items` row needs.
 *
 * A user with multiple memberships gets their first one: this repo's seed
 * data has single-org users and multi-org support is on product specification's cut
 * list.
 */
export async function resolveIngestOwner(userId: string): Promise<IngestOwner> {
	const ownerUser = await db.query.user.findFirst({
		where: (user, { eq }) => eq(user.id, userId),
	});
	if (!ownerUser) {
		throw new Error(`User not found for id "${userId}".`);
	}

	const membership = await db.query.member.findFirst({
		where: (member, { eq }) => eq(member.userId, userId),
	});
	if (!membership) {
		throw new Error(
			`No organization membership found for user "${userId}" (table "member") — this user must belong to an org for context_items.organizationId.`,
		);
	}

	const org = await db.query.organization.findFirst({
		where: (organization, { eq }) =>
			eq(organization.id, membership.organizationId),
	});
	if (!org) {
		throw new Error(
			`Organization "${membership.organizationId}" referenced by member row not found.`,
		);
	}

	return { userId: ownerUser.id, organizationId: org.id };
}

/**
 * Source IDs already ingested for one user and source type, read out of the
 * excerpt headers `toRawExcerpt` writes. Exported so an adapter can skip
 * fetching content it is about to discard (`ingestSourceDocuments` dedupes
 * again anyway — this is an optimization, not the guarantee).
 */
export async function getIngestedSourceIds(
	userId: string,
	sourceType: ContextSourceType,
): Promise<Set<string>> {
	const rows = await db.query.contextItems.findMany({
		where: (contextItems, { and, eq }) =>
			and(
				eq(contextItems.ownerId, userId),
				eq(contextItems.sourceType, sourceType),
			),
		columns: { rawExcerpt: true },
	});

	return new Set(
		rows
			.map((row) => extractSourceId(row.rawExcerpt))
			.filter((id): id is string => id !== null),
	);
}

/**
 * Classifies and stores a batch of normalized documents for one user.
 *
 * Idempotent: a document whose source ID is already present is skipped, so
 * re-running is safe. Per-document failures are contained and counted — one
 * unreadable or unclassifiable document never aborts the run.
 */
export async function ingestSourceDocuments(
	userId: string,
	documents: SourceDocument[],
): Promise<IngestSourceDocumentsResult> {
	const owner = await resolveIngestOwner(userId);

	// Dedup sets are per source type, since that is how the rows are indexed.
	const seenBySourceType = new Map<ContextSourceType, Set<string>>();
	for (const document of documents) {
		const sourceType = SOURCE_SYSTEM_SOURCE_TYPE[document.source];
		if (!seenBySourceType.has(sourceType)) {
			seenBySourceType.set(
				sourceType,
				await getIngestedSourceIds(userId, sourceType),
			);
		}
	}

	const newDocuments: SourceDocument[] = [];
	for (const document of documents) {
		const seen = seenBySourceType.get(
			SOURCE_SYSTEM_SOURCE_TYPE[document.source],
		);
		// Also guards against the same document appearing twice in one call.
		if (seen?.has(document.id)) {
			continue;
		}
		seen?.add(document.id);
		newDocuments.push(document);
	}

	const total = documents.length;
	const skipped = total - newDocuments.length;
	let inserted = 0;
	let failed = 0;

	/** Classify + store one document. Returns whether it ended up correctly
	 * classified; never throws. */
	const ingestOne = async (document: SourceDocument): Promise<boolean> => {
		const sourceType = SOURCE_SYSTEM_SOURCE_TYPE[document.source];
		try {
			const rawExcerpt = toRawExcerpt(document);

			let structuredClaim: {
				decision: string;
				reason: string;
				confidence: number;
			} = UNCLASSIFIED_STRUCTURED_CLAIM;
			let classification: (typeof contextItems.$inferInsert)["classification"] =
				UNCLASSIFIED_CLASSIFICATION;
			let classified = true;

			try {
				const result = await classifyContextItem({
					sourceType,
					rawExcerpt,
				});
				structuredClaim = result.structuredClaim;
				classification = result.classification;
			} catch (err) {
				classified = false;
				logger.warn(
					"Failed to classify document, storing unclassified",
					{
						sourceId: document.id,
						source: document.source,
						error: err,
					},
				);
			}

			await db.insert(contextItems).values({
				ownerId: owner.userId,
				organizationId: owner.organizationId,
				sourceType,
				rawExcerpt,
				structuredClaim,
				classification,
			});
			inserted++;
			return classified;
		} catch (err) {
			logger.warn("Failed to ingest document", {
				sourceId: document.id,
				source: document.source,
				error: err,
			});
			return false;
		}
	};

	for (let i = 0; i < newDocuments.length; i += INGEST_CONCURRENCY) {
		const batch = newDocuments.slice(i, i + INGEST_CONCURRENCY);
		const outcomes = await Promise.all(batch.map(ingestOne));
		failed += outcomes.filter((ok) => !ok).length;
	}

	const result: IngestSourceDocumentsResult = {
		processed: total,
		succeeded: total - failed,
		failed,
		inserted,
		skipped,
		total,
	};
	logger.info("Source document ingestion complete", { userId, ...result });
	return result;
}
