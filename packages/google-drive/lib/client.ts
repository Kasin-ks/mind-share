const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";

export interface DriveFile {
	id: string;
	name: string;
	mimeType: string;
	webViewLink: string | null;
	createdTime: string;
	modifiedTime: string;
	size?: string;
}

export interface ListFilesOptions {
	pageSize?: number;
	pageToken?: string;
	q?: string;
	orderBy?: string;
	fields?: string;
}

export interface ListFilesResponse {
	files: DriveFile[];
	nextPageToken: string | null;
}

function createHeaders(accessToken: string): HeadersInit {
	return {
		Authorization: `Bearer ${accessToken}`,
		"Content-Type": "application/json",
	};
}

/**
 * List files from the user's Google Drive.
 * Uses the Drive API v3 with the given OAuth2 access token.
 */
export async function listFiles(
	accessToken: string,
	options: ListFilesOptions = {},
): Promise<ListFilesResponse> {
	const {
		pageSize = 20,
		pageToken,
		q,
		orderBy = "modifiedTime desc",
	} = options;
	const params = new URLSearchParams({
		pageSize: String(pageSize),
		fields: "nextPageToken, files(id,name,mimeType,webViewLink,createdTime,modifiedTime,size)",
		orderBy,
	});
	if (pageToken) {
		params.set("pageToken", pageToken);
	}
	if (q) {
		params.set("q", q);
	}

	const url = `${DRIVE_API_BASE}/files?${params.toString()}`;
	const res = await fetch(url, { headers: createHeaders(accessToken) });

	if (!res.ok) {
		const err = await res.text();
		throw new Error(`Google Drive API error: ${res.status} ${err}`);
	}

	const data = (await res.json()) as {
		files?: Array<{
			id: string;
			name: string;
			mimeType: string;
			webViewLink?: string;
			createdTime?: string;
			modifiedTime?: string;
			size?: string;
		}>;
		nextPageToken?: string;
	};

	const files: DriveFile[] = (data.files ?? []).map((f) => ({
		id: f.id,
		name: f.name,
		mimeType: f.mimeType ?? "",
		webViewLink: f.webViewLink ?? null,
		createdTime: f.createdTime ?? "",
		modifiedTime: f.modifiedTime ?? "",
		size: f.size,
	}));

	return {
		files,
		nextPageToken: data.nextPageToken ?? null,
	};
}

/**
 * Get metadata for a single file by ID.
 */
export async function getFile(
	accessToken: string,
	fileId: string,
): Promise<DriveFile | null> {
	const params = new URLSearchParams({
		fields: "id,name,mimeType,webViewLink,createdTime,modifiedTime,size",
	});
	const url = `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?${params.toString()}`;
	const res = await fetch(url, { headers: createHeaders(accessToken) });

	if (res.status === 404) {
		return null;
	}
	if (!res.ok) {
		const err = await res.text();
		throw new Error(`Google Drive API error: ${res.status} ${err}`);
	}

	const f = (await res.json()) as {
		id: string;
		name: string;
		mimeType?: string;
		webViewLink?: string;
		createdTime?: string;
		modifiedTime?: string;
		size?: string;
	};

	return {
		id: f.id,
		name: f.name,
		mimeType: f.mimeType ?? "",
		webViewLink: f.webViewLink ?? null,
		createdTime: f.createdTime ?? "",
		modifiedTime: f.modifiedTime ?? "",
		size: f.size,
	};
}

/**
 * Google Workspace "native" file types (Docs/Sheets/Slides) have no raw byte
 * content — they must be exported to a concrete format via the `/export`
 * endpoint. This maps each to a plain-text-ish export mime type so the
 * result can be used as a `context_items.rawExcerpt` source.
 */
const GOOGLE_NATIVE_EXPORT_MIME_TYPE: Record<string, string> = {
	"application/vnd.google-apps.document": "text/plain",
	"application/vnd.google-apps.spreadsheet": "text/csv",
	"application/vnd.google-apps.presentation": "text/plain",
};

/** Non-native mime types we'll attempt to decode as UTF-8 text. Anything
 * else (images, PDFs, audio/video, zip, etc.) is treated as opaque binary
 * and skipped — callers should fall back to a metadata-only excerpt. */
function isTextualMimeType(mimeType: string): boolean {
	return (
		mimeType.startsWith("text/") ||
		mimeType === "application/json" ||
		mimeType === "application/xml"
	);
}

/**
 * Fetch a file's textual content, when there is any to fetch.
 *
 * - Google-native docs/sheets/slides are exported via `/export` to a plain
 *   text-ish format (`GOOGLE_NATIVE_EXPORT_MIME_TYPE`).
 * - Plain-text-ish uploaded files (`text/*`, JSON, XML) are downloaded via
 *   `/files/{id}?alt=media`.
 * - Everything else (binary formats with no reasonable text
 *   representation — images, PDFs, archives, etc.) returns `null` rather
 *   than attempting to decode binary bytes as text; callers should fall
 *   back to a metadata-derived excerpt (name/mimeType/link) in that case.
 */
export async function getFileContent(
	accessToken: string,
	file: Pick<DriveFile, "id" | "mimeType">,
): Promise<string | null> {
	const exportMimeType = GOOGLE_NATIVE_EXPORT_MIME_TYPE[file.mimeType];

	let url: string;
	if (exportMimeType) {
		const params = new URLSearchParams({ mimeType: exportMimeType });
		url = `${DRIVE_API_BASE}/files/${encodeURIComponent(file.id)}/export?${params.toString()}`;
	} else if (isTextualMimeType(file.mimeType)) {
		url = `${DRIVE_API_BASE}/files/${encodeURIComponent(file.id)}?alt=media`;
	} else {
		return null;
	}

	const res = await fetch(url, { headers: createHeaders(accessToken) });
	if (!res.ok) {
		const err = await res.text();
		throw new Error(`Google Drive API error: ${res.status} ${err}`);
	}
	return res.text();
}
