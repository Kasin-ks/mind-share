export interface MonitoringProviderStrategy {
	/**
	 * Capture an exception
	 * @param error - The error to capture
	 * @param extra - Additional context data
	 */
	captureException<Extra extends Record<string, unknown>>(
		error: unknown,
		extra?: Extra,
	): void;

	/**
	 * Identify a user in the monitoring service - used for tracking user actions
	 * @param info - User information with at least an id
	 */
	identify<Info extends { id: string }>(info: Info | null): unknown;

	/**
	 * Initialize the monitoring service
	 */
	initialize(): void | Promise<void>;
}

export interface MonitoringProviderClientStrategy
	extends MonitoringProviderStrategy {
	onRouterTransitionStart: (
		href: string,
		navigationType: string,
	) => void | Promise<void>;
}

export interface MonitoringProviderServerStrategy
	extends Omit<MonitoringProviderStrategy, "identify"> {
	onRequestError: (
		error: unknown,
		errorRequest: Readonly<{
			path: string;
			method: string;
			headers: NodeJS.Dict<string | string[]>;
		}>,
		errorContext: Readonly<{
			routerKind: string;
			routePath: string;
			routeType: string;
		}>,
	) => void | Promise<void>;
}
