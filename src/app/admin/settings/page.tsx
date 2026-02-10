import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Settings, Shield, Database, Server } from 'lucide-react';
import { Card } from '@/components/ui';
import { prisma } from '@/lib/db';
import { hashToken } from '@/lib/auth';

async function getAdminUser() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('arena_session')?.value;

  if (!sessionToken) return null;

  const session = await prisma.session.findUnique({
    where: { token: hashToken(sessionToken) },
    include: {
      user: {
        select: {
          id: true,
          isAdmin: true,
          displayName: true,
        },
      },
    },
  });

  if (!session || session.expiresAt < new Date() || !session.user.isAdmin) {
    return null;
  }

  return session.user;
}

export default async function AdminSettingsPage() {
  const user = await getAdminUser();
  if (!user) redirect('/');

  const provider = process.env.DATABASE_PROVIDER || 'sqlite';
  const hasRedisRateLimit = Boolean(process.env.RATE_LIMIT_REDIS_URL && process.env.RATE_LIMIT_REDIS_TOKEN);

  return (
    <div className="min-h-screen">
      <div className="border-b border-border bg-background-secondary/50">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <Settings className="h-8 w-8 text-accent-blue" />
            <div>
              <h1 className="text-2xl font-bold">Настройки платформы</h1>
              <p className="text-text-secondary">Базовые параметры и статус безопасности</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto grid gap-4 px-4 py-8 md:grid-cols-2">
        <Card padding="lg">
          <div className="mb-3 flex items-center gap-2">
            <Shield className="h-5 w-5 text-accent-green" />
            <h2 className="font-semibold">Безопасность</h2>
          </div>
          <p className="text-sm text-text-secondary">Глобальные security headers: включены через middleware.</p>
        </Card>

        <Card padding="lg">
          <div className="mb-3 flex items-center gap-2">
            <Database className="h-5 w-5 text-accent-blue" />
            <h2 className="font-semibold">База данных</h2>
          </div>
          <p className="text-sm text-text-secondary">Провайдер: {provider}</p>
        </Card>

        <Card padding="lg" className="md:col-span-2">
          <div className="mb-3 flex items-center gap-2">
            <Server className="h-5 w-5 text-tier-gold" />
            <h2 className="font-semibold">Rate limiting</h2>
          </div>
          <p className="text-sm text-text-secondary">
            {hasRedisRateLimit
              ? 'Используется Redis (Upstash) для устойчивого rate limiting.'
              : 'Redis не настроен, используется in-memory fallback.'}
          </p>
        </Card>
      </div>
    </div>
  );
}
