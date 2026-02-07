import { PrismaClient } from '@prisma/client';

function fail(message: string): never {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function ok(message: string) {
  console.log(`OK: ${message}`);
}

async function main() {
  const provider = process.env.DATABASE_PROVIDER || '';
  const databaseUrl = process.env.DATABASE_URL || '';
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || '';
  const nodeEnv = process.env.NODE_ENV || 'development';
  const allowDevLogin = process.env.ALLOW_DEV_LOGIN || 'false';

  if (provider !== 'postgresql') {
    fail('DATABASE_PROVIDER must be "postgresql" for cutover checks');
  }
  ok('DATABASE_PROVIDER=postgresql');

  if (!databaseUrl.startsWith('postgresql://') && !databaseUrl.startsWith('postgres://')) {
    fail('DATABASE_URL must start with postgresql:// or postgres://');
  }
  ok('DATABASE_URL format is PostgreSQL');

  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    fail('NEXT_PUBLIC_BASE_URL must be a full URL');
  }
  ok('NEXT_PUBLIC_BASE_URL format is valid');

  if (nodeEnv === 'production' && allowDevLogin === 'true') {
    fail('ALLOW_DEV_LOGIN=true is forbidden in production');
  }
  ok('ALLOW_DEV_LOGIN is safe for current NODE_ENV');

  const prisma = new PrismaClient({ log: ['error'] });

  try {
    await prisma.$queryRaw`SELECT 1`;
    ok('PostgreSQL connection check passed');

    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `;

    const tableNames = new Set(tables.map((row) => row.table_name));
    const requiredTables = [
      'users',
      'sessions',
      'tasks',
      'testcases',
      'submissions',
      'best_submissions',
      'submission_jobs',
    ];

    const missing = requiredTables.filter((name) => !tableNames.has(name));
    if (missing.length > 0) {
      fail(`Missing tables in PostgreSQL: ${missing.join(', ')}`);
    }
    ok('Required tables are present');

    const counts = await prisma.$queryRaw<Array<{ users: bigint; tasks: bigint; submissions: bigint }>>`
      SELECT
        (SELECT COUNT(*) FROM users) AS users,
        (SELECT COUNT(*) FROM tasks) AS tasks,
        (SELECT COUNT(*) FROM submissions) AS submissions
    `;

    const snapshot = counts[0];
    console.log(
      `SNAPSHOT: users=${snapshot.users.toString()} tasks=${snapshot.tasks.toString()} submissions=${snapshot.submissions.toString()}`
    );
  } finally {
    await prisma.$disconnect();
  }

  console.log('Preflight completed successfully.');
}

void main().catch((error) => {
  console.error('ERROR: Preflight crashed', error);
  process.exit(1);
});
