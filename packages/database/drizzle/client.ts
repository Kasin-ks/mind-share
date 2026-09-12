import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/postgres";

// Check the drizzle documentation for more information on how to connect to your preferred database provider
// https://orm.drizzle.team/docs/get-started-postgresql

const databaseUrl = process.env.DATABASE_URL as string;

if (!databaseUrl) {
	throw new Error("DATABASE_URL is not set");
}

const pool = new Pool({
	connectionString: databaseUrl,
	max: Number(process.env.DB_POOL_MAX) || 8,
	idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_TIMEOUT_MS) || 10_000,
});

export const db = drizzle(pool, { schema });

export async function closeDbPool(): Promise<void> {
	await pool.end();
}
