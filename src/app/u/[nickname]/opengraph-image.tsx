// src/app/u/[nickname]/opengraph-image.tsx

/**
 * Картинка с результатом участника: она уходит в превью ссылки
 * в Telegram и её же можно скачать со страницы профиля.
 */

import { ImageResponse } from 'next/og';
import { getPublicProfile } from '@/lib/profile';
import { loadCardFonts, OG_FONT_FAMILY } from '@/lib/og-fonts';
import { formatDate, pluralizeRu } from '@/lib/utils';

export const alt = 'Результаты участника Арены однострочников';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Картинку пересобираем не чаще раза в 5 минут: рендер стоит заметного CPU
export const revalidate = 300;

const COLORS = {
  background: '#0b0f14',
  card: '#111821',
  border: '#243041',
  textPrimary: '#eef3f8',
  textSecondary: '#a6b0bb',
  textMuted: '#7d8894',
  blue: '#6aa7ff',
  green: '#41c47a',
  gold: '#ffd700',
};

interface ImageProps {
  params: Promise<{ nickname: string }>;
}

export default async function Image({ params }: ImageProps) {
  const { nickname } = await params;
  // Если база недоступна, всё равно отдаём картинку — просто без цифр
  const [profile, fonts] = await Promise.all([
    getPublicProfile(safeDecode(nickname)).catch((error) => {
      console.error('OG card: profile is not available:', error);
      return null;
    }),
    loadCardFonts(),
  ]);

  const name = profile?.name || safeDecode(nickname);
  const stats = [
    { value: profile ? String(profile.totalPoints) : '0', label: 'очков', color: COLORS.blue },
    {
      value: profile ? String(profile.tasksSolved) : '0',
      label: pluralizeRu(profile?.tasksSolved ?? 0, ['задача', 'задачи', 'задач']),
      color: COLORS.green,
    },
    {
      value: profile ? String(profile.firstPlaces) : '0',
      label: pluralizeRu(profile?.firstPlaces ?? 0, ['первое место', 'первых места', 'первых мест']),
      color: COLORS.gold,
    },
  ];

  const footerParts: string[] = [];
  if (profile?.charsSaved) {
    footerParts.push(
      `срезано ${profile.charsSaved} ${pluralizeRu(profile.charsSaved, ['символ', 'символа', 'символов'])}`
    );
  }
  if (profile?.bestRank) {
    footerParts.push(`лучшее место #${profile.bestRank}`);
  }
  if (profile?.createdAt) {
    footerParts.push(`на Арене с ${formatDate(profile.createdAt)}`);
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: COLORS.background,
          color: COLORS.textPrimary,
          fontFamily: OG_FONT_FAMILY,
          padding: '56px 64px',
        }}
      >
        {/* Шапка */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 26,
            color: COLORS.textSecondary,
          }}
        >
          <div style={{ display: 'flex', color: COLORS.blue, letterSpacing: 2 }}>
            АРЕНА ОДНОСТРОЧНИКОВ
          </div>
          <div style={{ display: 'flex' }}>codegolf.ru</div>
        </div>

        {/* Имя участника */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 28, marginTop: 56 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 104,
              height: 104,
              borderRadius: 52,
              background: COLORS.card,
              border: `2px solid ${COLORS.border}`,
              fontSize: 52,
              fontWeight: 700,
              color: COLORS.blue,
            }}
          >
            {(name[0] || '?').toUpperCase()}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', fontSize: 68, fontWeight: 700 }}>{truncate(name, 20)}</div>
            <div style={{ display: 'flex', fontSize: 28, color: COLORS.textMuted, marginTop: 8 }}>
              {profile?.globalRank
                ? `#${profile.globalRank} в общем рейтинге`
                : 'участник Арены однострочников'}
            </div>
          </div>
        </div>

        {/* Цифры */}
        <div style={{ display: 'flex', gap: 24, marginTop: 'auto' }}>
          {stats.map((stat) => (
            <div
              key={stat.label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                padding: '24px 28px',
                borderRadius: 20,
                background: COLORS.card,
                border: `2px solid ${COLORS.border}`,
              }}
            >
              <div style={{ display: 'flex', fontSize: 64, fontWeight: 700, color: stat.color }}>
                {stat.value}
              </div>
              <div style={{ display: 'flex', fontSize: 26, color: COLORS.textSecondary, marginTop: 4 }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* Подпись */}
        <div
          style={{
            display: 'flex',
            marginTop: 32,
            fontSize: 26,
            color: COLORS.textMuted,
          }}
        >
          {footerParts.length > 0
            ? footerParts.join(' · ')
            : 'Реши задачу в одну строку — и попадёшь в этот рейтинг'}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: fonts.length > 0 ? fonts : undefined,
    }
  );
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
