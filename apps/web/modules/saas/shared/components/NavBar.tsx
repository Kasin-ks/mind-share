"use client";
import { config } from "@repo/config";
import { useSession } from "@saas/auth/hooks/use-session";
import { useActiveOrganization } from "@saas/organizations/hooks/use-active-organization";
import { UserMenu } from "@saas/shared/components/UserMenu";
import { Logo } from "@shared/components/Logo";
import { cn } from "@ui/lib";
import {
	ChevronRightIcon,
	DatabaseIcon,
	HomeIcon,
	ScrollTextIcon,
	SettingsIcon,
	UserCog2Icon,
	UserCogIcon,
	UsersRoundIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { OrganzationSelect } from "../../organizations/components/OrganizationSelect";

export function NavBar() {
	const t = useTranslations();
	const pathname = usePathname();
	const { user } = useSession();
	const { activeOrganization, isOrganizationAdmin } = useActiveOrganization();

	const { useSidebarLayout } = config.ui.saas;

	const basePath = activeOrganization
		? `/app/${activeOrganization.slug}`
		: "/app";

	const menuItems = [
		{
			label: t("app.menu.start"),
			href: basePath,
			icon: HomeIcon,
			isActive: pathname === basePath,
		},
		// Mind Share (U1/U2/U3/U4), in demo order: ask a teammate's agent,
		// then the two surfaces that show what that produced for you.
		// "Ask a teammate" is org-gated because it picks its target out of the
		// active organization's member list; "My context"/"Audit trail" are
		// personal, session-scoped reads and need no organization.
		...(config.organizations.enable
			? [
					{
						label: t("app.menu.mindShareAsk"),
						href: "/app/mind-share/ask",
						icon: UsersRoundIcon,
						isActive: pathname.startsWith("/app/mind-share/ask"),
					},
				]
			: []),
		{
			label: t("app.menu.myContext"),
			href: "/app/mind-share/context",
			icon: DatabaseIcon,
			isActive: pathname.startsWith("/app/mind-share/context"),
		},
		{
			label: t("app.menu.auditTrail"),
			href: "/app/mind-share/audit",
			icon: ScrollTextIcon,
			isActive: pathname.startsWith("/app/mind-share/audit"),
		},
		...(activeOrganization && isOrganizationAdmin
			? [
					{
						label: t("app.menu.organizationSettings"),
						href: `${basePath}/settings`,
						icon: SettingsIcon,
						isActive: pathname.startsWith(`${basePath}/settings/`),
					},
				]
			: []),
		{
			label: t("app.menu.accountSettings"),
			href: "/app/settings",
			icon: UserCog2Icon,
			isActive: pathname.startsWith("/app/settings/"),
		},
		...(user?.role === "admin"
			? [
					{
						label: t("app.menu.admin"),
						href: "/app/admin",
						icon: UserCogIcon,
						isActive: pathname.startsWith("/app/admin/"),
					},
				]
			: []),
	];

	return (
		<nav
			className={cn("w-full", {
				"w-full md:fixed md:top-0 md:left-0 md:h-full md:w-[280px] md:border-border/70 md:border-r md:bg-card":
					useSidebarLayout,
			})}
		>
			<div
				className={cn("px-6 py-4", {
					"md:flex md:h-full md:flex-col md:px-5 md:pt-6 md:pb-0":
						useSidebarLayout,
				})}
			>
				<div className="flex flex-wrap items-center justify-between gap-4">
					<div
						className={cn("flex items-center gap-4 md:gap-2", {
							"md:flex md:w-full md:flex-col md:items-stretch md:align-stretch":
								useSidebarLayout,
						})}
					>
						<Link href="/app" className="block">
							<Logo />
						</Link>

						{config.organizations.enable &&
							!config.organizations.hideOrganization && (
								<>
									<span
										className={cn(
											"hidden opacity-30 md:block",
											{
												"md:hidden": useSidebarLayout,
											},
										)}
									>
										<ChevronRightIcon className="size-4" />
									</span>

									<OrganzationSelect
										className={cn({
											"md:mt-5": useSidebarLayout,
										})}
									/>
								</>
							)}
					</div>

					<div
						className={cn(
							"mr-0 ml-auto flex items-center justify-end gap-4",
							{
								"md:hidden": useSidebarLayout,
							},
						)}
					>
						<UserMenu />
					</div>
				</div>

				<ul
					className={cn(
						"no-scrollbar -mx-6 mt-5 flex list-none items-center justify-start gap-1 overflow-x-auto px-6 text-sm",
						{
							"md:mx-0 md:mt-8 md:flex-col md:items-stretch md:gap-0.5 md:px-0":
								useSidebarLayout,
						},
					)}
				>
					{menuItems.map((menuItem) => (
						<li key={menuItem.href}>
							<Link
								href={menuItem.href}
								className={cn(
									"flex items-center gap-2.5 whitespace-nowrap rounded-full px-3 py-2 transition-colors md:rounded-xl",
									menuItem.isActive
										? "bg-foreground/8 text-foreground"
										: "text-foreground/65 hover:bg-foreground/5 hover:text-foreground",
								)}
								prefetch
							>
								<menuItem.icon
									className={cn(
										"size-4 shrink-0",
										menuItem.isActive
											? "opacity-100"
											: "opacity-60",
									)}
								/>
								<span>{menuItem.label}</span>
							</Link>
						</li>
					))}
				</ul>

				<div
					className={cn(
						"-mx-5 mt-auto mb-0 hidden border-border/70 border-t p-4",
						{
							"md:block": useSidebarLayout,
						},
					)}
				>
					<UserMenu showUserName />
				</div>
			</div>
		</nav>
	);
}
