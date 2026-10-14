import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface RequestContext {
  correlationId: string;
  jobName?: string;
  provider?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(context: Partial<RequestContext>, fn: () => T): T {
  return storage.run({ correlationId: context.correlationId ?? randomUUID(), ...context }, fn);
}

export function currentContext(): RequestContext | undefined {
  return storage.getStore();
}

export function correlationId(): string | undefined {
  return storage.getStore()?.correlationId;
}
