const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, esperarCarga, desbloquear, estadoBase } = require('./helpers');

const conDatos = () => estadoBase({ nombre: 'Ana', transactions: [{ id: 'tx0001', type: 'expense', amount: 50, cat: 'Comida', cuenta: 'efectivo', date: '2026-09-01T10:00:00Z' }] });

async function conPIN(env) {
  const page = await env.pagina();
  await sembrar(page, conDatos());
  page.respuestas = ['123456', '123456', true];
  await page.evaluate(() => configurarPIN());
  await page.waitForFunction(() => !!_sessionDEK && !!localStorage.getItem('mph_buzon_pub'), null, { timeout: 15000 });
  return page;
}
async function abrirAtajo(page, accion) {
  const url = new URL(page.url());
  url.search = '?action=' + accion;
  await page.goto(url.href);
}
const visible = (page, id) => page.evaluate(i => { const e = document.getElementById(i); return !!e && getComputedStyle(e).display !== 'none'; }, id);

describe('Anotar sin desbloquear', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('el atajo "Gasto" anota sin PIN, cifrado, y al entrar pasa a los movimientos', async () => {
    const page = await conPIN(env);
    await abrirAtajo(page, 'new-expense');
    await page.waitForSelector('#modal-anotar-rapido', { state: 'visible', timeout: 15000 });
    assert.equal(await visible(page, 'modal-pin'), false);
    assert.equal(await page.evaluate(() => state.setup), false, 'no se ve nada de los datos');
    await page.fill('#rap-monto', '150');
    await page.fill('#rap-nota', 'almuerzo en el centro');
    await page.dispatchEvent('#rap-nota', 'input');
    assert.equal(await page.evaluate(() => _rap.cat), 'Comida', 'la categoría sale de la nota');
    await page.click('#rap-guardar');
    await page.waitForFunction(() => _buzonLeer().length === 1);
    const guardado = await page.evaluate(() => localStorage.getItem('mph_buzon'));
    assert.doesNotMatch(guardado, /almuerzo|150/, 'queda cifrado');
    // "Entrar a la app" vuelve al PIN; al desbloquear se agrega
    await page.click('.rap-entrar');
    assert.equal(await visible(page, 'modal-pin'), true);
    await desbloquear(page, '123456');
    await page.waitForFunction(() => state.transactions.length === 2, null, { timeout: 10000 });
    const r = await page.evaluate(() => { const t = state.transactions.find(x => x.id !== 'tx0001'); return { amount: t.amount, cat: t.cat, type: t.type, buzon: _buzonLeer().length }; });
    assert.deepEqual(r, { amount: 150, cat: 'Comida', type: 'expense', buzon: 0 });
    assert.match(page.dialogos.join('\n'), /Anotaste 1 movimiento sin desbloquear/);
  });

  it('el atajo "Ingreso" abre con ingreso elegido y el botón del PIN también anota', async () => {
    const page = await conPIN(env);
    await abrirAtajo(page, 'new-income');
    await page.waitForSelector('#modal-anotar-rapido', { state: 'visible', timeout: 15000 });
    assert.equal(await page.evaluate(() => _rap.tipo), 'ingreso');
    await page.click('.rap-entrar');
    await page.click('#btn-anotar-sin-pin');
    assert.equal(await visible(page, 'modal-anotar-rapido'), true);
    assert.equal(await page.evaluate(() => _rap.tipo), 'gasto');
  });

  it('"Pago fijo" con la app bloqueada se abre después de desbloquear', async () => {
    const page = await conPIN(env);
    await page.addInitScript(() => { window.__pagoFijo = 0; document.addEventListener('DOMContentLoaded', () => { const base = window.abrirPagoFijo; window.abrirPagoFijo = function () { window.__pagoFijo++; return base && base.apply(this, arguments); }; }); });
    await abrirAtajo(page, 'pago-fijo');
    await esperarCarga(page);
    await desbloquear(page, '123456');
    await page.waitForFunction(() => window.__pagoFijo === 1, null, { timeout: 5000 });
  });

  it('se puede apagar: entonces el atajo pide el PIN', async () => {
    const page = await conPIN(env);
    await page.evaluate(() => { switchView('config'); renderBiometriaConfig(); });
    await page.uncheck('#buzon-config input[type=checkbox]');
    await abrirAtajo(page, 'new-expense');
    await esperarCarga(page);
    assert.equal(await visible(page, 'modal-pin'), true);
    assert.equal(await visible(page, 'modal-anotar-rapido'), false);
    assert.equal(await visible(page, 'btn-anotar-sin-pin'), false);
  });

  it('con la app abierta, el mismo formulario guarda directo', async () => {
    const page = await conPIN(env);
    await page.evaluate(() => abrirAnotarRapido('gasto'));
    await page.fill('#rap-monto', '30');
    await page.evaluate(() => _rapElegir('Transporte'));
    await page.click('#rap-guardar');
    await page.waitForFunction(() => state.transactions.length === 2, null, { timeout: 5000 });
    assert.equal(await page.evaluate(() => _buzonLeer().length), 0);
  });
});
