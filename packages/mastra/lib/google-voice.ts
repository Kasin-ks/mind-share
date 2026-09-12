import { GoogleVoice } from "@mastra/voice-google";

// Initialize with default configuration (uses GOOGLE_API_KEY environment variable)
export const googleVoice = new GoogleVoice({
	listeningModel: {
		apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY as string,
	},
});

/**
 * Transcribe audio using Google Voice API
 * @param audioStream - Audio data as ReadableStream
 * @param options - Transcription options
 * @returns Promise<string> - The transcribed text
 */
export async function transcribeAudio(
	audioStream: ReadableStream,
	options?: {
		encoding?:
			| "LINEAR16"
			| "FLAC"
			| "MULAW"
			| "AMR"
			| "AMR_WB"
			| "OGG_OPUS"
			| "SPEEX_WITH_HEADER_BYTE"
			| "WEBM_OPUS";
		languageCode?: string;
		sampleRateHertz?: number;
	},
): Promise<string> {
	const config = {
		encoding: options?.encoding || "LINEAR16",
		languageCode: options?.languageCode || "en-US",
		...(options?.sampleRateHertz && {
			sampleRateHertz: options.sampleRateHertz,
		}),
	};

	const transcript = await googleVoice.listen(audioStream as any, {
		config,
	});

	return transcript;
}
