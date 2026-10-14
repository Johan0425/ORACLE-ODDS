import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { MARKET_DEFINITIONS, SELECTION_LABELS_ES, isMarketKey } from '@oracle-odds/probability-engine';
import { PrismaService } from '../../prisma/prisma.service';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env';
import { publicCode } from '../../common/hashing';
import { SponsorService } from '../affiliate/sponsor.service';

export const SHARE_FORMATS = ['square', 'story', 'landscape', 'whatsapp', 'telegram'] as const;
export type ShareFormat = (typeof SHARE_FORMATS)[number];
export const SHARE_ENTITY_TYPES = ['value_bet', 'combination', 'fixture', 'challenge'] as const;

export interface SharePick {
  homeTeam: string;
  awayTeam: string;
  league: string;
  kickoff: string;
  market: string;
  selection: string;
  odds: number | null;
  bookmaker: string | null;
  probability: number | null;
  fairOdds: number | null;
  edge: number | null;
  expectedValue: number | null;
  confidence: string | null;
}

const SHARE_TTL_DAYS = 30;

export function selectionLabel(marketKey: string, selectionKey: string, line: number | null, home: string, away: string): string {
  if (selectionKey === 'HOME') return line != null ? `${home} ${line > 0 ? '+' : ''}${line}` : home;
  if (selectionKey === 'AWAY') return line != null ? `${away} ${-line > 0 ? '+' : ''}${-line}` : away;
  if (selectionKey === 'OVER' || selectionKey === 'UNDER') return `${SELECTION_LABELS_ES[selectionKey]} ${line}`;
  if (/^\d+-\d+$/.test(selectionKey)) return selectionKey;
  return SELECTION_LABELS_ES[selectionKey] ?? selectionKey;
}

export function marketLabel(marketKey: string): string {
  return isMarketKey(marketKey) ? MARKET_DEFINITIONS[marketKey].displayName : marketKey;
}

@Injectable()
export class ShareService {
  constructor(private readonly prisma: PrismaService, private readonly sponsor: SponsorService, @Inject(APP_ENV) private readonly env: AppEnv) {}

  private async valueBetPick(id: string): Promise<SharePick> {
    const vb = await this.prisma.valueBet.findUnique({ where: { id }, include: { fixture: { include: { homeTeam: true, awayTeam: true, league: true } } } });
    if (!vb) throw new NotFoundException('Oportunidad no encontrada');
    // Cuota actualizada antes de compartir: mejor precio vigente de casas autorizadas.
    const best = await this.prisma.oddsQuote.findFirst({
      where: { fixtureId: vb.fixtureId, marketKey: vb.marketKey, selectionKey: vb.selectionKey, lineKey: vb.lineKey, isLive: false, isSuspended: false, bookmaker: { isAuthorized: true, isActive: true } },
      orderBy: { currentPrice: 'desc' },
      include: { bookmaker: true },
    });
    const price = best?.currentPrice ?? vb.price;
    return {
      homeTeam: vb.fixture.homeTeam.name,
      awayTeam: vb.fixture.awayTeam.name,
      league: vb.fixture.league.name,
      kickoff: vb.fixture.kickoff.toISOString(),
      market: marketLabel(vb.marketKey),
      selection: selectionLabel(vb.marketKey, vb.selectionKey, vb.line, vb.fixture.homeTeam.name, vb.fixture.awayTeam.name),
      odds: price,
      bookmaker: best?.bookmaker.name ?? vb.bookmakerSlug,
      probability: vb.probability,
      fairOdds: vb.fairOdds,
      edge: vb.probability - vb.marketProbability,
      expectedValue: vb.probability * price - 1,
      confidence: vb.confidence >= 0.7 ? 'Alta' : vb.confidence >= 0.45 ? 'Media' : 'Baja',
    };
  }

  private async fixturePick(id: string): Promise<SharePick> {
    const f = await this.prisma.fixture.findFirst({ where: { id, primaryProvider: { not: null } }, include: { homeTeam: true, awayTeam: true, league: true } });
    if (!f) throw new NotFoundException('Partido no encontrado');
    return { homeTeam: f.homeTeam.name, awayTeam: f.awayTeam.name, league: f.league.name, kickoff: f.kickoff.toISOString(), market: 'Análisis del partido', selection: '', odds: null, bookmaker: null, probability: null, fairOdds: null, edge: null, expectedValue: null, confidence: null };
  }

