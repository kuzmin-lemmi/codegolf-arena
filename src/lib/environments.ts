// src/lib/environments.ts
// Глобальный реестр окружений выполнения кода.
// prelude выполняется ДО решения пользователя — только на сервере/раннере.
// Пользователь не пишет import — окружение подключает инструменты автоматически.

export type EnvId = 'base' | 'math' | 'functools' | 'itertools' | 're';

export interface EnvConfig {
  id: EnvId;
  label: string;    // для UI
  prelude: string;  // код, который вставляется перед def solution(...)
  exports: string[]; // какие имена появляются в globals (для подсказок)
  hint: string;     // строка-подсказка под селектором
}

export const ENV: Record<EnvId, EnvConfig> = {
  base: {
    id: 'base',
    label: 'Base',
    prelude: '',
    exports: [],
    hint: 'Только встроенные функции Python.',
  },

  math: {
    id: 'math',
    label: 'Math',
    prelude: 'import math as m\n',
    exports: ['m'],
    hint: 'Доступно: m (math). Пример: m.prod(nums)',
  },

  functools: {
    id: 'functools',
    label: 'Functools',
    prelude:
      'from functools import reduce as r\nfrom operator import mul as u\nfrom operator import add as a\n',
    exports: ['r', 'u', 'a'],
    hint: 'Доступно: r (reduce), u (mul), a (add). Пример: r(u, nums, 1)',
  },

  itertools: {
    id: 'itertools',
    label: 'Itertools',
    prelude: 'import itertools as it\n',
    exports: ['it'],
    hint: 'Доступно: it (itertools). Пример: it.chain(...)',
  },

  're': {
    id: 're',
    label: 'Regex',
    prelude: 'import re\n',
    exports: ['re'],
    hint: 'Доступно: re (regex). Пример: re.sub(...)',
  },
};

/** Проверяет, является ли строка допустимым EnvId */
export function isValidEnvId(value: unknown): value is EnvId {
  return typeof value === 'string' && value in ENV;
}

/** Возвращает EnvId или fallback 'base' */
export function resolveEnvId(value: unknown): EnvId {
  return isValidEnvId(value) ? value : 'base';
}
