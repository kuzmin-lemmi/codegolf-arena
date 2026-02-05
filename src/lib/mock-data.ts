// src/lib/mock-data.ts

import { Task, LeaderboardEntry, WeeklyChallenge } from '@/types';

export const mockTasks: Task[] = [
  {
    id: '1',
    slug: 'sum-numbers',
    title: 'Сумма чисел в строке',
    tier: 'bronze',
    mode: 'practice',
    status: 'published',
    functionSignature: 'solution(s: str) -> int',
    functionArgs: ['s'],
    statementMd: `Дана строка, содержащая целые числа, разделённые пробелами.

Верните их сумму.`,
    exampleInput: '"4 8 15 16 23 42"',
    exampleOutput: '108',
    constraintsJson: {
      max_length: 2000,
      forbidden_tokens: ['eval', 'exec', '__import__', ';', '\\n', '\\r', '\\t'],
      allowed_imports: [],
      timeout_ms: 2000,
    },
    createdAt: new Date('2024-01-01'),
  },
  {
    id: '2',
    slug: 'fibonacci',
    title: 'Числа Фибоначчи',
    tier: 'gold',
    mode: 'tournament',
    status: 'published',
    functionSignature: 'solution(n: int) -> int',
    functionArgs: ['n'],
    statementMd: `Напишите однострочник, который возвращает n-е число Фибоначчи.

Числа Фибоначчи: 0, 1, 1, 2, 3, 5, 8, 13, 21, ...

- F(0) = 0
- F(1) = 1
- F(n) = F(n-1) + F(n-2)`,
    exampleInput: '10',
    exampleOutput: '55',
    constraintsJson: {
      max_length: 2000,
      forbidden_tokens: ['eval', 'exec', '__import__', ';', '\\n', '\\r', '\\t'],
      allowed_imports: ['functools'],
      timeout_ms: 2000,
    },
    createdAt: new Date('2024-01-15'),
  },
  {
    id: '3',
    slug: 'reverse-words',
    title: 'Переворот слов',
    tier: 'bronze',
    mode: 'practice',
    status: 'published',
    functionSignature: 'solution(s: str) -> str',
    functionArgs: ['s'],
    statementMd: `Дана строка из слов, разделённых пробелами.

Переверните порядок слов (не букв в словах).`,
    exampleInput: '"hello world python"',
    exampleOutput: '"python world hello"',
    constraintsJson: {
      max_length: 2000,
      forbidden_tokens: ['eval', 'exec', '__import__', ';', '\\n', '\\r', '\\t'],
      allowed_imports: [],
      timeout_ms: 2000,
    },
    createdAt: new Date('2024-01-10'),
  },
  {
    id: '4',
    slug: 'max-product',
    title: 'Максимальное произведение пары',
    tier: 'silver',
    mode: 'practice',
    status: 'published',
    functionSignature: 'solution(nums: list) -> int',
    functionArgs: ['nums'],
    statementMd: `Дан список целых чисел.

Найдите максимальное произведение любых двух различных элементов.`,
    exampleInput: '[1, 5, 3, 4, 2]',
    exampleOutput: '20',
    constraintsJson: {
      max_length: 2000,
      forbidden_tokens: ['eval', 'exec', '__import__', ';', '\\n', '\\r', '\\t'],
      allowed_imports: [],
      timeout_ms: 2000,
    },
    createdAt: new Date('2024-01-12'),
  },
  {
    id: '5',
    slug: 'palindrome-check',
    title: 'Проверка палиндрома',
    tier: 'bronze',
    mode: 'practice',
    status: 'published',
    functionSignature: 'solution(s: str) -> bool',
    functionArgs: ['s'],
    statementMd: `Дана строка (только буквы в нижнем регистре).

Проверьте, является ли она палиндромом.`,
    exampleInput: '"radar"',
    exampleOutput: 'True',
    constraintsJson: {
      max_length: 2000,
      forbidden_tokens: ['eval', 'exec', '__import__', ';', '\\n', '\\r', '\\t'],
      allowed_imports: [],
      timeout_ms: 2000,
    },
    createdAt: new Date('2024-01-08'),
  },
];

export const mockWeeklyChallenge: WeeklyChallenge = {
  id: 'weekly-1',
  taskId: '2',
  task: mockTasks[1], // Fibonacci
  startsAt: new Date(),
  endsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // через 5 дней
  isActive: true,
};

