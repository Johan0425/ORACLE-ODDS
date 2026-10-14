import { parseEnv, EnvValidationError } from '../../src/config/env';
import { nameSimilarity, normalizeName, slugify } from '../../src/modules/normalization/names';
import { bestMatch, scoreCandidate, type MatchCandidate } from '../../src/modules/normalization/fixture-matching';
import { moderateAlias, moderateText, sanitizePlainText } from '../../src/modules/challenges/moderation';
import { scoreEntry } from '../../src/modules/challenges/scoring';
import { redact } from '../../src/common/logger';
import { dailyAnonymousHash, hashSecret, publicCode, stableHash, verifySecret } from '../../src/common/hashing';
import { dateRange, startOfLocalDay } from '../../src/modules/fixtures/fixtures.service';
import { SponsorService } from '../../src/modules/affiliate/sponsor.service';
import { selectionLabel } from '../../src/modules/share/share.service';
import { corsOrigin } from '../../src/common/configure-app';

const env = (extra: Record<string, string> = {}) => parseEnv({ DATABASE_URL: 'postgresql://x', ...extra });

describe('validación de entorno', () => {
  it('acepta un entorno mínimo de desarrollo sin claves', () => {
    const e = env();
    expect(e.DEFAULT_TIMEZONE).toBe('America/Bogota');
    expect(e.ALLOWED_BOOKMAKERS).toEqual([]);
    expect(e.PUBLISH_REQUIRE_CALIBRATION).toBe(true);
  });

  it('exige secretos y CORS en producción', () => {
    expect(() => env({ NODE_ENV: 'production' })).toThrow(EnvValidationError);
    expect(() =>
      env({ NODE_ENV: 'production', SYNC_ADMIN_SECRET: 'x'.repeat(32), CORS_ORIGIN: 'https://oracle.example', ANON_HASH_SALT: 'y'.repeat(20) }),
    ).not.toThrow();
  });

  it('el worker requiere Redis y los números se validan', () => {
    expect(() => env({ ENABLE_SYNC_WORKER: 'true' })).toThrow(/REDIS_URL/);
    expect(() => env({ VALUE_MIN_EDGE: 'abc' })).toThrow(/número inválido/);
  });
});

describe('normalización de nombres', () => {
  it('quita acentos, sufijos y aplica alias', () => {
    expect(normalizeName('Atlético Gamma FC')).toBe('atletico gamma');
    expect(normalizeName('Man Utd')).toBe('manchester united');
    expect(slugify('Club Alfa vs Sporting Zeta 2026-10-16')).toBe('club-alfa-vs-sporting-zeta-2026-10-16');
  });

  it('similaridad alta para variantes y baja para equipos distintos', () => {
    expect(nameSimilarity('Club Alfa FC', 'Club Alfa')).toBe(1);
    expect(nameSimilarity('Atletico Gamma', 'Atlético Gamma')).toBe(1);
    expect(nameSimilarity('Manchester United', 'Manchester City')).toBeLessThan(0.72);
  });
});

