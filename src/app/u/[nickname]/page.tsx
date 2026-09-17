// src/app/u/[nickname]/page.tsx

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Award, Code2, Crown, Scissors, Share2, Trophy } from 'lucide-react';
import { Avatar, Button, Card, TierBadge } from '@/components/ui';
import { ShareProfile } from '@/components/profile/ShareProfile';
import { getPublicProfile } from '@/lib/profile';
import { cn, formatDate, pluralizeRu } from '@/lib/utils';
import type { Metadata } from 'next';

interface PublicProfilePageProps {
  params: Promise<{ nickname: string }>;
}

// Страница публичная и одинаковая для всех — можно держать в кэше
export const revalidate = 60;

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function buildSummary(profile: {
  name: string;
  totalPoints: number;
  tasksSolved: number;
  firstPlaces: number;
}): string {
  const parts = [
    `${profile.totalPoints} ${pluralizeRu(profile.totalPoints, ['очко', 'очка', 'очков'])}`,
    `${profile.tasksSolved} ${pluralizeRu(profile.tasksSolved, ['задача', 'задачи', 'задач'])}`,
  ];

  if (profile.firstPlaces > 0) {
    parts.push(
      `${profile.firstPlaces} ${pluralizeRu(profile.firstPlaces, [
        'первое место',
        'первых места',
        'первых мест',
      ])}`
    );
  }

  return parts.join(' · ');
}

export async function generateMetadata({ params }: PublicProfilePageProps): Promise<Metadata> {
  const { nickname } = await params;
  const profile = await getPublicProfile(safeDecode(nickname));

  if (!profile) {
    return { title: 'Участник не найден' };
  }

  const description = `${profile.name} на Арене однострочников: ${buildSummary(profile)}.`;

  return {
    title: `${profile.name} — Арена однострочников`,
    description,
    alternates: {
      canonical: `/u/${profile.slug}`,
    },
    openGraph: {
      title: `${profile.name} — Арена однострочников`,
      description,
      type: 'profile',
      url: `/u/${profile.slug}`,
      siteName: 'Арена однострочников',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${profile.name} — Арена однострочников`,
      description,
    },
  };
}

export default async function PublicProfilePage({ params }: PublicProfilePageProps) {
  const { nickname } = await params;
  const profile = await getPublicProfile(safeDecode(nickname));

  if (!profile) {
    notFound();
  }

  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || 'https://codegolf.ru').replace(/\/$/, '');
  const profilePath = `/u/${encodeURIComponent(profile.slug)}`;
  const profileUrl = `${baseUrl}${profilePath}`;
  const imageUrl = `${profilePath}/opengraph-image`;
  const shareText = `${profile.name} на Арене однострочников: ${buildSummary(profile)}`;

  return (
    <div className="min-h-screen">
      {/* Шапка профиля */}
      <div className="border-b border-border bg-background-secondary/50">
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            <Avatar
              src={profile.avatarUrl}
              name={profile.name}
              size="lg"
              className="w-20 h-20 text-2xl"
            />
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold mb-1 truncate">{profile.name}</h1>
              <p className="text-text-secondary text-sm sm:text-base">
                {profile.globalRank ? (
                  <>
                    <span className="text-accent-blue font-medium">#{profile.globalRank}</span> в общем
                    рейтинге ·{' '}
                  </>
                ) : null}
                на Арене с {formatDate(profile.createdAt)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Цифры и решения */}
          <div className="lg:col-span-2 space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatTile
                icon={Trophy}
                label="Очки прогресса"
                value={profile.totalPoints}
                accent="text-accent-blue"
              />
              <StatTile
                icon={Code2}
                label="Решено задач"
                value={profile.tasksSolved}
                accent="text-accent-green"
              />
              <StatTile
                icon={Crown}
                label="Первых мест"
                value={profile.firstPlaces}
                accent="text-tier-gold"
              />
              <StatTile
                icon={Scissors}
                label="Срезано символов"
                value={profile.charsSaved}
                accent="text-accent-amber"
              />
            </div>

            <Card padding="lg">
              <div className="flex items-center justify-between mb-4 gap-3">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Award className="w-5 h-5 text-accent-green" />
                  Решённые задачи
                </h2>
                <span className="text-xs text-text-muted">код решений не показываем</span>
              </div>

              {profile.topSolutions.length === 0 ? (
                <div className="text-center py-10">
                  <Code2 className="w-12 h-12 mx-auto text-text-muted mb-3" />
                  <h3 className="font-semibold mb-1">Пока ни одной решённой задачи</h3>
                  <p className="text-text-secondary text-sm">
                    Здесь появятся задачи и длины решений.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {profile.topSolutions.map((solution) => {
                    const saved =
                      solution.firstLength !== null
                        ? solution.firstLength - solution.codeLength
                        : 0;

                    return (
                      <Link
                        key={solution.slug}
                        href={`/task/${solution.slug}`}
                        className="flex items-center gap-3 p-3 rounded-lg bg-background-tertiary/60 hover:bg-background-tertiary transition-colors"
                      >
                        <span
                          className={cn(
                            'w-10 shrink-0 text-center font-bold',
                            solution.rank === 1 && 'text-tier-gold',
                            solution.rank === 2 && 'text-tier-silver',
                            solution.rank === 3 && 'text-tier-bronze',
                            solution.rank > 3 && 'text-text-muted'
                          )}
                        >
                          #{solution.rank}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-medium truncate">{solution.title}</span>
                            <TierBadge tier={solution.tier} />
                          </div>
                          <div className="text-xs text-text-muted">
                            {formatDate(solution.achievedAt)}
                            {saved > 0 && (
                              <>
                                {' · '}
                                <span className="font-mono">
                                  {solution.firstLength} → {solution.codeLength}
                                </span>{' '}
                                (−{saved})
                              </>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-mono font-bold text-accent-green">
                            {solution.codeLength}
                          </div>
                          <div className="text-[11px] text-text-muted">симв.</div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          {/* Поделиться */}
          <div className="space-y-6">
            <Card padding="lg">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Share2 className="w-5 h-5 text-accent-blue" />
                Показать результат
              </h2>
              <ShareProfile profileUrl={profileUrl} imageUrl={imageUrl} shareText={shareText} />
            </Card>

            <Card padding="lg" className="text-center">
              <h3 className="font-semibold mb-2">Хочешь такую же страницу?</h3>
              <p className="text-sm text-text-secondary mb-4">
                Реши любую задачу в одну строку — и твои результаты появятся здесь.
              </p>
              <Link href="/tasks">
                <Button variant="primary" size="sm">
                  Выбрать задачу
                </Button>
              </Link>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Trophy;
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="p-4 rounded-lg border border-border bg-background-secondary/60">
      <div className="flex items-center gap-2 text-xs text-text-secondary mb-1">
        <Icon className="w-4 h-4" />
        {label}
      </div>
      <div className={cn('text-2xl font-bold font-mono', accent)}>{value}</div>
    </div>
  );
}
