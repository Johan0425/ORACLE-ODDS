import { BadRequestException, ConflictException, ForbiddenException, GoneException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { lineKey, settleSelection, type SettlementOutcome } from '@oracle-odds/probability-engine';
import { PrismaService } from '../../prisma/prisma.service';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env';
import { hashSecret, publicCode, randomSecret, verifySecret } from '../../common/hashing';
import { verifyTurnstile } from '../../common/captcha';
import { SettlementService } from '../settlement/settlement.service';
import { SponsorService } from '../affiliate/sponsor.service';
import { moderateAlias, moderateText, sanitizePlainText } from './moderation';
import { scoreEntry, type ScoringRules } from './scoring';

export interface CreateChallengeInput {
  title: string;
  description?: string;
  fixtureIds: string[];
  endsAt?: string;
  scoring: ScoringRules;
  maxParticipants?: number;
  maxPicksPerEntry?: number;
  withSponsor?: boolean;
  captchaToken?: string;
}

export interface PickInput {
  fixtureId: string;
  marketKey: string;
  selectionKey: string;
  line?: number | null;
}

export interface StoredPick extends PickInput {
  referenceOdds: number | null;
  pickedAt: string;
  outcome?: SettlementOutcome | null;
}

const ARCHIVE_AFTER_DAYS = 30;
const AUTO_HIDE_REPORTS = 5;

@Injectable()
export class ChallengesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settlement: SettlementService,
    private readonly sponsor: SponsorService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  private async audit(challengeId: string, action: string, actor: string, details: Prisma.InputJsonValue = {}) {
    await this.prisma.challengeAuditLog.create({ data: { challengeId, action, actor, details } });
  }

  /** Abuso: demasiados retos creados hoy desde la misma sesión anónima → CAPTCHA obligatorio (si está configurado). */
  private async requireCaptchaIfAbusive(sessionHash: string, token?: string) {
    const today = new Date(new Date().toISOString().slice(0, 10));
    const created = await this.prisma.challengeAuditLog.count({ where: { action: 'create', actor: `session:${sessionHash}`, createdAt: { gte: today } } });
    if (created < this.env.CHALLENGE_DAILY_CREATE_LIMIT) return;
    if (!this.env.TURNSTILE_SECRET_KEY) throw new ForbiddenException('Límite diario de creación de retos alcanzado');
    if (!(await verifyTurnstile(this.env.TURNSTILE_SECRET_KEY, token))) throw new ForbiddenException({ message: 'Se requiere verificación CAPTCHA', code: 'CAPTCHA_REQUIRED' });
  }

  async create(input: CreateChallengeInput, sessionHash: string) {
    await this.requireCaptchaIfAbusive(sessionHash, input.captchaToken);
    const title = sanitizePlainText(input.title, 80);
    const description = input.description ? sanitizePlainText(input.description, 500) : null;
    for (const text of [title, description ?? '']) {
      const m = moderateText(text, this.env.CHALLENGE_BLOCKLIST);
      if (!m.ok) throw new BadRequestException(m.reason);
    }
    if (title.length < 3) throw new BadRequestException('El título debe tener al menos 3 caracteres');
    const ids = [...new Set(input.fixtureIds)];
    if (ids.length === 0 || ids.length > 30) throw new BadRequestException('Elige entre 1 y 30 partidos');
    const fixtures = await this.prisma.fixture.findMany({ where: { id: { in: ids }, primaryProvider: { not: null }, status: 'SCHEDULED', kickoff: { gt: new Date() } }, select: { id: true, kickoff: true } });
    if (fixtures.length !== ids.length) throw new BadRequestException('Todos los partidos deben ser reales, programados y no iniciados');
    const firstKickoff = new Date(Math.min(...fixtures.map((f) => f.kickoff.getTime())));
    const lastKickoff = new Date(Math.max(...fixtures.map((f) => f.kickoff.getTime())));
    const minEnd = new Date(lastKickoff.getTime() + 3 * 3600_000);
    const endsAt = input.endsAt ? new Date(input.endsAt) : minEnd;
    if (Number.isNaN(endsAt.getTime()) || endsAt < minEnd) throw new BadRequestException('La fecha de cierre debe ser posterior al último partido');
    if (input.scoring.system === 'quiniela') input.scoring.allowedMarkets = ['1X2'];
    const secret = randomSecret();
    const code = publicCode();
    const sponsorConfig = input.withSponsor ? this.sponsor.publicConfig('challenge_sponsor') : null;
    const challenge = await this.prisma.anonymousChallenge.create({
      data: {
        publicCode: code,
        creatorSecretHash: hashSecret(secret),
        title,
        description,
        scoringRules: input.scoring as unknown as Prisma.InputJsonValue,
        startsAt: firstKickoff,
        endsAt,
        maxParticipants: Math.min(Math.max(input.maxParticipants ?? 100, 2), 500),
        maxPicksPerEntry: Math.min(Math.max(input.maxPicksPerEntry ?? ids.length * 3, 1), 60),
        sponsorConfig: sponsorConfig?.enabled ? (sponsorConfig as unknown as Prisma.InputJsonValue) : undefined,
        fixtures: { create: ids.map((fixtureId) => ({ fixtureId })) },
      },
    });
    await this.audit(challenge.id, 'create', `session:${sessionHash}`, { fixtures: ids.length, system: input.scoring.system });
    // El secreto se devuelve una única vez; solo se guarda su hash.
    return { publicCode: code, creatorSecret: secret, challengeId: challenge.id };
  }

  private async byCode(code: string) {
    const c = await this.prisma.anonymousChallenge.findUnique({ where: { publicCode: code.toUpperCase() } });
    if (!c) throw new NotFoundException('Reto no encontrado');
    return c;
  }

  async get(code: string) {
    const c = await this.byCode(code);
    const [fixtures, participants, leaderboard] = await Promise.all([
      this.prisma.challengeFixture.findMany({
        where: { challengeId: c.id },
        include: { fixture: { include: { homeTeam: true, awayTeam: true, league: true } } },
        orderBy: { fixture: { kickoff: 'asc' } },
      }),
      this.prisma.challengeEntry.count({ where: { challengeId: c.id } }),
      this.leaderboard(code),
    ]);
    const { creatorSecretHash: _hidden, ...publicFields } = c;
    return {
      ...publicFields,
      flagged: c.reportCount >= AUTO_HIDE_REPORTS,
      participants,
      fixtures: fixtures.map((f) => ({
        id: f.fixture.id,
        kickoff: f.fixture.kickoff,
        status: f.fixture.status,
        homeTeam: { id: f.fixture.homeTeam.id, name: f.fixture.homeTeam.name, logoUrl: f.fixture.homeTeam.logoUrl },
        awayTeam: { id: f.fixture.awayTeam.id, name: f.fixture.awayTeam.name, logoUrl: f.fixture.awayTeam.logoUrl },
        league: { id: f.fixture.league.id, name: f.fixture.league.name },
        homeScore: f.fixture.homeScore,
        awayScore: f.fixture.awayScore,
        locked: f.fixture.kickoff <= new Date(),
      })),
      leaderboard: leaderboard.entries.slice(0, 50),
      disclaimer: 'Reto social sin dinero real: no hay pagos, depósitos ni premios monetarios.',
    };
  }

  async join(code: string, aliasRaw: string) {
    const c = await this.byCode(code);
    if (c.status !== 'OPEN' || c.endsAt < new Date()) throw new GoneException('El reto ya no admite participantes');
    const alias = sanitizePlainText(aliasRaw, 20);
    const m = moderateAlias(alias, this.env.CHALLENGE_BLOCKLIST);
    if (!m.ok) throw new BadRequestException(m.reason);
    const count = await this.prisma.challengeEntry.count({ where: { challengeId: c.id } });
    if (count >= c.maxParticipants) throw new ConflictException('El reto alcanzó el máximo de participantes');
    const token = randomSecret();
    try {
      const entry = await this.prisma.challengeEntry.create({ data: { challengeId: c.id, anonymousAlias: alias, anonymousTokenHash: hashSecret(token) } });
      await this.audit(c.id, 'join', `participant:${alias}`);
      return { entryId: entry.id, alias, participantToken: token };
    } catch {
      throw new ConflictException('Ese alias ya está en uso en este reto');
    }
  }

  private async entryByToken(challengeId: string, token: string) {
    const entry = await this.prisma.challengeEntry.findUnique({ where: { anonymousTokenHash: hashSecret(token) } });
    if (!entry || entry.challengeId !== challengeId) throw new ForbiddenException('Token de participante inválido');
    return entry;
  }

  /** Referencia de dificultad: mejor cuota autorizada vigente, o cuota justa del modelo si no hay cuotas. */
  private async referenceOdds(p: PickInput): Promise<number | null> {
    const lk = lineKey(p.line);
    const quote = await this.prisma.oddsQuote.findFirst({
      where: { fixtureId: p.fixtureId, marketKey: p.marketKey, selectionKey: p.selectionKey, lineKey: lk, isLive: false, isSuspended: false, bookmaker: { isAuthorized: true, isActive: true } },
      orderBy: { currentPrice: 'desc' },
    });
    if (quote) return quote.currentPrice;
    const prob = await this.prisma.calculatedProbability.findFirst({
      where: { marketKey: p.marketKey, selectionKey: p.selectionKey, lineKey: lk, predictionRun: { fixtureId: p.fixtureId, status: 'COMPLETED' } },
      select: { fairOdds: true },
    });
    return prob?.fairOdds ?? null;
  }

  async submitPicks(code: string, token: string, picks: PickInput[]) {
    const c = await this.byCode(code);
    if (c.status !== 'OPEN') throw new GoneException('El reto está cerrado');
    const entry = await this.entryByToken(c.id, token);
    const rules = c.scoringRules as unknown as ScoringRules;
    if (picks.length > c.maxPicksPerEntry) throw new BadRequestException(`Máximo ${c.maxPicksPerEntry} selecciones`);
    const fixtureRows = await this.prisma.challengeFixture.findMany({ where: { challengeId: c.id }, include: { fixture: { select: { id: true, kickoff: true } } } });
    const kickoffs = new Map(fixtureRows.map((f) => [f.fixtureId, f.fixture.kickoff]));
    const now = new Date();
    const existing = (entry.selections as unknown as StoredPick[]) ?? [];
    // Las selecciones de partidos ya iniciados quedan bloqueadas y no se pueden cambiar.
    const locked = existing.filter((p) => (kickoffs.get(p.fixtureId) ?? now) <= now);
    const lockedFixtures = new Set(locked.map((p) => p.fixtureId));
    const fresh: StoredPick[] = [];
    const seen = new Set<string>();
    for (const p of picks) {
      const kickoff = kickoffs.get(p.fixtureId);
      if (!kickoff) throw new BadRequestException('Partido fuera del reto');
      if (kickoff <= now || lockedFixtures.has(p.fixtureId)) throw new BadRequestException('Las selecciones se bloquean al iniciar el partido');
      if (rules.allowedMarkets?.length && !rules.allowedMarkets.includes(p.marketKey)) throw new BadRequestException(`Mercado ${p.marketKey} no permitido en este reto`);
      const key = `${p.fixtureId}|${p.marketKey}`;
      if (seen.has(key)) throw new BadRequestException('Solo una selección por mercado y partido');
      seen.add(key);
      fresh.push({ fixtureId: p.fixtureId, marketKey: p.marketKey, selectionKey: p.selectionKey, line: p.line ?? null, referenceOdds: await this.referenceOdds(p), pickedAt: now.toISOString() });
    }
    const selections = [...locked, ...fresh];
    await this.prisma.challengeEntry.update({ where: { id: entry.id }, data: { selections: selections as unknown as Prisma.InputJsonValue } });
    await this.audit(c.id, 'picks', `participant:${entry.anonymousAlias}`, { count: fresh.length });
    return { alias: entry.anonymousAlias, selections };
  }

  async myEntry(code: string, token: string) {
    const c = await this.byCode(code);
    const entry = await this.entryByToken(c.id, token);
    return { alias: entry.anonymousAlias, selections: entry.selections, score: entry.score };
  }

  async leaderboard(code: string) {
    const c = await this.byCode(code);
    const entries = await this.prisma.challengeEntry.findMany({
      where: { challengeId: c.id, isHidden: false },
      orderBy: [{ score: 'desc' }, { tiebreaker: 'desc' }, { createdAt: 'asc' }],
      select: { anonymousAlias: true, score: true, tiebreaker: true, selections: true, createdAt: true },
    });
    const now = new Date();
    const kickoffs = new Map(
      (await this.prisma.challengeFixture.findMany({ where: { challengeId: c.id }, include: { fixture: { select: { kickoff: true } } } })).map((f) => [f.fixtureId, f.fixture.kickoff]),
    );
    return {
      status: c.status,
      entries: entries.map((e, i) => ({
        rank: i + 1,
        alias: e.anonymousAlias,
        score: e.score,
        // Las selecciones de otros participantes solo se muestran cuando su partido ya empezó.
        picks: ((e.selections as unknown as StoredPick[]) ?? []).filter((p) => (kickoffs.get(p.fixtureId) ?? now) <= now),
      })),
    };
  }

  private async assertCreator(code: string, secret: string) {
    const c = await this.byCode(code);
    if (!secret || !verifySecret(secret, c.creatorSecretHash)) throw new ForbiddenException('Secreto de creador inválido');
    return c;
  }

  async close(code: string, secret: string) {
    const c = await this.assertCreator(code, secret);
    await this.prisma.anonymousChallenge.update({ where: { id: c.id }, data: { status: 'CLOSED' } });
    await this.audit(c.id, 'close', 'creator');
    return { status: 'CLOSED' };
  }

  async moderateEntry(code: string, secret: string, alias: string, hidden: boolean) {
    const c = await this.assertCreator(code, secret);
    const res = await this.prisma.challengeEntry.updateMany({ where: { challengeId: c.id, anonymousAlias: alias }, data: { isHidden: hidden } });
    if (res.count === 0) throw new NotFoundException('Participante no encontrado');
    await this.audit(c.id, hidden ? 'hide_entry' : 'unhide_entry', 'creator', { alias });
    return { alias, hidden };
  }

  async report(code: string, reason: string, sessionHash: string) {
    const c = await this.byCode(code);
    const already = await this.prisma.challengeAuditLog.findFirst({ where: { challengeId: c.id, action: 'report', actor: `session:${sessionHash}` } });
    if (already) return { received: true };
    await this.prisma.anonymousChallenge.update({ where: { id: c.id }, data: { reportCount: { increment: 1 } } });
    await this.audit(c.id, 'report', `session:${sessionHash}`, { reason: sanitizePlainText(reason, 200) });
    return { received: true };
  }

  /** Recalcula puntuaciones con partidos liquidados y avanza estados (cierre y archivo). */
  async scoreAll(): Promise<{ challenges: number; entries: number }> {
    const active = await this.prisma.anonymousChallenge.findMany({ where: { status: { in: ['OPEN', 'LOCKED', 'CLOSED'] } }, include: { fixtures: { include: { fixture: { select: { id: true, kickoff: true } } } } } });
    let entriesScored = 0;
    const now = new Date();
    for (const c of active) {
      const results = new Map<string, Awaited<ReturnType<SettlementService['finalResult']>>>();
      for (const f of c.fixtures) results.set(f.fixtureId, await this.settlement.finalResult(f.fixtureId));
      const rules = c.scoringRules as unknown as ScoringRules;
      const entries = await this.prisma.challengeEntry.findMany({ where: { challengeId: c.id } });
      for (const e of entries) {
        const picks = ((e.selections as unknown as StoredPick[]) ?? []).map((p) => {
          const result = results.get(p.fixtureId);
          return { ...p, outcome: result ? settleSelection(p, result) : null };
        });
        const s = scoreEntry(rules.system, picks.map((p) => ({ fixtureId: p.fixtureId, kickoff: c.fixtures.find((f) => f.fixtureId === p.fixtureId)?.fixture.kickoff ?? now, outcome: p.outcome, referenceOdds: p.referenceOdds })));
        await this.prisma.challengeEntry.update({ where: { id: e.id }, data: { score: s.score, tiebreaker: s.tiebreaker, selections: picks as unknown as Prisma.InputJsonValue } });
        entriesScored += 1;
      }
      const allSettled = c.fixtures.every((f) => results.get(f.fixtureId) != null);
      const started = c.fixtures.every((f) => f.fixture.kickoff <= now);
      let status = c.status;
      if (status === 'OPEN' && started) status = 'LOCKED';
      if ((status === 'LOCKED' || status === 'OPEN') && allSettled && c.endsAt <= now) status = 'CLOSED';
      if (status === 'CLOSED' && c.endsAt.getTime() + ARCHIVE_AFTER_DAYS * 86_400_000 <= now.getTime()) status = 'ARCHIVED';
      if (status !== c.status) {
        await this.prisma.anonymousChallenge.update({ where: { id: c.id }, data: { status } });
        await this.audit(c.id, `status:${status}`, 'system');
      }
    }
    return { challenges: active.length, entries: entriesScored };
  }
}
