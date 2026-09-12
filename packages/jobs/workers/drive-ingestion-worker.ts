/**
 * P1a — pg-boss job that pulls a user's real Google Drive files (F4,
 * `packages/google-drive/lib/client.ts`) into the `context_items` table (F1,
 * `packages/database/drizzle/schema/postgres.ts`).
 *
 * Sibling of P1b (`fixture-ingestion-worker.ts`) — matches its queue/worker
 * shape, idempotency approach, and pipeline-separation contract — but this
 * job is naturally **per-user**, unlike P1b's "load all fixtures" job:
 * Drive access is per-account (Better Auth's linked-account model), not a
 * static file on disk. So the job's data is `{ userId: string }` and it
 * enqueues once per user, rather than once total.
 *
 * Scope: the full Drive ingestion pipeline —
 * `Drive file -> SourceDocument -> classifier -> context_items`. Unlike P1b
 * (which still writes raw, unclassified rows), this job calls P1c's
 * `classifyContextItem` inline, because a row whose `classification` is the
 * `restricted` sentinel is indistinguishable from genuinely restricted
 * content downstream: the firewall never auto-releases it, so an unclassified
 * row makes every negotiation answer look like a full redaction.
 *
 * Classification is best-effort per file. When the classifier throws (bad API
 * key, rate limit, malformed response) the row is still written, using the
 * `UNCLASSIFIED_STRUCTURED_CLAIM` / `UNCLASSIFIED_CLASSIFICATION` sentinels
 * below and counted as `failed` — `restricted` is the only value that is
 * never auto-released regardless of org role, so failing closed is safe by
 * construction. Sentinel values are identical to P1b's, kept in sync manually
 * (see that file's comment for the full rationale).
 *
 * Account resolution: reuses the same two primitives
 * `packages/api/modules/google-drive/lib/drive-account.ts` /
 * `packages/api/modules/google-drive/procedures/list-files.ts` are built on
 * (Better Auth's `account` table + `auth.api.getAccessToken`), but does NOT
 * import from `@repo/api` — `@repo/api` already depends on `@repo/jobs`
 * (`packages/api/package.json`), so the reverse import would be circular,
 * the same constraint P1c hit with `@repo/mastra`/`@repo/api` and resolved
 * the same way: mirror the small pure helper (`pickGoogleDriveAccount`
 * below is a straight port of `getGoogleDriveAccountId`) rather than import
 * it, and call the lower-level primitive directly instead of the oRPC
 * procedure that wraps it:
 *
 * - `listUserAccounts` (the API `list-files.ts`/`get-file.ts` call) requires
 *   Better Auth's `sessionMiddleware`, i.e. real request headers with a
 *   session cookie — which a background job doesn't have. Its data (the
 *   linked `account` rows) is queried directly from `@repo/database` instead
 *   (same table Better Auth itself reads via its internal adapter).
 * - `getAccessToken`'s body schema (`better-auth@1.4.7`,
 *   `dist/api/routes/account.mjs`) accepts an optional plain `userId` field
 *   precisely for this case: `resolvedUserId = session?.user?.id || userId`,
 *   and the endpoint only requires a session when it detects a real HTTP
 *   `ctx.request` (`if (req && !session) throw UNAUTHORIZED`). Called
 *   directly (no `headers`, so no `ctx.request`), it resolves purely from
 *   `userId` + `accountId` — exactly the server-to-server shape this job
 *   needs.
 */

import { auth } from "@repo/auth";
import { db } from "@repo/database";
import { type DriveFile, getFileContent, listFiles } from "@repo/google-drive";
import { logger } from "@repo/logs";
import {
	getIngestedSourceIds,
	type IngestSourceDocumentsResult,
	ingestSourceDocuments,
} from "../lib/ingest-source-documents";
import type { SourceDocument } from "../lib/source-document";
import type { JobProvider } from "../types";

export const DRIVE_INGESTION_QUEUE = "drive-ingestion";

/** Job data for `drive-ingestion` — one job per user, unlike P1b's single
 * "load everything" fixture job (see file-level comment). */
