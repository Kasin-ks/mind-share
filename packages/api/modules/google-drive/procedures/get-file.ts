import { ORPCError } from "@orpc/server";
import { auth } from "@repo/auth";
import { config } from "@repo/config";
import { getFile as getDriveFile } from "@repo/google-drive";
import { z } from "zod";
import { getGoogleDriveAccountId } from "../lib/drive-account";
import { protectedProcedure } from "../../../orpc/procedures";

export const getFile = protectedProcedure
	.route({
		method: "GET",
		path: "/google-drive/files/{fileId}",
		tags: ["Google Drive"],
		summary: "Get Google Drive file metadata",
		description: "Get metadata for a single file by ID",
	})
	.input(z.object({ fileId: z.string().min(1) }))
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

		const file = await getDriveFile(tokenResult.accessToken, input.fileId);
		if (!file) {
			throw new ORPCError("NOT_FOUND", {
				message: "File not found",
			});
		}
		return { file };
	});
