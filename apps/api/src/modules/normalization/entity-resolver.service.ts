import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma, type DataProvider, type EntityType, type Fixture, type SportKey } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env';
import { entitiesNormalized } from '../../common/metrics';
import type { ExternalRef, NormalizedFixture, NormalizedLeague, NormalizedOddsEvent, NormalizedTeam } from '../../providers/types';
import { bestMatch, type MatchCandidate } from './fixture-matching';
import { nameSimilarity, normalizeName, slugify } from './names';

export type UpsertAction = 'created' | 'updated' | 'unchanged' | 'matched';

const SPORT_NAMES: Record<SportKey, string> = {
  FOOTBALL: 'Fútbol',
  BASKETBALL: 'Baloncesto',
  TENNIS: 'Tenis',
  BASEBALL: 'Béisbol',
  NFL: 'Fútbol americano',
  HOCKEY: 'Hockey',
  MMA: 'MMA',
};

/**
 * Correspondencia conocida entre competiciones de The Odds API y de
 * API-Football. Es metadata de referencia (no datos de partidos) y se puede
 * ampliar; las competiciones no listadas se emparejan por equipos y horario.
 */
export const ODDS_KEY_TO_API_FOOTBALL_LEAGUE: Record<string, string> = {
  soccer_epl: '39',
  soccer_spain_la_liga: '140',
  soccer_italy_serie_a: '135',
  soccer_germany_bundesliga: '78',
  soccer_france_ligue_one: '61',
  soccer_uefa_champs_league: '2',
  soccer_uefa_europa_league: '3',
  soccer_usa_mls: '253',
  soccer_mexico_ligamx: '262',
  soccer_brazil_campeonato: '71',
  soccer_argentina_primera_division: '128',
  soccer_conmebol_copa_libertadores: '13',
  soccer_conmebol_copa_sudamericana: '11',
};

const TEAM_MERGE_SIMILARITY = 0.9;

@Injectable()
export class EntityResolverService {
  private readonly logger = new Logger(EntityResolverService.name);
  private readonly sportCache = new Map<SportKey, string>();

  constructor(private readonly prisma: PrismaService, @Inject(APP_ENV) private readonly env: AppEnv) {}

  async findMapped(provider: DataProvider, entityType: EntityType, externalId: string): Promise<string | null> {
    const row = await this.prisma.providerEntityMap.findUnique({
      where: { provider_entityType_externalId: { provider, entityType, externalId } },
      select: { internalId: true },
    });
    return row?.internalId ?? null;
  }

