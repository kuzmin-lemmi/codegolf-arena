// src/app/auth/page.tsx

import { Suspense } from 'react';
import AuthPageClient from './AuthPageClient';

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="min-h-[80vh]" />}>
      <AuthPageClient />
    </Suspense>
  );
}
