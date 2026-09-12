import { config } from "@repo/config";
import { getSession } from "@saas/auth/lib/server";
import { GoogleDriveBlock } from "@saas/settings/components/GoogleDriveBlock";
import { SettingsList } from "@saas/shared/components/SettingsList";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
	const t = await getTranslations();

	return {
		title: t("settings.account.integrations.title"),
	};
}

export default async function IntegrationsSettingsPage() {
	const session = await getSession();

	if (!session) {
		redirect("/auth/login");
	}

	return (
		<SettingsList>
			{config.googleDrive.enabled && <GoogleDriveBlock />}
		</SettingsList>
	);
}
