import { auth } from "@repo/auth";
import {
	account,
	db,
	invitation,
	member,
	organization,
	user,
} from "@repo/database";
import { logger } from "@repo/logs";
import { eq } from "drizzle-orm";

const SEED_PASSWORD = "Pa$$w0rd";

const getImage = (name: string) => `https://avatar.vercel.sh/${name}`;

// User definitions
const users = [
	{
		name: "me+org-admin",
		email: "me+org-admin@mindshare.test",
		image: getImage("me+org-admin"),
		role: "user" as const,
		orgRole: "admin" as const,
	},
	{
		name: "me+org-owner",
		email: "me+org-owner@mindshare.test",
		image: getImage("me+org-owner"),
		role: "user" as const,
		orgRole: "owner" as const,
	},
	{
		name: "me+org-member",
		email: "me+org-member@mindshare.test",
		image: getImage("me+org-member"),
		role: "user" as const,
		orgRole: "member" as const,
	},
	{
		name: "me+admin",
		email: "me+admin@mindshare.test",
		image: getImage("me+admin"),
		role: "admin" as const,
		orgRole: null,
	},
	{
		name: "me+user",
		email: "me+user@mindshare.test",
		image: getImage("me+user"),
		role: "user" as const,
		orgRole: null,
	},
];

// Organization definition
const orgData = {
	name: "seed-organization",
	slug: "seed-organization",
	logo: getImage("seed-organization"),
};

// -----------------------------------------------------------------------
// Mind Share demo seed (F2): a dedicated org + 2 users for the Human
// Context Protocol demo. These are the identities the firewall/negotiation
// demo (Phase 2+) queries against, so names/emails/roles here are the
// source of truth for downstream tracks (F3 fixtures, P2 firewall, U2/U3
// UI). Kept separate from the generic `seed-organization` block above so
// the two seed flows don't interfere with each other.
//
// - Jordan Blake (owner): the context *owner* in the demo — their seeded
//   Slack/Gmail fixtures (F3) will include the "job searching" and
//   "comp band" protected conclusions referenced in product specification's firewall
//   section, the sensitive facts the 3-question demo script probes. Given
//   org role `owner` (rather than `admin`) since that most naturally
//   represents "the person whose own data this is," and this org otherwise
//   had no `owner`-role member, unlike the generic `seed-organization`
//   above.
// - Priya Shah (member): the *requester* in the demo. Per the firewall's
//   RBAC mapping (member→team, admin→+private, restricted→never), a plain
//   `member` is capped at `team`-tier content — `private` content (e.g.
//   Jordan's salary/comp data) is genuinely out of RBAC reach, which is
//   what makes question 2 ("what's their salary" → redacted) and question
//   3 (the inference attack) meaningful to demo. If Priya were `admin` (or
//   `owner`), she'd already have blanket same-org access to Jordan's
//   private data via RBAC alone, and both of those demo moments would have
//   nothing to redact/block.
const mindShareOrgData = {
	name: "Acme Robotics",
	slug: "acme-robotics",
	logo: getImage("acme-robotics"),
};

const mindShareUsers = [
	{
		name: "Jordan Blake",
		email: "jordan.blake@acme-robotics.test",
		image: getImage("jordan-blake"),
		role: "user" as const,
		orgRole: "owner" as const,
	},
	{
		name: "Priya Shah",
		email: "priya.shah@acme-robotics.test",
		image: getImage("priya-shah"),
		role: "user" as const,
		orgRole: "member" as const,
	},
];

// Invitation definitions
const invitations = [
	{
		email: "me+org-invite-admin@mindshare.test",
		role: "admin" as const,
		status: "pending" as const,
	},
	{
		email: "me+org-invite-member@mindshare.test",
		role: "member" as const,
		status: "pending" as const,
	},
] as const;

