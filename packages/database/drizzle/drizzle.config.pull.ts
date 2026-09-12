import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "postgresql",
	out: "../../references/database/pull_results",
	dbCredentials: {
		url: process.env.DATABASE_URL as string,
	},
});
