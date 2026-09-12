import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	type ClassifierOutput,
	classifyContextItem,
	type RawContextItem,
} from "../agents/context-classifier-agent";

/**
 * P1c standalone verification script.
 *
 * Runs the classifier agent (`classifyContextItem`, defined in
 * `../agents/context-classifier-agent.ts`) against every item in all 4
 * fixture files (F3: `packages/jobs/fixtures/{jordan,priya}/{slack,gmail}
 * .json`, 28 items total) and prints the `{structuredClaim, classification}`
 * result for each — including `structuredClaim.entities` (project/people/
 * topics, added by the entities track, product specification "P1c-entities" notes
 * 2026-09-12) — plus a classification-count summary, so classification
 * quality can be sanity-checked by eye (e.g. does the "$128,000 base salary"
 * email come back `private`+? does the public status update come back
 * `public`/`team`? does a message naming a specific project/person populate
 * `entities.project`/`entities.people`, and does a vague FYI correctly omit
 * `entities` rather than fabricate it?) without touching the DB or
 * `context_items` — this step only classifies, it doesn't write rows (that's
 * P1b's/the DB-backfill track's job).
 *
 * Usage: `pnpm --filter @repo/mastra classify:fixtures` (needs
 * OPENROUTER_API_KEY set — see package.json's script for which env
 * file it loads).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, "../../../jobs/fixtures");

type SlackFixtureItem = {
	channel: string;
	author: string;
	timestamp: string;
	text: string;
};

type GmailFixtureItem = {
	from: string;
	to: string;
	subject: string;
	snippet: string;
	timestamp: string;
};

type FixtureFile = {
	user: "jordan" | "priya";
	sourceType: "slack" | "gmail";
	path: string;
};

const FIXTURE_FILES: FixtureFile[] = [
	{ user: "jordan", sourceType: "slack", path: "jordan/slack.json" },
	{ user: "jordan", sourceType: "gmail", path: "jordan/gmail.json" },
	{ user: "priya", sourceType: "slack", path: "priya/slack.json" },
	{ user: "priya", sourceType: "gmail", path: "priya/gmail.json" },
];

/** Turns one fixture row into the `{sourceType, rawExcerpt}` shape P1b's
 * ingestion job is expected to hand the classifier (product specification P1c task 1).
 * Slack/Gmail-specific metadata (channel, subject, ...) is folded into the
 * excerpt text itself, same as a real ingestion job would need to give the
 * model enough context to classify accurately. */
function toRawContextItem(
	sourceType: "slack" | "gmail",
	raw: SlackFixtureItem | GmailFixtureItem,
): RawContextItem {
	if (sourceType === "slack") {
		const item = raw as SlackFixtureItem;
		return {
			sourceType: "slack",
			rawExcerpt: `[Slack ${item.channel}, from ${item.author}, ${item.timestamp}]\n${item.text}`,
		};
	}
	const item = raw as GmailFixtureItem;
	return {
		sourceType: "gmail",
		rawExcerpt: `[Gmail from ${item.from} to ${item.to}, ${item.timestamp}]\nSubject: ${item.subject}\n${item.snippet}`,
	};
}

function shortExcerpt(raw: RawContextItem): string {
	const oneLine = raw.rawExcerpt.replace(/\s+/g, " ").trim();
	return oneLine.length > 90 ? `${oneLine.slice(0, 90)}…` : oneLine;
}

type Row = {
	user: string;
	sourceType: string;
	excerpt: string;
	result: ClassifierOutput | null;
	error: string | null;
};

async function main() {
	const rows: Row[] = [];

	for (const file of FIXTURE_FILES) {
		const fullPath = path.join(FIXTURES_DIR, file.path);
		const raw = JSON.parse(await readFile(fullPath, "utf-8")) as (
			| SlackFixtureItem
			| GmailFixtureItem
		)[];

		for (const item of raw) {
			const rawContextItem = toRawContextItem(file.sourceType, item);
			const row: Row = {
				user: file.user,
				sourceType: file.sourceType,
				excerpt: shortExcerpt(rawContextItem),
				result: null,
				error: null,
			};

			try {
				// Sequential on purpose: keeps output order stable and stays
				// well under any per-key rate limit for a 28-item run.
				row.result = await classifyContextItem(rawContextItem);
			} catch (err) {
				row.error = err instanceof Error ? err.message : String(err);
			}

			rows.push(row);
			const status = row.result
				? `${row.result.classification.toUpperCase().padEnd(10)} conf=${row.result.structuredClaim.confidence.toFixed(2)}`
				: `ERROR: ${row.error}`;
			console.log(
				`[${row.user}/${row.sourceType}] ${status} | ${row.excerpt}`,
			);
			if (row.result) {
				console.log(
					`    decision: ${row.result.structuredClaim.decision}`,
				);
				console.log(
					`    reason:   ${row.result.structuredClaim.reason}`,
				);
				const entities = row.result.structuredClaim.entities;
				if (
					entities?.project ||
					entities?.people?.length ||
					entities?.topics?.length
				) {
					console.log(
						`    entities: project=${entities.project ?? "—"} people=${JSON.stringify(entities.people ?? [])} topics=${JSON.stringify(entities.topics ?? [])}`,
					);
				} else {
					console.log("    entities: (none extracted)");
				}
			}
		}
	}

	const succeeded = rows.filter((r) => r.result);
	const failed = rows.filter((r) => r.error);

	console.log("\n=== Summary ===");
	console.log(`Total items: ${rows.length}`);
	console.log(`Classified:  ${succeeded.length}`);
	console.log(`Errors:      ${failed.length}`);

	if (succeeded.length > 0) {
		const counts: Record<string, number> = {};
		for (const row of succeeded) {
			const c = row.result?.classification ?? "unknown";
			counts[c] = (counts[c] ?? 0) + 1;
		}
		console.log("Classification counts:", counts);
	}

	if (failed.length > 0) {
		console.log(
			"\nAll failures printed above with their error message. If every " +
				"item failed with an auth/401-shaped error, OPENROUTER_API_KEY " +
				"is missing or invalid in the env file this script loaded — see " +
				"product specification's P1c notes.",
		);
		process.exitCode = 1;
	}
}

main().catch((err) => {
	console.error("classify-fixtures script crashed:", err);
	process.exitCode = 1;
});
