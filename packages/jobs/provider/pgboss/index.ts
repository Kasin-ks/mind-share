import { config } from "@repo/config";
import { logger } from "@repo/logs";
import { type Job, type JobWithMetadata, PgBoss } from "pg-boss";
import type {
	FindJobsOptions,
	JobData,
	JobHandler,
	JobOptions,
	JobProvider,
	JobWithMetadata as OurJobWithMetadata,
	QueueConfig,
	QueueStats,
	WorkerOptions,
} from "../../types";

let bossInstance: PgBoss | null = null;
let startPromise: Promise<void> | null = null;
let onReconnectCallback: (() => Promise<void>) | null = null;
let isReconnecting = false;

/**
 * Register the callback run after pg-boss is stopped because its connection was lost,
 * so the job server can restart the provider and re-register its workers.
 */
export function setPgBossReconnectCallback(
	callback: (() => Promise<void>) | null,
): void {
	onReconnectCallback = callback;
}

/** True if error is a connection timeout / connection terminated (recoverable by reconnecting). */
function isConnectionTimeoutError(error: Error): boolean {
	const msg = error?.message ?? "";
	return (
		msg.includes("connection timeout") ||
		msg.includes("Connection terminated")
	);
}

async function handleConnectionLost(): Promise<void> {
	if (isReconnecting || !bossInstance) {
		return;
	}
	isReconnecting = true;
	const boss = bossInstance;
	bossInstance = null;
	startPromise = null;
	try {
		await boss.stop();
		logger.info(
			"pg-boss stopped after connection timeout, will reconnect on next use",
		);
		if (onReconnectCallback) {
			await onReconnectCallback();
		}
	} catch (err) {
		logger.error("pg-boss error during reconnect cleanup", err);
	} finally {
		isReconnecting = false;
	}
}

function getBossInstance(): PgBoss {
	if (bossInstance) {
		return bossInstance;
	}

	if (!config.jobs?.enabled) {
		throw new Error("Jobs are not enabled in the configuration");
	}

	const databaseUrl = process.env.DATABASE_URL as string;
	if (!databaseUrl) {
		throw new Error("DATABASE_URL is not set");
	}

	const schema = config.jobs.schema ?? "pgboss";
	const applicationName = config.jobs.applicationName ?? "pg-boss-worker";
	const max = config.jobs?.max ?? 10;
	const idleTimeoutMillis = config.jobs?.idleTimeoutMillis ?? 120_000;
	const connectionTimeoutMillis = config.jobs?.connectionTimeoutMillis;

	// idleTimeoutMillis is passed to node-postgres Pool; pg-boss types don't declare it but it's forwarded
	const options = {
		connectionString: databaseUrl,
		schema,
		application_name: applicationName,
		max,
		idleTimeoutMillis,
		...(connectionTimeoutMillis != null && {
			connectionTimeoutMillis,
		}),
	};
	// pg-boss types omit idleTimeoutMillis; option is forwarded to node-postgres Pool
	bossInstance = new PgBoss(options as any);

	// Set up error handling: reconnect on connection timeout so next use gets a fresh connection
	bossInstance.on("error", (error: Error) => {
		logger.error("pg-boss error:", error);
		if (isConnectionTimeoutError(error)) {
			void handleConnectionLost();
		}
	});

	return bossInstance;
}

async function ensureStarted(): Promise<void> {
	if (!startPromise) {
		startPromise = getBossInstance()
			.start()
			.then(() => {});
	}
	await startPromise;
}

/**
 * pg-boss validates options with `"key" in options` checks, so a key that is present
 * with an `undefined` value still fails validation (e.g. `deadLetter: undefined` throws
 * "deadLetter must be a string"). Drop undefined entries so optional options are truly absent.
 */
function omitUndefined<T extends Record<string, unknown>>(obj: T): T {
	return Object.fromEntries(
		Object.entries(obj).filter(([, value]) => value !== undefined),
	) as T;
}

