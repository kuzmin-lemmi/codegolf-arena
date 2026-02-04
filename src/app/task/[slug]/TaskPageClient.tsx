// src/app/task/[slug]/TaskPageClient.tsx

'use client';

import { Card } from '@/components/ui';
import { SubmitForm } from '@/components/task/SubmitForm';
import { useAuth } from '@/context/AuthContext';

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

  return (
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
  );
}
