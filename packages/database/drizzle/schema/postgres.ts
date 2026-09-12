import { createId as cuid } from "@paralleldrive/cuid2";
import { relations } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	json,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

/** Rolling-window rate limit: one row per slot used (per key). Auto-clean by retention. */
export const rateLimitSlots = pgTable(
	"rate_limit_slots",
	{
		id: text("id").notNull(),
		slotAt: timestamp("slot_at", { withTimezone: true }).notNull(),
		slotId: text("slot_id")
			.notNull()
			.$defaultFn(() => crypto.randomUUID()),
	},
	(table) => [
		index("rate_limit_slots_window_idx").on(table.id, table.slotAt),
		primaryKey({ columns: [table.id, table.slotId] }),
	],
);

/** Per-key rate limit config: window, max slots, retention for auto-clean. */
export const rateLimitConfig = pgTable("rate_limit_config", {
	id: text("id").primaryKey(),
	windowSeconds: integer("window_seconds").notNull(),
	maxSlots: integer("max_slots").notNull(),
	retentionMinutes: integer("retention_minutes").notNull(),
});

export const purchaseTypeEnum = pgEnum("PurchaseType", [
	"SUBSCRIPTION",
	"ONE_TIME",
]);

export const user = pgTable("user", {
	id: text("id")
		.$defaultFn(() => cuid())
		.primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("emailVerified").default(false).notNull(),
	image: text("image"),
	createdAt: timestamp("createdAt").defaultNow().notNull(),
	updatedAt: timestamp("updatedAt")
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
	username: text("username").unique(),
	displayUsername: text("displayUsername"),
	role: text("role"),
	banned: boolean("banned").default(false),
	banReason: text("banReason"),
	banExpires: timestamp("banExpires"),
	twoFactorEnabled: boolean("twoFactorEnabled").default(false),
	onboardingComplete: boolean("onboardingComplete"),
	paymentsCustomerId: text("paymentsCustomerId"),
	locale: text("locale"),
});

