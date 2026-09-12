import { db } from "@repo/database";
import { z } from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { ContextAuditLogEntrySchema } from "../types";

/** Minimal person info for rendering "who" in the audit trail (U4) without
 * making the frontend do a second lookup — the demo only ever has two users,
 * but this keeps the page legible for more. */
const AuditLogPersonSchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string(),
});

const AuditLogEntryWithPeopleSchema = ContextAuditLogEntrySchema.extend({
	owner: AuditLogPersonSchema,
	requester: AuditLogPersonSchema,
});
export type AuditLogEntryWithPeople = z.infer<
	typeof AuditLogEntryWithPeopleSchema
>;

/**
 * `listAuditLog` — U4 (product specification §6 / "Phase 3/4 UI" table). Returns
 * `context_audit_log` rows where the calling user is either the `owner`
 * (someone asked about them) or the `requester` (they asked about someone
 * else), newest first, capped at 100 (no realistic scale concern for this
 * seeded demo — mirrors `listContextItems`'s reasoning for skipping
 * pagination).
 *
 * `context.user.id` (real Better Auth session, `protectedProcedure`) is the
 * only identity ever used to filter — never a client-supplied "which user am
 * I" param, same rule every other Mind Share procedure follows
 * (`negotiate-context.ts`, `listContextItems`).
 *
 * Joins in `owner`/`requester` name+email (via the `contextAuditLogRelations`
 * already defined in `packages/database/drizzle/schema/postgres.ts`) so the
 * audit trail page can render "Priya asked about Jordan" directly instead of
 * a raw id dump — product specification calls this page out as needing to be "clear and
 * legible, not just a raw dump."
 */
export const listAuditLog = protectedProcedure
	.route({
		method: "GET",
		path: "/mind-share/audit-log",
		tags: ["Mind Share"],
		summary:
			"List audit log entries where the caller is owner or requester",
		description:
			"Returns context_audit_log rows where the calling user is either the owner (someone asked about them) or the requester (they asked about someone else), newest first, with what was shared vs. redacted and why.",
	})
	.output(z.object({ entries: z.array(AuditLogEntryWithPeopleSchema) }))
	.handler(async ({ context }) => {
		const rows = await db.query.contextAuditLog.findMany({
			where: (contextAuditLog, { eq, or }) =>
				or(
					eq(contextAuditLog.ownerId, context.user.id),
					eq(contextAuditLog.requesterId, context.user.id),
				),
			orderBy: (contextAuditLog, { desc }) => [
				desc(contextAuditLog.createdAt),
			],
			limit: 100,
			with: {
				owner: true,
				requester: true,
			},
		});

		return {
			entries: rows.map((row) => ({
				...row,
				owner: {
					id: row.owner.id,
					name: row.owner.name,
					email: row.owner.email,
				},
				requester: {
					id: row.requester.id,
					name: row.requester.name,
					email: row.requester.email,
				},
			})),
		};
	});
