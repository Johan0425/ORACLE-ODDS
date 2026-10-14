import type { BrowserContext, Page } from '@playwright/test';

/** Simula a un visitante adulto que ya respondió al age gate y a las cookies. */
export async function asAdult(context: BrowserContext) {
  await context.addCookies([{ name: 'oo_age_ok', value: '1', url: 'http://localhost:3200' }]);
  await context.addInitScript(() => {
    try {
      localStorage.setItem('oo_cookie_choice', 'essential');
    } catch {
      /* noop */
    }
  });
}

export async function firstScheduledFixture(page: Page): Promise<string> {
  const res = await page.request.get('http://localhost:3201/api/v1/fixtures?date=week&status=SCHEDULED');
  const body = await res.json();
  return body.data.items[0].id as string;
}
