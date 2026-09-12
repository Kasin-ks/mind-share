import { ClosingSection } from "@marketing/home/components/ClosingSection";
import { FaqSection } from "@marketing/home/components/FaqSection";
import { FirewallSection } from "@marketing/home/components/FirewallSection";
import { Hero } from "@marketing/home/components/Hero";
import { ProtocolSection } from "@marketing/home/components/ProtocolSection";
import { StatementSection } from "@marketing/home/components/StatementSection";
import { SurfacesSection } from "@marketing/home/components/SurfacesSection";
import { setRequestLocale } from "next-intl/server";

export default async function Home({
	params,
}: {
	params: Promise<{ locale: string }>;
}) {
	const { locale } = await params;
	setRequestLocale(locale);

	return (
		<>
			<Hero />
			<StatementSection />
			<ProtocolSection />
			<FirewallSection />
			<SurfacesSection />
			<FaqSection />
			<ClosingSection />
		</>
	);
}
