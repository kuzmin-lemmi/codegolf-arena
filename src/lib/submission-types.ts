export interface SubmissionResponseData {
  submissionId: string | null;
  status: 'pass' | 'fail' | 'error';
  length: number;
  testsPassed: number;
  testsTotal: number;
  place: number | null;
  isNewBest: boolean;
  pointsEarned: number;
  pointsBreakdown: string[];
  errorMessage: string | null;
  details: Array<{
    index: number;
    passed: boolean;
    input?: string;
    expected?: string;
    actual?: string;
    error?: string | null;
  }>;
}

export interface TaskSubmitPayload {
  userId: string;
  taskSlug: string;
  code: string;
}
