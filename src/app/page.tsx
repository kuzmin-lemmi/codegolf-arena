// src/app/page.tsx

import Link from 'next/link';
import { Trophy, Code2, Zap, ArrowRight, Clock, TrendingDown, Medal, Users, MessageCircle, BookOpen } from 'lucide-react';
import { Card, TierBadge, Button, Avatar } from '@/components/ui';
import { prisma } from '@/lib/db';
import { formatTimeRemaining } from '@/lib/utils';

export const revalidate = 60; // Revalidate every 60 seconds

async function getHomePageData() {
  try {
    // Получаем активный турнир недели
    const weeklyChallenge = await prisma.weeklyChallenge.findFirst({
      where: { isActive: true },
      include: {
        task: {
          select: {
            id: true,
            slug: true,
            title: true,
            tier: true,
            functionSignature: true,
            statementMd: true,
            exampleInput: true,
            exampleOutput: true,
            constraintsJson: true,
          },
        },
      },
    });

    // Топ-10 лидерборда задачи недели
    let weeklyLeaderboard: any[] = [];
    if (weeklyChallenge) {
      const bestSubmissions = await prisma.bestSubmission.findMany({
        where: { taskId: weeklyChallenge.taskId },
        orderBy: [{ codeLength: 'asc' }, { achievedAt: 'asc' }],
        take: 10,
        include: {
          user: {
            select: { nickname: true, displayName: true, avatarUrl: true },
          },
        },
      });

      weeklyLeaderboard = bestSubmissions.map((bs, idx) => ({
        rank: idx + 1,
        nickname: bs.user.nickname || bs.user.displayName,
        avatarUrl: bs.user.avatarUrl,
        codeLength: bs.codeLength,
        achievedAt: bs.achievedAt,
      }));
    }

    // Глобальный рейтинг по очкам
    const globalLeaderboard = await prisma.user.findMany({
      where: { totalPoints: { gt: 0 } },
      orderBy: { totalPoints: 'desc' },
      take: 10,
      select: {
        id: true,
        nickname: true,
        displayName: true,
        avatarUrl: true,
        totalPoints: true,
        _count: { select: { bestSubmissions: true } },
      },
    });

    // Последние решения (только лучшие, без дублей по задаче/пользователю)
    const recentBestSubmissions = await prisma.bestSubmission.findMany({
      orderBy: { achievedAt: 'desc' },
      take: 5,
      include: {
        user: { select: { nickname: true, displayName: true } },
        task: { select: { title: true, slug: true } },
      },
    });

    const recentRecords = recentBestSubmissions.map((s) => ({
      nickname: s.user.nickname || s.user.displayName,
      taskTitle: s.task.title,
      taskSlug: s.task.slug,
      newLength: s.codeLength,
      oldLength: s.codeLength + Math.floor(Math.random() * 10) + 1,
      diff: -Math.floor(Math.random() * 10) - 1,
    }));

    return {
      weeklyChallenge: weeklyChallenge
        ? {
            ...weeklyChallenge,
            task: {
              ...weeklyChallenge.task,
              constraintsJson: JSON.parse(weeklyChallenge.task.constraintsJson),
            },
            leaderboard: weeklyLeaderboard,
          }
        : null,
      globalLeaderboard: globalLeaderboard.map((u, idx) => ({
        rank: idx + 1,
        userId: u.id,
        nickname: u.nickname || u.displayName,
        avatarUrl: u.avatarUrl,
        points: u.totalPoints,
        tasksSolved: u._count.bestSubmissions,
      })),
      recentRecords,
    };
  } catch (error) {
    console.error('Error fetching home page data:', error);
    return {
      weeklyChallenge: null,
      globalLeaderboard: [],
      recentRecords: [],
    };
  }
}

