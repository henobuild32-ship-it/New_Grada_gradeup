-- Password changes invalidate existing stateless access and refresh cookies.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "authVersion" INTEGER NOT NULL DEFAULT 0;

-- Keep the latest outstanding OTP when cleaning up older records left by
-- previous deployments, then enforce one pending reset code per account.
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "createdAt" DESC, "id" DESC) AS position
  FROM "PasswordReset"
  WHERE "used" = false
)
UPDATE "PasswordReset" AS reset
SET "used" = true
FROM ranked
WHERE reset."id" = ranked."id" AND ranked.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "PasswordReset_one_unused_per_user_key"
ON "PasswordReset" ("userId")
WHERE "used" = false;
