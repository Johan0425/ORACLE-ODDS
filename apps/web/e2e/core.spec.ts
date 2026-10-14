import { expect, test } from '@playwright/test';
import { asAdult, firstScheduledFixture } from './helpers';

test.describe('cumplimiento', () => {
  test('age gate 18+ sin cuenta bloquea a menores y recuerda a adultos', async ({ page }) => {
    await page.goto('/');
    const gate = page.getByRole('dialog', { name: /18 años o más/ });
    await expect(gate).toBeVisible();
    await page.getByRole('button', { name: 'No, soy menor' }).click();
    await expect(page.getByRole('heading', { name: 'Contenido no disponible' })).toBeVisible();
    await page.context().clearCookies();
    await page.reload();
    await page.getByRole('button', { name: 'Sí, soy mayor de 18' }).click();
    await expect(gate).toBeHidden();
    await page.reload();
    await expect(page.getByRole('dialog', { name: /18 años o más/ })).toBeHidden();
  });

  test('divulgaciones visibles: juego responsable, afiliación, no operador', async ({ page, context }) => {
    await asAdult(context);
    await page.goto('/');
    await expect(page.getByText('Jugar sin control puede generar adicción').first()).toBeVisible();
    await expect(page.getByText(/no es un operador de juegos de suerte y azar/)).toBeVisible();
    await expect(page.getByText(/enlaces son de afiliado o patrocinados/)).toBeVisible();
    await expect(page.getByText('Patrocinado').first()).toBeVisible();
    await page.goto('/responsible-gambling');
    await expect(page.getByRole('heading', { name: 'Juego responsable', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: /Coljuegos/ })).toBeVisible();
    await page.goto('/sponsor/betsantander');
    await expect(page.getByRole('heading', { name: 'Divulgación de afiliación' })).toBeVisible();
  });
});

