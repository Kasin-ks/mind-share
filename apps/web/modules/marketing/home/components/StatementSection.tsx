import { getTranslations } from "next-intl/server";

export async function StatementSection() {
	const t = await getTranslations("marketing.statement");

	return (
		<section className="border-border/70 border-t">
			<div className="container py-28 text-center lg:py-40">
				<h2 className="display-lg mx-auto max-w-[22ch] text-foreground">
					{t("title")}
				</h2>
				<p className="body-lg mx-auto mt-8 max-w-[58ch] text-muted-foreground">
					{t("body")}
				</p>
			</div>
		</section>
	);
}
