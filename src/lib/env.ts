let validated = false;

export function validateRuntimeEnv(): void {
  if (validated) return;
  validated = true;

  if (process.env.DISABLE_STRICT_ENV === 'true') {
    return;
  }

  const isProd = process.env.NODE_ENV === 'production';
  const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';
  const provider = process.env.DATABASE_PROVIDER || 'sqlite';
  const databaseUrl = process.env.DATABASE_URL || '';
  const allowSqliteInProd = process.env.ALLOW_SQLITE_IN_PRODUCTION === 'true';

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  if (isProd && process.env.ALLOW_DEV_LOGIN === 'true') {
    throw new Error('ALLOW_DEV_LOGIN=true is forbidden in production');
  }

  if (isProd && !process.env.NEXT_PUBLIC_BASE_URL) {
    throw new Error('NEXT_PUBLIC_BASE_URL is required in production');
  }

  if (provider === 'sqlite' && !databaseUrl.startsWith('file:')) {
    throw new Error('DATABASE_URL must start with file: when DATABASE_PROVIDER=sqlite');
  }

  if (provider === 'postgresql' && !databaseUrl.startsWith('postgresql://') && !databaseUrl.startsWith('postgres://')) {
    throw new Error('DATABASE_URL must be a PostgreSQL URL when DATABASE_PROVIDER=postgresql');
  }

  if (isProd && !isBuildPhase && provider === 'sqlite' && !allowSqliteInProd) {
    throw new Error('DATABASE_PROVIDER=sqlite is not allowed in production. Use postgresql.');
  }

  if (isProd && !isBuildPhase && databaseUrl.startsWith('file:') && !allowSqliteInProd) {
    throw new Error('SQLite DATABASE_URL is not allowed in production. Use PostgreSQL.');
  }
}
