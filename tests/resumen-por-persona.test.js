// Resumen "Total por persona" en Lo que debo y Lo que me deben:
// cuando una misma persona aparece varias veces, se suma lo pendiente de cada una.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase } = require('./helpers');

const conSaldo = (extra = {}) => estadoBase(Object.assign({ nombre: 'Ana', saldoInicial: 5000, cuentasIniciales: { efectivo: 1000, ahorro: 4000 } }, extra));

describe('Total por persona', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('en Lo que debo suma lo pendiente de cada persona y mantiene el total general', async () => {
    const page = await env.pagina();
    await sembrar(page, conSaldo({ payables: [
      { id: 'd1', creditor: 'Mamá', monto: 3000, pagado: 0, tipo: 'persona' },
      { id: 'd2', creditor: 'Mamá', monto: 2000, pagado: 500, tipo: 'persona' },
      { id: 'd3', creditor: 'Mamá', monto: 1000, pagado: 0, tipo: 'persona' },
      { id: 'd4', creditor: 'Mi hija', monto: 1500, pagado: 0, tipo: 'persona' },
      { id: 'd5', creditor: 'BAC', monto: 4000, pagado: 0, tipo: 'banco' },
    ] }));
    await page.evaluate(() => switchView('pagar'));
    const txt = await page.textContent('#pagar-list');
    // El resumen por persona aparece y Mamá suma 3000 + 1500 + 1000 = 5500
    assert.match(txt, /Total por persona/);
    assert.match(txt, /Mamá[\s\S]*· 3[\s\S]*L\. ?5,500\.00/);
    assert.match(txt, /Mi hija[\s\S]*L\. ?1,500\.00/);
    // El total de Lo que debo suma personas (7000) + banco (4000) = 11000
    assert.match(await page.textContent('#total-pagar'), /L\. ?11,000\.00/);
    // El resumen no toca a los bancos
    const resumen = await page.textContent('.resumen-personas');
    assert.equal(/BAC/.test(resumen), false);
    assert.deepEqual(page.errores, []);
  });

  it('con una sola persona y una sola deuda no muestra el resumen', async () => {
    const page = await env.pagina();
    await sembrar(page, conSaldo({ payables: [
      { id: 'd1', creditor: 'Juan', monto: 1000, pagado: 0, tipo: 'persona' },
    ] }));
    await page.evaluate(() => switchView('pagar'));
    assert.equal(await page.evaluate(() => !!document.querySelector('#pagar-list .resumen-personas')), false);
  });

  it('en Lo que me deben suma lo pendiente por cliente', async () => {
    const page = await env.pagina();
    await sembrar(page, conSaldo({ receivables: [
      { id: 'c1', persona: 'Cliente López', monto: 2000, pagado: 0 },
      { id: 'c2', persona: 'Cliente López', monto: 1500, pagado: 500 },
      { id: 'c3', persona: 'Pedro', monto: 800, pagado: 0 },
    ] }));
    await page.evaluate(() => switchView('cobrar'));
    const txt = await page.textContent('#cobrar-list');
    assert.match(txt, /Total por persona/);
    // Cliente López: 2000 + 1000 = 3000
    assert.match(txt, /Cliente López[\s\S]*· 2[\s\S]*L\. ?3,000\.00/);
    assert.match(txt, /Pedro[\s\S]*L\. ?800\.00/);
    assert.match(await page.textContent('#total-cobrar'), /L\. ?3,800\.00/);
    assert.deepEqual(page.errores, []);
  });
});
