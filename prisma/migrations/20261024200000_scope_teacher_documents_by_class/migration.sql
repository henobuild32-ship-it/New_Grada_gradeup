ALTER TABLE "TeacherDocument"
  ADD COLUMN IF NOT EXISTS "targetClassId" TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS "TeacherDocument_schoolId_targetClassId_published_idx"
  ON "TeacherDocument"("schoolId", "targetClassId", "published");