export interface DriveIngestionJobData {
	userId: string;
	[key: string]: unknown;
}

/** Drive scope used when linking Google Drive in Settings → Integrations.
 * Mirrors `packages/api/modules/google-drive/lib/drive-account.ts`. */
const DRIVE_SCOPE = "drive";

/**
 * Picks the Google account that has Drive access, from a user's linked
 * `account` rows (there may be more than one Google account — e.g. one for
 * login-only, one explicitly linked for Drive). Mirrors
 * `getGoogleDriveAccountId` in
 * `packages/api/modules/google-drive/lib/drive-account.ts` — see file-level
 * comment for why this is a mirror, not an import.
 */
function pickGoogleDriveAccount<
	T extends { id: string; providerId: string; scope: string | null },
>(accounts: T[]): T | null {
	const googleAccounts = accounts.filter((a) => a.providerId === "google");
	const withDrive = googleAccounts.find((a) =>
		(a.scope ?? "").toLowerCase().includes(DRIVE_SCOPE),
	);
	return withDrive ?? null;
}

/**
 * How many Drive files to pull per run. A hackathon-scale demo dataset, not
 * a real sync — `listFiles` defaults to `orderBy: "modifiedTime desc"`, so
 * this naturally picks the most recently touched files, which are also the
 * most likely to contain the kind of "decision/belief/commitment/blocker"
 * content P1c's classifier is looking for (vs. e.g. old archived files).
 */
const DRIVE_FILE_LIMIT = 20;

/** How many files are fetched + classified at once. See the batching loop in
 * `ingestDriveFiles` for why this exists and why it stays small. */
const INGEST_CONCURRENCY = 4;

/**
 * The Drive adapter: turns one `DriveFile` into the pipeline's normalized
 * `SourceDocument` (`../lib/source-document.ts`). Content is real file text
 * when `getFileContent` can produce it (Google-native Docs exported to
 * text/csv, or textual uploaded files); binary files (images, PDFs, ...)
 * that `getFileContent` declines to decode fall back to a metadata-only
 * description, so they still become a (thin) context item rather than being
 * dropped silently. Truncation lives in `toRawExcerpt`, not here.
 */
async function toSourceDocument(
	accessToken: string,
	file: DriveFile,
): Promise<SourceDocument> {
	let content: string;
	try {
		const fetched = await getFileContent(accessToken, file);
		content =
			fetched !== null && fetched.trim().length > 0
				? fetched.trim()
				: `${file.name} (${file.mimeType}) — no extractable text content. Modified ${file.modifiedTime}. ${file.webViewLink ?? ""}`.trim();
	} catch (err) {
		logger.warn("Failed to fetch Drive file content, using metadata only", {
			fileId: file.id,
			error: err,
		});
		content =
			`${file.name} (${file.mimeType}) — content fetch failed. Modified ${file.modifiedTime}. ${file.webViewLink ?? ""}`.trim();
	}

	return {
		id: file.id,
		name: file.name,
		mimeType: file.mimeType,
		modifiedTime: file.modifiedTime,
		source: "google_drive",
		content,
	};
}

/** Drive ingestion reports exactly what the shared ingestor reports; kept as
 * a named alias because it is part of this module's public API. */
export type IngestDriveFilesResult = IngestSourceDocumentsResult;

/**
 * Core ingestion logic for one user: resolve their linked Google Drive
 * account, get an access token, pull up to `DRIVE_FILE_LIMIT` files, and
 * idempotently insert one `context_items` row per file. Exported separately
 * from the pg-boss worker registration so it can also be invoked directly by
 * a one-off script (`tooling/scripts/src/ingest-drive.ts`), same pattern as
 * P1b's `ingestFixtures`.
 */
