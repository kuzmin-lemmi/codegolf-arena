import { prisma } from '@/lib/db';
import { runTaskSubmission } from '@/lib/submission-executor';
import type { SubmissionResponseData, TaskSubmitPayload } from '@/lib/submission-types';

const MAX_CONCURRENT = 2;
const MAX_QUEUE = 300;
const STALE_RUNNING_MS = 2 * 60 * 1000;

let activeWorkers = 0;
let initialized = false;

export type SubmissionJobStatus = 'queued' | 'running' | 'done' | 'failed';

export class SubmissionJobsOverflowError extends Error {
  code = 'JOBS_OVERFLOW';

  constructor() {
    super('Submission queue is full');
  }
}

export async function enqueueTaskSubmissionJob(params: {
  userId: string;
  taskSlug: string;
  dedupKey: string;
  payload: TaskSubmitPayload;
}): Promise<string> {
  await ensureInitialized();

  const existing = await prisma.submissionJob.findFirst({
    where: {
      dedupKey: params.dedupKey,
      status: { in: ['queued', 'running'] },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });

  if (existing) {
    kickWorkers();
    return existing.id;
  }

  const queueSize = await prisma.submissionJob.count({
    where: { status: { in: ['queued', 'running'] } },
  });

  if (queueSize >= MAX_QUEUE) {
    throw new SubmissionJobsOverflowError();
  }

  const created = await prisma.submissionJob.create({
    data: {
      userId: params.userId,
      taskSlug: params.taskSlug,
      dedupKey: params.dedupKey,
      payloadJson: JSON.stringify(params.payload),
      status: 'queued',
    },
    select: { id: true },
  });

  kickWorkers();
  return created.id;
}

export async function getSubmissionJob(
  jobId: string,
  userId: string,
  taskSlug: string
): Promise<
  | {
      id: string;
      status: SubmissionJobStatus;
      result?: SubmissionResponseData;
      error?: string;
    }
  | null
> {
  await ensureInitialized();

  const job = await prisma.submissionJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      userId: true,
      taskSlug: true,
      status: true,
      resultJson: true,
      errorMsg: true,
    },
  });

  if (!job) return null;
  if (job.userId !== userId || job.taskSlug !== taskSlug) return null;

  let result: SubmissionResponseData | undefined;
  if (job.resultJson) {
    try {
      result = JSON.parse(job.resultJson) as SubmissionResponseData;
    } catch {
      result = undefined;
    }
  }

  return {
    id: job.id,
    status: job.status as SubmissionJobStatus,
    result,
    error: job.errorMsg || undefined,
  };
}

async function ensureInitialized() {
  if (initialized) return;
  initialized = true;

  await recoverStaleRunningJobs();
  kickWorkers();

  const timer = setInterval(() => {
    kickWorkers();
    void recoverStaleRunningJobs();
  }, 5000);

  if (typeof timer.unref === 'function') {
    timer.unref();
  }
}

function kickWorkers() {
  while (activeWorkers < MAX_CONCURRENT) {
    activeWorkers += 1;
    void runWorker();
  }
}

async function runWorker() {
  try {
    while (true) {
      const job = await claimNextJob();
      if (!job) break;

      await processJob(job.id, job.payloadJson);
    }
  } finally {
    activeWorkers = Math.max(0, activeWorkers - 1);
  }
}

async function claimNextJob(): Promise<{ id: string; payloadJson: string } | null> {
  for (let i = 0; i < 5; i++) {
    const next = await prisma.submissionJob.findFirst({
      where: { status: 'queued' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, payloadJson: true },
    });

    if (!next) return null;

    const updated = await prisma.submissionJob.updateMany({
      where: {
        id: next.id,
        status: 'queued',
      },
      data: {
        status: 'running',
        attempts: { increment: 1 },
        startedAt: new Date(),
        errorMsg: null,
      },
    });

    if (updated.count === 1) {
      return next;
    }
  }

  return null;
}

async function processJob(jobId: string, payloadJson: string) {
  try {
    const payload = JSON.parse(payloadJson) as TaskSubmitPayload;
    const result = await runTaskSubmission(payload);

    await prisma.submissionJob.update({
      where: { id: jobId },
      data: {
        status: 'done',
        resultJson: JSON.stringify(result),
        finishedAt: new Date(),
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Submission failed';
    await prisma.submissionJob.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        errorMsg,
        finishedAt: new Date(),
      },
    });
  }
}

async function recoverStaleRunningJobs() {
  const threshold = new Date(Date.now() - STALE_RUNNING_MS);
  await prisma.submissionJob.updateMany({
    where: {
      status: 'running',
      startedAt: { lt: threshold },
    },
    data: {
      status: 'queued',
      errorMsg: null,
    },
  });
}
