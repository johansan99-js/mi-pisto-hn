const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase, UUID_TC } = require('./helpers');

const tarjeta = (extra = {}) => Object.assign({ id: UUID_TC, nombre: 'BAC Oro', corte: 25, pago: 10, limite: 30000, saldo: 1000, tasaInteres: 48, calcularMinimo: true }, extra);
const saldos = page => page.evaluate(() => ({ global: calcBalance(), ef: getCuentaBalance('efectivo'), tc: state.tarjetas[0] && state.tarjetas[0].saldo }));

describe('Tarjetas y préstamos', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('pagar la tarjeta es una transferencia y el sobrepago queda a favor', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase({ cuentasIniciales: { efectivo: 3000, ahorro: 0 }, tarjetas: [tarjeta({ saldo: 800 })], transactions: [
      { id: 'compra1', type: 'expense', amount: 800, cat: 'Comida', pago: 'credito', cuenta: null, tarjetaId: UUID_TC, date: '2026-09-01T10:00:00Z' },
      { id: 'pagoviejo', type: 'expense', amount: 200, cat: 'Pago Tarjeta', pago: 'efectivo', date: '2026-09-02T10:00:00Z' },
    ] }));
    // El pago viejo, registrado como gasto, se migra a transferencia
    const viejo = await page.evaluate(() => state.transactions.find(t => t.id === 'pagoviejo'));
    assert.equal(viejo.esTransferencia, true); assert.equal(viejo.cuenta, 'efectivo');
    assert.deepEqual(await saldos(page), { global: 4200, ef: 2800, tc: 800 });
    page.respuestas = ['1,000', true, false]; // monto, aceptar saldo a favor, desde efectivo
    await page.evaluate(id => pagarTarjeta(id), UUID_TC);
    assert.deepEqual(await saldos(page), { global: 4200, ef: 1800, tc: -200 });
  });

  it('una compra a crédito sin tarjeta seleccionada no se guarda', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase({ tarjetas: [tarjeta()] }));
    await page.evaluate(() => {
      openModal('modal-gasto');
      document.getElementById('gasto-monto').value = '500';
      document.getElementById('gasto-cat').value = 'Comida';
      document.getElementById('gasto-cuenta').value = 'credito'; checkCreditCard();
    });
    await page.evaluate(() => saveGasto());
    assert.equal(await page.evaluate(() => state.transactions.length), 0);
    assert.ok(page.dialogos.some(m => m.includes('Selecciona la tarjeta')));
  });

  it('compra Tasa Cero: bloquea cupo, suma cuotas al pago del mes y se paga por cuotas', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase({ cuentasIniciales: { efectivo: 5000, ahorro: 0 }, saldoInicial: 20000, tarjetas: [tarjeta()] }));
    await page.evaluate(id => {
      openModal('modal-gasto');
      document.getElementById('gasto-monto').value = '12,000';
      document.getElementById('gasto-cat').value = 'Hogar';
      document.getElementById('gasto-subcat').value = 'Refrigeradora';
      document.getElementById('gasto-cuenta').value = 'credito'; checkCreditCard();
      document.getElementById('gasto-tarjeta').value = id;
    }, UUID_TC);
    await page.check('#gasto-es-cuotas');
    await page.selectOption('#gasto-cuotas-meses', '12');
    await page.evaluate(() => saveGasto());
    assert.deepEqual(await saldos(page), { global: 8000, ef: 5000, tc: 1000 }, 'gasto por el total, sin tocar el saldo con interés');
    const t = () => page.evaluate(() => { const t = state.tarjetas[0]; return { comp: cupoComprometido(t), mes: cuotasDelMes(t), min: pagoMinimoTarjeta(t) }; });
    assert.deepEqual(await t(), { comp: 12000, mes: 1000, min: 100 });
    page.respuestas = [false]; // desde efectivo
    await page.evaluate(id => pagarCuotaTasaCero(id, state.tarjetas[0].cuotas[0].id), UUID_TC);
    assert.deepEqual(await saldos(page), { global: 8000, ef: 4000, tc: 1000 });
    assert.deepEqual(await t(), { comp: 11000, mes: 0, min: 100 });
    // La última cuota absorbe el redondeo
    const cuotas = await page.evaluate(() => { const c = nuevoPlanCuotas('x', 1000, 3, 0), m = []; while (planActivo(c)) { m.push(montoCuota(c)); c.cuotasPagadas++; } return m; });
    assert.deepEqual(cuotas, [333.33, 333.33, 333.34]);
  });

  it('el simulador calcula el costo real del pago mínimo', async () => {
    const page = await env.pagina();
    const r = await page.evaluate(() => [simularPagoTarjeta(10000, 48), simularPagoTarjeta(10000, 48, 1200), simularPagoTarjeta(10000, 60), simularPagoTarjeta(10000, 48, 300)]);
    assert.equal(r[0].meses, 202); assert.equal(Math.round(r[0].interes), 34104);
    assert.equal(r[1].meses, 11); assert.equal(Math.round(r[1].interes), 2411);
    assert.equal(r[2].nunca, true, 'al 60% el 5% no cubre el interés');
    assert.equal(r[3].nunca, true, 'un pago menor al interés nunca termina');
  });

  it('conciliar con el estado de cuenta registra cargos o pagos no anotados', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase({ saldoInicial: 20000, cuentasIniciales: { efectivo: 5000, ahorro: 0 }, tarjetas: [tarjeta()] }));
    page.respuestas = ['1,180', true, true];
    await page.evaluate(id => ajustarSaldoTarjeta(id), UUID_TC);
    assert.deepEqual(await saldos(page), { global: 19820, ef: 5000, tc: 1180 });
    assert.equal(await page.evaluate(() => state.transactions.filter(t => t.cat === 'Cargos Bancarios').length), 1);
    page.respuestas = ['680', true, false, true];
    await page.evaluate(id => ajustarSaldoTarjeta(id), UUID_TC);
    assert.deepEqual(await saldos(page), { global: 19820, ef: 4500, tc: 680 });
  });

  it('el saldo de un préstamo incluye intereses y se valida al crearlo', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase({ prestamos: [
      { id: 'prest1', entidad: 'BAC', monto: 100000, cuota: 3923.29, cuotasPagadas: 26, cuotasTotal: 36 },
      { id: 'prest2', entidad: 'Familiar', monto: 12000, cuota: 1000, cuotasPagadas: 5, cuotasTotal: 12 },
    ] }));
    const r = await page.evaluate(() => state.prestamos.map(p => Math.round(saldoPrestamo(p))));
    assert.deepEqual(r, [35241, 7000]);
    await page.evaluate(() => { document.getElementById('prest-entidad').value = ''; document.getElementById('prest-monto').value = '5000'; savePrestamo(); });
    assert.equal(await page.evaluate(() => state.prestamos.length), 2);
  });
});