describe('deduplicación de partidos', () => {
  const base: MatchCandidate = { id: 'f1', sportKey: 'FOOTBALL', leagueId: 'l1', homeTeamName: 'Club Alfa', awayTeamName: 'Sporting Zeta', kickoff: new Date('2026-10-16T19:00:00Z'), status: 'SCHEDULED' };

  it('empareja con tolerancia horaria y variantes de nombre', () => {
    const r = scoreCandidate({ sportKey: 'FOOTBALL', leagueId: 'l1', homeTeamName: 'Club Alfa FC', awayTeamName: 'Sporting Zeta', kickoff: new Date('2026-10-16T19:30:00Z') }, base, 90);
    expect(r?.score).toBeGreaterThan(0.9);
  });

  it('rechaza otro deporte, otra liga, roles invertidos o fuera de la ventana', () => {
    const q = { sportKey: 'FOOTBALL', leagueId: 'l1', homeTeamName: 'Club Alfa', awayTeamName: 'Sporting Zeta', kickoff: base.kickoff };
    expect(scoreCandidate({ ...q, sportKey: 'BASKETBALL' }, base, 90)).toBeNull();
    expect(scoreCandidate({ ...q, leagueId: 'l2' }, base, 90)).toBeNull();
    expect(scoreCandidate({ ...q, homeTeamName: 'Sporting Zeta', awayTeamName: 'Club Alfa' }, base, 90)).toBeNull();
    expect(scoreCandidate({ ...q, kickoff: new Date('2026-10-18T19:00:00Z') }, base, 90)).toBeNull();
  });

  it('absorbe reprogramaciones (horario original) y aplazamientos', () => {
    const moved = { ...base, kickoff: new Date('2026-10-20T19:00:00Z'), originalKickoff: base.kickoff };
    expect(scoreCandidate({ sportKey: 'FOOTBALL', homeTeamName: 'Club Alfa', awayTeamName: 'Sporting Zeta', kickoff: base.kickoff }, moved, 90)).not.toBeNull();
    const postponed = { ...base, status: 'POSTPONED' };
    expect(scoreCandidate({ sportKey: 'FOOTBALL', homeTeamName: 'Club Alfa', awayTeamName: 'Sporting Zeta', kickoff: new Date('2026-11-01T19:00:00Z') }, postponed, 90)).not.toBeNull();
  });

  it('no empareja si hay ambigüedad', () => {
    const twin = { ...base, id: 'f2' };
    expect(bestMatch({ sportKey: 'FOOTBALL', homeTeamName: 'Club Alfa', awayTeamName: 'Sporting Zeta', kickoff: base.kickoff }, [base, twin], 90)).toBeNull();
  });
});

describe('moderación y puntuación de retos', () => {
  it('modera alias y textos', () => {
    expect(moderateAlias('Tigre_23').ok).toBe(true);
    expect(moderateAlias('ab').ok).toBe(false);
    expect(moderateAlias('mierda99').ok).toBe(false);
    expect(moderateAlias('Pepe3001234567').ok).toBe(false);
    expect(moderateText('Premio en dinero para el ganador').ok).toBe(false);
    expect(moderateText('Visita www.spam.com').ok).toBe(false);
    expect(moderateText('Reto entre amigos de la oficina').ok).toBe(true);
    expect(sanitizePlainText('<b>Hola</b>\u0000 mundo', 50)).toBe('Hola mundo');
  });

  const picks = (outcomes: Array<'WIN' | 'LOSS' | 'PUSH' | null>, odds = 2) =>
    outcomes.map((o, i) => ({ fixtureId: `f${i}`, kickoff: new Date(2026, 0, i + 1), outcome: o, referenceOdds: odds }));

  it('sistemas de puntos', () => {
    expect(scoreEntry('simple', picks(['WIN', 'LOSS', 'WIN', null])).score).toBe(2);
    expect(scoreEntry('weighted', picks(['WIN', 'WIN'], 3.5)).score).toBe(7);
    expect(scoreEntry('virtual_units', picks(['WIN', 'LOSS'], 2.5)).score).toBe(0.5);
    const survivor = scoreEntry('survivor', picks(['WIN', 'LOSS', 'WIN']));
    expect(survivor).toMatchObject({ score: 1, eliminated: true });
    expect(scoreEntry('elimination', picks(['WIN', 'LOSS', 'WIN', 'LOSS', 'WIN'])).score).toBe(2);
  });
});

