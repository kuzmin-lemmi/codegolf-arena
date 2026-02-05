// src/app/admin/tasks/new/page.tsx

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { TaskForm } from '../_components/TaskForm';

export default function NewTaskPage() {
  const router = useRouter();
  const { user, isLoading, isLoggedIn } = useAuth();

  // Редирект если не админ
  useEffect(() => {
    if (!isLoading && (!isLoggedIn || !user?.isAdmin)) {
      router.push('/');
    }
  }, [isLoading, isLoggedIn, user, router]);

  if (isLoading || !user?.isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full" />
      </div>
    );
  }

  const handleSubmit = async (data: any) => {
    const res = await fetch('/api/admin/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });

    const json = await res.json();
    if (!json.success) {
      alert(json.error || 'Не удалось создать задачу');
      return;
    }

    router.push(`/admin/tasks/${json.data.id}/edit`);
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-border bg-background-secondary/50">
        <div className="container mx-auto px-4 py-4">
          <Link
            href="/admin/tasks"
            className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Назад к задачам
          </Link>
          <h1 className="text-2xl font-bold">Новая задача</h1>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <TaskForm onSubmit={handleSubmit} />
      </div>
    </div>
  );
}
