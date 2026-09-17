export interface SubmissionResponseData {
  submissionId: string | null;
  status: 'pass' | 'fail' | 'error';
  length: number;
  testsPassed: number;
  testsTotal: number;
  place: number | null;
  isNewBest: boolean;
  // Личный рекорд до этой отправки (null, если задача решена впервые)
  previousBestLength: number | null;
  // На сколько символов улучшен личный рекорд этой отправкой
  improvedBy: number | null;
  // Ник игрока, у которого этой отправкой забрали первое место
  tookFirstPlaceFrom: string | null;
  pointsEarned: number;
  pointsBreakdown: string[];
  errorMessage: string | null;
  details: Array<{
    index: number;
    passed: boolean;
    // У скрытых тестов наружу уходит только факт прохождения
    isHidden?: boolean;
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
  envId?: string; // EnvId окружения, выбранного пользователем
}
