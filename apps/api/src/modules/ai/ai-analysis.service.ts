import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env';
import { FixturesService } from '../fixtures/fixtures.service';

const pct = (p: number | null | undefined) => (p == null ? 's/d' : `${Math.round(p * 100)}%`);

const SYSTEM_PROMPT = [
  'Eres analista de fútbol de ORACLE ODDS. Escribes en español neutro para Colombia.',
  'Redactas un análisis breve (120-170 palabras, 2 párrafos, sin títulos ni viñetas) usando SOLO los datos que se te entregan.',
  'Prohibido inventar lesiones, alineaciones, noticias, rachas, árbitros, clima o cualquier dato que no esté en la entrada.',
  'Las probabilidades vienen de un modelo estadístico (Dixon-Coles + Elo + mercado): no las cambies ni inventes otras.',
  'Explica qué sostiene el pronóstico (forma, goles esperados, posición, historial) y qué lo hace incierto.',
  'Cierra con una frase recordando que es una estimación y no garantiza el resultado. No uses lenguaje de "apuesta segura", "fija" ni "dinero fácil".',
].join(' ');

/**
 * Análisis redactado con Groq (API compatible con OpenAI, plan gratuito).
 * Es un complemento de texto sobre una predicción ya calculada: no altera
 * probabilidades ni decide qué se publica. Sin GROQ_API_KEY no hace nada.
 */
@Injectable()
export class AiAnalysisService {
  private readonly logger = new Logger(AiAnalysisService.name);

  constructor(private readonly prisma: PrismaService, private readonly fixtures: FixturesService, @Inject(APP_ENV) private readonly env: AppEnv) {}

  get enabled(): boolean {
    return !!this.env.GROQ_API_KEY;
  }

  /** Construye la entrada factual del modelo de lenguaje a partir de datos persistidos. */
  async buildContext(fixtureId: string, runId: string): Promise<string | null> {
    const detail = await this.fixtures.findOne(fixtureId).catch(() => null);
    if (!detail) return null;
    const run = await this.prisma.predictionRun.findUnique({ where: { id: runId }, include: { probabilities: true } });
    if (!run) return null;
    const prob = (market: string, sel: string, line: number | null = null) =>
      run.probabilities.find((p) => p.marketKey === market && p.selectionKey === sel && (line == null || p.line === line))?.calibratedProbability ?? null;
    const form = (rows: Array<{ result: string; goalsFor: number; goalsAgainst: number; opponent: string; venue: string }>) =>
      rows.map((r) => `${r.result} ${r.goalsFor}-${r.goalsAgainst} vs ${r.opponent} (${r.venue === 'H' ? 'local' : 'visita'})`).join('; ') || 'sin datos';
    const rank = (teamId: string) => {
      const s = detail.standings.find((x) => x.teamId === teamId);
      return s ? `${s.rank}º con ${s.points} pts en ${s.played} PJ (GF ${s.goalsFor}, GC ${s.goalsAgainst})` : 'sin datos';
    };
    const h2h = detail.h2h.map((m) => `${m.homeTeam} ${m.homeScore}-${m.awayScore} ${m.awayTeam}`).join('; ') || 'sin enfrentamientos recientes registrados';
    return [
      `Partido: ${detail.homeTeam.name} (local) vs ${detail.awayTeam.name} (visitante)`,
      `Competición: ${detail.league.name}${detail.league.country ? ` (${detail.league.country})` : ''}`,
      `Fecha: ${detail.kickoff.toISOString()}${detail.venue ? `, estadio ${detail.venue}` : ''}`,
      `Goles esperados del modelo: local ${run.lambdaHome?.toFixed(2) ?? 's/d'}, visitante ${run.lambdaAway?.toFixed(2) ?? 's/d'}`,
      `Probabilidades 1X2: local ${pct(prob('1X2', 'HOME'))}, empate ${pct(prob('1X2', 'DRAW'))}, visitante ${pct(prob('1X2', 'AWAY'))}`,
      `Más de 2.5 goles: ${pct(prob('OU_GOALS', 'OVER', 2.5))}; ambos marcan: ${pct(prob('BTTS', 'YES'))}`,
      `Tabla: ${detail.homeTeam.name} ${rank(detail.homeTeamId)}; ${detail.awayTeam.name} ${rank(detail.awayTeamId)}`,
      `Últimos partidos ${detail.homeTeam.name}: ${form(detail.form.home)}`,
      `Últimos partidos ${detail.awayTeam.name}: ${form(detail.form.away)}`,
      `Historial directo reciente: ${h2h}`,
      `Calidad de datos del modelo (0-1): ${run.dataQuality?.toFixed(2) ?? 's/d'}`,
    ].join('\n');
  }

