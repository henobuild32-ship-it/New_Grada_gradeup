CREATE TABLE "HumanitiesSection" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HumanitiesSection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HumanitiesOption" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HumanitiesOption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HumanitiesSection_schoolId_name_key" ON "HumanitiesSection"("schoolId", "name");
CREATE INDEX "HumanitiesSection_schoolId_idx" ON "HumanitiesSection"("schoolId");
CREATE UNIQUE INDEX "HumanitiesOption_sectionId_name_key" ON "HumanitiesOption"("sectionId", "name");
CREATE INDEX "HumanitiesOption_sectionId_idx" ON "HumanitiesOption"("sectionId");

ALTER TABLE "HumanitiesSection" ADD CONSTRAINT "HumanitiesSection_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HumanitiesOption" ADD CONSTRAINT "HumanitiesOption_sectionId_fkey"
  FOREIGN KEY ("sectionId") REFERENCES "HumanitiesSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "School" ADD COLUMN "studentCardPriceCdf" INTEGER NOT NULL DEFAULT 10000;
