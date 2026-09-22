// src/components/task/LanguageSwitch.tsx
// Переключатель языка решения на странице задачи. Показывается только у задач,
// открытых для C# (проба C#, docs/csharp-trial.md).

'use client';

import { cn } from '@/lib/utils';

export type SolutionLanguage = 'python' | 'csharp';

const OPTIONS: Array<{ id: SolutionLanguage; label: string; badge?: string }> = [
  { id: 'python', label: 'Python' },
  { id: 'csharp', label: 'C#', badge: 'проба' },
];

export function LanguageSwitch({
  value,
  onChange,
  disabled = false,
}: {
  value: SolutionLanguage;
  onChange: (language: SolutionLanguage) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Язык решения"
      className="inline-flex rounded-lg border border-border bg-background-tertiary/60 p-0.5"
    >
      {OPTIONS.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(option.id)}
            className={cn(
              'px-3 py-1 rounded-md text-sm font-medium transition-colors disabled:opacity-50',
              active
                ? 'bg-background-secondary text-text-primary shadow-sm'
                : 'text-text-secondary hover:text-text-primary'
            )}
          >
            {option.label}
            {option.badge && (
              <span className="ml-1.5 text-[10px] uppercase tracking-wide text-accent-blue">{option.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