  private async complete(context: string): Promise<string> {
    const res = await fetch(`${this.env.GROQ_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.env.GROQ_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.env.GROQ_MODEL,
        temperature: 0.4,
        max_tokens: 700,
        // Modelos de razonamiento (gpt-oss, qwen3): razonamiento breve y fuera de la respuesta.
        ...(/gpt-oss|qwen3/.test(this.env.GROQ_MODEL) ? { reasoning_effort: 'low', include_reasoning: false } : {}),
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Datos del partido:\n${context}\n\nEscribe el análisis.` },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 429) throw new RateLimitedError();
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
      throw new Error(`Groq respondió ${res.status}${err?.error?.code ? ` (${err.error.code})` : ''}`);
    }
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = body.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('Groq devolvió una respuesta vacía');
    return text.slice(0, 2000);
  }

  /** compute:ai-analysis — partidos próximos con predicción vigente y sin análisis para esa predicción. */
  async generatePending(): Promise<{ candidates: number; created: number; failed: number; rateLimited: boolean }> {
    const now = new Date();
    const runs = await this.prisma.predictionRun.findMany({
      where: {
        status: 'COMPLETED',
        fixture: { status: 'SCHEDULED', primaryProvider: { not: null }, kickoff: { gt: now, lte: new Date(now.getTime() + this.env.GROQ_HORIZON_HOURS * 3_600_000) } },
      },
      select: { id: true, fixtureId: true, fixture: { select: { kickoff: true, analyses: { orderBy: { createdAt: 'desc' }, take: 1, select: { predictionRunId: true, createdAt: true } } } } },
      orderBy: { fixture: { kickoff: 'asc' } },
    });
    // Se regenera solo si la predicción cambió y el último análisis tiene más de 12 h (cuida el cupo gratuito).
    const pending = runs.filter((r) => {
      const last = r.fixture.analyses[0];
      return !last || (last.predictionRunId !== r.id && now.getTime() - last.createdAt.getTime() > 12 * 3_600_000);
    });
    let created = 0;
    let failed = 0;
    let rateLimited = false;
    let lastError: string | null = null;
    for (const r of pending.slice(0, this.env.GROQ_MAX_PER_RUN)) {
      try {
        const context = await this.buildContext(r.fixtureId, r.id);
        if (!context) continue;
        const content = await this.complete(context);
        await this.prisma.fixtureAnalysis.upsert({
          where: { predictionRunId: r.id },
          create: { fixtureId: r.fixtureId, predictionRunId: r.id, provider: 'GROQ', model: this.env.GROQ_MODEL, content },
          update: { content, model: this.env.GROQ_MODEL },
        });
        created += 1;
      } catch (e) {
        if (e instanceof RateLimitedError) {
          rateLimited = true;
          break;
        }
        failed += 1;
        lastError = (e as Error).message;
        this.logger.warn(`Análisis omitido para ${r.fixtureId}: ${(e as Error).message}`);
      }
    }
    // Si ninguna petición funcionó (clave o modelo inválidos) el job falla y se ve en /status.
    if (created === 0 && failed > 0) throw new Error(`Ningún análisis generado: ${lastError}`);
    return { candidates: pending.length, created, failed, rateLimited };
  }

  async latest(fixtureId: string) {
    return this.prisma.fixtureAnalysis.findFirst({
      where: { fixtureId },
      orderBy: { createdAt: 'desc' },
      select: { content: true, model: true, provider: true, createdAt: true, predictionRunId: true },
    });
  }
}

class RateLimitedError extends Error {
  constructor() {
    super('Groq: límite de peticiones alcanzado');
  }
}