test.describe('partidos y cuotas', () => {
  test.beforeEach(async ({ context }) => asAdult(context));

  test('calendario real con filtros', async ({ page }) => {
    await page.goto('/matches?date=week');
    await expect(page.getByTestId('match-row').first()).toBeVisible();
    const total = await page.getByTestId('match-row').count();
    expect(total).toBeGreaterThanOrEqual(3);
    await page.getByLabel('Buscar equipo').fill('Alfa');
    await page.getByRole('button', { name: 'Filtrar' }).click();
    await expect(page).toHaveURL(/q=Alfa/);
    await expect(page.getByTestId('match-row')).toHaveCount(1);
  });

  test('detalle del partido: predicciones, comparador, forma y tabla', async ({ page }) => {
    await page.goto(`/matches/${await firstScheduledFixture(page)}`);
    await expect(page.getByRole('heading', { name: 'Predicciones del modelo' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Comparador de cuotas' })).toBeVisible();
    await expect(page.getByText('Casa Uno').first()).toBeVisible();
    await expect(page.getByText('Casa No Autorizada')).toHaveCount(0);
    // Los enlaces a operadores pasan por /go (registro server-side) y se marcan como comerciales.
    const goLink = page.locator('a[href^="/go?"]').first();
    await expect(goLink).toHaveAttribute('rel', /sponsored/);
    await expect(page.getByRole('heading', { name: 'Clasificación' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Cómo llegó el modelo a estas cifras' })).toBeVisible();
  });

  test('mejores oportunidades ordenadas por calidad con métricas completas', async ({ page }) => {
    await page.goto('/best-bets');
    const cards = page.getByTestId('value-bet-card');
    await expect(cards.first()).toBeVisible();
    for (const label of ['Prob. modelo', 'Mercado sin vig', 'Cuota justa', 'Edge', 'EV']) await expect(cards.first().getByText(label, { exact: true })).toBeVisible();
    const scores = await page.locator('[title="Puntuación de calidad 0-100"]').allInnerTexts();
    const values = scores.map((s) => Number(s.replace(/[^\d.]/g, '')));
    expect([...values].sort((a, b) => b - a)).toEqual(values);
    await page.getByRole('link', { name: 'Tabla' }).click();
    await expect(page.getByRole('table')).toBeVisible();
  });

  test('comparador completo', async ({ page }) => {
    await page.goto('/odds-comparison');
    await expect(page.getByRole('heading', { name: 'Comparador de cuotas', level: 1 })).toBeVisible();
    await page.getByLabel('Elegir mercado').selectOption({ label: 'Más/Menos goles (2.5)' });
    await expect(page.getByText('Más de 2.5').first()).toBeVisible();
  });

  test('en vivo muestra marcador y antigüedad del dato', async ({ page }) => {
    await page.goto('/live');
    const card = page.getByTestId('live-card').first();
    await expect(card).toBeVisible();
    await expect(card.getByText('1 : 0')).toBeVisible();
    await expect(card.getByText(/Dato del proveedor hace/)).toBeVisible();
  });
});

test.describe('slip, combinadas y compartir', () => {
  test.beforeEach(async ({ context }) => asAdult(context));

  test('agregar selecciones, crear combinada y analizar', async ({ page }) => {
    await page.goto('/best-bets');
    await page.getByTestId('add-to-slip').nth(0).click();
    await expect(page.getByTestId('slip-drawer')).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await page.getByTestId('add-to-slip').nth(2).click();
    await expect(page.getByTestId('slip-leg')).toHaveCount(2);
    await page.getByTestId('slip-analyze').click();
    const analysis = page.getByTestId('combo-analysis');
    await expect(analysis).toBeVisible();
    await expect(analysis.getByText('Cuota total')).toBeVisible();
    await expect(analysis.getByText(/Prob. conjunta/)).toBeVisible();
    await page.getByRole('tab', { name: 'Sencillas' }).click();
    await expect(page.getByText(/Simulación sin dinero real/)).toBeVisible();
  });

  test('compartir una oportunidad: PNG, texto con avisos y QR', async ({ page }) => {
    await page.goto('/best-bets');
    await page.getByTestId('share-open').first().click();
    await page.getByLabel('Historia 1080×1920').check();
    await page.getByTestId('share-generate').click();
    const text = page.getByTestId('share-text');
    await expect(text).toHaveValue(/Cuotas sujetas a cambios/);
    await expect(text).toHaveValue(/Solo mayores de 18 años/);
    await expect(page.getByRole('img', { name: /Código QR/ })).toBeVisible();
    const preview = page.getByTestId('share-preview');
    await expect(preview).toBeVisible();
    const href = await page.getByTestId('share-download-png').getAttribute('href');
    const png = await page.request.get(href!);
    expect(png.status()).toBe(200);
    expect(png.headers()['content-type']).toContain('image/png');
    expect(png.headers()['content-disposition']).toContain('attachment');
    const pdfHref = await page.getByRole('link', { name: 'PDF' }).getAttribute('href');
    const pdf = await page.request.get(pdfHref!);
    expect(pdf.headers()['content-type']).toContain('application/pdf');
  });
});

test.describe('retos sociales', () => {
  test.beforeEach(async ({ context }) => asAdult(context));

  test('crear, unirse, elegir y ver clasificación', async ({ page }) => {
    await page.goto('/challenges');
    await page.getByLabel('Nombre del reto').fill('Reto E2E');
    const boxes = page.getByRole('checkbox');
    await boxes.nth(0).check();
    await boxes.nth(1).check();
    await page.getByTestId('challenge-submit').click();
    await expect(page.getByTestId('challenge-created')).toBeVisible();
    await expect(page.getByText('se muestra una sola vez')).toBeVisible();
    const code = (await page.getByTestId('challenge-code').innerText()).trim();
    await page.getByRole('link', { name: 'Ir al reto' }).click();
    await expect(page).toHaveURL(new RegExp(`/challenge/${code}`));
    await page.getByTestId('alias-input').fill('Jugador_E2E');
    await page.getByTestId('join-submit').click();
    await expect(page.getByText(/Te uniste como Jugador_E2E/)).toBeVisible();
    await page.getByTestId('challenge-fixture').first().getByRole('radio').first().click();
    await page.getByTestId('picks-save').click();
    await expect(page.getByText('Selecciones guardadas')).toBeVisible();
    await expect(page.getByTestId('leaderboard')).toContainText('Jugador_E2E');
    await expect(page.getByRole('heading', { name: 'Panel del creador' })).toBeVisible();
    await expect(page.getByText(/sin dinero real/i).first()).toBeVisible();
  });
});

test.describe('historial y transparencia', () => {
  test.beforeEach(async ({ context }) => asAdult(context));

  test('track record, metodología y estado de datos', async ({ page }) => {
    await page.goto('/track-record');
    await expect(page.getByRole('heading', { name: 'Historial auditable' })).toBeVisible();
    await expect(page.getByText('Publicadas', { exact: true })).toBeVisible();
    await page.goto('/methodology');
    await expect(page.getByRole('heading', { name: '3. Sin fuga de información' })).toBeVisible();
    await page.goto('/status');
    await expect(page.getByRole('heading', { name: 'Proveedores' })).toBeVisible();
  });
});

test('datos reales con credenciales (entorno configurado)', async ({ page }) => {
  const real = process.env.E2E_REAL_BASE_URL;
  test.skip(!real, 'Requiere E2E_REAL_BASE_URL apuntando a un entorno con claves reales');
  await page.context().addCookies([{ name: 'oo_age_ok', value: '1', url: real! }]);
  await page.goto(`${real}/matches?date=week`);
  await expect(page.getByTestId('match-row').first()).toBeVisible();
});
