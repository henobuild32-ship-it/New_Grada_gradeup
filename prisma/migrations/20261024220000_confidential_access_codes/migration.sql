ALTER TABLE "User"
  ADD COLUMN "confidentialCodeGeneration" INTEGER,
  ADD COLUMN "lastActivityAt" TIMESTAMP(3);

DROP INDEX IF EXISTS "User_schoolId_fullName_role_key";
CREATE INDEX IF NOT EXISTS "User_schoolId_fullName_role_idx"
  ON "User"("schoolId", "fullName", "role");

CREATE TABLE "ConfidentialAccessCode" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "encryptedCode" TEXT NOT NULL,
  "generation" INTEGER NOT NULL DEFAULT 1,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rotateAt" TIMESTAMP(3) NOT NULL,
  "suspendedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConfidentialAccessCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConfidentialAccessCode_schoolId_role_key"
  ON "ConfidentialAccessCode"("schoolId", "role");
CREATE INDEX "ConfidentialAccessCode_rotateAt_suspendedAt_idx"
  ON "ConfidentialAccessCode"("rotateAt", "suspendedAt");
ALTER TABLE "ConfidentialAccessCode"
  ADD CONSTRAINT "ConfidentialAccessCode_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
