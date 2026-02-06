// src/app/task/[slug]/TaskPageClient.tsx

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui';
import { SubmitForm } from '@/components/task/SubmitForm';
import { TaskTabs } from '@/components/task/TaskTabs';
import { useAuth } from '@/context/AuthContext';
import { toPythonLiteral } from '@/lib/python-serializer';
import type { LeaderboardEntry } from '@/components/leaderboard/LeaderboardTable';
import type { SubmissionStatus } from '@/types';

interface TaskPageClientProps {
  taskSlug: string;
  functionArgs: string[];
  testcases: Array<{
    inputData: { args: any[] };
    expectedOutput: string;
  }>;
  allowedImports: string[];
  leaderboard: LeaderboardEntry[];
  currentUserRank?: number;
}

export function TaskPageClient({
  taskSlug,
  functionArgs,
  testcases,
  allowedImports,
  leaderboard,
  currentUserRank,
}: TaskPageClientProps) {
  const { isLoggedIn } = useAuth();
  const router = useRouter();
  const [solutionsRefreshKey, setSolutionsRefreshKey] = useState(0);

  const formatArgs = (args: any[]) =>
    args.length > 0 ? args.map(toPythonLiteral).join(', ') : '';

  const bestLength = leaderboard.length > 0 ? leaderboard[0].codeLength : null;
  const top3Target = leaderboard.length >= 3 ? leaderboard[2].codeLength : bestLength;

  return (
    <div className="space-y-6">
      <Card padding="lg">
        <h2 className="text-lg font-semibold mb-4">Твоё решение</h2>
        <div className="mb-4 rounded-lg border border-border bg-background-tertiary/50 px-3 py-2 text-sm text-text-secondary">
          {bestLength !== null ? (
            <>
              Текущий лучший результат: <span className="font-mono text-accent-green font-semibold">{bestLength}</span>
              {top3Target !== null && (
                <span>
                  {' '}• цель для топ-3:{' '}
                  <span className="font-mono text-accent-blue font-semibold">{top3Target}</span>
                </span>
              )}
            </>
          ) : (
            <>
              Пока нет решений в рейтинге — стань первым и задай планку для остальных.
            </>
          )}
        </div>
        <SubmitForm
          taskSlug={taskSlug}
          isLoggedIn={isLoggedIn}
          functionArgs={functionArgs}
          testcases={testcases}
          allowedImports={allowedImports}
          onSubmitSuccess={(result: { status: SubmissionStatus }) => {
            if (result.status === 'pass') {
              setSolutionsRefreshKey((prev) => prev + 1);
              router.refresh();
            }
          }}
        />
      </Card>

      {testcases.length > 0 && (
        <Card padding="lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Открытые тесты</h3>
            <span className="text-xs text-text-muted">проверяются локально</span>
          </div>
          <div className="space-y-3">
            {testcases.map((testcase, index) => {
              const args = formatArgs(testcase.inputData.args || []);
              return (
                <div
                  key={index}
                  className="p-3 rounded-lg border border-border bg-background-tertiary/50"
                >
                  <div className="text-sm font-medium mb-2">Тест {index + 1}</div>
                  <div className="font-mono text-sm text-text-secondary space-y-1">
                    <div>
                      Ввод: <span className="text-text-primary">solution({args})</span>
                    </div>
                    <div>
                      Ожидалось: <span className="text-text-primary">{testcase.expectedOutput}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 text-xs text-text-muted">
            Полный набор тестов проверяется при отправке в рейтинг.
          </div>
          <div className="mt-3 rounded-md border border-border px-3 py-2 text-xs text-text-secondary bg-background-tertiary/40">
            Почему тесты разделены: локально запускаются открытые кейсы для быстрого цикла, на сервере — полный набор скрытых.
            Частые причины расхождений: граничные случаи, большие значения, округление float и лимиты времени/вывода.
          </div>
        </Card>
      )}

      <Card padding="lg">
        <TaskTabs
          leaderboard={leaderboard}
          taskSlug={taskSlug}
          refreshKey={solutionsRefreshKey}
          currentUserRank={currentUserRank}
        />
      </Card>
    </div>
  );
}
