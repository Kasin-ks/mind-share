import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { sql } from "drizzle-orm";

const CONFIRMATION_WORD = "CONFIRM";

async function main() {
	logger.warn("This script will PERMANENTLY wipe ALL data in the database.");
	logger.warn("This action cannot be undone.");

	const confirmation = await logger.prompt(
		`Type ${CONFIRMATION_WORD} (in capital letters) to proceed:`,
		{
			required: true,
			placeholder: CONFIRMATION_WORD,
			type: "text",
		},
	);

	if (confirmation !== CONFIRMATION_WORD) {
		logger.error(
			`You must type exactly "${CONFIRMATION_WORD}" in capital letters. Aborted.`,
		);
		process.exit(1);
	}

	logger.info("Wiping database...");

	try {
		await db.execute(
			sql`TRUNCATE "user", organization, verification CASCADE`,
		);
		logger.success("Database has been reset. All data has been removed.");
	} catch (error) {
		logger.error("Failed to reset database:", error);
		throw error;
	}
}

main()
	.then(() => {
		process.exit(0);
	})
	.catch(() => {
		process.exit(1);
	});
