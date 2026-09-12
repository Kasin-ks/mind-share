import { ORPCError } from "@orpc/server";
import { config } from "@repo/config";
import { ingestDriveFiles } from "@repo/jobs";
import { protectedProcedure } from "../../../orpc/procedures";
import { SyncSourceResultSchema } from "../types";

/**
 * `syncGoogleDrive` — the one button behind the Context Map: pulls the
 * caller's most recent Drive documents, runs each through the existing
 * classifier, and upserts them into the existing Context Store.
 *
 * The whole pipeline already lives in `@repo/jobs`'
 * `ingestDriveFiles(userId)` (`packages/jobs/workers/drive-ingestion-worker
 * .ts`) — account resolution, access token, Drive listing, normalization,
 * classification, dedup, insert. This procedure calls it **in-process rather
 * than enqueuing the pg-boss job**, on purpose: the user is watching a button
 * spinner and needs the counts back in the same request, and a ~20-document
 * run is short enough not to need a queue. The queue path
 * (`DRIVE_INGESTION_QUEUE`) stays available unchanged for a scheduled sync
 * later.
 *
 * `userId` is always `context.user.id` from the Better Auth session and never
 * client input — same rule as `negotiate-context.ts` / `list-context-items
 * .ts`; a caller can only ever sync their own Drive into their own context.
 */
export const syncGoogleDrive = protectedProcedure
	.route({
		method: "POST",
		path: "/mind-share/sync/google-drive",
		tags: ["Mind Share"],
		summary: "Sync the caller's Google Drive into their context",
		description:
			"Pulls the caller's most recently modified Google Drive documents, classifies each one, and stores them as context_items (deduplicated by Drive file ID). Per-document failures are counted, not fatal.",
	})
	.output(SyncSourceResultSchema)
	.handler(async ({ context }) => {
		if (!config.googleDrive.enabled) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Google Drive integration is disabled",
			});
		}

		try {
			const result = await ingestDriveFiles(context.user.id);
			return {
				processed: result.processed,
				succeeded: result.succeeded,
				failed: result.failed,
				skipped: result.skipped,
			};
		} catch (err) {
			// `ingestDriveFiles` throws only for whole-run preconditions (no
			// org membership, no linked Drive account, no access token) — every
			// per-document problem is already counted inside the result.
			throw new ORPCError("BAD_REQUEST", {
				message:
					err instanceof Error
						? err.message
						: "Google Drive sync failed",
			});
		}
	});
