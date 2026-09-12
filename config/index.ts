import type { Config } from "./types";

export const config = {
	appName: "Mind Share",
	// Internationalization
	i18n: {
		// Whether internationalization should be enabled (if disabled, you still need to define the locale you want to use below and set it as the default locale)
		enabled: true,
		// Define all locales here that should be available in the app
		// You need to define a label that is shown in the language selector and a currency that should be used for pricing with this locale
		locales: {
			en: {
				currency: "USD",
				label: "English",
			},
			"zh-HK": {
				currency: "HKD",
				label: "香港繁體",
			},
			"zh-CN": {
				currency: "CNY",
				label: "简体中文",
			},
		},
		// The default locale is used if no locale is provided
		defaultLocale: "en",
		// The default currency is used for pricing if no currency is provided
		defaultCurrency: "USD",
		// The name of the cookie that is used to determine the locale
		localeCookieName: "NEXT_LOCALE",
	},
	// Organizations
	organizations: {
		// Whether organizations are enabled in general
		enable: true,
		// Whether billing for organizations should be enabled (below you can enable it for users instead)
		enableBilling: false,
		// Whether the organization should be hidden from the user (use this for multi-tenant applications)
		hideOrganization: true,
		// Should users be able to create new organizations? Otherwise only admin users can create them
		enableUsersToCreateOrganizations: false,
		// Whether users should be required to be in an organization. This will redirect users to the organization page after sign in
		requireOrganization: false,
		// Define forbidden organization slugs. Make sure to add all paths that you define as a route after /app/... to avoid routing issues
		forbiddenOrganizationSlugs: [
			"new-organization",
			"admin",
			"settings",
			"ai-demo",
			"organization-invitation",
			"developer",
		],
	},
	// Users
	users: {
		// Whether billing should be enabled for users (above you can enable it for organizations instead)
		enableBilling: false,
		// Whether you want the user to go through an onboarding form after signup (can be defined in the OnboardingForm.tsx)
		enableOnboarding: false,
	},
	// Authentication
	auth: {
		// Whether users should be able to create accounts (otherwise users can only be invited by admins)
		enableSignup: true,
		// Whether users should be able to sign in with a magic link
		enableMagicLink: false,
		// Whether users should be able to sign in with a social provider
		enableSocialLogin: false,
		// Whether users should be able to sign in with a passkey
		enablePasskeys: false,
		// Whether users should be able to sign in with a password
		enablePasswordLogin: true,
		// Whether users should be activate two factor authentication
		enableTwoFactor: false,
		// where users should be redirected after the sign in
		redirectAfterSignIn: "/app",
		// where users should be redirected after logout
		redirectAfterLogout: "/auth/login",
		// how long a session should be valid
		sessionCookieMaxAge: 60 * 60 * 24 * 30,
	},
	// Mails
	mails: {
		// the from address for mails
		from: "noreply@mindshare.test",
	},
	// Frontend
	ui: {
		// the themes that should be available in the app
		enabledThemes: ["light", "dark"],
		// the default theme
		defaultTheme: "dark",
		// the saas part of the application
		saas: {
			// whether the saas part should be enabled (otherwise all routes will be redirect to the marketing page)
			enabled: true,
			// whether the sidebar layout should be used
			useSidebarLayout: true,
		},
		// the marketing part of the application
		marketing: {
			// whether the marketing features should be enabled (otherwise all routes will be redirect to the saas part)
			enabled: true,
		},
	},
	// Storage
	storage: {
		// define the name of the bucket for all files (one-project-one-bucket)
		// This is server-only and not exposed to the client
		bucketName: process.env.S3_BUCKET ?? "",
	},
	// Google Drive integration (connect account, list files, etc.)
	googleDrive: {
		enabled: true,
	},
	contactForm: {
		// whether the contact form should be enabled
		enabled: true,
		// the email to which the contact form messages should be sent
		to: "young.leads@mindshare.test",
		// the subject of the email
		subject: "Contact form message",
	},
	// Payments
	payments: {
		// define the products that should be available in the checkout
		plans: {
			// The free plan is treated differently. It will automatically be assigned if the user has no other plan.
			free: {
				isFree: true,
			},
			pro: {
				recommended: true,
				prices: [
					{
						type: "recurring",
						productId: process.env
							.NEXT_PUBLIC_PRICE_ID_PRO_MONTHLY as string,
						interval: "month",
						amount: 29,
						currency: "USD",
						seatBased: true,
						trialPeriodDays: 7,
					},
					{
						type: "recurring",
						productId: process.env
							.NEXT_PUBLIC_PRICE_ID_PRO_YEARLY as string,
						interval: "year",
						amount: 290,
						currency: "USD",
						seatBased: true,
						trialPeriodDays: 7,
					},
				],
			},
			lifetime: {
				prices: [
					{
						type: "one-time",
						productId: process.env
							.NEXT_PUBLIC_PRICE_ID_LIFETIME as string,
						amount: 799,
						currency: "USD",
					},
				],
			},
			enterprise: {
				isEnterprise: true,
			},
		},
	},
	// Jobs
	jobs: {
		// whether jobs should be enabled
		enabled: true,
		// PostgreSQL schema for pg-boss (default: "pgboss")
		schema: process.env.PGBOSS_SCHEMA ?? "pgboss",
		// Application name for pg-boss connections (default: "pg-boss-worker")
		applicationName:
			process.env.PGBOSS_APPLICATION_NAME ?? "pg-boss-worker",
		// Max connections for pg-boss pool (default: 10)
		max: Number(process.env.PGBOSS_MAX) || 10,
		// Idle timeout: client closes connections before DB does (default 2 min; avoids "connection terminated")
		idleTimeoutMillis:
			process.env.PGBOSS_IDLE_TIMEOUT_MS != null
				? Number(process.env.PGBOSS_IDLE_TIMEOUT_MS)
				: 120_000,
		// Connection timeout when establishing (optional)
		connectionTimeoutMillis:
			process.env.PGBOSS_CONNECTION_TIMEOUT_MS != null
				? Number(process.env.PGBOSS_CONNECTION_TIMEOUT_MS)
				: undefined,
		// whether to include metrics collection
		includeMetrics: process.env.PGBOSS_INCLUDE_METRICS === "true",
	},
} as const satisfies Config;

export type { Config };
