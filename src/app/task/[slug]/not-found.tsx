// src/app/task/[slug]/not-found.tsx

import Link from 'next/link';
import { FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui';

export default function TaskNotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-background-secondary flex items-center justify-center">
          <FileQuestion className="w-10 h-10 text-text-muted" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Задача не найдена</h1>
        <p className="text-text-secondary mb-6">
          Возможно, задача была удалена или у вас неправильная ссылка
        </p>
        <Link href="/tasks">
          <Button variant="primary">
            К списку задач
          </Button>
        </Link>
      </div>
    </div>
  );
}
