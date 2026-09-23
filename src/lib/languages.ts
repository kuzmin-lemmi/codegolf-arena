// src/lib/languages.ts
// Языки арены. Модуль без серверных зависимостей: им пользуются и страницы,
// и API. Включён ли язык на сайте — в language-settings.ts (только сервер).
//
// Правила зачёта (решение владельца, docs/three-languages.md):
//  - у каждой задачи своя таблица рекордов на каждом языке, длину между
//    языками не сравниваем;
//  - очки начисляются в каждом языке отдельно по одним правилам;
//  - рейтингов четыре: по каждому языку и общий, где очки складываются.

export const LANGUAGES = ['python', 'javascript', 'csharp'] as const;

export type Language = (typeof LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = 'python';

export const LANGUAGE_LABELS: Record<Language, string> = {
  python: 'Python',
  javascript: 'JavaScript',
  csharp: 'C#',
};

// Короткая подпись для тесных мест: метки в списке задач, строки таблиц
export const LANGUAGE_SHORT_LABELS: Record<Language, string> = {
  python: 'Py',
  javascript: 'JS',
  csharp: 'C#',
};

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

/** Язык из параметра запроса или тела: неизвестное значение — null */
export function parseLanguage(value: unknown): Language | null {
  return isLanguage(value) ? value : null;
}

/** Рейтинг: общий или по одному языку */
export type RatingScope = Language | 'all';

export function parseRatingScope(value: unknown): RatingScope {
  return isLanguage(value) ? value : 'all';
}
