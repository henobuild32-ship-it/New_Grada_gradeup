'use client';

import { useAppStore } from '@/lib/store';
import GradieChat from './gradie/GradieChat';

export default function StudentAi() {
  const user = useAppStore((s) => s.user);

  if (!user) return null;

  return (
    <div className="h-full min-h-0">
      <GradieChat
        schoolId={user.schoolId}
        userId={user.id}
        userRole="STUDENT"
        userName={user.fullName}
      />
    </div>
  );
}