export const mockLeaderboard: LeaderboardEntry[] = [
  { rank: 1, userId: 'mock-1', nickname: 'Leonard', avatarUrl: null, codeLength: 28, achievedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
  { rank: 2, userId: 'mock-2', nickname: 'Anna', avatarUrl: null, codeLength: 31, achievedAt: new Date(Date.now() - 5 * 60 * 60 * 1000) },
  { rank: 3, userId: 'mock-3', nickname: 'CodeNinja', avatarUrl: null, codeLength: 34, achievedAt: new Date(Date.now() - 12 * 60 * 60 * 1000) },
  { rank: 4, userId: 'mock-4', nickname: 'Dmitry', avatarUrl: null, codeLength: 36, achievedAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
  { rank: 5, userId: 'mock-5', nickname: 'QuantumCoder', avatarUrl: null, codeLength: 38, achievedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
  { rank: 6, userId: 'mock-6', nickname: 'PythonHero', avatarUrl: null, codeLength: 42, achievedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
  { rank: 7, userId: 'mock-7', nickname: 'AnnaDev', avatarUrl: null, codeLength: 45, achievedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
  { rank: 8, userId: 'mock-8', nickname: 'DreamCoder', avatarUrl: null, codeLength: 48, achievedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) },
  { rank: 9, userId: 'mock-9', nickname: 'LeraDev', avatarUrl: null, codeLength: 52, achievedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) },
  { rank: 10, userId: 'mock-10', nickname: 'Alex', avatarUrl: null, codeLength: 55, achievedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000) },
];

// Глобальный рейтинг по ОЧКАМ (для главной страницы)
export interface GlobalLeaderboardEntry {
  rank: number;
  nickname: string;
  avatarUrl?: string | null;
  points: number;
  tasksSolved: number;
}

export const mockGlobalLeaderboard: GlobalLeaderboardEntry[] = [
  { rank: 1, nickname: 'Leonard', points: 285, tasksSolved: 5 },
  { rank: 2, nickname: 'QuantumCoder', points: 245, tasksSolved: 4 },
  { rank: 3, nickname: 'Anna', points: 220, tasksSolved: 4 },
  { rank: 4, nickname: 'PythonHero', points: 195, tasksSolved: 4 },
  { rank: 5, nickname: 'CodeNinja', points: 180, tasksSolved: 3 },
  { rank: 6, nickname: 'Dmitry', points: 165, tasksSolved: 3 },
  { rank: 7, nickname: 'AnnaDev', points: 150, tasksSolved: 3 },
  { rank: 8, nickname: 'DreamCoder', points: 125, tasksSolved: 2 },
  { rank: 9, nickname: 'LeraDev', points: 110, tasksSolved: 2 },
  { rank: 10, nickname: 'Alex', points: 95, tasksSolved: 2 },
];

export const mockRecentRecords = [
  { nickname: 'Anna', oldLength: 34, newLength: 31, diff: -3, taskTitle: 'Числа Фибоначчи' },
  { nickname: 'Alex', oldLength: 55, newLength: 48, diff: -7, taskTitle: 'Сумма чисел' },
  { nickname: 'Leonard', oldLength: 32, newLength: 28, diff: -4, taskTitle: 'Числа Фибоначчи' },
];

export const mockTaskLeaderboard: Record<string, LeaderboardEntry[]> = {
  'sum-numbers': [
    { rank: 1, userId: 'mock-sum-1', nickname: 'QuantumCoder', avatarUrl: null, codeLength: 21, achievedAt: new Date(Date.now() - 45 * 60 * 1000) },
    { rank: 2, userId: 'mock-sum-2', nickname: 'PythonHero', avatarUrl: null, codeLength: 21, achievedAt: new Date(Date.now() - 4 * 60 * 1000) },
    { rank: 3, userId: 'mock-sum-3', nickname: 'AnnaDev', avatarUrl: null, codeLength: 23, achievedAt: new Date(Date.now() - 25 * 60 * 1000) },
    { rank: 4, userId: 'mock-sum-4', nickname: 'DreamCoder', avatarUrl: null, codeLength: 28, achievedAt: new Date(Date.now() - 60 * 1000) },
    { rank: 5, userId: 'mock-sum-5', nickname: 'LeraDev', avatarUrl: null, codeLength: 34, achievedAt: new Date(Date.now() - 30 * 60 * 1000) },
  ],
  'fibonacci': mockLeaderboard,
};

export function getTaskBySlug(slug: string): Task | undefined {
  return mockTasks.find((t) => t.slug === slug);
}

export function getLeaderboardByTaskSlug(slug: string): LeaderboardEntry[] {
  return mockTaskLeaderboard[slug] || [];
}
