/**
 * Client-side text extraction for uploaded documents.
 *
 * The browser already holds the bytes, so extracting here keeps
 * `mindShare.uploadDocuments` a plain JSON procedure — no multipart handling,
 * no upload storage, no server-side binary parsing.
 *
 * `.docx` is unzipped natively with `DecompressionStream`, which every
 * current browser has, rather than pulling in a document-parsing dependency
 * for one file format. A `.docx` is an ordinary ZIP whose `word/document.xml`
 * holds the text; the reader below is the minimum needed to pull that one
 * entry out. PDF is deliberately not supported — it needs real layout
 * reconstruction, and a bad extraction produces confidently wrong context
 * rather than an obvious failure.
 */

const DOCX_MIME =
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** ZIP end-of-central-directory signature, scanned for from the end of file. */
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_FILE_SIGNATURE = 0x02014b50;

/** The EOCD record is 22 bytes plus an optional comment of up to 64 KB. */
const MAX_EOCD_SCAN = 22 + 0xffff;

interface ZipEntry {
	name: string;
	compressionMethod: number;
	compressedSize: number;
	localHeaderOffset: number;
}

/**
 * Reads a ZIP's central directory. Used instead of walking local file headers
 * because an entry written with a data descriptor carries zero sizes in its
 * local header — the central directory is the only place the real sizes are
 * guaranteed to be.
 */
function readCentralDirectory(view: DataView): ZipEntry[] {
	const scanStart = Math.max(0, view.byteLength - MAX_EOCD_SCAN);
	let eocdOffset = -1;
	for (let i = view.byteLength - 22; i >= scanStart; i--) {
		if (view.getUint32(i, true) === EOCD_SIGNATURE) {
			eocdOffset = i;
			break;
		}
	}
	if (eocdOffset === -1) {
		throw new Error("Not a valid .docx file (no ZIP directory found).");
	}

	const entryCount = view.getUint16(eocdOffset + 10, true);
	let offset = view.getUint32(eocdOffset + 16, true);
	const entries: ZipEntry[] = [];
	const decoder = new TextDecoder();

	for (let i = 0; i < entryCount; i++) {
		if (view.getUint32(offset, true) !== CENTRAL_FILE_SIGNATURE) {
			break;
		}
		const nameLength = view.getUint16(offset + 28, true);
		const extraLength = view.getUint16(offset + 30, true);
		const commentLength = view.getUint16(offset + 32, true);
		const name = decoder.decode(
			new Uint8Array(
				view.buffer,
				view.byteOffset + offset + 46,
				nameLength,
			),
		);

		entries.push({
			name,
			compressionMethod: view.getUint16(offset + 10, true),
			compressedSize: view.getUint32(offset + 20, true),
			localHeaderOffset: view.getUint32(offset + 42, true),
		});

		offset += 46 + nameLength + extraLength + commentLength;
	}

	return entries;
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
	const stream = new Blob([bytes as BlobPart])
		.stream()
		.pipeThrough(new DecompressionStream("deflate-raw"));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Extracts one named entry's bytes from a ZIP. */
async function readZipEntry(
	buffer: ArrayBuffer,
	entryName: string,
): Promise<Uint8Array> {
	const view = new DataView(buffer);
	const entry = readCentralDirectory(view).find(
		(candidate) => candidate.name === entryName,
	);
	if (!entry) {
		throw new Error(`Not a valid .docx file (missing ${entryName}).`);
	}

	// The local header's own name/extra lengths decide where the data starts —
	// they can differ from the central directory's copies.
	const localNameLength = view.getUint16(entry.localHeaderOffset + 26, true);
	const localExtraLength = view.getUint16(entry.localHeaderOffset + 28, true);
	const dataStart =
		entry.localHeaderOffset + 30 + localNameLength + localExtraLength;
	const data = new Uint8Array(buffer, dataStart, entry.compressedSize);

	// 0 = stored, 8 = deflate. Word writes deflate; some tools write stored.
	if (entry.compressionMethod === 0) {
		return data;
	}
	if (entry.compressionMethod === 8) {
		return inflateRaw(data);
	}
	throw new Error(
		`Unsupported compression in .docx (method ${entry.compressionMethod}).`,
	);
}

/**
 * Turns WordprocessingML into plain text: `<w:t>` runs carry the text,
 * `<w:p>` ends a paragraph, `<w:br>`/`<w:tab>` are literal whitespace. Tag
 * stripping is enough here because the classifier wants prose, not structure.
 */
function wordXmlToText(xml: string): string {
	return xml
		.replace(/<w:br\b[^>]*\/?>/g, "\n")
		.replace(/<w:tab\b[^>]*\/?>/g, "\t")
		.replace(/<\/w:p>/g, "\n")
		.replace(/<[^>]+>/g, "")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, "&")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

export function isDocx(file: File): boolean {
	return file.type === DOCX_MIME || file.name.toLowerCase().endsWith(".docx");
}

/**
 * Best-effort plain text for one uploaded file. Throws with a user-facing
 * message when the file can't be read as text — the caller reports it per
 * file rather than failing the whole upload.
 */
export async function extractDocumentText(file: File): Promise<string> {
	if (isDocx(file)) {
		const xml = new TextDecoder().decode(
			await readZipEntry(await file.arrayBuffer(), "word/document.xml"),
		);
		return wordXmlToText(xml);
	}

	return (await file.text()).trim();
}
