// src/hooks/useApi.ts

'use client';

import { useState, useEffect, useCallback } from 'react';

// Базовый хук для GET запросов
export function useApi<T>(url: string | null, options?: { enabled?: boolean }) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enabled = options?.enabled ?? true;

  const fetchData = useCallback(async () => {
    if (!url || !enabled) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(url);
      const json = await res.json();

      if (!json.success) {
        throw new Error(json.error || 'Request failed');
      }

      setData(json.data);
    } catch (err: any) {
      setError(err.message || 'Unknown error');
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [url, enabled]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, refetch: fetchData };
}

// Хук для списка задач
export function useTasks(filters?: { tier?: string; search?: string }) {
  const params = new URLSearchParams();
  if (filters?.tier && filters.tier !== 'all') params.set('tier', filters.tier);
  if (filters?.search) params.set('search', filters.search);

  const url = `/api/tasks${params.toString() ? `?${params}` : ''}`;
  return useApi<TaskListItem[]>(url);
}

// Хук для одной задачи
export function useTask(slug: string | null) {
  const url = slug ? `/api/tasks/${slug}` : null;
  return useApi<TaskDetail>(url);
}

// Хук для лидерборда задачи
export function useTaskLeaderboard(slug: string | null, limit = 50) {
  const url = slug ? `/api/tasks/${slug}/leaderboard?limit=${limit}` : null;
  return useApi<LeaderboardEntry[]>(url);
}

// Хук для глобального рейтинга
export function useGlobalLeaderboard(limit = 50) {
  return useApi<GlobalLeaderboardEntry[]>(`/api/leaderboard?limit=${limit}`);
}

// Хук для задачи недели
export function useWeeklyChallenge() {
  return useApi<WeeklyChallenge>('/api/weekly');
}

// Хук для профиля
export function useProfile() {
  return useApi<UserProfile>('/api/profile');
}

// Хук для решений задачи (только после PASS)
export function useTaskSolutions(slug: string | null, enabled = true) {
  const url = slug ? `/api/tasks/${slug}/solutions` : null;
  return useApi<SolutionsResponse>(url, { enabled });
}

// Типы
export interface TaskListItem {
  id: string;
  slug: string;
  title: string;
  tier: 'bronze' | 'silver' | 'gold';
  mode: 'practice' | 'tournament';
  functionSignature: string;
  statementMd: string;
  participantsCount: number;
  bestSolution: {
    length: number;
    nickname: string;
  } | null;
}

export interface TaskDetail {
  id: string;
  slug: string;
  title: string;
  tier: 'bronze' | 'silver' | 'gold';
  mode: 'practice' | 'tournament';
  statementMd: string;
  functionSignature: string;
  functionArgs: string[];
  exampleInput: string;
  exampleOutput: string;
  constraintsJson: {
    forbidden_tokens: string[];
    allowed_imports: string[];
    timeout_ms: number;
  };
  testcases: Array<{
    id: string;
    inputData: { args: any[] };
    expectedOutput: string;
  }>;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  codeLength: number;
  achievedAt: string;
}

export interface GlobalLeaderboardEntry {
  rank: number;
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  points: number;
  tasksSolved: number;
}

export interface WeeklyChallenge {
  id: string;
  task: TaskListItem;
  startsAt: string;
  endsAt: string;
  leaderboard: LeaderboardEntry[];
}

export interface UserProfile {
  id: string;
  stepikUserId: number | null;
  email: string | null;
  displayName: string;
  nickname: string | null;
  avatarUrl: string | null;
  totalPoints: number;
  nicknameChangedAt: string | null;
  createdAt: string;
  tasksSolved: number;
  totalSubmissions: number;
  bestRank: number | null;
  solvedTasks: Array<{
    slug: string;
    title: string;
    tier: 'bronze' | 'silver' | 'gold';
    length: number;
    achievedAt: string;
  }>;
}

export interface SolutionsResponse {
  canView: boolean;
  message?: string;
  solutions: Array<{
    rank: number;
    nickname: string;
    code: string;
    codeLength: number;
    achievedAt: string;
  }>;
}

// Хук для отправки решения
export function useSubmit() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async (taskSlug: string, code: string) => {
    setIsSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`/api/tasks/${taskSlug}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });

      const json = await res.json();

      if (!json.success) {
        throw new Error(json.error || 'Submit failed');
      }

      setResult(json.data);
      return json.data;
    } catch (err: any) {
      setError(err.message || 'Unknown error');
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { submit, isSubmitting, result, error, reset };
}

export interface SubmitResult {
  submissionId: string | null;
  status: 'pass' | 'fail' | 'error';
  length: number;
  testsPassed: number;
  testsTotal: number;
  place: number | null;
  isNewBest: boolean;
  details: Array<{
    index: number;
    passed: boolean;
    input?: string;
    expected?: string;
    actual?: string;
    error?: string;
  }>;
}
