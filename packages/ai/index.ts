import { DEFAULT_MODEL_ID, openrouter } from "./lib/provider";

export const textModel = openrouter.chat(DEFAULT_MODEL_ID);

export * from "ai";
export * from "./lib";
