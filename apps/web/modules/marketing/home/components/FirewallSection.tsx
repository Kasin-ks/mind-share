import { getTranslations } from "next-intl/server";

const tiers = ["public", "team", "private", "restricted"] as const;

export async function FirewallSection() {
	const t = await getTranslations("marketing.firewall");

	return (
		<section
			id="firewall"
			className="scroll-mt-24 border-border/70 border-t"
		>
			<div className="container grid gap-16 py-28 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-24 lg:py-40">
				<div className="lg:sticky lg:top-28 lg:self-start">
					<p className="eyebrow text-muted-foreground">
						{t("eyebrow")}
					</p>
					<h2 className="display-lg mt-6 text-foreground">
						{t("title")}
					</h2>
					<p className="body-lg mt-6 text-muted-foreground">
						{t("description")}
					</p>
				</div>

				<div>
					<dl>
						{tiers.map((tier) => (
							<div
								key={tier}
								className="grid gap-2 border-border/70 border-t py-8 first:border-t-0 first:pt-0 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-8"
							>
								<dt className="eyebrow pt-1.5 text-foreground">
									{t(`tiers.${tier}.label`)}
								</dt>
								<dd className="text-[0.9375rem] text-muted-foreground leading-relaxed">
									{t(`tiers.${tier}.body`)}
								</dd>
							</div>
						))}
					</dl>

					<p className="mt-8 rounded-2xl border border-border bg-card/60 p-8 text-[0.9375rem] text-muted-foreground leading-relaxed">
						{t("note")}
					</p>
				</div>
			</div>
		</section>
	);
}
