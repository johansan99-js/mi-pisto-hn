const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase } = require('./helpers');

describe('Carga, montos y saldos', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('arranca sin errores sin PIN y con transacciones guardadas', async () => {
    // Regresión: un save() en el nivel superior accedía a _sessionDEK antes de declararse
    const page = await env.pagina();
    await sembrar(page, estadoBase({ transactions: [
      { id: 'aaaaa1', type: 'expense', amount: 50, cat: 'Comida', cuenta: 'efectivo', date: '2026-09-01T10:00:00Z' },
    ] }));
    assert.deepEqual(page.errores, []);
    assert.equal(await page.evaluate(() => state.setup), true);
  });

  it('interpreta la coma de miles y la calculadora', async () => {
    const page = await env.pagina();
    const r = await page.evaluate(() => ['1,500', '1,500.50', '12,5', '1,000,000', '150+200', '1 500', 'abc', '-5'].map(parseMonto));
    assert.deepEqual(r, [1500, 1500.5, 12.5, 1000000, 350, 1500, null, null]);
    assert.ok(Number.isNaN(await page.evaluate(() => leerMonto('abc'))));
  });

  it('migra saldos que se contaban dos veces y no los vuelve a tocar', async () => {
    // Efectivo inicial 1000 + cobro de 200 que ya estaba sumado en state.cuentas;
    // ahorro inicial 500 − cuota de 300 que ya estaba restada.
    const page = await env.pagina();
    const legado = estadoBase({ cuentas: { efectivo: 1200, ahorro: 200 }, cuentasIniciales: undefined, cuentasInicialesV: undefined, transactions: [
      { id: 'aaaaa1', type: 'income', amount: 200, cat: 'Cobro Deuda', cuenta: 'efectivo', date: '2026-09-01T10:00:00Z' },
      { id: 'aaaaa2', type: 'expense', amount: 300, cat: 'Préstamo', cuenta: 'ahorro', date: '2026-09-02T10:00:00Z' },
    ] });
    delete legado.cuentasIniciales; delete legado.cuentasInicialesV;
    await sembrar(page, legado);
    const saldos = () => page.evaluate(() => ({ ef: getCuentaBalance('efectivo'), ah: getCuentaBalance('ahorro'), ini: state.cuentasIniciales }));
    assert.deepEqual(await saldos(), { ef: 1200, ah: 200, ini: { efectivo: 1000, ahorro: 500 } });
    await page.evaluate(() => save());
    await page.reload(); await page.waitForTimeout(1200);
    const r = await saldos();
    assert.equal(r.ef, 1200); assert.equal(r.ah, 200);
  });

  it('cobrar una deuda suma una sola vez', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase({ cuentasIniciales: { efectivo: 1000, ahorro: 0 }, receivables: [{ id: 'cobro1', persona: 'Ana', monto: 500, pagado: 0 }] }));
    page.respuestas = ['200'];
    await page.evaluate(() => abonarCobrar('cobro1'));
    await page.evaluate(() => save());
    await page.reload(); await page.waitForTimeout(1200);
    assert.equal(await page.evaluate(() => getCuentaBalance('efectivo')), 1200);
  });

  it('"Cobrado hoy" y "Pagado hoy" usan la fecha local de Honduras', async () => {
    const page = await env.pagina({ timezoneId: 'America/Tegucigalpa' });
    const estado = await page.evaluate(() => {
      const hora = h => { const d = new Date(); d.setHours(h, 0, 0, 0); return d.toISOString(); };
      const ayer = new Date(); ayer.setDate(ayer.getDate() - 1);
      return [
        { id: 'aaaaa1', type: 'income', amount: 1500, cat: 'Salario', cuenta: 'efectivo', date: hora(9) },
        { id: 'aaaaa2', type: 'expense', amount: 300, cat: 'Comida', cuenta: 'efectivo', date: hora(13) },
        { id: 'aaaaa3', type: 'expense', amount: 120, cat: 'Taxi', cuenta: 'efectivo', date: hora(20) }, // 02:00 UTC de mañana
        { id: 'aaaaa4', type: 'expense', amount: 200, cat: 'Transferencia', cuenta: 'efectivo', esTransferencia: true, date: hora(10) },
        { id: 'aaaaa5', type: 'expense', amount: 999, cat: 'Ajuste', cuenta: 'efectivo', esConciliacion: true, date: hora(11) },
        { id: 'aaaaa6', type: 'expense', amount: 400, cat: 'Comida', cuenta: 'efectivo', date: ayer.toISOString() },
        { id: 'aaaaa7', type: 'expense', amount: 77, cat: 'Borrado', cuenta: 'efectivo', date: hora(12), deletedAt: hora(12) },
      ];
    });
    await sembrar(page, estadoBase({ transactions: estado }));
    assert.equal(await page.textContent('#cobrado-hoy'), 'L. 1,500.00');
    assert.equal(await page.textContent('#pagado-hoy'), 'L. 420.00');
  });

  it('el modo discreto oculta los montos y se recuerda', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase({ transactions: [{ id: 'aaaaa1', type: 'income', amount: 15000, cat: 'Salario', cuenta: 'ahorro', date: new Date().toISOString() }] }));
    await page.click('.btn-modo-discreto >> visible=true');
    assert.equal(await page.textContent('#balance-amount'), 'L. ••••');
    await page.reload(); await page.waitForTimeout(1200);
    assert.equal(await page.evaluate(() => document.body.classList.contains('modo-discreto')), true);
  });
});
