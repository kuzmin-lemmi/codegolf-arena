import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Keep finished jobs for 14 days by default
const RETENTION_DAYS = parseInt(process.env.JOB_RETENTION_DAYS || '14', 10);

async function main() {
  const cutoffDate = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  
  console.log(`Cleaning up SubmissionJobs older than ${RETENTION_DAYS} days (before ${cutoffDate.toISOString()})...`);

  try {
    // Delete old completed/failed jobs
    const result = await prisma.submissionJob.deleteMany({
      where: {
        status: { in: ['done', 'failed'] },
        finishedAt: { lt: cutoffDate }
      }
    });

    console.log(`✓ Deleted ${result.count} old submission jobs`);

    // Also clean up very old queued jobs that never ran (probably stuck)
    const stuckCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days
    const stuckResult = await prisma.submissionJob.deleteMany({
      where: {
        status: 'queued',
        createdAt: { lt: stuckCutoff }
      }
    });

    if (stuckResult.count > 0) {
      console.log(`✓ Deleted ${stuckResult.count} stuck queued jobs (older than 7 days)`);
    }

    // Show remaining job counts
    const remaining = await prisma.submissionJob.groupBy({
      by: ['status'],
      _count: true
    });

    console.log('\nRemaining jobs by status:');
    remaining.forEach(({ status, _count }) => {
      console.log(`  ${status}: ${_count}`);
    });

  } catch (error) {
    console.error('Error cleaning up jobs:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
