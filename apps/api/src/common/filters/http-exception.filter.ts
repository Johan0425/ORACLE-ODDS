import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { ThrottlerException } from '@nestjs/throttler';
import { appLogger, redact } from '../logger';
import { correlationId } from '../request-context';

/**
 * Envuelve todo error en `{ error: { code, message, requestId } }`. Los errores
 * no controlados se registran (redactados) pero nunca se devuelven al cliente:
 * no se filtran payloads de proveedores, consultas ni secretos.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const requestId = correlationId();
    if (exception instanceof ThrottlerException) {
      response.status(429).json({ error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiadas solicitudes. Intenta de nuevo en un momento.', requestId } });
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message = typeof body === 'string' ? body : ((body as { message?: string | string[] }).message ?? exception.message);
      const code = (typeof body === 'object' && (body as { code?: string }).code) || HttpStatus[status] || 'ERROR';
      response.status(status).json({ error: { code, message, requestId } });
      return;
    }
    const err = exception as Error;
    appLogger.error(redact(err?.message ?? String(exception)), err?.stack, 'UnhandledException');
    response.status(500).json({ error: { code: 'INTERNAL_SERVER_ERROR', message: 'Error interno del servidor', requestId } });
  }
}