function mapQueueConfig(config?: QueueConfig) {
	if (!config) {
		return undefined;
	}

	return omitUndefined({
		policy: config.policy,
		partition: config.partition,
		deadLetter: config.deadLetter,
		warningQueueSize: config.warningQueueSize,
		retryLimit: config.retryLimit,
		retryDelay: config.retryDelay,
		retryBackoff: config.retryBackoff,
		retryDelayMax: config.retryDelayMax,
		expireInSeconds: config.expireInSeconds,
		retentionSeconds: config.retentionSeconds,
		deleteAfterSeconds: config.deleteAfterSeconds,
	});
}

function mapJobOptions(options?: JobOptions) {
	if (!options) {
		return undefined;
	}

	return omitUndefined({
		priority: options.priority,
		id: options.id,
		retryLimit: options.retryLimit,
		retryDelay: options.retryDelay,
		retryBackoff: options.retryBackoff,
		retryDelayMax: options.retryDelayMax,
		startAfter: options.startAfter,
		expireInSeconds: options.expireInSeconds,
		retentionSeconds: options.retentionSeconds,
		deleteAfterSeconds: options.deleteAfterSeconds,
		singletonSeconds: options.singletonSeconds,
		singletonKey: options.singletonKey,
		singletonNextSlot: options.singletonNextSlot,
		group: options.group,
	});
}

function mapWorkerOptions(options?: WorkerOptions) {
	if (!options) {
		return undefined;
	}

	return omitUndefined({
		pollingIntervalSeconds: options.pollingIntervalSeconds,
		batchSize: options.batchSize,
		localConcurrency: options.localConcurrency,
		localGroupConcurrency: options.localGroupConcurrency,
		groupConcurrency: options.groupConcurrency,
	});
}

function mapJob(pgBossJob: Job<JobData>): {
	id: string;
	name: string;
	data: JobData;
	signal: AbortSignal;
} {
	return {
		id: pgBossJob.id,
		name: pgBossJob.name,
		data: pgBossJob.data,
		signal: pgBossJob.signal,
	};
}

function mapJobWithMetadata(
	pgBossJob: JobWithMetadata<JobData>,
): OurJobWithMetadata {
	return {
		id: pgBossJob.id,
		name: pgBossJob.name,
		data: pgBossJob.data,
		signal: pgBossJob.signal,
		priority: pgBossJob.priority,
		state: pgBossJob.state,
		retryLimit: pgBossJob.retryLimit,
		retryCount: pgBossJob.retryCount,
		createdOn: pgBossJob.createdOn,
		startedOn: pgBossJob.startedOn,
		completedOn: pgBossJob.completedOn,
	};
}

