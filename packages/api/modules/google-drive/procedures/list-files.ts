import { ORPCError } from "@orpc/server";
import { auth } from "@repo/auth";
import { config } from "@repo/config";
import { listFiles as listDriveFiles } from "@repo/google-drive";
import { z } from "zod";
import { getGoogleDriveAccountId } from "../lib/drive-account";
import { protectedProcedure } from "../../../orpc/procedures";

export const listFiles = protectedProcedure
	.route({
		method: "GET",
		path: "/google-drive/files",
		tags: ["Google Drive"],
		summary: "List Google Drive files",
		description: "List files from the user's Google Drive (read-only)",
	})
	.input(
		z.object({
			pageSize: z.number().min(1).max(100).optional().default(20),
			pageToken: z.string().optional(),
			q: z.string().optional(),
			orderBy: z.string().optional(),
		}),
	)
	.handler(async ({ context: { headers }, input }) => {
		if (!config.googleDrive.enabled) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Google Drive integration is disabled",
			});
		}
		const accounts = await auth.api.listUserAccounts({ headers });
		const driveAccountId = getGoogleDriveAccountId(accounts);
		if (!driveAccountId) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Google account not linked or token unavailable",
			});
		}
		const tokenResult = await auth.api.getAccessToken({
			body: { providerId: "google", accountId: driveAccountId },
			headers,
		});

		if (!tokenResult?.accessToken) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Google account not linked or token unavailable",
			});
		}

		return listDriveFiles(tokenResult.accessToken, {
			pageSize: input.pageSize,
			pageToken: input.pageToken,
			q: input.q,
			orderBy: input.orderBy,
		});
	});
