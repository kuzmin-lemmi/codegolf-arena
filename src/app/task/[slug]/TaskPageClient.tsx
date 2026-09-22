// src/app/task/[slug]/TaskPageClient.tsx

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui';
import { SubmitForm } from '@/components/task/SubmitForm';
import { TaskTabs } from '@/components/task/TaskTabs';
import { CsharpTaskView } from '@/components/task/CsharpTaskView';
import { LanguageSwitch, type SolutionLanguage } from '@/components/task/LanguageSwitch';
import type { CsharpSignature } from '@/lib/csharp';
import { useAuth } from '@/context/AuthContext';
import { toPythonLiteral } from '@/lib/python-serializer';
import { pluralizeRu } from '@/lib/utils';
import type { LeaderboardEntry } from '@/components/leaderboard/LeaderboardTable';
import type { SubmissionStatus } from '@/types';

export interface TaskUserBest {
  codeLength: number;
  firstLength: number | null;
  improveCount: number;
}

interface TaskPageClientProps {
  taskSlug: string;
  taskTitle: string;
  nextTask: { slug: string; title: string } | null;
  functionArgs: string[];
  testcases: Array<{
    inputData: { args: any[] };
    expectedOutput: string;
  }>;
  // Сколько тестов задачи скрыто: сами данные на клиент не приходят
  hiddenTestsCount?: number;
  allowedImports: string[];
  availableEnvs?: string[];
  defaultEnvId?: string;
  leaderboard: LeaderboardEntry[];
  currentUserRank?: number;
  userBest?: TaskUserBest | null;
  // Проба C#: сигнатура, если задача открыта для C# и C# включён
  csharp?: CsharpSignature | null;
}

