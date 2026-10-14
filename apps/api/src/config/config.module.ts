import { Global, Module } from '@nestjs/common';
import { env } from './env';

export const APP_ENV = Symbol('APP_ENV');

/** Expone la configuración validada como provider inyectable (`@Inject(APP_ENV)`). */
@Global()
@Module({
  providers: [{ provide: APP_ENV, useFactory: () => env() }],
  exports: [APP_ENV],
})
export class AppConfigModule {}
