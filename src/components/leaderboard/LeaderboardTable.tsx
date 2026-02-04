// src/components/leaderboard/LeaderboardTable.tsx

import { cn, formatRelativeTime } from '@/lib/utils';
import { Avatar } from '@/components/ui';
import { Trophy, Clock, Check } from 'lucide-react';

export interface LeaderboardEntry {
  rank: number;
  nickname: string;
  avatarUrl?: string | null;
  codeLength: number;
  achievedAt: Date | string;
  isCurrentUser?: boolean;
}

interface LeaderboardTableProps {
  entries: LeaderboardEntry[];
  showCode?: boolean;
  maxEntries?: number;
  title?: string;
  emptyMessage?: string;
}

export function LeaderboardTable({
  entries,
  showCode = false,
  maxEntries,
  title,
  emptyMessage = 'Пока нет решений',
}: LeaderboardTableProps) {
  const displayEntries = maxEntries ? entries.slice(0, maxEntries) : entries;

  return (
    <div className="space-y-3">
      {title && (
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Trophy className="w-5 h-5 text-tier-gold" />
            {title}
          </h3>
          {maxEntries && entries.length > maxEntries && (
            <button className="text-sm text-accent-blue hover:underline">
              Показать все →
            </button>
          )}
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-left text-sm text-text-secondary">
              <th className="px-4 py-3 font-medium w-16">Место</th>
              <th className="px-4 py-3 font-medium">Ник</th>
              <th className="px-4 py-3 font-medium text-right">Длина</th>
              <th className="px-4 py-3 font-medium text-right hidden sm:table-cell">Время</th>
            </tr>
          </thead>
          <tbody>
            {displayEntries.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-text-muted">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              displayEntries.map((entry) => (
                <tr
                  key={entry.rank}
                  className={cn(
                    'border-b border-border/50 last:border-0 transition-colors hover:bg-background-tertiary/50',
                    entry.isCurrentUser && 'bg-accent-blue/5'
                  )}
                >
                  <td className="px-4 py-3">
                    <RankBadge rank={entry.rank} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar
                        src={entry.avatarUrl}
                        name={entry.nickname}
                        size="sm"
                      />
                      <span
                        className={cn(
                          'font-medium',
                          entry.isCurrentUser && 'text-accent-blue'
                        )}
                      >
                        {entry.nickname}
                        {entry.isCurrentUser && (
                          <Check className="inline w-4 h-4 ml-1 text-accent-green" />
                        )}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono font-bold text-accent-green">
                      {entry.codeLength}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-text-secondary hidden sm:table-cell">
                    <div className="flex items-center justify-end gap-1">
                      <Clock className="w-3 h-3" />
                      {formatRelativeTime(entry.achievedAt)}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-tier-gold/20 text-tier-gold font-bold">
        1
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

// Компактная версия для виджетов
interface LeaderboardCompactProps {
  entries: LeaderboardEntry[];
  maxEntries?: number;
}

export function LeaderboardCompact({ entries, maxEntries = 10 }: LeaderboardCompactProps) {
  const displayEntries = entries.slice(0, maxEntries);

  return (
    <div className="space-y-2">
      {displayEntries.map((entry) => (
        <div
          key={entry.rank}
          className={cn(
            'flex items-center gap-3 p-2 rounded-lg transition-colors hover:bg-background-tertiary/50',
            entry.isCurrentUser && 'bg-accent-blue/5'
          )}
        >
          <RankBadge rank={entry.rank} />
          <Avatar src={entry.avatarUrl} name={entry.nickname} size="sm" />
          <span className="flex-1 font-medium truncate">{entry.nickname}</span>
          <span className="font-mono font-bold text-accent-green">{entry.codeLength}</span>
        </div>
      ))}
    </div>
  );
}