async function seedUser({
	email,
	name,
	image,
	role,
}: {
	email: string;
	name: string;
	image: string;
	role: "admin" | "user";
}) {
	const authContext = await auth.$context;
	const hashedPassword = await authContext.password.hash(SEED_PASSWORD);

	return await db.transaction(async (tx) => {
		// Check if user exists
		const existingUser = await tx.query.user.findFirst({
			where: (user, { eq }) => eq(user.email, email),
		});

		if (existingUser) {
			// Update existing user
			await tx
				.update(user)
				.set({
					name,
					image,
					role,
					emailVerified: true,
					onboardingComplete: true,
					updatedAt: new Date(),
				})
				.where(eq(user.id, existingUser.id));

			// Check if account exists
			const existingAccount = await tx.query.account.findFirst({
				where: (account, { eq, and }) =>
					and(
						eq(account.userId, existingUser.id),
						eq(account.providerId, "credential"),
					),
			});

			if (!existingAccount) {
				// Create account
				await tx.insert(account).values({
					userId: existingUser.id,
					accountId: existingUser.id,
					providerId: "credential",
					password: hashedPassword,
					createdAt: new Date(),
					updatedAt: new Date(),
				});
			} else {
				// Update password
				await tx
					.update(account)
					.set({ password: hashedPassword })
					.where(eq(account.id, existingAccount.id));
			}

			return existingUser;
		}

		// Create new user
		const [newUser] = await tx
			.insert(user)
			.values({
				email,
				name,
				image,
				role,
				emailVerified: true,
				onboardingComplete: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			})
			.returning();

		if (!newUser) {
			throw new Error(`Failed to create user: ${email}`);
		}

		// Create account
		await tx.insert(account).values({
			userId: newUser.id,
			accountId: newUser.id,
			providerId: "credential",
			password: hashedPassword,
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		return newUser;
	});
}

async function seedOrganization(data: {
	name: string;
	slug: string;
	logo: string;
}) {
	return await db.transaction(async (tx) => {
		// Check if organization exists
		const existingOrg = await tx.query.organization.findFirst({
			where: (org, { eq }) => eq(org.slug, data.slug),
		});

		if (existingOrg) {
			// Update existing organization
			await tx
				.update(organization)
				.set({
					name: data.name,
					logo: data.logo,
				})
				.where(eq(organization.id, existingOrg.id));

			return existingOrg;
		}

		// Create new organization
		const [newOrg] = await tx
			.insert(organization)
			.values({
				name: data.name,
				slug: data.slug,
				logo: data.logo,
				createdAt: new Date(),
			})
			.returning();

		if (!newOrg) {
			throw new Error("Failed to create organization");
		}

		return newOrg;
	});
}

async function seedOrganizationMember({
	organizationId,
	userId,
	role,
}: {
	organizationId: string;
	userId: string;
	role: "admin" | "owner" | "member";
}) {
	return await db.transaction(async (tx) => {
		// Check if member already exists
		const existingMember = await tx.query.member.findFirst({
			where: (member, { eq, and }) =>
				and(
					eq(member.organizationId, organizationId),
					eq(member.userId, userId),
				),
		});

		if (existingMember) {
			// Update existing member
			const [updatedMember] = await tx
				.update(member)
				.set({ role })
				.where(eq(member.id, existingMember.id))
				.returning();

			return updatedMember;
		}

		// Create new member
		const [newMember] = await tx
			.insert(member)
			.values({
				organizationId,
				userId,
				role,
				createdAt: new Date(),
			})
			.returning();

		if (!newMember) {
			throw new Error(
				`Failed to create member: userId=${userId}, orgId=${organizationId}`,
			);
		}

		return newMember;
	});
}

async function seedOrganizationInvitation({
	organizationId,
	inviterId,
	email,
	role,
	status,
}: {
	organizationId: string;
	inviterId: string;
	email: string;
	role: "admin" | "member";
	status: "pending";
}) {
	const expiresAt = new Date();
	expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now

	return await db.transaction(async (tx) => {
		// Check if invitation already exists for this specific inviter and email
		const existingInvitation = await tx.query.invitation.findFirst({
			where: (invitation, { eq, and }) =>
				and(
					eq(invitation.organizationId, organizationId),
					eq(invitation.email, email),
					eq(invitation.inviterId, inviterId),
				),
		});

		if (existingInvitation) {
			// Update existing invitation
			const [updatedInvitation] = await tx
				.update(invitation)
				.set({
					role,
					status,
					expiresAt,
					inviterId,
				})
				.where(eq(invitation.id, existingInvitation.id))
				.returning();

			return updatedInvitation;
		}

		// Create new invitation
		const [newInvitation] = await tx
			.insert(invitation)
			.values({
				organizationId,
				email,
				role,
				status,
				expiresAt,
				inviterId,
			})
			.returning();

		if (!newInvitation) {
			throw new Error(
				`Failed to create invitation: email=${email}, orgId=${organizationId}`,
			);
		}

		return newInvitation;
	});
}

async function main() {
	logger.info("Starting seed script...");

	try {
		// Seed users
		logger.info("Seeding users...");
		const seededUsers = await Promise.all(
			users.map((userData) =>
				seedUser({
					email: userData.email,
					name: userData.name,
					image: userData.image,
					role: userData.role,
				}),
			),
		);

		logger.success(`Seeded ${seededUsers.length} users`);

		// Seed organization
		logger.info("Seeding organization...");
		const seededOrg = await seedOrganization(orgData);
		logger.success(`Seeded organization: ${seededOrg.name}`);

		// Seed organization members
		logger.info("Seeding organization members...");
		const orgMembers = users.filter(
			(u): u is typeof u & { orgRole: "admin" | "owner" | "member" } =>
				u.orgRole !== null,
		);
		const seededMembers = await Promise.all(
			orgMembers.map((userData) => {
				const foundUser = seededUsers.find(
					(u) => u.email === userData.email,
				);
				if (!foundUser) {
					throw new Error(`User not found: ${userData.email}`);
				}
				return seedOrganizationMember({
					organizationId: seededOrg.id,
					userId: foundUser.id,
					role: userData.orgRole,
				});
			}),
		);

		logger.success(`Seeded ${seededMembers.length} organization members`);

		// Seed invitations
		// Owner, admin, and member each invite both org-invite-admin & org-invite-member
		logger.info("Seeding invitations...");

		// Get the specific inviters: owner, admin, and member
		const ownerUser = seededUsers.find(
			(u) => u.email === "me+org-owner@mindshare.test",
		);
		const adminUser = seededUsers.find(
			(u) => u.email === "me+org-admin@mindshare.test",
		);
		const memberUser = seededUsers.find(
			(u) => u.email === "me+org-member@mindshare.test",
		);

		if (!ownerUser || !adminUser || !memberUser) {
			throw new Error("Required org members not found for invitations");
		}

		const inviters = [
			{ userId: ownerUser.id, role: "owner" },
			{ userId: adminUser.id, role: "admin" },
			{ userId: memberUser.id, role: "member" },
		];

		// Each inviter invites both org-invite-admin and org-invite-member
		const invitationPromises = inviters.flatMap((inviter) =>
			invitations.map((invitationData) =>
				seedOrganizationInvitation({
					organizationId: seededOrg.id,
					inviterId: inviter.userId,
					email: invitationData.email,
					role: invitationData.role,
					status: invitationData.status,
				}),
			),
		);

		const seededInvitations = await Promise.all(invitationPromises);
		logger.success(
			`Seeded ${seededInvitations.length} invitations (${inviters.length} inviters × ${invitations.length} invitations each)`,
		);

		// Seed Mind Share demo org + users (F2)
		logger.info("Seeding Mind Share demo org and users...");
		const seededMindShareUsers = await Promise.all(
			mindShareUsers.map((userData) =>
				seedUser({
					email: userData.email,
					name: userData.name,
					image: userData.image,
					role: userData.role,
				}),
			),
		);
		logger.success(
			`Seeded ${seededMindShareUsers.length} Mind Share users`,
		);

		const seededMindShareOrg = await seedOrganization(mindShareOrgData);
		logger.success(`Seeded organization: ${seededMindShareOrg.name}`);

		const seededMindShareMembers = await Promise.all(
			mindShareUsers.map((userData) => {
				const foundUser = seededMindShareUsers.find(
					(u) => u.email === userData.email,
				);
				if (!foundUser) {
					throw new Error(`User not found: ${userData.email}`);
				}
				return seedOrganizationMember({
					organizationId: seededMindShareOrg.id,
					userId: foundUser.id,
					role: userData.orgRole,
				});
			}),
		);
		logger.success(
			`Seeded ${seededMindShareMembers.length} Mind Share organization members`,
		);

		logger.success("Seed script completed successfully!");
		logger.info(`Password for all users: ${SEED_PASSWORD}`);
	} catch (error) {
		logger.error("Seed script failed:", error);
		throw error;
	}
}

main()
	.then(() => {
		process.exit(0);
	})
	.catch((error) => {
		logger.error(error);
		process.exit(1);
	});
