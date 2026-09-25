// Sin esfuerzo: los pagos fijos se anotan solos y el efectivo se cuadra una vez por semana
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase } = require('./helpers');

const HOY = new Date(2026, 8, 25, 12, 0);
const dia = (d, m = 8) => new Date(2026, m, d, 10, 0).toISOString();
const movs = n => Array.from({ length: n }, (_, i) => ({ id: 'mov' + String(i).padStart(5, '0'), type: 'expense', amount: 100, cat: 'Comida', date: dia(1 + i), cuenta: 'efectivo', tipo: 'extra' }));

describe('Pagos fijos que se anotan solos', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('el salario de cada quincena se anota solo, sin repetirse, desde el día que se activó', async () => {
    const page = await env.pagina();
    await page.clock.setFixedTime(HOY);
    await sembrar(page, estadoBase());
    await page.evaluate(() => { switchView('pagos'); abrirPagoFijo(); });
    await page.click('#pf-tipo .an-seg-btn[data-t="ingreso"]');
    assert.equal(await page.textContent('#pf-lbl-cuenta'), '¿A qué cuenta entra?');
    await page.fill('#pago-servicio', 'Salario');
    await page.fill('#pago-monto', '12,000');
    await page.fill('#pago-dia', '15, 30');
    await page.fill('#pf-cat', 'Salario');
    await page.selectOption('#pf-cuenta', 'ahorro');
    assert.equal(await page.isChecked('#pf-auto'), true, 'viene activado');
    await page.click('#modal-pago-recurrente .btn-primary');
    assert.match(await page.textContent('#aviso-rapido'), /Salario: se anota solo cada día 15 y 30/);
    assert.match(await page.textContent('#pagos-list'), /Salario[\s\S]*Día 15 y 30[\s\S]*Ingreso · L\. 12,000\.00 ·[\s\S]*Se anota solo/);
    // El 15 de este mes ya pasó, pero se activó hoy: no se anota
    assert.deepEqual(await page.evaluate(() => verificarPagosAutomaticos().length), 0);
    const anotar = f => page.evaluate(iso => verificarPagosAutomaticos(new Date(iso)).map(t => [t.type, t.amount, t.cat, t.cuenta, fechaLocal(new Date(t.date))]), f.toISOString());
    assert.deepEqual(await anotar(new Date(2026, 8, 30, 8)), [], 'el día 30 a las 9 de la mañana');
    assert.deepEqual(await anotar(new Date(2026, 8, 30, 12)), [['income', 12000, 'Salario', 'ahorro', '2026-09-30']]);
    assert.deepEqual(await anotar(new Date(2026, 8, 30, 18)), [], 'no se repite');
    // En octubre: el 15 y el 30; si la app estuvo cerrada, llegan los dos juntos
    assert.deepEqual((await anotar(new Date(2026, 9, 31, 12))).map(x => x[4]), ['2026-10-15', '2026-10-30']);
    // Febrero no tiene 30: se anota el último día
    assert.deepEqual((await anotar(new Date(2027, 1, 28, 12))).map(x => x[4]), ['2027-02-15', '2027-02-28']);
    assert.deepEqual(page.errores, []);
  });

  it('al abrir la app se anotan los que ya tocaban y el Inicio los muestra para corregirlos', async () => {
    const page = await env.pagina();
    await page.clock.setFixedTime(HOY);
    await sembrar(page, estadoBase({
      cuentasIniciales: { efectivo: 20000, ahorro: 0 },
      tarjetas: [{ id: 'tarj001', nombre: 'BAC Visa', limite: 20000, saldo: 0, saldoBase: 0, corte: 5, pago: 25, tasaInteres: 48, calcularMinimo: true }],
      pagosRecurrentes: [
        { id: 'pagofijo1', servicio: 'Netflix', monto: 399, dia: 5, tipo: 'gasto', cat: 'Suscripciones', tarjetaId: 'tarj001', auto: true, autoDesde: dia(1, 6), pagado: 0 },
        { id: 'pagofijo2', servicio: 'Luz', monto: 850, dia: 20, tipo: 'gasto', cat: 'Luz', cuenta: 'efectivo', auto: true, autoDesde: dia(1, 6), pagado: 0 },
        { id: 'pagofijo3', servicio: 'Alquiler', monto: 6000, dia: 28, tipo: 'gasto', cat: 'Alquiler', cuenta: 'efectivo', auto: true, autoDesde: dia(1, 6), pagado: 0 },
        // Ya se marcó pagado a mano este mes
        { id: 'pagofijo4', servicio: 'Agua', monto: 200, dia: 10, tipo: 'gasto', cat: 'Agua', cuenta: 'efectivo', auto: true, autoDesde: dia(1, 6), pagado: 200, ultimoPago: dia(9) },
        // Solo aviso
        { id: 'pagofijo5', servicio: 'Cable', monto: 500, dia: 3, pagado: 0 },
      ],
    }));
    await page.waitForFunction(() => state.transactions.length >= 2);
    const txs = await page.evaluate(() => state.transactions.map(t => [t.subcat, t.amount, t.cuenta, String(t.tarjetaId || ''), fechaLocal(new Date(t.date))]));
    assert.deepEqual(txs, [['Netflix', 399, null, 'tarj001', '2026-09-05'], ['Luz', 850, 'efectivo', '', '2026-09-20']], 'solo este mes, sin agosto, sin el agua ya pagada ni el cable');
    assert.equal(await page.evaluate(() => state.tarjetas[0].saldo), 399);
    assert.equal(await page.evaluate(() => getCuentaBalance('efectivo')), 19150);
    assert.match(await page.textContent('#aviso-rapido'), /Se anotaron solos 2 pagos fijos/);
    assert.match(await page.textContent('#auto-anotados'), /Se anotaron solos[\s\S]*Luz[\s\S]*Suscripciones[\s\S]*Netflix/);
    // La luz vino más cara: se toca y se corrige
    await page.click('#auto-anotados .rm-fila:has-text("Luz")');
    assert.equal(await page.isVisible('#modal-edit-tx'), true);
    await page.evaluate(() => closeModal('modal-edit-tx'));
    await page.click('#auto-anotados .auto-ok');
    assert.equal(await page.isVisible('#auto-anotados'), false);
    // Al volver a abrir no se repiten ni vuelve el aviso
    await page.reload();
    await page.waitForTimeout(900);
    assert.equal(await page.evaluate(() => state.transactions.length), 2);
    assert.equal(await page.isVisible('#auto-anotados'), false);
    // La lista dice cuáles se anotan solos
    await page.evaluate(() => switchView('pagos'));
    const lista = await page.textContent('#pagos-list');
    assert.match(lista, /Netflix[\s\S]*Se anota solo[\s\S]*Pagado este mes/);
    assert.doesNotMatch(lista.split('Cable')[1], /Se anota solo/);
    // "Marcar pagado" con la cuenta ya elegida no pregunta de dónde
    await page.evaluate(() => marcarPagoRecurrente('pagofijo3'));
    assert.deepEqual(await page.evaluate(() => { const t = state.transactions.at(-1); return [t.subcat, t.amount, t.cuenta, t.cat, !!t.autoRegistrado]; }), ['Alquiler', 6000, 'efectivo', 'Alquiler', false]);
    assert.deepEqual(page.dialogos, []);
    // Y ya no se anota solo el 28
    assert.equal(await page.evaluate(() => verificarPagosAutomaticos(new Date(2026, 8, 28, 12)).length), 0);
    assert.deepEqual(page.errores, []);
  });
});

