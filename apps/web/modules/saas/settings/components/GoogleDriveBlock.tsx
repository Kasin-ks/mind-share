"use client";

import { authClient } from "@repo/auth/client";
import { SettingsItem } from "@saas/shared/components/SettingsItem";
import { Button } from "@ui/components/button";
import { Skeleton } from "@ui/components/skeleton";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2Icon, ExternalLinkIcon, LinkIcon } from "lucide-react";
import { useTranslations } from "next-intl";

export function GoogleDriveBlock() {
	const t = useTranslations();

	const { data, isPending } = useQuery(
		orpc.googleDrive.getConnectionStatus.queryOptions(),
	);

	const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
	const isConnected = data?.connected ?? false;

	const handleConnectOrUpdateAccess = () => {
		const callbackURL = window.location.href;
		authClient.linkSocial({
			provider: "google",
			callbackURL,
			scopes: [GOOGLE_DRIVE_SCOPE],
		});
	};

	return (
		<SettingsItem title={t("settings.account.security.googleDrive.title")}>
			<div className="flex flex-col gap-3">
				{isPending ? (
					<Skeleton className="h-10 w-48" />
				) : isConnected ? (
					<div className="flex flex-col gap-3">
						<div className="flex items-center gap-2">
							<CheckCircle2Icon className="size-5 text-success" />
							<span className="text-sm">
								{t("settings.account.security.googleDrive.connected")}
							</span>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={handleConnectOrUpdateAccess}
							>
								<LinkIcon className="mr-1.5 size-4" />
								{t("settings.account.security.googleDrive.updateAccess")}
							</Button>
							<Button variant="outline" size="sm" asChild>
								<a
									href="https://drive.google.com"
									target="_blank"
									rel="noopener noreferrer"
								>
									<ExternalLinkIcon className="mr-1.5 size-4" />
									{t("settings.account.security.googleDrive.openDrive")}
								</a>
							</Button>
						</div>
					</div>
				) : (
					<div className="flex flex-col gap-3">
						<span className="text-muted-foreground text-sm">
							{t("settings.account.security.googleDrive.connectDescription")}
						</span>
						<Button variant="light" onClick={handleConnectOrUpdateAccess}>
							<LinkIcon className="mr-1.5 size-4" />
							{t("settings.account.security.googleDrive.connect")}
						</Button>
					</div>
				)}
			</div>
		</SettingsItem>
	);
}
