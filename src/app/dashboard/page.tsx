import { Suspense } from 'react';
import Dashboard from './dashboard-client';

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-gray-400">
          Carregando...
        </div>
      }
    >
      <Dashboard />
    </Suspense>
  );
}
