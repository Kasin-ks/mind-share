import { config } from "@repo/config";
import { getSignedUrl } from "@repo/storage";
import { NextResponse } from "next/server";

export const GET = async (
	_req: Request,
	{ params }: { params: Promise<{ path: string[] }> },
) => {
	const { path } = await params;

	const filePath = path.join("/");

	if (!filePath) {
		return new Response("Invalid path", { status: 400 });
	}

	// Only allow avatars and logos folders for security
	if (!filePath.startsWith("avatars/") && !filePath.startsWith("logos/")) {
		return new Response("Not found", {
			status: 404,
		});
	}

	const signedUrl = await getSignedUrl(filePath, {
		bucket: config.storage.bucketName,
		expiresIn: 60 * 60,
	});

	return NextResponse.redirect(signedUrl, {
		headers: { "Cache-Control": "max-age=3600" },
	});
};
