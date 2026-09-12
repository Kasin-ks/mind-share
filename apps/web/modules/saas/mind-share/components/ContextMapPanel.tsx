"use client";

import type { SyncSourceResult } from "@repo/api/modules/mind-share/types";
import { orpcClient } from "@shared/lib/orpc-client";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@ui/components/card";
import { Skeleton } from "@ui/components/skeleton";
import { LinkIcon, Loader2Icon, UploadIcon } from "lucide-react";
import { useRef, useState } from "react";
import { extractDocumentText } from "../lib/extract-text";
import { ContextGraph } from "./ContextGraph";

/**
 * "Build My Context" — the start page's Files → Context Map flow (upload
 * documents, see the derived graph).
 *
 * Two sources sit side by side. **Upload** is the live one: the browser reads
 * each file as text and posts it to `mindShare.uploadDocuments`, which runs
 * the same classify → store → graph pipeline every other source uses.
 * **Google Drive** is present but disabled pending OAuth setup — its backend
 * (`mindShare.syncGoogleDrive`) is built and wired, so re-enabling it is a
 * matter of flipping `DRIVE_COMING_SOON` once credentials work, not writing
 * code.
 *
 * Both calls block until ingestion finishes rather than streaming progress:
 * at this scale a spinner plus final counts is enough, and it keeps the
 * client free of polling.
 */

/** Flip to `false` once Google OAuth credentials are working; the sync path
 * behind the button is already implemented. */
const DRIVE_COMING_SOON = true;

/** What `extractDocumentText` can turn into usable text. PDF is deliberately
 * absent — see that module's header. */
const ACCEPTED_FILE_TYPES = ".txt,.md,.markdown,.csv,.json,.log,.docx,text/*";

/** Matches the procedure's own per-request cap, so the user gets a clear
 * message here instead of a validation error from the server. */
const MAX_FILES = 20;

function StatsRow({
	stats,
}: {
	stats: {
		documents: number;
		projects: number;
		people: number;
		topics: number;
	};
}) {
	const entries = [
		{ label: "documents", value: stats.documents },
		{ label: "projects", value: stats.projects },
		{ label: "people", value: stats.people },
		{ label: "topics", value: stats.topics },
	];

	return (
		<div className="flex flex-wrap gap-6">
			{entries.map((entry) => (
				<div key={entry.label}>
					<div className="font-semibold text-2xl">{entry.value}</div>
					<div className="text-foreground/60 text-sm">
						{entry.label}
					</div>
				</div>
			))}
		</div>
	);
}

export function ContextMapPanel() {
	const [ingesting, setIngesting] = useState(false);
	const [result, setResult] = useState<SyncSourceResult | null>(null);
	const [error, setError] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const {
		data: graph,
		isPending: graphPending,
		refetch: refetchGraph,
	} = useQuery(orpc.mindShare.getContextGraph.queryOptions());

	const handleFilesSelected = async (fileList: FileList | null) => {
		const files = [...(fileList ?? [])];
		// Reset immediately so picking the same file twice still fires change.
		if (fileInputRef.current) {
			fileInputRef.current.value = "";
		}
		if (files.length === 0) {
			return;
		}

		setIngesting(true);
		setError(null);
		setResult(null);
		try {
			if (files.length > MAX_FILES) {
				throw new Error(
					`Select at most ${MAX_FILES} files at a time (you picked ${files.length}).`,
				);
			}

			// Extraction is per file and allowed to fail per file: one
			// unreadable document must not sink the rest of the upload.
			const extracted = await Promise.all(
				files.map(async (file) => {
					try {
						return {
							name: file.name,
							mimeType: file.type || "text/plain",
							content: await extractDocumentText(file),
						};
					} catch {
						return null;
					}
				}),
			);

			const readable = extracted.filter(
				(document): document is NonNullable<typeof document> =>
					document !== null && document.content.trim().length > 0,
			);
			if (readable.length === 0) {
				throw new Error(
					"No readable text in the selected files. Supported: .txt, .md, .csv, .json, .docx — PDF isn't supported yet.",
				);
			}
			const unreadable = files.length - readable.length;

			const uploadResult = await orpcClient.mindShare.uploadDocuments({
				documents: readable,
			});
			// Files we could not read never reached the server, so fold them
			// into the counts here rather than reporting a smaller total than
			// the user selected.
			setResult({
				...uploadResult,
				processed: uploadResult.processed + unreadable,
				failed: uploadResult.failed + unreadable,
			});
			await refetchGraph();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setIngesting(false);
		}
	};

	return (
		<Card className="mt-6">
			<CardHeader>
				<CardTitle>Build my context</CardTitle>
				<CardDescription>
					Add documents, let the classifier read them, and see the
					context map they form.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				<div className="space-y-3">
					<h4 className="font-medium text-sm">Sources</h4>
					<div className="flex flex-wrap items-center gap-3">
						<Button
							variant="light"
							disabled={DRIVE_COMING_SOON}
							title={
								DRIVE_COMING_SOON
									? "Google Drive sync is coming soon"
									: undefined
							}
						>
							<LinkIcon className="mr-1.5 size-4" />
							Connect Google Drive
							{DRIVE_COMING_SOON && (
								<span className="ml-1.5 text-xs opacity-70">
									(coming soon)
								</span>
							)}
						</Button>

						<Button
							onClick={() => fileInputRef.current?.click()}
							disabled={ingesting}
						>
							{ingesting ? (
								<Loader2Icon className="mr-1.5 size-4 animate-spin" />
							) : (
								<UploadIcon className="mr-1.5 size-4" />
							)}
							{ingesting ? "Reading…" : "Upload files"}
						</Button>

						<input
							ref={fileInputRef}
							type="file"
							multiple
							accept={ACCEPTED_FILE_TYPES}
							className="hidden"
							onChange={(event) =>
								handleFilesSelected(event.target.files)
							}
						/>
					</div>

					{ingesting ? (
						<p className="text-foreground/60 text-sm">
							Classifying your documents — a few seconds each.
						</p>
					) : (
						<p className="text-foreground/60 text-sm">
							.txt, .md, .csv, .json, .docx — up to {MAX_FILES}{" "}
							files at a time.
						</p>
					)}
					{result && (
						<p className="text-sm">
							{result.processed} documents processed ·{" "}
							{result.succeeded} succeeded · {result.failed}{" "}
							failed
							{result.skipped > 0 &&
								` · ${result.skipped} already ingested`}
						</p>
					)}
					{error && (
						<p className="text-destructive text-sm">{error}</p>
					)}
				</div>

				<div className="space-y-3">
					<h4 className="font-medium text-sm">Context map</h4>
					{graphPending ? (
						<Skeleton className="h-96 w-full" />
					) : graph ? (
						<>
							<ContextGraph
								graph={graph}
								extracting={ingesting}
							/>
							<StatsRow stats={graph.stats} />
						</>
					) : null}
				</div>
			</CardContent>
		</Card>
	);
}
