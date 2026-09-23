// src/lib/language-settings.ts
// Какие языки включены на сайте. Только для сервера: настройки читаются из .env
// на каждый вызов, поэтому смена флага + перезапуск службы действуют сразу.
//
// Python включён всегда. JavaScript и C# открываются у задач с типизированной
// сигнатурой (tasks.csharp_signature) и включаются флагами в .env:
// JAVASCRIPT_ENABLED и CSHARP_ENABLED.

import { LANGUAGES, type Language } from '@/lib/languages';
import { parseCsharpSignature, type CsharpSignature } from '@/lib/csharp';

export function isLanguageEnabled(language: Language): boolean {
  switch (language) {
    case 'python':
      return true;
    case 'csharp':
      return process.env.CSHARP_ENABLED === 'true';
    case 'javascript':
      return process.env.JAVASCRIPT_ENABLED === 'true';
  }
}

export function getEnabledLanguages(): Language[] {
  return LANGUAGES.filter(isLanguageEnabled);
}

/**
 * На каких языках можно решать задачу. Python — всегда; JavaScript и C# —
 * если язык включён и у задачи есть сигнатура с типами: по ней раннер читает
 * аргументы и печатает ответ так же, как Python.
 */
export function getTaskLanguages(task: { csharpSignature: string | null }): Language[] {
  const typed = parseCsharpSignature(task.csharpSignature) !== null;
  return getEnabledLanguages().filter((language) => language === 'python' || typed);
}

/** Сигнатура с типами — общая для JavaScript и C# */
export function getTypedSignature(task: { csharpSignature: string | null }): CsharpSignature | null {
  return parseCsharpSignature(task.csharpSignature);
}
