import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { Button } from '@/components/ui';

export default function NotFound() {
  return (
    <div className="container mx-auto px-4 py-16">
      <div className="mx-auto max-w-xl rounded-xl border border-border bg-background-secondary/40 p-6">
        <div className="mb-4 flex items-center gap-3">
          <SearchX className="h-6 w-6 text-text-muted" />
          <h1 className="text-xl font-semibold">Страница не найдена</h1>
        </div>
        <p className="mb-6 text-sm text-text-secondary">
          Возможно, ссылка устарела или страница была перемещена.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/">
            <Button variant="primary">На главную</Button>
          </Link>
          <Link href="/tasks">
            <Button variant="secondary">К задачам</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
