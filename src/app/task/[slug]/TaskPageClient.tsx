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
  taskTitle: string;
  nextTask: { slug: string; title: string } | null;
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
  taskTitle,
  nextTask,
  functionArgs,
  testcases,
  allowedImports,
  leaderboard,
  currentUserRank,
}: TaskPageClientProps) {
  const { isLoggedIn } = useAuth();
  const router = useRouter();
  const [solutionsRefreshKey, setSolutionsRefreshKey] = useState(0);
  const [editorLength, setEditorLength] = useState<number | null>(null);

  const formatArgs = (args: any[]) =>
    args.length > 0 ? args.map(toPythonLiteral).join(', ') : '';

  const bestLength = leaderboard.length > 0 ? leaderboard[0].codeLength : null;
  const top3Target = leaderboard.length >= 3 ? leaderboard[2].codeLength : bestLength;
  const toTop1 = editorLength !== null && bestLength !== null ? editorLength - bestLength : null;
  const toTop3 = editorLength !== null && top3Target !== null ? editorLength - top3Target : null;
  const top1Progress = editorLength !== null && bestLength !== null
    ? Math.max(0, Math.min(100, Math.round((bestLength / editorLength) * 100)))
    : null;
  const top3Progress = editorLength !== null && top3Target !== null
    ? Math.max(0, Math.min(100, Math.round((top3Target / editorLength) * 100)))
    : null;

  return (
    <div className="space-y-6">
      <Card padding="lg">
        <h2 className="text-base sm:text-lg font-semibold mb-4">Твоё решение</h2>
        <div className="mb-4 rounded-lg border border-border bg-background-tertiary/50 px-3 py-3 text-sm text-text-secondary space-y-2">
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
          {editorLength !== null && (
            <div className="text-xs space-y-2">
              {toTop1 !== null && (
                <div>
                  {toTop1 > 0 ? (
                    <>До топ-1: <span className="font-mono text-accent-blue font-semibold">-{toTop1}</span> символов</>
                  ) : toTop1 === 0 ? (
                    <>Ты уже на уровне текущего топ-1.</>
                  ) : (
                    <>Ты уже короче текущего топ-1 на <span className="font-mono text-accent-green font-semibold">{Math.abs(toTop1)}</span> символов.</>
                  )}
                </div>
              )}
              {toTop3 !== null && (
                <div>
                  {toTop3 > 0 ? (
                    <>До топ-3: <span className="font-mono text-accent-blue font-semibold">-{toTop3}</span></>
                  ) : (
                    <>Текущая длина уже тянет на топ-3.</>
                  )}
                </div>
              )}
              {(top1Progress !== null || top3Progress !== null) && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {top1Progress !== null && (
                    <div className="rounded-md border border-border/70 px-2 py-1.5 bg-background/40">
                      <div className="flex items-center justify-between text-[11px] text-text-muted mb-1">
                        <span>Прогресс к топ-1</span>
                        <span>{top1Progress}%</span>
                      </div>
                      <div className="h-1.5 rounded bg-background-tertiary overflow-hidden">
                        <div className="h-full rounded bg-accent-green" style={{ width: `${top1Progress}%` }} />
                      </div>
                    </div>
                  )}
                  {top3Progress !== null && (
                    <div className="rounded-md border border-border/70 px-2 py-1.5 bg-background/40">
                      <div className="flex items-center justify-between text-[11px] text-text-muted mb-1">
                        <span>Прогресс к топ-3</span>
                        <span>{top3Progress}%</span>
                      </div>
                      <div className="h-1.5 rounded bg-background-tertiary overflow-hidden">
                        <div className="h-full rounded bg-accent-blue" style={{ width: `${top3Progress}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        <SubmitForm
          taskSlug={taskSlug}
          isLoggedIn={isLoggedIn}
          functionArgs={functionArgs}
          testcases={testcases}
          allowedImports={allowedImports}
          taskTitle={taskTitle}
          rankingTargets={{ top1: bestLength, top3: top3Target }}
          nextTask={nextTask}
          onCodeMetricsChange={({ length, hasCode }) => {
            setEditorLength(hasCode ? length : null);
          }}
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
          <div className="flex items-center justify-between mb-4 gap-3">
            <h3 className="text-base sm:text-lg font-semibold">Все тесты</h3>
            <span className="text-xs text-text-muted">одинаковы для локальной и серверной проверки</span>
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
          <div className="mt-3 rounded-md border border-border px-3 py-2 text-xs text-text-secondary bg-background-tertiary/40">
            Локальная проверка и отправка в рейтинг используют один и тот же набор тестов.
            Если есть расхождение, причина обычно в лимитах времени или окружении раннера.
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