export const jobProvider: JobProvider = {
	async start() {
		startPromise = getBossInstance()
			.start()
			.then(() => {});
		await startPromise;
		logger.info("pg-boss started");
	},

	async stop() {
		const boss = getBossInstance();
		await boss.stop();
		logger.info("pg-boss stopped");
		bossInstance = null;
		startPromise = null;
	},

	async createQueue(name: string, config?: QueueConfig) {
		await ensureStarted();
		const boss = getBossInstance();
		await boss.createQueue(name, mapQueueConfig(config));
	},

	async updateQueue(name: string, config: Partial<QueueConfig>) {
		await ensureStarted();
		const boss = getBossInstance();
		await boss.updateQueue(name, mapQueueConfig(config as QueueConfig));
	},

	async deleteQueue(name: string) {
		const boss = getBossInstance();
		await boss.deleteQueue(name);
	},

	async getQueue(name: string) {
		await ensureStarted();
		const boss = getBossInstance();
		const queue = await boss.getQueue(name);
		if (!queue) {
			return null;
		}
		return {
			policy: queue.policy,
			partition: queue.partition,
			deadLetter: queue.deadLetter,
			warningQueueSize: queue.warningQueueSize,
			retryLimit: queue.retryLimit,
			retryDelay: queue.retryDelay,
			retryBackoff: queue.retryBackoff,
			retryDelayMax: queue.retryDelayMax,
			expireInSeconds: queue.expireInSeconds,
			retentionSeconds: queue.retentionSeconds,
			deleteAfterSeconds: queue.deleteAfterSeconds,
		} as QueueConfig;
	},

	async getQueues() {
		await ensureStarted();
		const boss = getBossInstance();
		const queues = await boss.getQueues();
		return queues.map((q) => ({
			name: q.name,
			config: {
				policy: q.policy,
				partition: q.partition,
				deadLetter: q.deadLetter,
				warningQueueSize: q.warningQueueSize,
				retryLimit: q.retryLimit,
				retryDelay: q.retryDelay,
				retryBackoff: q.retryBackoff,
				retryDelayMax: q.retryDelayMax,
				expireInSeconds: q.expireInSeconds,
				retentionSeconds: q.retentionSeconds,
				deleteAfterSeconds: q.deleteAfterSeconds,
			} as QueueConfig,
		}));
	},

	async getQueueStats(name: string): Promise<QueueStats> {
		await ensureStarted();
		const boss = getBossInstance();
		const stats = await boss.getQueueStats(name);
		return {
			createdCount: stats.deferredCount + stats.queuedCount,
			retryCount: 0, // pg-boss doesn't expose this separately
			activeCount: stats.activeCount,
			completedCount: 0, // pg-boss doesn't expose this in QueueResult
			failedCount: 0, // pg-boss doesn't expose this in QueueResult
			cancelledCount: 0, // pg-boss doesn't expose this in QueueResult
		};
	},

	async send(
		name: string,
		data: JobData,
		options?: JobOptions,
	): Promise<string | null> {
		await ensureStarted();
		const boss = getBossInstance();
		return await boss.send(name, data, mapJobOptions(options));
	},

	async sendAfter(
		name: string,
		data: JobData,
		options: JobOptions | undefined,
		value: number | string | Date,
	): Promise<string | null> {
		await ensureStarted();
		const boss = getBossInstance();
		if (typeof value === "number") {
			return await boss.sendAfter(
				name,
				data,
				mapJobOptions(options) || null,
				value,
			);
		}
		if (typeof value === "string") {
			return await boss.sendAfter(
				name,
				data,
				mapJobOptions(options) || null,
				value,
			);
		}
		return await boss.sendAfter(
			name,
			data,
			mapJobOptions(options) || null,
			value,
		);
	},

	async sendThrottled(
		name: string,
		data: JobData,
		options: JobOptions | undefined,
		seconds: number,
		key?: string,
	): Promise<string | null> {
		await ensureStarted();
		const boss = getBossInstance();
		return await boss.sendThrottled(
			name,
			data,
			mapJobOptions(options) || null,
			seconds,
			key,
		);
	},

	async sendDebounced(
		name: string,
		data: JobData,
		options: JobOptions | undefined,
		seconds: number,
		key?: string,
	): Promise<string | null> {
		await ensureStarted();
		const boss = getBossInstance();
		return await boss.sendDebounced(
			name,
			data,
			mapJobOptions(options) || null,
			seconds,
			key,
		);
	},

	async insert(
		name: string,
		jobs: Array<{ data: JobData; options?: JobOptions }>,
		_options?: JobOptions,
	): Promise<string[]> {
		await ensureStarted();
		const boss = getBossInstance();
		const pgBossJobs = jobs.map((job) => ({
			data: job.data,
			...mapJobOptions(job.options),
		}));
		const result = await boss.insert(name, pgBossJobs);
		return result || [];
	},

	async fetch(
		name: string,
		options?: {
			batchSize?: number;
			priority?: boolean;
			includeMetadata?: boolean;
			ignoreStartAfter?: boolean;
		},
	) {
		const boss = getBossInstance();
		const jobs = await boss.fetch(
			name,
			omitUndefined({
				batchSize: options?.batchSize,
				priority: options?.priority,
				includeMetadata: options?.includeMetadata,
				ignoreStartAfter: options?.ignoreStartAfter,
			}),
		);

		if (options?.includeMetadata) {
			return (jobs as JobWithMetadata<JobData>[]).map((job) =>
				mapJobWithMetadata(job),
			);
		}

		return (jobs as Job<JobData>[]).map((job) => mapJob(job));
	},

	async complete(
		name: string,
		id: string | string[],
		data?: JobData,
		_options?: { keepAlive?: boolean },
	): Promise<void> {
		const boss = getBossInstance();
		await boss.complete(name, id, data || null);
	},

	async fail(
		name: string,
		id: string | string[],
		data?: JobData,
		_options?: { keepAlive?: boolean },
	): Promise<void> {
		const boss = getBossInstance();
		await boss.fail(name, id, data || null);
	},

	async cancel(
		name: string,
		id: string | string[],
		_options?: { keepAlive?: boolean },
	): Promise<void> {
		const boss = getBossInstance();
		await boss.cancel(name, id);
	},

	async resume(
		name: string,
		id: string | string[],
		_options?: { keepAlive?: boolean },
	): Promise<void> {
		const boss = getBossInstance();
		await boss.resume(name, id);
	},

	async retry(
		name: string,
		id: string | string[],
		_options?: { keepAlive?: boolean },
	): Promise<void> {
		const boss = getBossInstance();
		await boss.retry(name, id);
	},

	async deleteJob(
		name: string,
		id: string | string[],
		_options?: { keepAlive?: boolean },
	): Promise<void> {
		const boss = getBossInstance();
		await boss.deleteJob(name, id);
	},

	async deleteQueuedJobs(name: string): Promise<void> {
		const boss = getBossInstance();
		await boss.deleteQueuedJobs(name);
	},

	async deleteStoredJobs(name: string): Promise<void> {
		const boss = getBossInstance();
		await boss.deleteStoredJobs(name);
	},

	async deleteAllJobs(name?: string): Promise<void> {
		const boss = getBossInstance();
		await boss.deleteAllJobs(name);
	},

	async findJobs(name: string, options: FindJobsOptions) {
		const boss = getBossInstance();
		const jobs = await boss.findJobs<JobData>(name, options);
		return jobs.map((job) => mapJobWithMetadata(job));
	},

	async work(
		name: string,
		options: WorkerOptions | JobHandler,
		handler?: JobHandler,
	): Promise<string> {
		await ensureStarted();
		const boss = getBossInstance();

		// Handle overloaded signature: work(name, handler) or work(name, options, handler)
		let workOptions: ReturnType<typeof mapWorkerOptions> | undefined;
		let workHandler: JobHandler;

		if (typeof options === "function") {
			workHandler = options;
		} else {
			workOptions = mapWorkerOptions(options);
			if (!handler) {
				throw new Error(
					"Handler is required when options are provided",
				);
			}
			workHandler = handler;
		}

		return await boss.work(
			name,
			workOptions || {},
			async (jobs: Job<JobData>[]) => {
				const mappedJobs = jobs.map((job) => mapJob(job));
				await workHandler(mappedJobs);
			},
		);
	},

	async offWork(
		name: string,
		options?: { id?: string; wait?: boolean },
	): Promise<void> {
		const boss = getBossInstance();
		await boss.offWork(name, options);
	},

	async notifyWorker(id: string): Promise<void> {
		const boss = getBossInstance();
		boss.notifyWorker(id);
	},
};

/**
 * HMR disposal: when this module is replaced, stop and clear the PgBoss instance
 * so the next use gets a fresh instance and we don't leave orphaned DB connections.
 */
declare const module: { hot?: { dispose(cb: (data: unknown) => void): void } };
if (module?.hot?.dispose) {
	module.hot?.dispose(() => {
		if (bossInstance) {
			void bossInstance
				.stop()
				.then(() => {
					bossInstance = null;
					startPromise = null;
					logger.info("pg-boss stopped (HMR)");
				})
				.catch((err: Error) =>
					logger.error("pg-boss HMR dispose error", err),
				);
		}
	});
}