  /** Crea el mapeo; si ya existe apuntando a otra entidad se conserva el existente (no se sobrescribe en silencio). */
  async link(provider: DataProvider, entityType: EntityType, externalId: string, internalId: string, metadata: Prisma.InputJsonValue = {}): Promise<string> {
    try {
      await this.prisma.providerEntityMap.create({ data: { provider, entityType, externalId, internalId, metadata } });
      return internalId;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const existing = await this.findMapped(provider, entityType, externalId);
        if (existing && existing !== internalId) {
          this.logger.warn(`Conflicto de mapeo ${provider}/${entityType}/${externalId}: se conserva ${existing}`);
        }
        return existing ?? internalId;
      }
      throw e;
    }
  }

  async sportId(key: SportKey): Promise<string> {
    const cached = this.sportCache.get(key);
    if (cached) return cached;
    const sport = await this.prisma.sport.upsert({
      where: { key },
      create: { key, name: SPORT_NAMES[key], isIndividual: key === 'TENNIS' || key === 'MMA' },
      update: {},
    });
    this.sportCache.set(key, sport.id);
    return sport.id;
  }

  private async countryId(country: NormalizedLeague['country']): Promise<string | null> {
    if (!country) return null;
    const code = (country.code ?? (country.name.toLowerCase() === 'world' ? 'WORLD' : slugify(country.name).toUpperCase())).slice(0, 32);
    const row = await this.prisma.country.upsert({
      where: { code },
      create: { code, name: country.name, flagUrl: country.flagUrl ?? null },
      update: { flagUrl: country.flagUrl ?? undefined },
    });
    return row.id;
  }

  async resolveLeague(league: NormalizedLeague): Promise<string> {
    const mapped = await this.findMapped(league.ref.provider, 'LEAGUE', league.ref.externalId);
    const sportId = await this.sportId(league.sport);
    const countryId = await this.countryId(league.country);
    const seasonLabel = league.season?.label ?? '';
    if (mapped) {
      await this.prisma.league.update({
        where: { id: mapped },
        data: {
          logoUrl: league.logoUrl ?? undefined,
          countryId: countryId ?? undefined,
          type: league.type ?? undefined,
          ...(seasonLabel ? { season: seasonLabel } : {}),
        },
      });
      if (league.season) await this.upsertSeason(mapped, league.season);
      return mapped;
    }
    // Una competición de otro proveedor puede ser equivalente a una de API-Football ya mapeada.
    if (league.ref.provider === 'THE_ODDS_API') {
      const afId = ODDS_KEY_TO_API_FOOTBALL_LEAGUE[league.ref.externalId];
      const equivalent = afId ? await this.findMapped('API_FOOTBALL', 'LEAGUE', afId) : null;
      if (equivalent) return this.link(league.ref.provider, 'LEAGUE', league.ref.externalId, equivalent, { name: league.name });
    }
    const slugBase = slugify(`${league.country?.name ?? league.sport} ${league.name}`);
    const created = await this.prisma.league.upsert({
      where: { sportId_name_season: { sportId, name: league.name, season: seasonLabel } },
      create: {
        sportId,
        name: league.name,
        season: seasonLabel,
        country: league.country?.name ?? null,
        countryId,
        type: league.type ?? null,
        logoUrl: league.logoUrl ?? null,
        slug: await this.uniqueSlug('league', slugBase),
        isTracked: this.env.TRACKED_LEAGUES.includes(league.ref.externalId),
      },
      update: {},
    });
    entitiesNormalized.inc({ entity: 'league', action: 'created' });
    if (league.season) await this.upsertSeason(created.id, league.season);
    return this.link(league.ref.provider, 'LEAGUE', league.ref.externalId, created.id, { name: league.name });
  }

  private async upsertSeason(leagueId: string, season: NonNullable<NormalizedLeague['season']>) {
    await this.prisma.season.upsert({
      where: { leagueId_label: { leagueId, label: season.label } },
      create: { leagueId, label: season.label, year: season.year ?? null, startDate: season.start ?? null, endDate: season.end ?? null, isCurrent: !!season.current },
      update: { isCurrent: season.current ?? undefined, startDate: season.start ?? undefined, endDate: season.end ?? undefined },
    });
  }

  private async uniqueSlug(kind: 'league' | 'team' | 'fixture', base: string): Promise<string> {
    const clean = base.slice(0, 80) || kind;
    for (let i = 0; i < 50; i++) {
      const candidate = i === 0 ? clean : `${clean}-${i + 1}`;
      const exists =
        kind === 'league'
          ? await this.prisma.league.findUnique({ where: { slug: candidate }, select: { id: true } })
          : kind === 'team'
            ? await this.prisma.team.findUnique({ where: { slug: candidate }, select: { id: true } })
            : await this.prisma.fixture.findUnique({ where: { slug: candidate }, select: { id: true } });
      if (!exists) return candidate;
    }
    return `${clean}-${Date.now()}`;
  }

  /**
   * Resuelve un equipo. Orden: mapeo exacto → equipo existente muy similar en el
   * mismo deporte sin mapeo de este proveedor → nuevo registro.
   */
  async resolveTeam(team: NormalizedTeam, leagueId?: string | null): Promise<string> {
    const mapped = await this.findMapped(team.ref.provider, 'TEAM', team.ref.externalId);
    if (mapped) {
      await this.prisma.team.update({
        where: { id: mapped },
        data: { logoUrl: team.logoUrl ?? undefined, venueName: team.venueName ?? undefined, shortName: team.shortName ?? undefined },
      });
      return mapped;
    }
    const sportId = await this.sportId(team.sport);
    const similar = await this.findSimilarTeam(sportId, team.name, team.ref.provider, leagueId);
    if (similar) {
      entitiesNormalized.inc({ entity: 'team', action: 'matched' });
      return this.link(team.ref.provider, 'TEAM', team.ref.externalId, similar, { name: team.name });
    }
    const created = await this.prisma.team.create({
      data: {
        sportId,
        name: team.name,
        normalizedName: normalizeName(team.name),
        slug: await this.uniqueSlug('team', slugify(team.name)),
        shortName: team.shortName ?? null,
        country: team.country ?? null,
        logoUrl: team.logoUrl ?? null,
        venueName: team.venueName ?? null,
      },
    });
    entitiesNormalized.inc({ entity: 'team', action: 'created' });
    return this.link(team.ref.provider, 'TEAM', team.ref.externalId, created.id, { name: team.name });
  }

  private async findSimilarTeam(sportId: string, name: string, provider: DataProvider, leagueId?: string | null): Promise<string | null> {
    const normalized = normalizeName(name);
    const firstToken = normalized.split(' ')[0] ?? normalized;
    const where: Prisma.TeamWhereInput = {
      sportId,
      normalizedName: { contains: firstToken },
      ...(leagueId ? { OR: [{ homeFixtures: { some: { leagueId } } }, { awayFixtures: { some: { leagueId } } }] } : {}),
    };
    const candidates = await this.prisma.team.findMany({ where, take: 25, select: { id: true, name: true } });
    let best: { id: string; score: number } | null = null;
    for (const c of candidates) {
      const s = nameSimilarity(name, c.name);
      if (s >= TEAM_MERGE_SIMILARITY && (!best || s > best.score)) best = { id: c.id, score: s };
    }
    if (!best) return null;
    // No fusionar con un equipo que ya tiene otro ID de este mismo proveedor (serían equipos distintos).
    const conflicting = await this.prisma.providerEntityMap.findFirst({ where: { provider, entityType: 'TEAM', internalId: best.id } });
    return conflicting ? null : best.id;
  }

  private async candidates(sportId: string, sportKey: SportKey, kickoff: Date, toleranceMinutes: number, leagueId?: string | null): Promise<MatchCandidate[]> {
    const windowMs = Math.max(toleranceMinutes, 30 * 24 * 60) * 60_000;
    const rows = await this.prisma.fixture.findMany({
      where: {
        sportId,
        ...(leagueId ? { leagueId } : {}),
        OR: [
          { kickoff: { gte: new Date(kickoff.getTime() - toleranceMinutes * 60_000), lte: new Date(kickoff.getTime() + toleranceMinutes * 60_000) } },
          { status: 'POSTPONED', kickoff: { gte: new Date(kickoff.getTime() - windowMs), lte: new Date(kickoff.getTime() + windowMs) } },
          { originalKickoff: { gte: new Date(kickoff.getTime() - toleranceMinutes * 60_000), lte: new Date(kickoff.getTime() + toleranceMinutes * 60_000) } },
        ],
        primaryProvider: { not: null },
      },
      include: { homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } },
      take: 200,
    });
    return rows.map((r) => ({
      id: r.id,
      sportKey,
      leagueId: r.leagueId,
      homeTeamName: r.homeTeam.name,
      awayTeamName: r.awayTeam.name,
      kickoff: r.kickoff,
      originalKickoff: r.originalKickoff,
      venue: r.venue,
      status: r.status,
    }));
  }

  /**
   * Upsert idempotente de un partido normalizado. Deduplica por: ID externo
   * mapeado → mismos equipos canónicos en ventana horaria → similitud de
   * equipos + competición + horario (incluye reprogramaciones).
   */
  async upsertFixture(n: NormalizedFixture): Promise<{ id: string; action: UpsertAction }> {
    const leagueId = await this.resolveLeague(n.league);
    const homeTeamId = await this.resolveTeam(n.home, leagueId);
    const awayTeamId = await this.resolveTeam(n.away, leagueId);
    const sportId = await this.sportId(n.sport);
    const seasonId = n.league.season
      ? (await this.prisma.season.findUnique({ where: { leagueId_label: { leagueId, label: n.league.season.label } }, select: { id: true } }))?.id
      : undefined;

    let fixtureId = await this.findMapped(n.ref.provider, 'FIXTURE', n.ref.externalId);
    let action: UpsertAction = 'updated';
    const tol = this.env.FIXTURE_MATCH_TOLERANCE_MINUTES;

    if (!fixtureId) {
      const sameTeams = await this.prisma.fixture.findFirst({
        where: {
          homeTeamId,
          awayTeamId,
          OR: [
            { kickoff: { gte: new Date(n.kickoff.getTime() - tol * 60_000), lte: new Date(n.kickoff.getTime() + tol * 60_000) } },
            { status: 'POSTPONED', kickoff: { gte: new Date(n.kickoff.getTime() - 30 * 86_400_000), lte: new Date(n.kickoff.getTime() + 30 * 86_400_000) } },
          ],
        },
        select: { id: true },
      });
      const match =
        sameTeams?.id ??
        bestMatch(
          { sportKey: n.sport, leagueId, homeTeamName: n.home.name, awayTeamName: n.away.name, kickoff: n.kickoff, venue: n.venue },
          await this.candidates(sportId, n.sport, n.kickoff, tol, leagueId),
          tol,
        )?.candidate.id;
      if (match) {
        fixtureId = await this.link(n.ref.provider, 'FIXTURE', n.ref.externalId, match);
        action = 'matched';
      }
    }

    if (!fixtureId) {
      const created = await this.prisma.fixture.create({
        data: {
          sportId,
          leagueId,
          seasonId,
          homeTeamId,
          awayTeamId,
          kickoff: n.kickoff,
          status: n.status,
          statusDetail: n.statusDetail ?? null,
          elapsedMinutes: n.elapsedMinutes ?? null,
          period: n.period ?? null,
          venue: n.venue ?? null,
          round: n.round ?? null,
          homeScore: n.homeScore ?? null,
          awayScore: n.awayScore ?? null,
          htHomeScore: n.htHomeScore ?? null,
          htAwayScore: n.htAwayScore ?? null,
          lastScoreUpdateAt: n.homeScore != null ? (n.sourceTimestamp ?? new Date()) : null,
          primaryProvider: n.ref.provider,
          slug: await this.uniqueSlug('fixture', slugify(`${n.home.name} vs ${n.away.name} ${n.kickoff.toISOString().slice(0, 10)}`)),
          externalIds: { [n.ref.provider]: n.ref.externalId },
        },
      });
      await this.link(n.ref.provider, 'FIXTURE', n.ref.externalId, created.id);
      entitiesNormalized.inc({ entity: 'fixture', action: 'created' });
      return { id: created.id, action: 'created' };
    }

    const existing = await this.prisma.fixture.findUniqueOrThrow({ where: { id: fixtureId } });
    const data = this.fixtureChanges(existing, n);
    if (Object.keys(data).length === 0) {
      entitiesNormalized.inc({ entity: 'fixture', action: action === 'matched' ? 'matched' : 'unchanged' });
      return { id: fixtureId, action: action === 'matched' ? 'matched' : 'unchanged' };
    }
    await this.prisma.fixture.update({ where: { id: fixtureId }, data });
    entitiesNormalized.inc({ entity: 'fixture', action });
    return { id: fixtureId, action };
  }

  /** Solo los campos que cambian. El proveedor primario manda sobre horario y estado. */
  fixtureChanges(existing: Fixture, n: NormalizedFixture): Prisma.FixtureUpdateInput {
    const data: Prisma.FixtureUpdateInput = {};
    const authoritative = !existing.primaryProvider || existing.primaryProvider === n.ref.provider || n.ref.provider === 'API_FOOTBALL';
    if (authoritative && existing.kickoff.getTime() !== n.kickoff.getTime()) {
      data.kickoff = n.kickoff;
      data.originalKickoff = existing.originalKickoff ?? existing.kickoff;
      data.kickoffChangedAt = new Date();
    }
    if (authoritative && existing.status !== n.status) data.status = n.status;
    const set = <K extends keyof Fixture>(key: K, value: Fixture[K] | null | undefined) => {
      if (value !== undefined && value !== null && existing[key] !== value) (data as Record<string, unknown>)[key] = value;
    };
    set('statusDetail', n.statusDetail);
    set('elapsedMinutes', n.elapsedMinutes);
    set('period', n.period);
    set('venue', n.venue);
    set('round', n.round);
    set('htHomeScore', n.htHomeScore);
    set('htAwayScore', n.htAwayScore);
    if (n.homeScore != null && n.awayScore != null && (existing.homeScore !== n.homeScore || existing.awayScore !== n.awayScore)) {
      data.homeScore = n.homeScore;
      data.awayScore = n.awayScore;
      data.lastScoreUpdateAt = n.sourceTimestamp ?? new Date();
    }
    if (n.ref.provider === 'API_FOOTBALL' && existing.primaryProvider !== 'API_FOOTBALL') data.primaryProvider = 'API_FOOTBALL';
    const ids = (existing.externalIds as Record<string, string>) ?? {};
    if (ids[n.ref.provider] !== n.ref.externalId) data.externalIds = { ...ids, [n.ref.provider]: n.ref.externalId };
    return data;
  }

  /**
   * Asocia un evento de cuotas a un partido canónico; si no existe, lo crea con
   * los datos que el propio proveedor de cuotas entrega (equipos y horario
   * reales). Devuelve null si el emparejamiento es ambiguo.
   */
  async resolveOddsEvent(e: NormalizedOddsEvent): Promise<string | null> {
    const mapped = await this.findMapped(e.ref.provider, 'FIXTURE', e.ref.externalId);
    if (mapped) return mapped;
    if (e.fixtureRef) {
      const direct = await this.findMapped(e.fixtureRef.provider, 'FIXTURE', e.fixtureRef.externalId);
      if (direct) return this.link(e.ref.provider, 'FIXTURE', e.ref.externalId, direct);
      return null;
    }
    const sportId = await this.sportId(e.sport);
    const leagueId = await this.resolveLeague({
      ref: { provider: e.ref.provider, externalId: e.competitionKey },
      sport: e.sport,
      name: e.competitionName ?? e.competitionKey,
      country: null,
    });
    const tol = this.env.FIXTURE_MATCH_TOLERANCE_MINUTES;
    const match = bestMatch(
      { sportKey: e.sport, leagueId, homeTeamName: e.homeTeamName, awayTeamName: e.awayTeamName, kickoff: e.kickoff },
      await this.candidates(sportId, e.sport, e.kickoff, tol, leagueId),
      tol,
    ) ?? bestMatch(
      { sportKey: e.sport, homeTeamName: e.homeTeamName, awayTeamName: e.awayTeamName, kickoff: e.kickoff },
      await this.candidates(sportId, e.sport, e.kickoff, tol),
      tol,
    );
    if (match) return this.link(e.ref.provider, 'FIXTURE', e.ref.externalId, match.candidate.id, { reasons: match.reasons });

    const teamRef = (name: string): ExternalRef => ({ provider: e.ref.provider, externalId: `${e.competitionKey}:${normalizeName(name)}` });
    const created = await this.upsertFixture({
      ref: e.ref,
      sport: e.sport,
      league: { ref: { provider: e.ref.provider, externalId: e.competitionKey }, sport: e.sport, name: e.competitionName ?? e.competitionKey, country: null },
      home: { ref: teamRef(e.homeTeamName), sport: e.sport, name: e.homeTeamName },
      away: { ref: teamRef(e.awayTeamName), sport: e.sport, name: e.awayTeamName },
      kickoff: e.kickoff,
      status: e.kickoff.getTime() <= Date.now() ? 'LIVE' : 'SCHEDULED',
    });
    return created.id;
  }
}
