import { clearChatHistory } from "./procedures/clear-chat-history";
import { getChatHistory } from "./procedures/get-chat-history";
import { streamChat } from "./procedures/stream-chat";
import { transcribeAudioProcedure } from "./procedures/transcribe-audio";

export const mastraRouter = {
	streamChat,
	getChatHistory,
	clearChatHistory,
	transcribeAudio: transcribeAudioProcedure,
};
