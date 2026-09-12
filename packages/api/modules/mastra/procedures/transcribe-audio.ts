import { ORPCError } from "@orpc/client";
import { transcribeAudio } from "@repo/mastra";
import { z } from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const transcribeAudioProcedure = protectedProcedure
	.route({
		method: "POST",
		path: "/mastra/transcribe-audio",
		tags: ["Mastra"],
		summary: "Transcribe audio to text",
		description: "Convert audio to text using Google Voice API",
	})
	.input(
		z.object({
			audioData: z
				.string()
				.describe("Audio data as base64 encoded string"),
			encoding: z
				.enum([
					"LINEAR16",
					"FLAC",
					"MULAW",
					"AMR",
					"AMR_WB",
					"OGG_OPUS",
					"SPEEX_WITH_HEADER_BYTE",
					"WEBM_OPUS",
				])
				.optional()
				.default("LINEAR16")
				.describe("Audio encoding format"),
			languageCode: z
				.string()
				.optional()
				.default("en-US")
				.describe(
					"Language code for transcription (e.g., 'en-US', 'es-ES')",
				),
			sampleRateHertz: z
				.number()
				.optional()
				.describe("Sample rate in Hz (e.g., 16000, 44100)"),
		}),
	)
	.handler(async ({ input }) => {
		const { audioData, encoding, languageCode, sampleRateHertz } = input;

		try {
			// Convert base64 string to Buffer, then to ReadableStream
			const audioBuffer = Buffer.from(audioData, "base64");
			const audioStream = new ReadableStream({
				start(controller) {
					controller.enqueue(new Uint8Array(audioBuffer));
					controller.close();
				},
			});

			// Transcribe the audio
			const transcript = await transcribeAudio(audioStream, {
				encoding,
				languageCode,
				sampleRateHertz,
			});

			return {
				transcript,
				languageCode,
			};
		} catch (error) {
			const errorMessage =
				error instanceof Error
					? error.message
					: "Failed to transcribe audio";
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: errorMessage,
			});
		}
	});
