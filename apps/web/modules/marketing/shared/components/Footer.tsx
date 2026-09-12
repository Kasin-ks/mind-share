import { LocaleLink } from "@i18n/routing";
import { config } from "@repo/config";
import { Logo } from "@shared/components/Logo";
import { getTranslations } from "next-intl/server";

export async function Footer() {
	const t = await getTranslations();

	const columns = [
		{
			title: t("marketing.footer.product"),
			links: [
				{ label: t("common.menu.protocol"), href: "/#protocol" },
				{ label: t("common.menu.firewall"), href: "/#firewall" },
				{ label: t("common.menu.faq"), href: "/#faq" },
			],
		},
		{
			title: t("marketing.footer.resources"),
			links: [
				{ label: t("common.menu.docs"), href: "/docs" },
				...(config.contactForm.enabled
					? [{ label: t("common.menu.contact"), href: "/contact" }]
					: []),
			],
		},
		{
			title: t("marketing.footer.legal"),
			links: [
				{ label: "Privacy policy", href: "/legal/privacy-policy" },
				{ label: "Terms and conditions", href: "/legal/terms" },
			],
		},
	];

	return (
		<footer className="border-border/70 border-t">
			<div className="container grid grid-cols-2 gap-12 py-20 lg:grid-cols-4">
				<div className="col-span-2 lg:col-span-1">
					<Logo />
					<p className="mt-5 max-w-[28ch] text-muted-foreground text-sm leading-relaxed">
						{t("marketing.footer.tagline")}
					</p>
				</div>

				{columns.map((column) => (
					<div key={column.title}>
						<h2 className="eyebrow text-muted-foreground">
							{column.title}
						</h2>
						<ul className="mt-5 flex flex-col gap-3 text-sm">
							{column.links.map((link) => (
								<li key={link.href}>
									<LocaleLink
										href={link.href}
										className="text-foreground/70 transition-colors hover:text-foreground"
									>
										{link.label}
									</LocaleLink>
								</li>
							))}
						</ul>
					</div>
				))}
			</div>

			<div className="container border-border/70 border-t py-8 text-muted-foreground text-xs">
				© {new Date().getFullYear()} {config.appName}
			</div>
		</footer>
	);
}
