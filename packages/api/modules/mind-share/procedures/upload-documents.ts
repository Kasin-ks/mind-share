import { createHash } from "node:crypto";
import { ORPCError } from "@orpc/server";
import { ingestSourceDocuments, type SourceDocument } from "@repo/jobs";
import { z } from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { SyncSourceResultSchema } from "../types";

/**
 * `uploadDocuments` — build context from files the user hands us directly,
 * instead of from a connected source.
 *
 * This is the same pipeline as `sync-google-drive.ts` with a different
 * adapter in front of it: the browser reads each file as text and posts it,
 * we normalize it to a `SourceDocument`, and `ingestSourceDocuments` does the
 * rest (classify, dedupe, store). Nothing about the classifier, the Context
 * Store, or the graph knows the difference.
 *
 * Text extraction happens client-side on purpose — the browser already has
 * the bytes, and doing it there keeps this endpoint a plain JSON procedure
 * with no multipart handling, no upload storage, and no binary parsing
 * dependency. Formats that need real extraction (PDF, DOCX) are therefore
 * out of scope here rather than silently producing garbage excerpts; that is
 * an extension point, not a limitation of the pipeline.
 *
 * `userId` is always `context.user.id` from the session and never client
 * input — same rule as every other Mind Share procedure.
 */

/** Per-file cap on posted text. Excerpts are truncated to ~4000 chars when
 * stored anyway (`toRawExcerpt`), so this only exists to keep a stray large
 * file from bloating the request body. */
const MAX_CONTENT_CHARS = 200_000;

/** Per-request file cap. The button is a demo affordance, not a bulk
 * importer, and each file costs one LLM round trip. */
const MAX_FILES = 20;

const UploadedDocumentSchema = z.object({
	name: z.string().min(1).max(400),
	mimeType: z.string().max(200).default("text/plain"),
	content: z.string().min(1).max(MAX_CONTENT_CHARS),
});

/**
 * Content-addressed source identity: re-uploading a byte-identical file under
 * the same name is a no-op (counted as `skipped`), while an edited file is
 * genuinely new context. This is the upload equivalent of the Drive file ID,
 * and it is what the `upload-` prefix in the excerpt header marks.
 */
function uploadSourceId(name: string, content: string): string {
	const digest = createHash("sha256")
		.update(`${name}\n${content}`)
		.digest("hex");
	return `upload-${digest.slice(0, 16)}`;
}

export const uploadDocuments = protectedProcedure
	.route({
		method: "POST",
		path: "/mind-share/upload-documents",
		tags: ["Mind Share"],
		summary: "Ingest uploaded documents into the caller's context",
		description:
			"Classifies plain-text documents uploaded by the caller and stores them as context_items (deduplicated by content hash). Per-document failures are counted, not fatal.",
	})
	.input(
		z.object({
			documents: z.array(UploadedDocumentSchema).min(1).max(MAX_FILES),
		}),
	)
	.output(SyncSourceResultSchema)
	.handler(async ({ context, input }) => {
		const documents: SourceDocument[] = input.documents.map((document) => ({
			id: uploadSourceId(document.name, document.content),
			name: document.name,
			mimeType: document.mimeType,
			source: "upload",
			content: document.content,
		}));

		try {
			const result = await ingestSourceDocuments(
				context.user.id,
				documents,
			);
			return {
				processed: result.processed,
				succeeded: result.succeeded,
				failed: result.failed,
				skipped: result.skipped,
			};
		} catch (err) {
			// Only whole-run preconditions reach here (no org membership, DB
			// unavailable) — per-document problems are already counted.
			throw new ORPCError("BAD_REQUEST", {
				message:
					err instanceof Error
						? err.message
						: "Document upload failed",
			});
		}
	});