export default async function HomePage() {
  const { weeklyChallenge, globalLeaderboard, recentRecords } = await getHomePageData();

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-background to-background-secondary">
        <div className="hero-radial absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-accent-blue/10 via-transparent to-transparent" />
        <div className="container mx-auto px-4 py-16 relative">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent-blue/10 text-accent-blue text-sm font-medium mb-6">
              <Zap className="w-4 h-4" />
              Python Code Golf
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Арена <span className="text-accent-blue">однострочников</span>
            </h1>
            <p className="text-xl text-text-secondary mb-8">
              Решай задачи в одну строку. Соревнуйся за самый короткий код.
              Попади в топ рейтинга.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/tasks">
                <Button variant="primary" size="lg">
                  Начать решать
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </Link>
              <Link href="/leaderboard">
                <Button variant="secondary" size="lg">
                  <Trophy className="w-5 h-5" />
                  Рейтинг
                </Button>
              </Link>
              <a href="https://t.me/codegolf_arena" target="_blank" rel="noopener noreferrer">
                <Button variant="ghost" size="lg">
                  <MessageCircle className="w-5 h-5" />
                  Чат Telegram
                </Button>
              </a>
            </div>
            <p className="mt-4 text-sm text-text-secondary">
              Локальная проверка для скорости, полный набор тестов проверяется при отправке в рейтинг.
            </p>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-background-secondary/30">
        <div className="container mx-auto px-4 py-8">
          <h2 className="text-xl font-semibold mb-4 text-center">Как это работает за 30 секунд</h2>
          <div className="grid md:grid-cols-3 gap-4">
            <Card padding="md">
              <div className="text-xs text-text-muted mb-1">Шаг 1</div>
              <div className="font-semibold mb-2">Выбери задачу</div>
              <p className="text-sm text-text-secondary">Открой Bronze, Silver или Gold и посмотри формат функции.</p>
            </Card>
            <Card padding="md">
              <div className="text-xs text-text-muted mb-1">Шаг 2</div>
              <div className="font-semibold mb-2">Напиши однострочник</div>
              <p className="text-sm text-text-secondary">Проверь на открытых тестах и отправь решение в рейтинг.</p>
            </Card>
            <Card padding="md">
              <div className="text-xs text-text-muted mb-1">Шаг 3</div>
              <div className="font-semibold mb-2">Поднимайся в топ</div>
              <p className="text-sm text-text-secondary">Чем короче код и лучше место — тем больше очков прогресса.</p>
            </Card>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="container mx-auto px-4 py-12">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left Column - Weekly Challenge */}
          <div className="lg:col-span-2">
            {weeklyChallenge ? (
              <WeeklyChallengeCard challenge={weeklyChallenge} />
            ) : (
              <Card padding="lg" className="text-center">
                <Trophy className="w-12 h-12 mx-auto text-text-muted mb-4" />
                <h3 className="text-xl font-semibold mb-2">Турнир недели скоро начнётся</h3>
                <p className="text-text-secondary mb-4">А пока можно потренироваться на задачах</p>
                <Link href="/tasks">
                  <Button variant="primary">Перейти к задачам</Button>
                </Link>
              </Card>
            )}
          </div>

          {/* Right Column - Leaderboard & Records */}
          <div className="space-y-6">
            {/* Global Leaderboard */}
            <Card padding="md">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-tier-gold" />
                  Рейтинг игроков
                </h3>
                <Link href="/leaderboard" className="text-sm text-accent-blue hover:underline">
                  Все →
                </Link>
              </div>
              {globalLeaderboard.length > 0 ? (
                <GlobalLeaderboardCompact entries={globalLeaderboard} />
              ) : (
                <div className="text-center py-4 space-y-3">
                  <p className="text-text-secondary">Станьте первым участником!</p>
                  <Link href="/tasks">
                    <Button variant="secondary" size="sm">Решить первую задачу</Button>
                  </Link>
                </div>
              )}
            </Card>

            {/* Recent Records */}
            <Card padding="md">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <TrendingDown className="w-5 h-5 text-accent-green" />
                  Последние решения
                </h3>
              </div>
              {recentRecords.length > 0 ? (
                <div className="space-y-3">
                  {recentRecords.map((record, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-background-tertiary/50 transition-colors"
                    >
                      <div className="w-2 h-2 rounded-full bg-accent-green" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{record.nickname}</span>
                          <span className="text-accent-green font-mono font-bold">{record.newLength}</span>
                        </div>
                        <Link
                          href={`/task/${record.taskSlug}`}
                          className="text-xs text-text-muted truncate hover:text-accent-blue"
                        >
                          {record.taskTitle}
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 space-y-3">
                  <p className="text-text-secondary">Пока нет решений</p>
                  <div className="flex items-center justify-center gap-2">
                    <Link href="/tasks">
                      <Button variant="secondary" size="sm">Начать с Bronze</Button>
                    </Link>
                    <Link href="/rules">
                      <Button variant="ghost" size="sm">
                        <BookOpen className="w-4 h-4" />
                        Правила
                      </Button>
                    </Link>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="border-t border-border bg-background-secondary/50">
        <div className="container mx-auto px-4 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <StatCard icon={Code2} label="Задач" value="5+" />
            <StatCard icon={Users} label="Участников" value={`${Math.max(globalLeaderboard.length, 1)}+`} />
            <StatCard icon={Trophy} label="Решений" value="100+" />
            <StatCard icon={Zap} label="Рекордов" value="50+" />
          </div>
        </div>
      </section>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="text-center">
      <Icon className="w-8 h-8 mx-auto text-accent-blue mb-2" />
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm text-text-secondary">{label}</div>
    </div>
  );
}

function WeeklyChallengeCard({ challenge }: { challenge: any }) {
  const task = challenge.task;
  const timeRemaining = formatTimeRemaining(new Date(challenge.endsAt));

  return (
    <div className="card-gold p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-3 py-1 bg-tier-gold/20 text-tier-gold rounded-full text-sm font-bold">
              GOLD
            </span>
            <span className="text-text-secondary">Задача недели</span>
          </div>
          <h2 className="text-2xl font-bold">{task.title}</h2>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-1 text-text-secondary text-sm">
            <Clock className="w-4 h-4" />
            Дедлайн
          </div>
          <div className="font-bold text-tier-gold">{timeRemaining}</div>
        </div>
      </div>

      <p className="text-text-secondary mb-4">{task.statementMd.split('\n')[0]}</p>

      <div className="flex flex-wrap gap-2 mb-6">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-background-tertiary rounded-full text-sm">
          <span className="text-accent-green">✓</span> 1 строка
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-background-tertiary rounded-full text-sm">
          <span className="text-accent-red">✗</span> ; запрещён
        </span>
      </div>

      {/* Weekly Leaderboard */}
      {challenge.leaderboard.length > 0 && (
        <div className="mb-6 p-4 bg-background-tertiary/50 rounded-lg">
          <h4 className="text-sm font-medium text-text-secondary mb-3">Топ-5 недели</h4>
          <div className="space-y-2">
            {challenge.leaderboard.slice(0, 5).map((entry: any) => (
              <div key={entry.rank} className="flex items-center gap-3">
                <span className="w-6 text-center font-bold text-text-muted">{entry.rank}.</span>
                <Avatar src={entry.avatarUrl} name={entry.nickname} size="sm" />
                <span className="flex-1 truncate">{entry.nickname}</span>
                <span className="font-mono font-bold text-accent-green">{entry.codeLength}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Link href={`/task/${task.slug}`}>
        <Button variant="primary" size="lg" className="w-full sm:w-auto">
          Решать задачу
          <ArrowRight className="w-4 h-4" />
        </Button>
      </Link>
    </div>
  );
}

function GlobalLeaderboardCompact({ entries }: { entries: any[] }) {
  return (
    <div className="space-y-2">
      {entries.map((entry) => (
        <div
          key={entry.rank}
          className="flex items-center gap-3 p-2 rounded-lg transition-colors hover:bg-background-tertiary/50"
        >
          <RankBadge rank={entry.rank} />
          <Avatar src={entry.avatarUrl} name={entry.nickname} size="sm" />
          <span className="flex-1 font-medium truncate">{entry.nickname}</span>
          <div className="text-right">
            <span className="font-mono font-bold text-accent-blue">{entry.points}</span>
            <span className="text-text-muted text-xs ml-1">очков</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-tier-gold/20 text-tier-gold font-bold">
        <Medal className="w-4 h-4" />
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-tier-silver/20 text-tier-silver font-bold">
        2
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-tier-bronze/20 text-tier-bronze font-bold">
        3
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center w-8 h-8 text-text-secondary font-medium">
      {rank}.
    </div>
  );
}
