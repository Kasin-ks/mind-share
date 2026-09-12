import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import {
	NegotiateContextError,
	negotiateContext as negotiateContextCore,
} from "../lib/negotiate";
import { DisclosureReceiptSchema } from "../types";

/**
 * `negotiateContext` — product specification §5 / the "Converges last" table's first
 * row. Thin `protectedProcedure` wrapper around
 * `../lib/negotiate.ts`'s `negotiateContext` (see that file's header for the
 * actual design — in-process agent call, receipt reconstruction, audit
 * logging). This file's only job is real-session auth and error-shape
 * translation into `ORPCError`, mirroring
 * `../../google-drive/procedures/{list-files,get-file}.ts`'s structure.
 *
 * `fromUserId` is NEVER accepted from client input — it is always
 * `context.user.id`, the real authenticated user from Better Auth's session
 * (`protectedProcedure`, `packages/api/orpc/procedures.ts`). Accepting it as
 * client input would let any caller assert any identity, exactly the "AUTH
 * GAP" `create-user-mcp-server.ts` documents for the open MCP transport —
 * the whole point of doing this in-process is to NOT reproduce that gap.
 */
export const negotiateContext = protectedProcedure
	.route({
		method: "POST",
		path: "/mind-share/negotiate-context",
		tags: ["Mind Share"],
		summary: "Ask a teammate's Context Agent a question",
		description:
			"Negotiates context with another user's Context Agent on the caller's behalf: asks `question` for the stated `purpose`, and returns the agent's scoped answer plus a DisclosureReceipt showing what was shared vs. redacted (and why).",
	})
	.input(
		z.object({
			toUserId: z.string().min(1),
			question: z.string().min(1),
			purpose: z.string().min(1),
		}),
	)
	.output(
		z.object({
			answer: z.string(),
			receipt: DisclosureReceiptSchema,
		}),
	)
	.handler(async ({ context, input }) => {
		try {
			return await negotiateContextCore({
				fromUserId: context.user.id,
				toUserId: input.toUserId,
				question: input.question,
				purpose: input.purpose,
			});
		} catch (err) {
			if (err instanceof NegotiateContextError) {
				throw new ORPCError(err.code, { message: err.message });
			}
			// Anything else (e.g. the agent's `generate()` call failing against
			// the upstream LLM provider — the recurring missing-API-key blocker
			// documented throughout product specification) is a genuine internal failure,
			// not a client input error.
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message:
					err instanceof Error
						? err.message
						: "negotiateContext failed for an unknown reason",
			});
		}
	});
