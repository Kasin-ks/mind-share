import { auth } from "@repo/auth";
import { config } from "@repo/config";
import { ORPCError } from "@orpc/server";
import { getGoogleDriveAccountId } from "../lib/drive-account";
import { protectedProcedure } from "../../../orpc/procedures";

export const getConnectionStatus = protectedProcedure
	.route({
		method: "GET",
		path: "/google-drive/connection-status",
		tags: ["Google Drive"],
		summary: "Get Google Drive connection status",
		description:
			"Returns whether the user has linked a Google account with Drive access",
	})
	.handler(async ({ context: { headers } }) => {
		if (!config.googleDrive.enabled) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Google Drive integration is disabled",
			});
		}
		const accounts = await auth.api.listUserAccounts({
			headers,
		});

		const driveAccountId = getGoogleDriveAccountId(accounts);

		return {
			connected: Boolean(driveAccountId),
			accountId: driveAccountId,
		};
	});
