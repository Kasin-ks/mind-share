export interface JobData {
	[key: string]: unknown;
}

export interface JobOptions {
	priority?: number;
	id?: string;
	retryLimit?: number;
	retryDelay?: number;
	retryBackoff?: boolean;
	retryDelayMax?: number;
	startAfter?: number | string | Date;
	expireInSeconds?: number;
	retentionSeconds?: number;
	deleteAfterSeconds?: number;
	singletonSeconds?: number;
	singletonKey?: string;
	singletonNextSlot?: boolean;
	group?: {
		id: string;
		tier?: string;
	};
}

export interface Job {
	id: string;
	name: string;
	data: JobData;
	signal: AbortSignal;
}

export interface JobWithMetadata extends Job {
	priority: number;
	state:
		| "created"
		| "retry"
		| "active"
		| "completed"
		| "cancelled"
		| "failed";
	retryLimit: number;
	retryCount: number;
	createdOn: Date;
	startedOn: Date | null;
	completedOn: Date | null;
}

export interface QueueConfig {
	policy?: "standard" | "short" | "singleton" | "stately" | "exclusive";
	partition?: boolean;
	deadLetter?: string;
	warningQueueSize?: number;
	retryLimit?: number;
	retryDelay?: number;
	retryBackoff?: boolean;
	retryDelayMax?: number;
	expireInSeconds?: number;
	retentionSeconds?: number;
	deleteAfterSeconds?: number;
}

export interface WorkerOptions {
	pollingIntervalSeconds?: number;
	batchSize?: number;
	localConcurrency?: number;
	localGroupConcurrency?:
		| number
		| {
				default: number;
				tiers: Record<string, number>;
		  };
	groupConcurrency?:
		| number
		| {
				default: number;
				tiers: Record<string, number>;
		  };
}

export interface QueueStats {
	createdCount: number;
	retryCount: number;
	activeCount: number;
	completedCount: number;
	failedCount: number;
	cancelledCount: number;
}

export interface FindJobsOptions {
	id?: string;
	key?: string;
	data?: Record<string, unknown>;
	queued?: boolean;
}

export type JobHandler = (jobs: Job[]) => Promise<void>;

export interface JobProvider {
	/**
	 * Start the job queue system
	 */
	start(): Promise<void>;

	/**
	 * Stop the job queue system
	 */
	stop(): Promise<void>;

	/**
	 * Create a queue with the given configuration
	 */
	createQueue(name: string, config?: QueueConfig): Promise<void>;

	/**
	 * Update queue configuration
	 */
	updateQueue(name: string, config: Partial<QueueConfig>): Promise<void>;

	/**
	 * Delete a queue and all its jobs
	 */
	deleteQueue(name: string): Promise<void>;

	/**
	 * Get queue configuration
	 */
	getQueue(name: string): Promise<QueueConfig | null>;

	/**
	 * Get all queue configurations
	 */
	getQueues(): Promise<Array<{ name: string; config: QueueConfig }>>;

	/**
	 * Get queue statistics
	 */
	getQueueStats(name: string): Promise<QueueStats>;

	/**
	 * Send a job to a queue
	 */
	send(
		name: string,
		data: JobData,
		options?: JobOptions,
	): Promise<string | null>;

	/**
	 * Send a job after a delay
	 */
	sendAfter(
		name: string,
		data: JobData,
		options: JobOptions | undefined,
		value: number | string | Date,
	): Promise<string | null>;

	/**
	 * Send a throttled job (only if no job in time window)
	 */
	sendThrottled(
		name: string,
		data: JobData,
		options: JobOptions | undefined,
		seconds: number,
		key?: string,
	): Promise<string | null>;

	/**
	 * Send a debounced job (schedules to next window if conflicted)
	 */
	sendDebounced(
		name: string,
		data: JobData,
		options: JobOptions | undefined,
		seconds: number,
		key?: string,
	): Promise<string | null>;

	/**
	 * Bulk insert jobs
	 */
	insert(
		name: string,
		jobs: Array<{ data: JobData; options?: JobOptions }>,
		options?: JobOptions,
	): Promise<string[]>;

	/**
	 * Fetch jobs for processing
	 */
	fetch(
		name: string,
		options?: {
			batchSize?: number;
			priority?: boolean;
			includeMetadata?: boolean;
			ignoreStartAfter?: boolean;
		},
	): Promise<Job[] | JobWithMetadata[]>;

	/**
	 * Mark a job as completed
	 */
	complete(
		name: string,
		id: string | string[],
		data?: JobData,
		options?: { keepAlive?: boolean },
	): Promise<void>;

	/**
	 * Mark a job as failed
	 */
	fail(
		name: string,
		id: string | string[],
		data?: JobData,
		options?: { keepAlive?: boolean },
	): Promise<void>;

	/**
	 * Cancel a job
	 */
	cancel(
		name: string,
		id: string | string[],
		options?: { keepAlive?: boolean },
	): Promise<void>;

	/**
	 * Resume a cancelled job
	 */
	resume(
		name: string,
		id: string | string[],
		options?: { keepAlive?: boolean },
	): Promise<void>;

	/**
	 * Retry a failed job
	 */
	retry(
		name: string,
		id: string | string[],
		options?: { keepAlive?: boolean },
	): Promise<void>;

	/**
	 * Delete a job
	 */
	deleteJob(
		name: string,
		id: string | string[],
		options?: { keepAlive?: boolean },
	): Promise<void>;

	/**
	 * Delete all queued jobs
	 */
	deleteQueuedJobs(name: string): Promise<void>;

	/**
	 * Delete all stored jobs (completed/failed/cancelled)
	 */
	deleteStoredJobs(name: string): Promise<void>;

	/**
	 * Delete all jobs in a queue
	 */
	deleteAllJobs(name?: string): Promise<void>;

	/**
	 * Find jobs by criteria
	 */
	findJobs(
		name: string,
		options: FindJobsOptions,
	): Promise<JobWithMetadata[]>;

	/**
	 * Start a worker to process jobs
	 */
	work(
		name: string,
		options: WorkerOptions | JobHandler,
		handler?: JobHandler,
	): Promise<string>;

	/**
	 * Stop a worker
	 */
	offWork(
		name: string,
		options?: { id?: string; wait?: boolean },
	): Promise<void>;

	/**
	 * Notify a worker to poll immediately
	 */
	notifyWorker(id: string): Promise<void>;
}
