import { PostgresStore } from "@mastra/pg";
import { db } from "@repo/database";

export const mastraStorage = new PostgresStore({
	id: "mastra-storage",
	pool: db.$client,
});