  async create(input: { entityType: string; entityId: string; format: ShareFormat; template?: string; showSponsor?: boolean }) {
    if (!(SHARE_ENTITY_TYPES as readonly string[]).includes(input.entityType)) throw new BadRequestException('entityType inválido');
    if (!(SHARE_FORMATS as readonly string[]).includes(input.format)) throw new BadRequestException('format inválido');
    let payload: Record<string, unknown>;
    switch (input.entityType) {
      case 'value_bet':
        payload = { picks: [await this.valueBetPick(input.entityId)] };
        break;
      case 'fixture':
        payload = { picks: [await this.fixturePick(input.entityId)] };
        break;
      case 'combination': {
        const combo = await this.prisma.combination.findUnique({ where: { publicCode: input.entityId } });
        if (!combo) throw new NotFoundException('Combinada no encontrada');
        payload = { combination: { code: combo.publicCode, legs: combo.legs, combinedOdds: combo.combinedOdds, adjustedProbability: combo.adjustedProbability, expectedValue: combo.expectedValue, riskLevel: combo.riskLevel, systemType: combo.systemType } };
        break;
      }
      default: {
        const ch = await this.prisma.anonymousChallenge.findUnique({ where: { publicCode: input.entityId } });
        if (!ch) throw new NotFoundException('Reto no encontrado');
        payload = { challenge: { code: ch.publicCode, title: ch.title, endsAt: ch.endsAt } };
      }
    }
    const sponsor = this.sponsor.publicConfig('share_footer');
    const showSponsor = !!input.showSponsor && sponsor.enabled && sponsor.showOnShares;
    const code = publicCode(7);
    const asset = await this.prisma.shareAsset.create({
      data: {
        entityType: input.entityType,
        entityId: input.entityId,
        template: input.template ?? 'default',
        format: input.format,
        publicCode: code,
        showSponsor,
        storageUrl: this.env.PUBLIC_WEB_URL ? `${this.env.PUBLIC_WEB_URL}/s/${code}/image?format=${input.format}` : null,
        payload: { ...payload, generatedAt: new Date().toISOString() } as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + SHARE_TTL_DAYS * 86_400_000),
      },
    });
    return this.present(asset);
  }

  async get(code: string) {
    const asset = await this.prisma.shareAsset.findUnique({ where: { publicCode: code.toUpperCase() } });
    if (!asset || asset.expiresAt < new Date()) throw new NotFoundException('Enlace no encontrado o vencido');
    return this.present(asset);
  }

  private present(asset: { publicCode: string; entityType: string; entityId: string; format: string; template: string; payload: Prisma.JsonValue; showSponsor: boolean; createdAt: Date; expiresAt: Date; storageUrl: string | null }) {
    const shortUrl = this.env.PUBLIC_WEB_URL ? `${this.env.PUBLIC_WEB_URL}/s/${asset.publicCode}` : `/s/${asset.publicCode}`;
    const payload = asset.payload as unknown as { picks?: SharePick[]; combination?: Record<string, unknown>; challenge?: Record<string, unknown>; generatedAt: string };
    return {
      publicCode: asset.publicCode,
      entityType: asset.entityType,
      entityId: asset.entityId,
      format: asset.format,
      template: asset.template,
      payload,
      showSponsor: asset.showSponsor,
      sponsor: asset.showSponsor ? { name: 'BetSantander', label: 'En colaboración con BetSantander' } : null,
      shortUrl,
      imageUrl: asset.storageUrl,
      shareText: this.shareText(payload, shortUrl, asset.showSponsor),
      createdAt: asset.createdAt,
      expiresAt: asset.expiresAt,
    };
  }

  /** Plantilla lista para WhatsApp/Telegram, con avisos obligatorios. */
  shareText(payload: { picks?: SharePick[]; combination?: Record<string, unknown>; challenge?: Record<string, unknown> }, shortUrl: string, sponsor: boolean): string {
    const tz = this.env.DEFAULT_TIMEZONE;
    const fmt = (iso: string) => new Intl.DateTimeFormat(this.env.DEFAULT_LOCALE, { dateStyle: 'medium', timeStyle: 'short', timeZone: tz }).format(new Date(iso));
    const pct = (p: number | null) => (p == null ? '—' : `${(p * 100).toFixed(1)}%`);
    const footer = [
      '⚠️ Cuotas sujetas a cambios',
      '📉 Pronóstico estadístico, no garantía de resultado',
      '🔞 Solo mayores de 18 años. Juega responsablemente.',
      ...(sponsor ? ['🤝 En colaboración con BetSantander (enlace patrocinado)'] : []),
      `🔗 ${shortUrl}`,
    ];
    if (payload.picks?.[0]) {
      const p = payload.picks[0];
      const value = p.edge != null ? `edge ${(p.edge * 100).toFixed(1)} pts · EV ${pct(p.expectedValue)}` : '—';
      return [
        `⚽ ${p.homeTeam} vs ${p.awayTeam}`,
        `🏆 ${p.league}`,
        `🕐 ${fmt(p.kickoff)} (${tz})`,
        ...(p.selection
          ? [`📊 Mercado: ${p.market}`, `🎯 Selección: ${p.selection}`, `💰 Mejor cuota: ${p.odds?.toFixed(2) ?? '—'} en ${p.bookmaker ?? '—'}`, `🧠 Probabilidad estimada: ${pct(p.probability)}`, `📈 Valor estimado: ${value}`]
          : []),
        ...footer,
      ].join('\n');
    }
    if (payload.combination) {
      const c = payload.combination as { legs: Array<{ label?: string; odds: number }>; combinedOdds: number; adjustedProbability: number | null; riskLevel: string };
      return [
        `🧩 Combinada (${c.legs.length} selecciones) — simulación`,
        ...c.legs.map((l) => `• ${l.label ?? 'Selección'} @ ${l.odds.toFixed(2)}`),
        `💰 Cuota total: ${c.combinedOdds.toFixed(2)}`,
        `🧠 Probabilidad estimada: ${pct(c.adjustedProbability)}`,
        `⚖️ Riesgo: ${c.riskLevel}`,
        ...footer,
      ].join('\n');
    }
    const ch = payload.challenge as { title: string } | undefined;
    return [`🏅 Reto: ${ch?.title ?? ''}`, 'Participa gratis, sin dinero real.', ...footer].join('\n');
  }
}