export const session = pgTable(
	"session",
	{
		id: text("id")
			.$defaultFn(() => cuid())
			.primaryKey(),
		expiresAt: timestamp("expiresAt").notNull(),
		token: text("token").notNull().unique(),
		createdAt: timestamp("createdAt").defaultNow().notNull(),
		updatedAt: timestamp("updatedAt")
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		ipAddress: text("ipAddress"),
		userAgent: text("userAgent"),
		userId: text("userId")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		impersonatedBy: text("impersonatedBy"),
		activeOrganizationId: text("activeOrganizationId"),
	},
	(table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
	"account",
	{
		id: text("id")
			.$defaultFn(() => cuid())
			.primaryKey(),
		accountId: text("accountId").notNull(),
		providerId: text("providerId").notNull(),
		userId: text("userId")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		accessToken: text("accessToken"),
		refreshToken: text("refreshToken"),
		idToken: text("idToken"),
		accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
		refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
		scope: text("scope"),
		password: text("password"),
		createdAt: timestamp("createdAt").defaultNow().notNull(),
		updatedAt: timestamp("updatedAt")
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
	"verification",
	{
		id: text("id")
			.$defaultFn(() => cuid())
			.primaryKey(),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: timestamp("expiresAt").notNull(),
		createdAt: timestamp("createdAt").defaultNow().notNull(),
		updatedAt: timestamp("updatedAt")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const passkey = pgTable(
	"passkey",
	{
		id: text("id")
			.$defaultFn(() => cuid())
			.primaryKey(),
		name: text("name"),
		publicKey: text("publicKey").notNull(),
		userId: text("userId")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		credentialID: text("credentialID").notNull(),
		counter: integer("counter").notNull(),
		deviceType: text("deviceType").notNull(),
		backedUp: boolean("backedUp").notNull(),
		transports: text("transports"),
		createdAt: timestamp("createdAt"),
		aaguid: text("aaguid"),
	},
	(table) => [
		index("passkey_userId_idx").on(table.userId),
		index("passkey_credentialID_idx").on(table.credentialID),
	],
);

export const organization = pgTable(
	"organization",
	{
		id: text("id")
			.$defaultFn(() => cuid())
			.primaryKey(),
		name: text("name").notNull(),
		slug: text("slug").notNull().unique(),
		logo: text("logo"),
		createdAt: timestamp("createdAt").notNull(),
		metadata: text("metadata"),
		paymentsCustomerId: text("paymentsCustomerId"),
	},
	(table) => [uniqueIndex("organization_slug_uidx").on(table.slug)],
);

export const member = pgTable(
	"member",
	{
		id: text("id")
			.$defaultFn(() => cuid())
			.primaryKey(),
		organizationId: text("organizationId")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		userId: text("userId")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		role: text("role").default("member").notNull(),
		createdAt: timestamp("createdAt").notNull(),
	},
	(table) => [
		index("member_organizationId_idx").on(table.organizationId),
		index("member_userId_idx").on(table.userId),
	],
);

export const invitation = pgTable(
	"invitation",
	{
		id: text("id")
			.$defaultFn(() => cuid())
			.primaryKey(),
		organizationId: text("organizationId")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		email: text("email").notNull(),
		role: text("role"),
		status: text("status").default("pending").notNull(),
		expiresAt: timestamp("expiresAt").notNull(),
		createdAt: timestamp("createdAt").defaultNow().notNull(),
		inviterId: text("inviterId")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
	},
	(table) => [
		index("invitation_organizationId_idx").on(table.organizationId),
		index("invitation_email_idx").on(table.email),
	],
);

export const twoFactor = pgTable(
	"twoFactor",
	{
		id: text("id")
			.$defaultFn(() => cuid())
			.primaryKey(),
		secret: text("secret").notNull(),
		backupCodes: text("backupCodes").notNull(),
		userId: text("userId")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
	},
	(table) => [
		index("twoFactor_secret_idx").on(table.secret),
		index("twoFactor_userId_idx").on(table.userId),
	],
);

export const purchase = pgTable("purchase", {
	id: text("id")
		.$defaultFn(() => cuid())
		.primaryKey(),
	organizationId: text("organizationId").references(() => organization.id, {
		onDelete: "cascade",
	}),
	userId: text("userId").references(() => user.id, {
		onDelete: "cascade",
	}),
	type: purchaseTypeEnum("type").notNull(),
	customerId: text("customerId").notNull(),
	subscriptionId: text("subscriptionId").unique(),
	productId: text("productId").notNull(),
	status: text("status"),
	createdAt: timestamp("createdAt").defaultNow().notNull(),
	updatedAt: timestamp("updatedAt"),
});

export const aiChat = pgTable("aiChat", {
	id: text("id")
		.$defaultFn(() => cuid())
		.primaryKey(),
	organizationId: text("organizationId").references(() => organization.id, {
		onDelete: "cascade",
	}),
	userId: text("userId").references(() => user.id, { onDelete: "cascade" }),
	title: text("title"),
	messages: json("messages").$type<Array<object>>(),
	createdAt: timestamp("createdAt").defaultNow().notNull(),
	updatedAt: timestamp("updatedAt"),
});

// ---------------------------------------------------------------------------
// Mind Share / Human Context Protocol (Foundation track F1).
// Field shapes mirror the Zod contracts in
// `packages/api/modules/mind-share/types.ts` (`ContextItemSchema`,
// `ContextAuditLogEntrySchema`). `protected_conclusions` isn't in that file
// (see product specification's Phase 2 firewall section) — minimal shape here, just
// enough for the inference-risk check to test "does answering X let the
// requester infer this owner's protected conclusion."
// ---------------------------------------------------------------------------

export const contextSourceTypeEnum = pgEnum("ContextSourceType", [
	"drive",
	"slack",
	"gmail",
]);

export const contextClassificationEnum = pgEnum("ContextClassification", [
	"public",
	"team",
	"private",
	"restricted",
]);

/** A structured claim extracted by the Mastra classifier step from a raw
 * excerpt. Mirrors `StructuredClaimSchema` in mind-share/types.ts, including
 * the optional `entities` who/what/topic graph added by the entities track
 * (product specification "P1c-entities" notes, 2026-09-12). */
export type StructuredClaimJson = {
	decision: string;
	reason: string;
	confidence: number;
	entities?: {
		project?: string | null;
		people?: string[] | null;
		topics?: string[] | null;
	} | null;
};

export const contextItems = pgTable(
	"context_items",
	{
		id: text("id")
			.$defaultFn(() => cuid())
			.primaryKey(),
		ownerId: text("ownerId")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		organizationId: text("organizationId").references(
			() => organization.id,
			{ onDelete: "cascade" },
		),
		sourceType: contextSourceTypeEnum("sourceType").notNull(),
		rawExcerpt: text("rawExcerpt").notNull(),
		structuredClaim: json("structuredClaim")
			.$type<StructuredClaimJson>()
			.notNull(),
		classification: contextClassificationEnum("classification").notNull(),
		createdAt: timestamp("createdAt").defaultNow().notNull(),
		updatedAt: timestamp("updatedAt")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date()),
	},
	(table) => [
		index("context_items_ownerId_idx").on(table.ownerId),
		index("context_items_organizationId_idx").on(table.organizationId),
	],
);

/** Minimal "thing the owner doesn't want inferred" row, seeded per demo user
 * (product specification Phase 2 firewall: "Seed 2-3 protected_conclusions per demo
 * user, e.g. 'job searching', 'comp band'"). Not part of the Step 0 Zod
 * contracts — no `packages/api/modules/mind-share/types.ts` schema to mirror
 * yet, so this is deliberately small: just enough for the inference-risk
 * pass to check candidate claims against. */
export const protectedConclusions = pgTable(
	"protected_conclusions",
	{
		id: text("id")
			.$defaultFn(() => cuid())
			.primaryKey(),
		ownerId: text("ownerId")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		organizationId: text("organizationId").references(
			() => organization.id,
			{ onDelete: "cascade" },
		),
		label: text("label").notNull(),
		description: text("description"),
		createdAt: timestamp("createdAt").defaultNow().notNull(),
	},
	(table) => [
		index("protected_conclusions_ownerId_idx").on(table.ownerId),
		index("protected_conclusions_organizationId_idx").on(
			table.organizationId,
		),
	],
);

/** Mirrors `SharedContextEntrySchema` / `RedactedContextEntrySchema` in
 * mind-share/types.ts — kept as loose json types here since the audit log
 * only ever stores the already-computed entries, never re-validates them. */
export type SharedContextEntryJson = {
	contextItemId?: string;
	content: string;
	classification: "public" | "team" | "private" | "restricted";
};
export type RedactedContextEntryJson = {
	contextItemId?: string;
	summary: string;
	classification: "public" | "team" | "private" | "restricted";
	reason: string;
};

export const contextAuditLog = pgTable(
	"context_audit_log",
	{
		id: text("id")
			.$defaultFn(() => cuid())
			.primaryKey(),
		receiptId: text("receiptId"),
		requesterId: text("requesterId")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		ownerId: text("ownerId")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		organizationId: text("organizationId").references(
			() => organization.id,
			{ onDelete: "cascade" },
		),
		question: text("question").notNull(),
		shared: json("shared").$type<Array<SharedContextEntryJson>>().notNull(),
		redacted: json("redacted")
			.$type<Array<RedactedContextEntryJson>>()
			.notNull(),
		why: text("why").notNull(),
		createdAt: timestamp("createdAt").defaultNow().notNull(),
	},
	(table) => [
		index("context_audit_log_requesterId_idx").on(table.requesterId),
		index("context_audit_log_ownerId_idx").on(table.ownerId),
		index("context_audit_log_organizationId_idx").on(table.organizationId),
	],
);

export const userRelations = relations(user, ({ many }) => ({
	sessions: many(session),
	accounts: many(account),
	passkeys: many(passkey),
	members: many(member),
	invitations: many(invitation),
	twoFactors: many(twoFactor),

	purchases: many(purchase),
	memberships: many(member),
	aiChats: many(aiChat),

	contextItems: many(contextItems),
	protectedConclusions: many(protectedConclusions),
	requestedAuditLogs: many(contextAuditLog, { relationName: "requester" }),
	ownedAuditLogs: many(contextAuditLog, { relationName: "owner" }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id],
	}),
}));

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id],
	}),
}));

