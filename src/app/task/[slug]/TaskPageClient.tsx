// src/app/task/[slug]/TaskPageClient.tsx

'use client';

import { Card } from '@/components/ui';
import { SubmitForm } from '@/components/task/SubmitForm';
import { useAuth } from '@/context/AuthContext';
import { toPythonLiteral } from '@/lib/python-serializer';

interface TaskPageClientProps {
  taskSlug: string;
  functionArgs: string[];
  testcases: Array<{
    inputData: { args: any[] };
    expectedOutput: string;
  }>;
  allowedImports: string[];
}

export function TaskPageClient({
  taskSlug,
  functionArgs,
  testcases,
  allowedImports,
}: TaskPageClientProps) {
  const { isLoggedIn } = useAuth();

  const formatArgs = (args: any[]) =>
    args.length > 0 ? args.map(toPythonLiteral).join(', ') : '';

  return (
    <div className="space-y-6">
      <Card padding="lg">
        <h2 className="text-lg font-semibold mb-4">Твоё решение</h2>
        <SubmitForm
          taskSlug={taskSlug}
          isLoggedIn={isLoggedIn}
          functionArgs={functionArgs}
          testcases={testcases}
          allowedImports={allowedImports}
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
        </Card>
      )}
    </div>
  );
}
