// src/lib/pyodide.ts

'use client';

import { generateTestCode, toPythonLiteral } from '@/lib/python-serializer';

// Типы для Pyodide
interface PyodideInterface {
  runPython: (code: string) => any;
  runPythonAsync: (code: string) => Promise<any>;
  loadPackage: (packages: string | string[]) => Promise<void>;
  globals: {
    get: (name: string) => any;
    set: (name: string, value: any) => void;
  };
}

declare global {
  interface Window {
    loadPyodide?: () => Promise<PyodideInterface>;
    pyodide?: PyodideInterface;
  }
}

let pyodideInstance: PyodideInterface | null = null;
let loadingPromise: Promise<PyodideInterface> | null = null;

// URL для загрузки Pyodide
const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/';

// Загрузка скрипта Pyodide
function loadPyodideScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.loadPyodide) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = `${PYODIDE_CDN}pyodide.js`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Pyodide script'));
    document.head.appendChild(script);
  });
}

// Инициализация Pyodide
export async function initPyodide(): Promise<PyodideInterface> {
  // Если уже загружен — возвращаем
  if (pyodideInstance) {
    return pyodideInstance;
  }

  // Если идёт загрузка — ждём
  if (loadingPromise) {
    return loadingPromise;
  }

  // Начинаем загрузку
  loadingPromise = (async () => {
    await loadPyodideScript();

    if (!window.loadPyodide) {
      throw new Error('Pyodide not available');
    }

    pyodideInstance = await window.loadPyodide();
    return pyodideInstance;
  })();

  return loadingPromise;
}

// Проверка, загружен ли Pyodide
export function isPyodideLoaded(): boolean {
  return pyodideInstance !== null;
}

// Результат выполнения кода
export interface ExecutionResult {
  success: boolean;
  output: string;
  error: string | null;
  executionTime: number;
}

// Результат теста
export interface TestResult {
  index: number;
  passed: boolean;
  input: string;
  expected: string;
  actual: string;
  error: string | null;
  executionTime: number;
}

// Результат проверки всех тестов
export interface CheckResult {
  allPassed: boolean;
  results: TestResult[];
  totalTime: number;
}

// Выполнение кода Python
export async function executePython(code: string, timeout: number = 5000): Promise<ExecutionResult> {
  const startTime = performance.now();

  try {
    const pyodide = await initPyodide();

    // Оборачиваем код для захвата stdout
    const wrappedCode = `
import sys
from io import StringIO

_stdout = sys.stdout
_output = StringIO()
sys.stdout = _output

try:
    exec("""${code.replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"')}""")
    _result = _output.getvalue()
except Exception as e:
    _result = f"Error: {type(e).__name__}: {e}"
finally:
    sys.stdout = _stdout

_result
`;

    // Выполняем с таймаутом
    const result = await Promise.race([
      pyodide.runPythonAsync(wrappedCode),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeout)
      ),
    ]);

    const executionTime = performance.now() - startTime;

    return {
      success: !String(result).startsWith('Error:'),
      output: String(result),
      error: String(result).startsWith('Error:') ? String(result) : null,
      executionTime,
    };
  } catch (error: any) {
    const executionTime = performance.now() - startTime;
    return {
      success: false,
      output: '',
      error: error.message || 'Execution failed',
      executionTime,
    };
  }
}

// Проверка однострочника на тестах
export async function checkOneliner(
  userCode: string,
  functionArgs: string[],
  testcases: Array<{
    inputData: { args: any[] };
    expectedOutput: string;
  }>,
  allowedImports: string[] = []
): Promise<CheckResult> {
  const startTime = performance.now();
  const results: TestResult[] = [];

  try {
    const pyodide = await initPyodide();

    for (let i = 0; i < testcases.length; i++) {
      const test = testcases[i];
      const testStartTime = performance.now();

      try {
        const testArgsStr = test.inputData.args.map(toPythonLiteral).join(', ');
        const fullCode = generateTestCode(userCode, functionArgs, test.inputData.args, allowedImports);

        // Выполняем
        const execResult = await executePython(fullCode, 3000);
        const testTime = performance.now() - testStartTime;

        if (!execResult.success) {
          results.push({
            index: i,
            passed: false,
            input: testArgsStr,
            expected: test.expectedOutput,
            actual: '',
            error: execResult.error,
            executionTime: testTime,
          });
          continue;
        }

        const actual = execResult.output.trim();
        const expected = test.expectedOutput.trim();
        const passed = actual === expected;

        results.push({
          index: i,
          passed,
          input: testArgsStr,
          expected,
          actual,
          error: null,
          executionTime: testTime,
        });
      } catch (error: any) {
        const testTime = performance.now() - testStartTime;
        results.push({
          index: i,
          passed: false,
          input: JSON.stringify(test.inputData.args),
          expected: test.expectedOutput,
          actual: '',
          error: error.message || 'Test execution failed',
          executionTime: testTime,
        });
      }
    }

    const totalTime = performance.now() - startTime;
    const allPassed = results.every((r) => r.passed);

    return {
      allPassed,
      results,
      totalTime,
    };
  } catch (error: any) {
    const totalTime = performance.now() - startTime;
    return {
      allPassed: false,
      results: testcases.map((_, i) => ({
        index: i,
        passed: false,
        input: '',
        expected: '',
        actual: '',
        error: error.message || 'Pyodide initialization failed',
        executionTime: 0,
      })),
      totalTime,
    };
  }
}
