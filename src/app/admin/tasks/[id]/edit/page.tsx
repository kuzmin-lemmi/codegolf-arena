'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { TaskForm } from '../../_components/TaskForm';

interface TaskApiData {
  id: string;
  slug: string;
  title: string;
  tier: 'bronze' | 'silver' | 'gold';
  mode: 'practice' | 'tournament';
  statementMd: string;
  functionSignature: string;
  functionArgs: string[];
  exampleInput: string;
  exampleOutput: string;
  constraintsJson: {
    forbidden_tokens: string[];
    allowed_imports: string[];
    timeout_ms: number;
    topics?: string[];
  };
  testcases: Array<{
    id: string;
    inputData: { args: any[] };
    expectedOutput: string;
    isHidden: boolean;
  }>;
}

export default function EditTaskPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { user, isLoading, isLoggedIn } = useAuth();
  const [task, setTask] = useState<TaskApiData | null>(null);
  const [isFetching, setIsFetching] = useState(true);
  const taskId = Array.isArray(params?.id) ? params.id[0] : params?.id;

  useEffect(() => {
    if (!isLoading && (!isLoggedIn || !user?.isAdmin)) {
      router.push('/');
    }
  }, [isLoading, isLoggedIn, user, router]);

  useEffect(() => {
    if (!user?.isAdmin || !taskId) return;

    const fetchTask = async () => {
      setIsFetching(true);
      try {
        const res = await fetch(`/api/admin/tasks/${taskId}`, {
          credentials: 'include',
        });
        const json = await res.json();
        if (!json.success) {
          alert(json.error || 'Не удалось загрузить задачу');
          router.push('/admin/tasks');
          return;
        }
        setTask(json.data);
      } finally {
        setIsFetching(false);
      }
    };

    fetchTask();
  }, [taskId, router, user?.isAdmin]);

  if (isLoading || !user?.isAdmin || isFetching) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!task) return null;

  const initialData = {
    slug: task.slug,
    title: task.title,
    tier: task.tier,
    mode: task.mode,
    statementMd: task.statementMd,
    functionSignature: task.functionSignature,
    functionArgs: task.functionArgs.join(', '),
    exampleInput: task.exampleInput,
    exampleOutput: task.exampleOutput,
    forbiddenTokens: (task.constraintsJson?.forbidden_tokens || []).join(', '),
    allowedImports: (task.constraintsJson?.allowed_imports || []).join(', '),
    topics: (task.constraintsJson?.topics || []).join(', '),
    timeoutMs: task.constraintsJson?.timeout_ms || 2000,
    testcases: task.testcases.map((tc, idx) => ({
      id: tc.id || String(idx + 1),
      args: JSON.stringify(tc.inputData?.args || []),
      expectedOutput: tc.expectedOutput,
      isHidden: tc.isHidden,
    })),
  };

  const handleSubmit = async (data: any) => {
    if (!taskId) return;

    const res = await fetch(`/api/admin/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });

    const json = await res.json();
    if (!json.success) {
      alert(json.error || 'Не удалось сохранить задачу');
      return;
    }

    alert('Задача сохранена');
  };

  return (
    <div className="min-h-screen">
      <div className="border-b border-border bg-background-secondary/50">
        <div className="container mx-auto px-4 py-4">
          <Link
            href="/admin/tasks"
            className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Назад к задачам
          </Link>
          <h1 className="text-2xl font-bold">Редактирование задачи</h1>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <TaskForm initialData={initialData} onSubmit={handleSubmit} />
      </div>
    </div>
  );
}
