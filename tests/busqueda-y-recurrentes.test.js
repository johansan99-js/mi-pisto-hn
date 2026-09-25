// Buscar movimientos desde el Inicio y proponer como pago recurrente lo que se repite cada mes
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase } = require('./helpers');

const HOY = new Date(2026, 8, 25, 12, 0);
const dia = (d, m = 8, y = 2026) => new Date(y, m, d, 10, 0).toISOString();
let n = 0;
const g = (amount, cat, d, m, extra = {}) => Object.assign({ id: 'tx' + String(++n).padStart(6, '0'), type: 'expense', amount, cat, date: dia(d, m), cuenta: 'efectivo', tipo: 'extra' }, extra);

describe('Buscar movimientos', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  const TX = [
    g(350, 'Comida', 24, 8, { subcat: 'Pollo Campero' }),
    g(1250, 'Supermercado', 20, 8, { subcat: 'La Colonia' }),
    g(399, 'Suscripciones', 5, 7, { subcat: 'Netflix' }),
    g(90, 'Comida', 3, 11, { subcat: 'Baleadas', date: dia(3, 11, 2025) }),
    { id: 'ing00001', type: 'income', amount: 350, cat: 'Extra', subcat: 'extra', nota: 'Venta de ropa', date: dia(10), cuenta: 'ahorro' },
  ];

  it('busca en todos los meses por categoría, comercio, monto y cuenta', async () => {
    const page = await env.pagina();
    await page.clock.setFixedTime(HOY);
    await sembrar(page, estadoBase({ transactions: TX }));
    const cats = () => page.$$eval('#registros-mes .rm-cat', e => e.map(x => x.textContent));
    await page.fill('#rm-q', 'comida');
    assert.deepEqual(await cats(), ['Comida', 'Comida'], 'también la del año pasado');
    assert.match(await page.textContent('#registros-mes'), /2 resultados · Gastos L\. 440\.00/);
    assert.match(await page.textContent('#registros-mes'), /3 dic, miércoles 2025/);
    await page.fill('#rm-q', 'netflix');
    assert.deepEqual(await cats(), ['Suscripciones']);
    await page.fill('#rm-q', '350');
    assert.deepEqual(await cats(), ['Comida', 'Extra']);
    await page.click('#rm-filtros .an-seg-btn:text("Ingresos")');
    assert.deepEqual(await cats(), ['Extra']);
    await page.click('#rm-filtros .an-seg-btn:text("Todos")');
    await page.fill('#rm-q', 'comida campero');
    assert.deepEqual(await cats(), ['Comida'], 'cada palabra tiene que aparecer');
    await page.fill('#rm-q', 'ahorro');
    assert.deepEqual(await cats(), ['Extra'], 'por la cuenta');
    await page.fill('#rm-q', 'pupusas');
    assert.match(await page.textContent('#registros-mes'), /No encontramos movimientos con "pupusas"/);
    // Limpiar vuelve al mes
    await page.click('.rm-limpiar');
    assert.equal(await page.inputValue('#rm-q'), '');
    assert.match(await page.textContent('#registros-mes'), /Septiembre 2026/);
    assert.deepEqual(page.errores, []);
  });
});

describe('Gastos que se repiten', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  const mensuales = [
    g(399, 'Suscripciones', 5, 6, { subcat: 'Netflix' }), g(399, 'Suscripciones', 6, 7, { subcat: 'Netflix' }), g(399, 'Suscripciones', 4, 8, { subcat: 'Netflix' }),
    // Comida todos los días: no es un pago fijo
    ...[2, 5, 9, 14].map(d => g(150, 'Comida', d, 8)), ...[3, 8, 20].map(d => g(160, 'Comida', d, 7)),
    // Monto muy distinto: no
    g(500, 'Gasolina', 10, 7), g(1400, 'Gasolina', 11, 8),
  ];

  it('propone guardar como pago recurrente lo que se paga cada mes y no vuelve a proponerlo', async () => {
    const page = await env.pagina();
    await page.clock.setFixedTime(HOY);
    await sembrar(page, estadoBase({ cuentasIniciales: { efectivo: 20000, ahorro: 0 }, transactions: mensuales }));
    const sug = await page.evaluate(() => sugerenciasRecurrentes().map(s => [s.nombre, s.monto, s.dia, s.meses]));
    assert.deepEqual(sug, [['Netflix', 399, 5, 3]]);
    assert.match(await page.textContent('#sugerencia-recurrente'), /¿Netflix es un pago de cada mes\?[\s\S]*en 3 de los últimos meses, unos L\. 399\.00 cerca del día 5/);
    await page.click('#sugerencia-recurrente .btn-primary');
    assert.deepEqual(await page.evaluate(() => state.pagosRecurrentes.map(({ servicio, monto, dia, pagado }) => ({ servicio, monto, dia, pagado }))), [{ servicio: 'Netflix', monto: 399, dia: 5, pagado: 0 }]);
    assert.equal(await page.isVisible('#sugerencia-recurrente'), false, 'ya es recurrente: no se vuelve a proponer');
    assert.match(await page.textContent('#aviso-rapido'), /Netflix: te recordamos cada día 5/);
  });

  it('"No es fijo" la descarta para siempre', async () => {
    const page = await env.pagina();
    await page.clock.setFixedTime(HOY);
    await sembrar(page, estadoBase({ cuentasIniciales: { efectivo: 20000, ahorro: 0 }, transactions: mensuales }));
    await page.click('#sugerencia-recurrente .btn-secondary');
    assert.equal(await page.isVisible('#sugerencia-recurrente'), false);
    await page.reload(); await page.waitForTimeout(700);
    assert.equal(await page.isVisible('#sugerencia-recurrente'), false);
    assert.deepEqual(await page.evaluate(() => state.pagosRecurrentes), []);
  });
});
