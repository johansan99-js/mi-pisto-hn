const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { crearEntorno, sembrar, esperarCarga, desbloquear, estadoBase, UUID_TC } = require('./helpers');

// El código está repartido en varios archivos que comparten el ámbito global.
// Si una función se usa al cargar antes de que su archivo se haya ejecutado,
// el error solo aparece en el navegador: estas pruebas recorren los arranques.
const conDatos = () => estadoBase({ nombre: 'Ana',
  tarjetas: [{ id: UUID_TC, nombre: 'BAC Oro', corte: 20, pago: 5, limite: 30000, saldo: 500, tasaInteres: 48 }],
  goals: [{ id: 'meta01', nombre: 'Viaje', objetivo: 10000, actual: 2000 }],
  transactions: [
    { id: 'tx0001', type: 'income', amount: 20000, cat: 'Salario', cuenta: 'ahorro', date: new Date().toISOString() },
    { id: 'tx0002', type: 'expense', amount: 500, cat: 'Comida', pago: 'credito', cuenta: null, tarjetaId: UUID_TC, date: new Date().toISOString() },
  ] });
const VISTAS = ['dashboard', 'gastos', 'ingresos', 'metas', 'cobrar', 'pagar', 'prestamos', 'tarjetas', 'pagos', 'historico', 'config'];

describe('Arranque sin errores con el código dividido en archivos', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('el service worker guarda para uso sin conexión cada archivo que carga index.html', () => {
    const raiz = path.join(__dirname, '..');
    const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
    const sw = fs.readFileSync(path.join(raiz, 'sw.js'), 'utf8');
    const locales = [...html.matchAll(/<script src="(js\/[^"]+)"/g), ...html.matchAll(/<link rel="stylesheet" href="(css\/[^"]+)"/g)].map(m => m[1]);
    assert.ok(locales.length > 10);
    for (const f of locales) {
      assert.ok(fs.existsSync(path.join(raiz, f)), f + ' no existe');
      assert.ok(sw.includes(`'${f}'`), f + ' falta en sw.js');
    }
  });

  it('instalación nueva: configuración inicial y tutorial', async () => {
    const page = await env.pagina();
    await page.waitForSelector('#onboarding', { state: 'visible', timeout: 15000 });
    assert.ok(await page.evaluate(() => getComputedStyle(document.body).backgroundColor !== 'rgba(0, 0, 0, 0)'), 'el CSS cargó');
    await page.fill('#ob-nombre', 'Ana');
    page.respuestas = [true, '123456', '123456'];
    await page.click('#onboarding .btn-primary');
    await page.waitForSelector('#modal-tour', { state: 'visible', timeout: 15000 });
    await page.waitForTimeout(3500); // revisiones periódicas a los 3 s
    assert.deepEqual(page.errores, []);
  });

  it('con datos: recorre todas las vistas', async () => {
    const page = await env.pagina();
    await sembrar(page, conDatos());
    for (const v of VISTAS) { await page.evaluate(x => switchView(x), v); await page.waitForTimeout(150); }
    await page.waitForTimeout(3500);
    assert.deepEqual(page.errores, []);
    assert.equal(await page.evaluate(() => typeof window.currencyManager), 'object');
  });

  it('con PIN: bloqueada al recargar y desbloqueo', async () => {
    const page = await env.pagina();
    await sembrar(page, conDatos());
    page.respuestas = ['123456', '123456', true];
    await page.evaluate(() => configurarPIN());
    await page.waitForFunction(() => !!_sessionDEK, null, { timeout: 15000 });
    await page.reload(); await esperarCarga(page);
    assert.equal(await page.isVisible('#modal-pin'), true);
    await desbloquear(page, '123456');
    assert.equal(await page.evaluate(() => state.nombre), 'Ana');
    await page.waitForTimeout(3500);
    assert.deepEqual(page.errores, []);
  });

  it('en escritorio', async () => {
    const page = await env.pagina({ viewport: { width: 1366, height: 800 } });
    await sembrar(page, conDatos());
    for (const v of VISTAS) { await page.evaluate(x => switchView(x), v); await page.waitForTimeout(100); }
    assert.deepEqual(page.errores, []);
  });
});
