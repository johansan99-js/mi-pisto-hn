// Barra de abajo: Inicio · Análisis · + · Presupuestos · Cuentas (tarjetas y deudas desde Cuentas)
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase, UUID_TC } = require('./helpers');

const TARJETA = { id: UUID_TC, nombre: 'BAC Visa Oro', corte: 20, pago: 5, limite: 40000, saldo: 0, saldoBase: 12500, tasaInteres: 48, historialPagos: [] };

describe('Barra de abajo nueva', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('tiene Inicio, Análisis, el +, Presupuestos y Cuentas, y marca la pestaña de cada pantalla', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase({ tarjetas: [TARJETA] }));
    assert.deepEqual(await page.$$eval('#bottom-nav .nav-label', ls => ls.map(l => l.textContent)), ['Inicio', 'Análisis', 'Presupuestos', 'Cuentas']);
    assert.equal(await page.$$eval('#bottom-nav .nav-fab', b => b.length), 1);
    const activa = () => page.$eval('#bottom-nav .nav-tab.active .nav-label', l => l.textContent);
    await page.click('#tab-presupuestos');
    assert.equal(await page.isVisible('#view-presupuestos'), true);
    assert.equal(await activa(), 'Presupuestos');
    await page.click('#tab-cuentas');
    assert.equal(await page.isVisible('#view-cuentas'), true);
    assert.equal(await activa(), 'Cuentas');
    // Las tarjetas están dentro de Cuentas, con lo que debes y lo disponible
    const txt = await page.textContent('#cuentas-contenido');
    assert.match(txt, /Tarjetas de crédito\s*-L\. 12,500\.00/);
    assert.match(txt, /BAC Visa Oro\s*Disponible L\. 27,500\.00/);
    await page.click('#cuentas-contenido .cuenta-tc');
    assert.equal(await page.isVisible('#view-tarjetas'), true);
    assert.equal(await activa(), 'Cuentas', 'tarjetas se abre desde Cuentas');
    await page.click('#tab-dashboard');
    assert.equal(await activa(), 'Inicio');
    assert.deepEqual(page.errores, []);
  });

  it('desde Cuentas se llega a lo que debo, préstamos y me deben', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase({ payables: [{ id: 'deuda001', creditor: 'Tía Rosa', monto: 1500, pagado: 0 }], prestamos: [{ id: 'pres0001', entidad: 'Atlántida', monto: 50000, tasaInteres: 18, cuota: 2500, cuotasPagadas: 4, cuotasTotal: 24 }] }));
    await page.click('#tab-cuentas');
    const txt = await page.textContent('#cuentas-contenido');
    assert.match(txt, /No tienes tarjetas registradas/);
    assert.match(txt, /Lo que debo\s*Pendiente L\. 1,500\.00/);
    assert.match(txt, /Préstamos\s*1 préstamo activo/);
    await page.click('.cuenta-atajo:has-text("Lo que debo")');
    assert.equal(await page.isVisible('#view-pagar'), true);
    await page.click('#tab-cuentas');
    await page.click('.cuenta-atajo:has-text("Préstamos")');
    assert.equal(await page.isVisible('#view-prestamos'), true);
  });

  it('Configuración y Tarjetas siguen en el menú ☰', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase());
    await page.evaluate(() => toggleHamburger());
    await page.click('.hamburger-item:has-text("Tarjetas de crédito")');
    assert.equal(await page.isVisible('#view-tarjetas'), true);
    await page.evaluate(() => toggleHamburger());
    await page.click('.hamburger-item:has-text("Configuración")');
    assert.equal(await page.isVisible('#view-config'), true);
  });
});
