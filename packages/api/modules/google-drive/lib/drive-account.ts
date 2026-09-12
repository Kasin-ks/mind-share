/** Drive scope used when linking Google Drive in Settings → Integrations */
const DRIVE_SCOPE = "drive";

interface AccountWithScope {
	id: string;
	providerId: string;
	scope?: string | null;
	scopes?: string[] | null;
}

/**
 * Picks the Google account that has Drive access when the user has multiple
 * linked Google accounts (e.g. one for login, one for Drive).
 * Returns null if no linked Google account has Drive scope.
 */
export function getGoogleDriveAccountId(
	accounts: AccountWithScope[],
): string | null {
	const googleAccounts = accounts.filter((account) => {
		return account.providerId === "google";
	});
	if (googleAccounts.length === 0) {
		return null;
	}

	const scopeString = (acc: AccountWithScope) => {
		return acc.scope ?? (acc.scopes ?? []).join(" ");
	};
	const hasDriveScope = (acc: AccountWithScope) => {
		return scopeString(acc).toLowerCase().includes(DRIVE_SCOPE);
	};

	const withDrive = googleAccounts.find(hasDriveScope);
	return withDrive?.id ?? null;
}
