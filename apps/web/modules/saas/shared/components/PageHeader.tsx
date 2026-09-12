"use client";

export function PageHeader({
	title,
	subtitle,
}: {
	title: string;
	subtitle?: string;
}) {
	return (
		<div className="mb-10 border-border/70 border-b pb-8">
			<h1 className="display-lg text-foreground">{title}</h1>
			{subtitle && (
				<p className="body-lg mt-4 max-w-[62ch] text-muted-foreground">
					{subtitle}
				</p>
			)}
		</div>
	);
}
