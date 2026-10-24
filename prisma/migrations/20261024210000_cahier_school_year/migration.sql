ALTER TABLE "CahierEvaluation"
ADD COLUMN IF NOT EXISTS "schoolYearId" TEXT;

UPDATE "CahierEvaluation" AS evaluation
SET "schoolYearId" = school_year.id
FROM "SchoolYear" AS school_year
WHERE evaluation."schoolId" = school_year."schoolId"
  AND evaluation."schoolYearId" IS NULL
  AND school_year."deletedAt" IS NULL
  AND school_year."year" = CASE
    WHEN EXTRACT(MONTH FROM evaluation."date") >= 9
      THEN EXTRACT(YEAR FROM evaluation."date")::int::text || '-' || (EXTRACT(YEAR FROM evaluation."date")::int + 1)::text
    ELSE (EXTRACT(YEAR FROM evaluation."date")::int - 1)::text || '-' || EXTRACT(YEAR FROM evaluation."date")::int::text
  END;

CREATE INDEX IF NOT EXISTS "CahierEvaluation_schoolId_schoolYearId_classId_courseId_tri_idx"
ON "CahierEvaluation"("schoolId", "schoolYearId", "classId", "courseId", "trimester");

DO $$ BEGIN
  ALTER TABLE "CahierEvaluation"
    ADD CONSTRAINT "CahierEvaluation_schoolYearId_fkey"
    FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
