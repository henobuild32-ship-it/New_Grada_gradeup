'use client';

import { useAppStore } from '@/lib/store';
import GradieChat from './gradie/GradieChat';

export default function TeacherAi() {
  const { user } = useAppStore();

  if (!user) return null;

  return (
    <div className="h-full min-h-0">
      <GradieChat
        schoolId={user.schoolId}
        userId={user.id}
        userRole="TEACHER"
        userName={user.fullName}
      />
    </div>
  );
}
