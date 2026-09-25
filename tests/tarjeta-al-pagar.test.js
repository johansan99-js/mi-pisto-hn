// Compras con tarjeta en el mes en que se paga la tarjeta
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase, UUID_TC } = require('./helpers');

const HOY = new Date(2026, 8, 25, 12, 0);
const dia = (d, m) => new Date(2026, m, d, 10, 0).toISOString();
const tarjeta = { id: UUID_TC, nombre: 'BAC Visa', corte: 20, pago: 5, limite: 50000, saldo: 0, saldoBase: 0, tasaInteres: 48, historialPagos: [] };
const txs = [
  { id: 'tcompra1', type: 'expense', amount: 300, cat: 'Comida', date: dia(10, 7), cuenta: null, pago: 'credito', tarjetaId: UUID_TC, tipo: 'extra' },
  { id: 'tcompra2', type: 'expense', amount: 1000, cat: 'Comida', date: dia(10, 8), cuenta: null, pago: 'credito', tarjetaId: UUID_TC, tipo: 'extra' },
  { id: 'efectivo1', type: 'expense', amount: 200, cat: 'Comida', date: dia(12, 8), cuenta: 'efectivo', tipo: 'extra' },
];

describe('Compras con tarjeta en el mes del pago', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('calcula el día de pago según el corte y cambia el mes en que cuentan', async () => {
    const page = await env.pagina();
    await page.clock.setFixedTime(HOY);
    await sembrar(page, estadoBase({ saldoInicial: 20000, cuentasIniciales: { efectivo: 20000, ahorro: 0 }, tarjetas: [tarjeta], transactions: txs, presupuestos: [{ id: 'pres0001', cat: '*', monto: 5000, periodo: 'mes' }] }));
    const pagos = await page.evaluate(() => {
      const f = (c, p, d) => { const x = fechaPagoDeCompra({ corte: c, pago: p }, d); return (x.getMonth() + 1) + '/' + x.getDate(); };
      return [f(20, 5, new Date(2026, 8, 10)), f(20, 5, new Date(2026, 8, 25)), f(5, 25, new Date(2026, 8, 10)), f(5, 25, new Date(2026, 8, 3)), f(31, 30, new Date(2026, 1, 10))];
    });
    assert.deepEqual(pagos, ['10/5', '11/5', '10/25', '9/25', '3/30']);

    const mes = m => page.evaluate(m => calcularResumenMes(2026, m).gastos, m);
    const estado = () => page.evaluate(() => estadoPresupuesto(state.presupuestos[0]).gastado);
    assert.deepEqual([await mes(8), await estado()], [1200, 1200], 'por defecto, en el mes de la compra');
    await page.evaluate(() => { switchView('config'); document.querySelector('input[name="tarjeta-al-pagar"][value="1"]').click(); });
    assert.equal(await page.evaluate(() => state.tarjetaAlPagar), true);
    assert.deepEqual([await mes(7), await mes(8), await mes(9), await estado()], [0, 500, 1000, 500]);
    await page.evaluate(() => switchView('gastos'));
    assert.match(await page.textContent('#gastos-list'), /💳 cuenta el 5 oct/);
    assert.match(await page.textContent('#gastos-mes'), /L\. ?500\.00/);
    // Se mantiene al recargar y se puede volver
    await page.reload(); await page.waitForTimeout(800);
    await page.evaluate(() => switchView('config'));
    assert.equal(await page.isChecked('input[name="tarjeta-al-pagar"][value="1"]'), true);
    await page.evaluate(() => elegirTarjetaAlPagar(false));
    assert.equal(await mes(8), 1200);
    assert.deepEqual(page.errores, []);
  });
});
