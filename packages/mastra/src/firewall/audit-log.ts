/**
 * P2c — Context Firewall audit log writes.
 *
 * product specification Architecture §3's last bullet: "Every check writes to
 * `context_audit_log`: requester, owner, question, what was shared, what was
 * redacted, why." This module is that write path — a single small function,
 * not a pg-boss job, because audit writes must happen synchronously as part
 * of the disclosure-check flow (P2b's `checkDisclosurePolicy`, and later the
 * `negotiateContext` procedure), not queued and eventually-consistent. An
 * audit trail that might not have landed yet by the time someone reads it
 * (U4, the audit trail page) defeats the point.
 *
 * Scope: pure DB write. No LLM call belongs here — deciding *what* to share,
 * redact, and why is P2b's job (the firewall's RBAC + inference-risk logic);
 * this module just persists whatever decision it's handed. Keeping this
 * separate from `check-disclosure-policy.ts` (P2b, same directory, owned by
 * a parallel track) avoids a merge collision — this file is the only thing
 * this track touches in `packages/mastra/src/firewall/`.
 *
 * Shape: input mirrors `ContextAuditLogEntryInsertSchema`
 * (`packages/api/modules/mind-share/types.ts`'s `ContextAuditLogEntrySchema`
 * minus the DB-generated `id`/`createdAt` fields) — but this file does *not*
 * import from `@repo/api`, same call P1c made in
 * `context-classifier-agent.ts`: `@repo/api` already depends on
 * `@repo/mastra` (see `packages/api/package.json`), so the reverse import
 * would be circular. Instead this uses Drizzle's own inferred
 * insert/select types for `contextAuditLog`
 * (`packages/database/drizzle/schema/postgres.ts`), which is itself already
 * kept structurally identical to that Zod contract (see that file's
 * "Field shapes mirror the Zod contracts" comment) — so these two stay in
 * sync by construction rather than by a second hand-copied type. `receiptId`
 * is optional because the contract's linkage is one-directional and
 * nullable: `DisclosureReceipt.id` is the source of truth for a live
 * negotiation, and `ContextAuditLogEntry.receiptId` is an optional pointer
 * back to it — a caller with a receipt in hand passes its `id` through; a
 * caller that hasn't created one (or never does, e.g. a bare
 * `checkDisclosurePolicy` call with no negotiation) omits it and the column
 * stays null.
 */

import { contextAuditLog, db } from "@repo/database";

/** Insertable shape — everything `contextAuditLog` needs except the
 * DB-generated `id`/`createdAt`. Mirrors `ContextAuditLogEntryInsert` in
 * `packages/api/modules/mind-share/types.ts` (see file header for why this
 * isn't a direct import). */
export type AuditLogEntryInsert = Omit<
	typeof contextAuditLog.$inferInsert,
	"id" | "createdAt"
>;

/** The full row as returned after insert, including DB-generated fields.
 * Mirrors `ContextAuditLogEntry` in `packages/api/modules/mind-share/types.ts`. */
export type AuditLogEntry = typeof contextAuditLog.$inferSelect;

/**
 * Inserts one row into `context_audit_log` and returns the created row
 * (including the DB-generated `id`/`createdAt`) so callers can, if needed,
 * link a `DisclosureReceipt.id` to it after the fact, or pass `receiptId` in
 * up front when a receipt already exists.
 */
export async function writeAuditLogEntry(
	entry: AuditLogEntryInsert,
): Promise<AuditLogEntry> {
	const [row] = await db.insert(contextAuditLog).values(entry).returning();
	if (!row) {
		throw new Error(
			"Failed to write context_audit_log entry — no row returned from insert",
		);
	}
	return row;
}
