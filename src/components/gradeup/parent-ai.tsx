'use client';

import { useAppStore } from '@/lib/store';
import GradieChat from './gradie/GradieChat';

export default function ParentAI() {
  const user = useAppStore((s) => s.user);

  if (!user) return null;

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 px-5 py-3 text-white shadow-lg shadow-blue-500/20 shrink-0">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white/20 backdrop-blur-sm text-base">🤖</span>
          IA Gradie — Coach Familial
        </h1>
      </div>
      <div className="flex-1 min-h-0">
        <GradieChat
          schoolId={user.schoolId}
          userId={user.id}
          userRole="PARENT"
          userName={user.fullName}
        />
      </div>
    </div>
  );
}