describe('Cuadre de efectivo', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('cada semana pregunta cuánto efectivo hay; lo que falta se anota como gastos del día a día', async () => {
    const page = await env.pagina();
    await page.clock.setFixedTime(HOY);
    await sembrar(page, estadoBase({ cuentasIniciales: { efectivo: 5000, ahorro: 0 }, transactions: movs(6) }));
    assert.equal(await page.isVisible('#aviso-cuadre'), true);
    assert.match(await page.textContent('#aviso-cuadre'), /¿Cuadran tus cuentas\?[\s\S]*¿Cuánto efectivo tienes ahorita\? La app dice L\. 4,400\.00/);
    await page.fill('#cuadre-efectivo', '3,900');
    await page.click('#aviso-cuadre .cuadre-fila .btn');
    assert.match(await page.textContent('#aviso-rapido'), /Se anotaron L\. 500\.00 como gastos del día a día/);
    assert.deepEqual(await page.evaluate(() => { const t = state.transactions.at(-1); return [t.type, t.amount, t.cat, t.cuenta, t.esCuadre, !!t.esConciliacion]; }), ['expense', 500, 'Día a día', 'efectivo', true, false]);
    assert.equal(await page.evaluate(() => getCuentaBalance('efectivo')), 3900);
    assert.equal(await page.isVisible('#aviso-cuadre'), false);
    // Cuenta como gasto del mes, con su ícono
    assert.match(await page.textContent('#registros-mes'), /Día a día[\s\S]*Cuadre de efectivo/);
    assert.equal(await page.evaluate(() => iconoCategoria('Día a día', 'expense').i), '🪙');
    // A la semana vuelve a preguntar
    await page.clock.setFixedTime(new Date(2026, 9, 2, 12));
    await page.reload(); await page.waitForTimeout(700);
    assert.equal(await page.isVisible('#aviso-cuadre'), true);
    // Si hay más de lo que dice la app, pregunta si fue un ingreso
    page.respuestas.push(true);
    await page.fill('#cuadre-efectivo', '4000');
    await page.press('#cuadre-efectivo', 'Enter');
    assert.match(page.dialogos.pop(), /Tienes L\. 100\.00 más de lo que dice la app/);
    assert.deepEqual(await page.evaluate(() => { const t = state.transactions.at(-1); return [t.type, t.amount, t.cat, !!t.esConciliacion]; }), ['income', 100, 'Otros', false]);
    assert.equal(await page.evaluate(() => getCuentaBalance('efectivo')), 4000);
    assert.equal(await page.isVisible('#aviso-cuadre'), false);
    assert.deepEqual(page.errores, []);
  });
});
