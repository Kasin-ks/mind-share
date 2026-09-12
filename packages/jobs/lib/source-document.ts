/**
 * The normalized shape every source adapter produces, and the single place
 * that knows how a source document becomes a `context_items.rawExcerpt`.
 *
 * Only the Google Drive adapter exists today
 * (`../workers/drive-ingestion-worker.ts`). This file is the extension point
 * for the others: a future Gmail or Slack adapter's whole job is to produce
 * `SourceDocument[]`, after which the rest of the pipeline — classifier,
 * Context Store, graph — is shared and unchanged.
 */

/** Which upstream system a document came from. Maps onto the
 * `ContextSourceType` DB enum via `SOURCE_SYSTEM_SOURCE_TYPE` below; the two
 * are separate because the external-facing names ("google_drive") and the
 * stored enum values ("drive") differ. */
export type SourceSystem = "google_drive" | "upload" | "gmail" | "slack";

export type ContextSourceType = "drive" | "gmail" | "slack";

/** Note `upload -> "drive"`: a directly uploaded document is a file, and the
 * `ContextSourceType` DB enum has no "upload" value. Adding one means an
 * `ALTER TYPE` migration against a database that already holds demo data, for
 * no behavioural gain — uploads and Drive files travel the identical pipeline
 * and are told apart by their `upload-…` source ID in the excerpt header. */
export const SOURCE_SYSTEM_SOURCE_TYPE: Record<
	SourceSystem,
	ContextSourceType
> = {
	google_drive: "drive",
	upload: "drive",
	gmail: "gmail",
	slack: "slack",
};

export interface SourceDocument {
	/** Stable ID in the upstream system (e.g. a Drive file ID). Used as the
	 * dedup key, embedded in the excerpt header below. */
	id: string;
	name: string;
	mimeType: string;
	modifiedTime?: string;
	source: SourceSystem;
	content: string;
}

/**
 * Max characters of document content kept in `rawExcerpt`. Source documents
 * (a long Doc, a Sheet exported to CSV) can be arbitrarily large;
 * `rawExcerpt` is an *excerpt* fed to the classifier and rendered in the UI,
 * not a document store. ~4000 chars is enough to reach a real
 * decision/blocker near the top of a doc while staying inside classifier
 * prompt budgets when a batch of items is reasoned over together.
 */
const EXCERPT_MAX_CHARS = 4000;

/**
 * Serializes a `SourceDocument` into the `rawExcerpt` stored on the row:
 *
 *     [drive:<fileId>] <document name>
 *
 *     <content, truncated>
 *
 * The bracketed header does double duty. Ingestion uses it as the idempotency
 * key (`extractSourceId`), and `packages/api/modules/mind-share/lib/
 * context-graph.ts` reads the same header for a document node's stable ID and
 * label — so the format is a small contract between those two files, not an
 * internal detail. The name is kept in the excerpt body too because file
 * names carry real classification signal ("Turbojet UAT plan").
 */
export function toRawExcerpt(document: SourceDocument): string {
	const sourceType = SOURCE_SYSTEM_SOURCE_TYPE[document.source];
	const body = document.content.trim().slice(0, EXCERPT_MAX_CHARS);
	return `[${sourceType}:${document.id}] ${document.name}\n\n${body}`.trim();
}

const SOURCE_HEADER_RE = /^\[(?:drive|gmail|slack):([^\]]+)\]/;

/** Inverse of `toRawExcerpt`'s header, for dedup against already-stored rows.
 * Returns null for rows written before this format existed. */
export function extractSourceId(rawExcerpt: string): string | null {
	return rawExcerpt.match(SOURCE_HEADER_RE)?.[1] ?? null;
}
