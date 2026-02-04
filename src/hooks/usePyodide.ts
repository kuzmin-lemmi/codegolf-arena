// src/hooks/usePyodide.ts

'use client';

import { useState, useEffect, useCallback } from 'react';
import { initPyodide, isPyodideLoaded, checkOneliner, CheckResult } from '@/lib/pyodide';

interface UsePyodideReturn {
  isLoading: boolean;
  isReady: boolean;
  error: string | null;
  loadProgress: string;
  checkCode: (
    code: string,
    functionArgs: string[],
    testcases: Array<{ inputData: { args: any[] }; expectedOutput: string }>,
    allowedImports?: string[]
  ) => Promise<CheckResult | null>;
}

export function usePyodide(autoLoad: boolean = false): UsePyodideReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadProgress, setLoadProgress] = useState('');

  // Проверяем, загружен ли уже Pyodide
  useEffect(() => {
    if (isPyodideLoaded()) {
      setIsReady(true);
    }
  }, []);

  // Автозагрузка
  useEffect(() => {
    if (autoLoad && !isReady && !isLoading) {
      loadPyodide();
    }
  }, [autoLoad, isReady, isLoading]);

  // Загрузка Pyodide
  const loadPyodide = useCallback(async () => {
    if (isLoading || isReady) return;

    setIsLoading(true);
    setError(null);
    setLoadProgress('Загрузка Python...');

    try {
      await initPyodide();
      setIsReady(true);
      setLoadProgress('');
    } catch (err: any) {
      setError(err.message || 'Failed to load Pyodide');
      setLoadProgress('');
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, isReady]);

  // Проверка кода
  const checkCode = useCallback(
    async (
      code: string,
      functionArgs: string[],
      testcases: Array<{ inputData: { args: any[] }; expectedOutput: string }>,
      allowedImports: string[] = []
    ): Promise<CheckResult | null> => {
      // Если Pyodide не загружен — загружаем
      if (!isReady) {
        setIsLoading(true);
        setLoadProgress('Загрузка Python...');
        try {
          await initPyodide();
          setIsReady(true);
        } catch (err: any) {
          setError(err.message || 'Failed to load Pyodide');
          setIsLoading(false);
          return null;
        }
        setIsLoading(false);
      }

      // Выполняем проверку
      try {
        const result = await checkOneliner(code, functionArgs, testcases, allowedImports);
        return result;
      } catch (err: any) {
        setError(err.message || 'Check failed');
        return null;
      }
    },
    [isReady]
  );

  return {
    isLoading,
    isReady,
    error,
    loadProgress,
    checkCode,
  };
}
