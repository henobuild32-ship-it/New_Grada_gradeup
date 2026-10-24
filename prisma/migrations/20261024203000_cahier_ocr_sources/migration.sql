ALTER TABLE "CahierEvaluation"
  ADD COLUMN "sourceDocumentPath" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "sourceDocumentName" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "ocrSourceText" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "ocrCorrections" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "ocrConfidence" DOUBLE PRECISION,
  ADD COLUMN "ocrProvider" TEXT NOT NULL DEFAULT '';
