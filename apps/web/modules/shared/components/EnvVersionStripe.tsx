"use client";

const version = process.env.NEXT_PUBLIC_VERSION;

export function EnvVersionStripe() {
	if (!version?.trim()) {
		return null;
	}

	return (
		<div
			className="fixed left-0 right-0 top-0 z-[9999] flex items-center justify-center border-b border-amber-500/20 bg-amber-500/5 py-0.5 text-[10px] font-medium tracking-wide text-amber-700/70 dark:text-amber-400/60"
			role="status"
			aria-label={`Environment: ${version}`}
		>
			{version}
		</div>
	);
}
