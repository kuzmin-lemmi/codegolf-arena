'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global error boundary:', error);
  }, [error]);

  return (
    <div className="container mx-auto px-4 py-16">
      <div className="mx-auto max-w-xl rounded-xl border border-accent-red/30 bg-accent-red/10 p-6">
        <div className="mb-4 flex items-center gap-3">
          <AlertTriangle className="h-6 w-6 text-accent-red" />
          <h1 className="text-xl font-semibold">Что-то пошло не так</h1>
        </div>
        <p className="mb-6 text-sm text-text-secondary">
          Произошла ошибка при загрузке страницы. Попробуйте обновить страницу.
        </p>
        <Button variant="primary" onClick={reset}>
          Попробовать снова
        </Button>
      </div>
    </div>
  );
}
