// src/types/index.ts

export type TaskTier = 'bronze' | 'silver' | 'gold';
export type TaskMode = 'practice' | 'tournament';
export type TaskStatus = 'draft' | 'published' | 'archived';
export type SubmissionStatus = 'pending' | 'pass' | 'fail' | 'error';

export interface User {
  id: string;
  stepikUserId: number;
  displayName: string;
  nickname: string | null;
  avatarUrl: string | null;
  totalPoints: number;
  isAdmin: boolean;
  createdAt: Date;
}

export interface Task {
  id: string;
  slug: string;
  title: string;
  statementMd: string;
  functionSignature: string;
  functionArgs: string[];
  constraintsJson: TaskConstraints;
  mode: TaskMode;
  tier: TaskTier;
  status: TaskStatus;
  exampleInput: string | null;
  exampleOutput: string | null;
  createdAt: Date;
}

export interface TaskConstraints {
  max_length: number;
  forbidden_tokens: string[];
  allowed_imports: string[];
  timeout_ms: number;
  memory_limit_mb?: number;
  topics?: string[];
}

export interface Testcase {
  id: string;
  taskId: string;
  isHidden: boolean;
  inputData: { args: unknown[] };
  expectedOutput: string;
  orderIndex: number;
}

export interface Submission {
  id: string;
  taskId: string;
  userId: string;
  code: string;
  codeLength: number;
  status: SubmissionStatus;
  testsPassed: number;
  testsTotal: number;
  runtimeMs: number | null;
  errorMessage: string | null;
  createdAt: Date;
}

export interface BestSubmission {
  taskId: string;
  userId: string;
  submissionId: string;
  codeLength: number;
  achievedAt: Date;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  codeLength: number;
  achievedAt: Date;
  code?: string; // Только если можно показывать
}

export interface WeeklyChallenge {
  id: string;
  taskId: string;
  task: Task;
  startsAt: Date;
  endsAt: Date;
  isActive: boolean;
}

export interface SubmitResult {
  status: SubmissionStatus;
  length: number;
  testsPassed: number;
  testsTotal: number;
  place: number | null;
  errorMessage: string | null;
  submissionId?: string | null;
  details?: TestResult[];
}

export interface TestResult {
  index: number;
  passed: boolean;
  input?: string;
  expected?: string;
  actual?: string;
  error?: string;
}

// Для API ответов
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
