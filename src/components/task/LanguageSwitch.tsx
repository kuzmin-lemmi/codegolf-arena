// src/components/task/LanguageSwitch.tsx
// Переключатель языка решения на странице задачи. Показывает только языки,
// на которых задачу можно решать (Python — всегда).

'use client';

import { cn } from '@/lib/utils';
import { LANGUAGE_LABELS, type Language } from '@/lib/languages';

export function LanguageSwitch({
  languages,
  value,
  onChange,
  disabled = false,
}: {
  languages: Language[];
  value: Language;
  onChange: (language: Language) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Язык решения"
      className="inline-flex rounded-lg border border-border bg-background-tertiary/60 p-0.5"
    >
      {languages.map((language) => {
        const active = language === value;
        return (
          <button
            key={language}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(language)}
            className={cn(
              'px-3 py-1 rounded-md text-sm font-medium transition-colors disabled:opacity-50',
              active
                ? 'bg-background-secondary text-text-primary shadow-sm'
                : 'text-text-secondary hover:text-text-primary'
            )}
          >
            {LANGUAGE_LABELS[language]}
          </button>
        );
      })}
    </div>
  );
}
