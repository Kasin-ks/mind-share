import { getTranslations } from "next-intl/server";

const steps = ["ask", "negotiate", "disclose"] as const;

export async function ProtocolSection() {
	const t = await getTranslations("marketing.protocol");

	return (
		<section
			id="protocol"
			className="scroll-mt-24 border-border/70 border-t"
		>
			<div className="container py-28 lg:py-40">
				<p className="eyebrow text-muted-foreground">{t("eyebrow")}</p>
				<h2 className="display-lg mt-6 max-w-[18ch] text-foreground">
					{t("title")}
				</h2>
				<p className="body-lg mt-6 max-w-[56ch] text-muted-foreground">
					{t("description")}
				</p>

				<ol className="mt-20 grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-3">
					{steps.map((step, index) => (
						<li key={step} className="bg-background p-8 lg:p-10">
							<span className="eyebrow text-muted-foreground tabular-nums">
								{String(index + 1).padStart(2, "0")}
							</span>
							<h3 className="display-md mt-8 text-foreground">
								{t(`steps.${step}.title`)}
							</h3>
							<p className="mt-4 text-[0.9375rem] text-muted-foreground leading-relaxed">
								{t(`steps.${step}.body`)}
							</p>
						</li>
					))}
				</ol>
			</div>
		</section>
	);
}