export async function ingestDriveFiles(
	userId: string,
): Promise<IngestDriveFilesResult> {
	const ownerUser = await db.query.user.findFirst({
		where: (user, { eq }) => eq(user.id, userId),
	});
	if (!ownerUser) {
		throw new Error(`User not found for id "${userId}".`);
	}

	const linkedAccounts = await db.query.account.findMany({
		where: (account, { eq }) => eq(account.userId, userId),
	});
	const driveAccount = pickGoogleDriveAccount(linkedAccounts);
	if (!driveAccount) {
		throw new Error(
			`No linked Google account with Drive scope for user "${userId}" (${ownerUser.email}). ` +
				"They must connect Google Drive in Settings → Integrations (Better Auth account-linking, " +
				`"${DRIVE_SCOPE}" scope) before this job can run.`,
		);
	}

	const tokenResult = await auth.api.getAccessToken({
		body: {
			providerId: "google",
			accountId: driveAccount.id,
			userId,
		},
	});
	if (!tokenResult?.accessToken) {
		throw new Error(
			`Google Drive account linked for user "${userId}" but no access token could be obtained.`,
		);
	}
	const accessToken = tokenResult.accessToken;

	const { files } = await listFiles(accessToken, {
		pageSize: DRIVE_FILE_LIMIT,
		orderBy: "modifiedTime desc",
	});

	// Skip downloading content for files already ingested on an earlier run.
	// `ingestSourceDocuments` dedupes again on its own, so this is purely
	// about not paying for fetches whose result would be discarded — which is
	// also why already-seen files are still counted below.
	const alreadyIngested = await getIngestedSourceIds(userId, "drive");
	const newFiles = files.filter((file) => !alreadyIngested.has(file.id));

	// Content fetches are fast and independent, unlike the per-document LLM
	// call downstream, so they run in one batch rather than the ingestor's
	// small concurrency window.
	const documents = await Promise.all(
		newFiles.map((file) => toSourceDocument(accessToken, file)),
	);

	const result = await ingestSourceDocuments(userId, documents);

	// Report against the full Drive listing, not just the documents handed to
	// the ingestor, so "20 processed / 18 skipped" stays true on a re-sync.
	const skipped = files.length - newFiles.length + result.skipped;
	return {
		...result,
		processed: files.length,
		succeeded: files.length - result.failed,
		skipped,
		total: files.length,
	};
}

/**
 * Registers the `drive-ingestion` pg-boss queue + worker. Same shape as
 * `registerFixtureIngestionWorker`/`registerRateLimitedTaskWorker` (create
 * queue before `work`; return `{ queueName, workerId }` for graceful
 * shutdown in `server.ts`). Unlike P1b's worker, each job carries a
 * `{ userId }` payload (`DriveIngestionJobData`) — this queue is meant to be
 * `send()`-ed once per user (e.g. on a schedule, or after they link Drive),
 * not enqueued as a single global job.
 */
export async function registerDriveIngestionWorker(
	jobProvider: JobProvider,
): Promise<{ queueName: string; workerId: string }> {
	await jobProvider.createQueue(DRIVE_INGESTION_QUEUE, {
		retryLimit: 2,
		retryBackoff: true,
	});

	const workerId = await jobProvider.work(
		DRIVE_INGESTION_QUEUE,
		async (jobs) => {
			for (const job of jobs) {
				const data = job.data as unknown as DriveIngestionJobData;
				if (!data.userId) {
					logger.warn("Drive ingestion job missing userId", {
						jobId: job.id,
					});
					await jobProvider.fail(DRIVE_INGESTION_QUEUE, job.id);
					continue;
				}
				try {
					const result = await ingestDriveFiles(data.userId);
					logger.info("Drive ingestion job completed", {
						jobId: job.id,
						userId: data.userId,
						...result,
					});
					await jobProvider.complete(DRIVE_INGESTION_QUEUE, job.id);
				} catch (err) {
					logger.error("Drive ingestion job failed", {
						jobId: job.id,
						userId: data.userId,
						error: err,
					});
					await jobProvider.fail(DRIVE_INGESTION_QUEUE, job.id);
				}
			}
		},
	);

	return { queueName: DRIVE_INGESTION_QUEUE, workerId };
}
