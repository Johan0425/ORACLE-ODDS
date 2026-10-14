import type { LoggerService } from '@nestjs/common';
import { currentContext } from './request-context';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

/** Patrones que nunca deben llegar a un log: claves de API en URLs y cabeceras de autenticación. */
const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/(apiKey|api_key|apikey|key|token|secret)=([^&\s"]+)/gi, '$1=***'],
  [/(x-apisports-key|authorization|x-admin-secret)["']?\s*[:=]\s*["']?[^"',\s}]+/gi, '$1: ***'],
  [/bot\d+:[A-Za-z0-9_-]+/g, 'bot***'],
];

export function redact(value: string): string {
  return SECRET_PATTERNS.reduce((acc, [re, rep]) => acc.replace(re, rep), value);
}

/**
 * Logger JSON de una línea por evento, con correlation ID del contexto activo.
 * Redacta secretos conocidos antes de escribir.
 */
export class JsonLogger implements LoggerService {
  constructor(private readonly minLevel: Level = 'info', private readonly service = 'oracle-odds-api') {}

  private write(level: Level, message: unknown, context?: string, extra?: Record<string, unknown>) {
    if (LEVELS[level] < LEVELS[this.minLevel]) return;
    const ctx = currentContext();
    const entry: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level,
      service: this.service,
      context,
      msg: typeof message === 'string' ? message : message instanceof Error ? message.message : JSON.stringify(message),
      correlationId: ctx?.correlationId,
      job: ctx?.jobName,
      provider: ctx?.provider,
      ...extra,
    };
    const line = redact(JSON.stringify(entry));
    (level === 'error' ? process.stderr : process.stdout).write(line + '\n');
  }

  log(message: unknown, context?: string) {
    this.write('info', message, context);
  }
  error(message: unknown, trace?: string, context?: string) {
    this.write('error', message, context, trace ? { trace: redact(String(trace)).split('\n').slice(0, 8).join('\n') } : undefined);
  }
  warn(message: unknown, context?: string) {
    this.write('warn', message, context);
  }
  debug(message: unknown, context?: string) {
    this.write('debug', message, context);
  }
  verbose(message: unknown, context?: string) {
    this.write('debug', message, context);
  }

  /** Evento estructurado con campos adicionales. */
  event(level: Level, msg: string, fields: Record<string, unknown>, context?: string) {
    this.write(level, msg, context, fields);
  }
}

export const appLogger = new JsonLogger((process.env.LOG_LEVEL as Level) ?? 'info');
