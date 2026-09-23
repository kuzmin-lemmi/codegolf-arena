// src/components/profile/LanguagePoints.tsx
// Очки игрока по языкам: у каждого языка свой рейтинг (docs/three-languages.md)

import Link from 'next/link';
import { LANGUAGE_LABELS, type Language } from '@/lib/languages';
import { pluralizeRu } from '@/lib/utils';

export interface LanguagePointsItem {
  language: Language;
  points: number;
  tasksSolved: number;
  rank: number | null;
}

export function LanguagePoints({ stats }: { stats: LanguagePointsItem[] }) {
  if (stats.length === 0) return null;

  return (
    <div className="mt-4 grid grid-cols-3 gap-2">
      {stats.map((item) => (
        <Link
          key={item.language}
          href={`/leaderboard?lang=${item.language}`}
          className="rounded-lg border border-border bg-background-tertiary/50 px-3 py-2 hover:border-accent-blue/40 transition-colors"
        >
          <div className="text-xs text-text-muted">{LANGUAGE_LABELS[item.language]}</div>
          <div className="font-mono font-bold text-accent-blue">{item.points}</div>
          <div className="text-[11px] text-text-secondary">
            {item.tasksSolved} {pluralizeRu(item.tasksSolved, ['задача', 'задачи', 'задач'])}
            {item.rank ? ` · #${item.rank}` : ''}
          </div>
        </Link>
      ))}
    </div>
  );
}
