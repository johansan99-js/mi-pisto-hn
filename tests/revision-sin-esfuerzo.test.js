// Correcciones de la revisión: pagos fijos, teclado, dictado y sugerencias
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase } = require('./helpers');

const HOY = new Date(2026, 8, 20, 12, 0);
const dia = (d, m = 8) => new Date(2026, m, d, 10, 0).toISOString();

describe('Revisión de pagos fijos, teclado y dictado', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('pagos fijos: ingreso sin cuenta, quincena marcada a mano, meses cortos, id fijo y tarjeta borrada', async () => {
    const page = await env.pagina();
    await page.clock.setFixedTime(HOY);
    await sembrar(page, estadoBase({ pagosRecurrentes: [
      { id: 'pagofijo1', servicio: 'Pensión', monto: 3000, dia: 10, tipo: 'ingreso', cat: 'Extra', auto: false, pagado: 0 },
      { id: 'pagofijo2', servicio: 'Salario', monto: 9000, dia: 15, dias: [15, 30], tipo: 'ingreso', cat: 'Salario', cuenta: 'ahorro', auto: true, autoDesde: dia(1), pagado: 0 },
      { id: 'pagofijo3', servicio: 'Cuota', monto: 500, dia: 30, dias: [30, 31], tipo: 'gasto', cuenta: 'efectivo', auto: true, autoDesde: dia(1), pagado: 0 },
      { id: 'pagofijo4', servicio: 'Spotify', monto: 150, dia: 1, tipo: 'gasto', tarjetaId: 'yanoexiste', auto: true, autoDesde: dia(1), pagado: 0 },
    ] }));
    await page.waitForTimeout(500);
    // Solo el salario del 15 (el de Spotify no tiene a dónde ir)
    const ya = await page.evaluate(() => state.transactions.map(t => [t.cat, t.amount, fechaLocal(new Date(t.date)), /^pf[a-z0-9]+$/.test(t.id)]));
    assert.deepEqual(ya, [['Salario', 9000, '2026-09-15', true]]);
    // 1) Un ingreso sin cuenta se marca recibido como INGRESO
    page.respuestas.push(true); // a la cuenta de ahorro
    await page.evaluate(() => marcarPagoRecurrente('pagofijo1'));
    assert.match(page.dialogos.pop(), /¿A qué cuenta entran los L\. 3,000\.00 de "Pensión"\?/);
    assert.deepEqual(await page.evaluate(() => { const t = state.transactions.at(-1); return [t.type, t.amount, t.cat, t.cuenta]; }), ['income', 3000, 'Extra', 'ahorro']);
    // 4) El salario del 30 cobrado a mano el 20 no se vuelve a anotar el 30
    await page.evaluate(() => marcarPagoRecurrente('pagofijo2'));
    assert.equal(await page.evaluate(() => verificarPagosAutomaticos(new Date(2026, 8, 30, 12)).filter(t => t.cat === 'Salario').length), 0);
    // 6) La cuota del 30 y el 31 en septiembre (30 días): una sola
    assert.equal(await page.evaluate(() => state.transactions.filter(t => t.subcat === 'Cuota').length), 1);
    // 8) El mismo id en otro teléfono: si ya llegó por la nube, no se duplica
    const otro = await page.evaluate(() => { const id = _idPagoFijo('pagofijo2', '2026-9-15'); state.transactions.push({ id, type: 'income', amount: 9000, cat: 'Salario', cuenta: 'ahorro', date: new Date(2026, 9, 15, 9).toISOString() }); return verificarPagosAutomaticos(new Date(2026, 9, 16, 12)).filter(t => t.cat === 'Salario').length; });
    assert.equal(otro, 0);
    // 7) Días para el próximo pago con la quincena
    assert.deepEqual(await page.evaluate(() => [diasHastaPagoFijo(state.pagosRecurrentes[1], new Date(2026, 8, 20, 12)), diasHastaPagoFijo(state.pagosRecurrentes[1], new Date(2026, 1, 20, 12))]), [10, 8]);
    await page.evaluate(() => switchView('pagos'));
    assert.match(await page.textContent('#pagos-list'), /Salario[\s\S]*Día 15 y 30/);
    assert.deepEqual(page.errores, []);
  });

  it('el teclado no arrastra cuotas ni factura del formulario completo; el dictado respeta la tarjeta y la moneda', async () => {
    const page = await env.pagina();
    await page.clock.setFixedTime(HOY);
    await sembrar(page, estadoBase({
      cuentasIniciales: { efectivo: 5000, ahorro: 0 },
      tarjetas: [{ id: 'tarj001', nombre: 'BAC Visa', limite: 40000, saldo: 0, saldoBase: 0, saldoUSD: 0, saldoBaseUSD: 0, bimoneda: true, bimonedaDesde: dia(1), corte: 5, pago: 25, tasaInteres: 48, calcularMinimo: true }],
      transactions: [{ id: 'rem00001', type: 'income', amount: 5000, cat: 'Remesa', subcat: 'extra', cuenta: 'efectivo', originalAmount: 200, originalCurrency: 'USD', remesa: { de: 'Mamá', via: 'Remitly', moneda: 'USD' }, date: dia(5) }],
    }));
    // 2) "Más opciones" con cuotas marcadas y cerrado: el siguiente gasto del teclado no es a cuotas
    await page.evaluate(() => { abrirRegistro('gasto'); elegirTarjetaRegistro('tarj001'); masOpcionesRegistro(); document.getElementById('gasto-es-cuotas').checked = true; document.getElementById('gasto-cobrado').value = '999'; closeModal('modal-gasto'); });
    await page.evaluate(() => { abrirRegistro('gasto'); elegirTarjetaRegistro('tarj001'); elegirCatRegistro('Comida'); _reg.expr = '250'; guardarRegistro(); });
    assert.deepEqual(await page.evaluate(() => { const t = state.transactions.at(-1); return [t.amount, !!t.planCuotasId, (state.tarjetas[0].cuotas || []).length, !!t.cobradoBanco]; }), [250, false, 0, false]);
    // 3) Dictar dólares sin nombrar la cuenta con la tarjeta en dólares ya elegida
    await page.evaluate(() => { abrirRegistro('gasto'); elegirTarjetaRegistro('tarj001'); aplicarDictado(interpretarDictado('gasté 20 dólares en suscripciones')); });
    assert.deepEqual(await page.evaluate(() => [_reg.expr, _reg.moneda, String(_reg.tarjeta)]), ['20', 'USD', 'tarj001']);
    // 10) Una remesa dictada sin moneda va en lempiras aunque la última fue en dólares
    await page.evaluate(() => { cerrarRegistro(); abrirRegistro('gasto'); aplicarDictado(interpretarDictado('mi mamá me mandó 2000 por Remitly')); });
    assert.deepEqual(await page.evaluate(() => [_reg.expr, _remReg.moneda, remesaEnDolares()]), ['2000', 'HNL', false]);
    assert.deepEqual(page.errores, []);
  });

  it('aceptar la sugerencia no vuelve a anotar el pago de este mes', async () => {
    const page = await env.pagina();
    await page.clock.setFixedTime(new Date(2026, 8, 3, 12));
    await sembrar(page, estadoBase({ cuentasIniciales: { efectivo: 20000, ahorro: 0 }, transactions: [
      { id: 'net00001', type: 'expense', amount: 399, cat: 'Suscripciones', subcat: 'Netflix', cuenta: 'efectivo', tipo: 'extra', date: dia(5, 6) },
      { id: 'net00002', type: 'expense', amount: 399, cat: 'Suscripciones', subcat: 'Netflix', cuenta: 'efectivo', tipo: 'extra', date: dia(5, 7) },
      { id: 'net00003', type: 'expense', amount: 399, cat: 'Suscripciones', subcat: 'Netflix', cuenta: 'efectivo', tipo: 'extra', date: dia(1, 8) },
    ] }));
    await page.click('#sugerencia-recurrente .btn-primary');
    const r = await page.evaluate(() => [verificarPagosAutomaticos(new Date(2026, 8, 5, 12)).length, verificarPagosAutomaticos(new Date(2026, 9, 5, 12)).length]);
    assert.deepEqual(r, [0, 1], 'septiembre ya estaba pagado; octubre sí se anota');
    assert.deepEqual(page.errores, []);
  });
});