describe('seguridad y utilidades', () => {
  it('redacta claves en logs', () => {
    expect(redact('GET https://x/v4/odds?apiKey=abc123&regions=eu')).toBe('GET https://x/v4/odds?apiKey=***&regions=eu');
    expect(redact('{"x-apisports-key":"zzz"}')).not.toContain('zzz');
    expect(redact('https://api.telegram.org/bot123:ABC/sendMessage')).not.toContain('123:ABC');
  });

  it('hashes, secretos y códigos', () => {
    expect(verifySecret('s3cret', hashSecret('s3cret'))).toBe(true);
    expect(verifySecret('otro', hashSecret('s3cret'))).toBe(false);
    expect(publicCode(8)).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(stableHash({ b: 1, a: 2 })).toBe(stableHash({ a: 2, b: 1 }));
    const d1 = dailyAnonymousHash(['1.2.3.4', 'ua'], 'salt', new Date('2026-10-14T10:00:00Z'));
    expect(dailyAnonymousHash(['1.2.3.4', 'ua'], 'salt', new Date('2026-10-14T20:00:00Z'))).toBe(d1);
    expect(dailyAnonymousHash(['1.2.3.4', 'ua'], 'salt', new Date('2026-10-15T10:00:00Z'))).not.toBe(d1);
    expect(d1).not.toContain('1.2.3.4');
  });

  it('rangos de fecha en la zona horaria configurada (Bogotá, UTC−5)', () => {
    const start = startOfLocalDay(new Date('2026-10-14T03:00:00Z'), 'America/Bogota');
    expect(start.toISOString()).toBe('2026-10-13T05:00:00.000Z');
    const r = dateRange('tomorrow', 'America/Bogota', new Date('2026-10-14T15:00:00Z'))!;
    expect(r.gte.toISOString()).toBe('2026-10-15T05:00:00.000Z');
    expect(dateRange('nonsense', 'America/Bogota')).toBeUndefined();
  });

  it('CORS por allowlist', () => {
    const check = (origin: string | undefined, e: Parameters<typeof corsOrigin>[0]) => new Promise((resolve) => corsOrigin(e)(origin, (_err, ok) => resolve(ok)));
    return Promise.all([
      expect(check('https://evil.example', { CORS_ORIGIN: ['https://oracle.example'], NODE_ENV: 'production' })).resolves.toBe(false),
      expect(check('https://oracle.example', { CORS_ORIGIN: ['https://oracle.example'], NODE_ENV: 'production' })).resolves.toBe(true),
      expect(check(undefined, { CORS_ORIGIN: [], NODE_ENV: 'production' })).resolves.toBe(true),
    ]);
  });

  it('patrocinio desactivado por defecto y bloqueado en producción sin verificación legal', () => {
    expect(new SponsorService(env()).status().enabled).toBe(false);
    const prod = env({ NODE_ENV: 'production', SYNC_ADMIN_SECRET: 'x'.repeat(32), CORS_ORIGIN: 'https://o.example', ANON_HASH_SALT: 'y'.repeat(20), BET_SANTANDER_ENABLED: 'true', BET_SANTANDER_URL: 'https://www.betsantander.com/' });
    expect(new SponsorService(prod).status()).toMatchObject({ enabled: false, reason: expect.stringMatching(/verificación legal/) });
    const verified = new SponsorService({ ...prod, BET_SANTANDER_VERIFIED_AT: '2026-10-01', BET_SANTANDER_AFFILIATE_ID: 'AFF1' });
    expect(verified.publicConfig('landing').enabled).toBe(true);
    expect(verified.publicConfig('popup').enabled).toBe(false);
    const url = new URL(verified.destinationUrl({ placement: 'landing', clickId: 'c1' })!);
    expect(url.searchParams.get('aff')).toBe('AFF1');
    expect(url.searchParams.get('subid')).toBe('landing');
    expect(url.searchParams.get('clickid')).toBe('c1');
  });

  it('etiquetas de selección legibles', () => {
    expect(selectionLabel('AH', 'AWAY', -0.5, 'A', 'B')).toBe('B +0.5');
    expect(selectionLabel('OU_GOALS', 'OVER', 2.5, 'A', 'B')).toBe('Más de 2.5');
  });
});