export function TaskPageClient({
  taskSlug,
  taskTitle,
  nextTask,
  functionArgs,
  testcases,
  hiddenTestsCount = 0,
  allowedImports,
  availableEnvs,
  defaultEnvId,
  leaderboard,
  currentUserRank,
  userBest,
  csharp = null,
}: TaskPageClientProps) {
  const { isLoggedIn } = useAuth();
  const router = useRouter();
  const [solutionsRefreshKey, setSolutionsRefreshKey] = useState(0);
  const [editorLength, setEditorLength] = useState<number | null>(null);
  const [language, setLanguage] = useState<SolutionLanguage>('python');

  // Язык запоминается в браузере; ?lang=csharp в ссылке открывает сразу C#
  useEffect(() => {
    if (!csharp) return;
    let preferred: string | null = new URLSearchParams(window.location.search).get('lang');
    if (!preferred) {
      try {
        preferred = window.localStorage.getItem('solution_language');
      } catch {
        preferred = null;
      }
    }
    if (preferred === 'csharp') setLanguage('csharp');
  }, [csharp]);

  const chooseLanguage = (next: SolutionLanguage) => {
    setLanguage(next);
    try {
      window.localStorage.setItem('solution_language', next);
    } catch {
      // Хранилище недоступно — выбор просто не запомнится
    }
  };

  const switcher = csharp ? <LanguageSwitch value={language} onChange={chooseLanguage} /> : null;

  if (csharp && language === 'csharp') {
    return (
      <CsharpTaskView
        taskSlug={taskSlug}
        signature={csharp}
        isLoggedIn={isLoggedIn}
        switcher={switcher}
        testcases={testcases}
        hiddenTestsCount={hiddenTestsCount}
      />
    );
  }

  const formatArgs = (args: any[]) =>
    args.length > 0 ? args.map(toPythonLiteral).join(', ') : '';

  const bestLength = leaderboard.length > 0 ? leaderboard[0].codeLength : null;
  const top3Target = leaderboard.length >= 3 ? leaderboard[2].codeLength : bestLength;

  // Самая понятная новичку цель — длина решения, которое стоит на строчку выше
  const nextRankTarget =
    currentUserRank && currentUserRank > 1 && leaderboard[currentUserRank - 2]
      ? {
          rank: currentUserRank - 1,
          codeLength: leaderboard[currentUserRank - 2].codeLength,
        }
      : null;

  const ownSaved =
    userBest && userBest.firstLength !== null
      ? userBest.firstLength - userBest.codeLength
      : 0;

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
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-base sm:text-lg font-semibold">Твоё решение</h2>
          {switcher}
        </div>

        {/* Цель по длине: цифры показываем, код решений — нет */}
        <div className="mb-4 rounded-lg border border-border bg-background-tertiary/50 px-3 py-3 text-sm text-text-secondary space-y-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {bestLength !== null ? (
              <span>
                Лучшее решение —{' '}
                <span className="font-mono text-accent-green font-semibold">{bestLength}</span>{' '}
                {pluralizeRu(bestLength, ['символ', 'символа', 'символов'])}
                {top3Target !== null && top3Target !== bestLength && (
                  <>
                    , цель для топ-3 —{' '}
                    <span className="font-mono text-accent-blue font-semibold">{top3Target}</span>
                  </>
                )}
              </span>
            ) : (
              <span>Пока нет решений в рейтинге — стань первым и задай планку для остальных.</span>
            )}

            {userBest && (
              <span>
                твой рекорд —{' '}
                <span className="font-mono text-accent-blue font-semibold">{userBest.codeLength}</span>
                {currentUserRank ? ` (место #${currentUserRank})` : ''}
              </span>
            )}
          </div>

          {nextRankTarget && userBest && userBest.codeLength > nextRankTarget.codeLength && (
            <div className="text-xs">
              До места #{nextRankTarget.rank}:{' '}
              <span className="font-mono text-accent-blue font-semibold">
                {nextRankTarget.codeLength}
              </span>{' '}
              симв. — срезать ещё{' '}
              <span className="font-mono font-semibold">
                {userBest.codeLength - nextRankTarget.codeLength}
              </span>
            </div>
          )}

          {userBest && ownSaved > 0 && (
            <div className="text-xs">
              Твой прогресс:{' '}
              <span className="font-mono">
                {userBest.firstLength} → {userBest.codeLength}
              </span>{' '}
              (−{ownSaved} за {userBest.improveCount}{' '}
              {pluralizeRu(userBest.improveCount, ['улучшение', 'улучшения', 'улучшений'])})
            </div>
          )}

          {!userBest && bestLength !== null && (
            <div className="text-xs text-text-muted">
              Сам код лучших решений откроется, когда сдашь задачу — пока ориентируйся на длину.
            </div>
          )}

          {editorLength !== null && (
            <div className="text-xs space-y-2 pt-1 border-t border-border/60">
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
          hiddenTestsCount={hiddenTestsCount}
          allowedImports={allowedImports}
          availableEnvs={availableEnvs}
          defaultEnvId={defaultEnvId}
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

      {(testcases.length > 0 || hiddenTestsCount > 0) && (
        <Card padding="lg">
          <div className="flex items-center justify-between mb-4 gap-3">
            <h3 className="text-base sm:text-lg font-semibold">Открытые тесты</h3>
            <span className="text-xs text-text-muted">на них работает локальная проверка</span>
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
          {hiddenTestsCount > 0 && (
            <div className="mt-3 p-3 rounded-lg border border-dashed border-border bg-background-tertiary/30 text-sm text-text-secondary">
              И ещё {hiddenTestsCount}{' '}
              {pluralizeRu(hiddenTestsCount, ['скрытый тест', 'скрытых теста', 'скрытых тестов'])}.
              Их данные не показываются: иначе ответ можно было бы выписать со страницы.
            </div>
          )}
          <div className="mt-3 rounded-md border border-border px-3 py-2 text-xs text-text-secondary bg-background-tertiary/40">
            Локальная проверка в браузере прогоняет только открытые тесты. В рейтинг решение
            попадает после серверной проверки на полном наборе — открытых и скрытых.
          </div>
        </Card>
      )}

      <Card padding="lg">
        <TaskTabs
          leaderboard={leaderboard}
          taskSlug={taskSlug}
          refreshKey={solutionsRefreshKey}
          currentUserRank={currentUserRank}
          isLoggedIn={isLoggedIn}
        />
      </Card>
    </div>
  );
}