export const passkeyRelations = relations(passkey, ({ one }) => ({
	user: one(user, {
		fields: [passkey.userId],
		references: [user.id],
	}),
}));

export const organizationRelations = relations(organization, ({ many }) => ({
	members: many(member),
	invitations: many(invitation),

	purchases: many(purchase),
	aiChats: many(aiChat),

	contextItems: many(contextItems),
	protectedConclusions: many(protectedConclusions),
	contextAuditLogs: many(contextAuditLog),
}));

export const memberRelations = relations(member, ({ one }) => ({
	organization: one(organization, {
		fields: [member.organizationId],
		references: [organization.id],
	}),
	user: one(user, {
		fields: [member.userId],
		references: [user.id],
	}),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
	organization: one(organization, {
		fields: [invitation.organizationId],
		references: [organization.id],
	}),
	user: one(user, {
		fields: [invitation.inviterId],
		references: [user.id],
	}),
}));

export const twoFactorRelations = relations(twoFactor, ({ one }) => ({
	user: one(user, {
		fields: [twoFactor.userId],
		references: [user.id],
	}),
}));

export const purchaseRelations = relations(purchase, ({ one }) => ({
	organization: one(organization, {
		fields: [purchase.organizationId],
		references: [organization.id],
	}),
	user: one(user, {
		fields: [purchase.userId],
		references: [user.id],
	}),
}));

export const aiChatRelations = relations(aiChat, ({ one }) => ({
	organization: one(organization, {
		fields: [aiChat.organizationId],
		references: [organization.id],
	}),
	user: one(user, {
		fields: [aiChat.userId],
		references: [user.id],
	}),
}));

export const contextItemsRelations = relations(contextItems, ({ one }) => ({
	owner: one(user, {
		fields: [contextItems.ownerId],
		references: [user.id],
	}),
	organization: one(organization, {
		fields: [contextItems.organizationId],
		references: [organization.id],
	}),
}));

export const protectedConclusionsRelations = relations(
	protectedConclusions,
	({ one }) => ({
		owner: one(user, {
			fields: [protectedConclusions.ownerId],
			references: [user.id],
		}),
		organization: one(organization, {
			fields: [protectedConclusions.organizationId],
			references: [organization.id],
		}),
	}),
);

export const contextAuditLogRelations = relations(
	contextAuditLog,
	({ one }) => ({
		requester: one(user, {
			fields: [contextAuditLog.requesterId],
			references: [user.id],
			relationName: "requester",
		}),
		owner: one(user, {
			fields: [contextAuditLog.ownerId],
			references: [user.id],
			relationName: "owner",
		}),
		organization: one(organization, {
			fields: [contextAuditLog.organizationId],
			references: [organization.id],
		}),
	}),
);
