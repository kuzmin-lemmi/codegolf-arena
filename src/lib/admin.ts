// src/lib/admin.ts

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from './auth';
import { normalizeTaskTopics } from './task-topics';

// Проверка прав администратора
export async function requireAdmin(request: NextRequest) {
  const user = await getCurrentUser(request);

  if (!user) {
    return {
      authorized: false,
      response: NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      ),
    };
  }

  if (!user.isAdmin) {
    return {
      authorized: false,
      response: NextResponse.json(
        { success: false, error: 'Forbidden: Admin access required' },
        { status: 403 }
      ),
    };
  }

  return {
    authorized: true,
    user,
  };
}

// Валидация данных задачи
export interface TaskFormData {
  slug: string;
  title: string;
  tier: 'bronze' | 'silver' | 'gold';
  mode: 'practice' | 'tournament';
  statementMd: string;
  functionSignature: string;
  functionArgs: string[];
  exampleInput: string;
  exampleOutput: string;
  constraints: {
    forbidden_tokens: string[];
    allowed_imports: string[];
    timeout_ms: number;
    topics: string[];
  };
  testcases: Array<{
    inputData: { args: any[] };
    expectedOutput: string;
    isHidden: boolean;
  }>;
}

export function validateTaskData(data: any): { valid: boolean; error?: string; data?: TaskFormData } {
  // Slug
  if (!data.slug || typeof data.slug !== 'string') {
    return { valid: false, error: 'Slug is required' };
  }
  if (!/^[a-z0-9-]+$/.test(data.slug)) {
    return { valid: false, error: 'Slug must contain only lowercase letters, numbers, and hyphens' };
  }

  // Title
  if (!data.title || typeof data.title !== 'string' || data.title.length < 3) {
    return { valid: false, error: 'Title must be at least 3 characters' };
  }

  // Tier
  if (!['bronze', 'silver', 'gold'].includes(data.tier)) {
    return { valid: false, error: 'Invalid tier' };
  }

  // Mode
  if (!['practice', 'tournament'].includes(data.mode)) {
    return { valid: false, error: 'Invalid mode' };
  }

  // Statement
  if (!data.statementMd || typeof data.statementMd !== 'string') {
    return { valid: false, error: 'Statement is required' };
  }

  // Function signature
  if (!data.functionSignature || typeof data.functionSignature !== 'string') {
    return { valid: false, error: 'Function signature is required' };
  }

  // Function args
  if (!Array.isArray(data.functionArgs) || data.functionArgs.length === 0) {
    return { valid: false, error: 'At least one function argument is required' };
  }

  // Example
  if (!data.exampleInput || !data.exampleOutput) {
    return { valid: false, error: 'Example input and output are required' };
  }

  // Testcases
  if (!Array.isArray(data.testcases) || data.testcases.length === 0) {
    return { valid: false, error: 'At least one test case is required' };
  }

  for (let i = 0; i < data.testcases.length; i++) {
    const tc = data.testcases[i];
    if (!tc.inputData || !tc.inputData.args) {
      return { valid: false, error: `Test case ${i + 1}: inputData.args is required` };
    }
    if (tc.expectedOutput === undefined || tc.expectedOutput === null) {
      return { valid: false, error: `Test case ${i + 1}: expectedOutput is required` };
    }
  }

  return {
    valid: true,
    data: {
      slug: data.slug.toLowerCase(),
      title: data.title,
      tier: data.tier,
      mode: data.mode,
      statementMd: data.statementMd,
      functionSignature: data.functionSignature,
      functionArgs: data.functionArgs,
      exampleInput: data.exampleInput,
      exampleOutput: data.exampleOutput,
      constraints: {
        forbidden_tokens: data.constraints?.forbidden_tokens || [';', 'eval', 'exec', '__import__'],
        allowed_imports: data.constraints?.allowed_imports || [],
        timeout_ms: data.constraints?.timeout_ms || 2000,
        topics: Array.isArray(data.constraints?.topics)
          ? normalizeTaskTopics(data.constraints.topics, 8)
          : [],
      },
      testcases: data.testcases.map((tc: any, idx: number) => ({
        inputData: tc.inputData,
        expectedOutput: String(tc.expectedOutput),
        isHidden: tc.isHidden ?? (idx >= 3), // Первые 3 теста открытые
      })),
    },
  };
}
