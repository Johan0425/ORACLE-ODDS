-- Proveedor gratuito ESPN (calendario, resultados, clasificación y cuotas de referencia).
ALTER TYPE "DataProvider" ADD VALUE 'ESPN';

-- Análisis redactado por LLM (Groq) sobre una predicción ya calculada.
CREATE TABLE "fixture_analyses" (
    "id" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "predictionRunId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fixture_analyses_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "fixture_analyses_predictionRunId_key" ON "fixture_analyses"("predictionRunId");
CREATE INDEX "fixture_analyses_fixtureId_createdAt_idx" ON "fixture_analyses"("fixtureId", "createdAt");
ALTER TABLE "fixture_analyses" ADD CONSTRAINT "fixture_analyses_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "fixtures"("id") ON DELETE CASCADE ON UPDATE CASCADE;
