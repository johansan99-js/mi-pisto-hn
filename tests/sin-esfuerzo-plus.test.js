// Para gente sin tiempo: gastos de un toque, categoría que aprende, presupuestos
// en un toque, importar el estado de cuenta del banco y la guía
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase } = require('./helpers');

const hoy = new Date();
const dia = (d, mm = 0) => new Date(hoy.getFullYear(), hoy.getMonth() - mm, d, 12).toISOString();
const conCafe = () => estadoBase({ cuentasIniciales: { efectivo: 5000, ahorro: 0 }, transactions: [1, 2, 3].map(i => ({ id: 'cafe' + i + 'aa', type: 'expense', amount: 45, cat: 'Comida', subcat: 'Café', cuenta: 'efectivo', tipo: 'extra', date: new Date(Date.now() - i * 864e5).toISOString() })) });

describe('Sin esfuerzo, parte 2', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('lo que repites 3 veces queda como botón: un toque lo anota y "Deshacer" lo quita', async () => {
    const page = await env.pagina();
    await sembrar(page, conCafe());
    assert.equal(await page.isVisible('#favoritos-inicio'), true);
    assert.match(await page.textContent('#favoritos-inicio'), /Café L\. 45/);
    await page.click('#favoritos-inicio .fav-chip');
    await page.waitForFunction(() => state.transactions.length === 4);
    const t = await page.evaluate(() => { const x = state.transactions[3]; return [x.amount, x.cat, x.subcat, x.cuenta]; });
    assert.deepEqual(t, [45, 'Comida', 'Café', 'efectivo']);
    assert.equal(await page.isVisible('#modal-registro'), false);
    assert.equal(await page.evaluate(() => getCuentaBalance('efectivo')), 5000 - 45 * 4);
    await page.click('#aviso-deshacer .btn-undo');
    assert.equal(await page.evaluate(() => state.transactions.length), 3);
    // En el registro los botones llenan todo para revisar antes de guardar
    await page.evaluate(() => abrirRegistro('gasto'));
    await page.click('#reg-favoritos .fav-chip');
    assert.deepEqual(await page.evaluate(() => [_reg.cat, _reg.expr, document.getElementById('reg-nota').value]), ['Comida', '45', 'Café']);
    assert.equal(await page.isVisible('#reg-favoritos'), false, 'con monto escrito se esconden');
    assert.deepEqual(page.errores, []);
  });

  it('la categoría sale sola con el comercio que ya anotaste, y se puede cambiar', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase({ cuentasIniciales: { efectivo: 5000, ahorro: 0 }, transactions: [
      { id: 'ps00001', type: 'expense', amount: 1200, cat: 'Supermercado', subcat: 'PriceSmart', cuenta: 'efectivo', date: dia(1) },
      { id: 'ub00001', type: 'expense', amount: 90, cat: 'Transporte', subcat: 'Uber aeropuerto', cuenta: 'efectivo', date: dia(1) },
    ] }));
    await page.evaluate(() => abrirRegistro('gasto'));
    await page.fill('#reg-nota', 'pricesmart');
    assert.equal(await page.evaluate(() => _reg.cat), 'Supermercado');
    assert.match(await page.textContent('#reg-lbl-b'), /la de siempre/);
    await page.fill('#reg-nota', 'Uber');
    assert.equal(await page.evaluate(() => _reg.cat), 'Transporte');
    // Elegida a mano ya no la cambia
    await page.evaluate(() => elegirCatRegistro('Salidas'));
    await page.fill('#reg-nota', 'pricesmart');
    assert.equal(await page.evaluate(() => _reg.cat), 'Salidas');
    // Guardar sin categoría (como después de dictar) usa la de siempre
    await page.evaluate(() => { abrirRegistro('gasto'); _reg.expr = '300'; document.getElementById('reg-nota').value = 'PriceSmart'; return guardarRegistro(); });
    assert.equal(await page.evaluate(() => state.transactions[state.transactions.length - 1].cat), 'Supermercado');
    // Y los SMS del banco
    assert.equal(await page.evaluate(() => interpretarMensajeBanco('BAC: Compra por L 350.00 en UBER AEROPUERTO con tarjeta 1234').categoria), 'Transporte');
    assert.deepEqual(page.errores, []);
  });

  it('presupuestos en un toque: un 5% menos de lo que sueles gastar', async () => {
    const page = await env.pagina();
    const tx = [];
    [[1, 3000, 1000], [2, 3200, 900], [3, 2800, 0]].forEach(([mm, comida, bus]) => {
      tx.push({ id: 'co' + mm + 'aaa', type: 'expense', amount: comida, cat: 'Comida', cuenta: 'efectivo', date: dia(10, mm) });
      if (bus) tx.push({ id: 'bu' + mm + 'aaa', type: 'expense', amount: bus, cat: 'Transporte', cuenta: 'efectivo', date: dia(10, mm) });
    });
    await sembrar(page, estadoBase({ transactions: tx }));
    page.respuestas = [true];
    await page.evaluate(() => armarPresupuestosSolo());
    assert.match(page.dialogos[0], /Comida: L\. 2,850\.00 \(sueles gastar L\. 3,000\.00\)/);
    assert.deepEqual(await page.evaluate(() => state.presupuestos.map(p => [p.cat, p.monto, p.periodo])), [['Comida', 2850, 'mes'], ['Transporte', 950, 'mes']]);
    // Ya no se ofrecen otra vez
    assert.deepEqual(await page.evaluate(() => presupuestosSugeridos().length), 0);
    assert.deepEqual(page.errores, []);
  });

  it('importa un estado de cuenta en CSV: columnas por nombre, categorías solas, sin duplicados ni pagos de tarjeta', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase({ cuentasIniciales: { efectivo: 0, ahorro: 20000 }, transactions: [
      { id: 'ya00001', type: 'expense', amount: 450, cat: 'Comida', subcat: 'Baleadas', cuenta: 'ahorro', date: new Date(2026, 8, 3, 12).toISOString() },
    ] }));
    const csv = ['BANCO DE PRUEBA S.A.', 'Estado de cuenta;;;', 'Fecha;Descripción;Débito;Crédito;Saldo',
      '02/09/2026;UBER TRIP HELP;"125.50";;19874.50', '03/09/2026;BALEADAS DOÑA TERE;450.00;;19424.50', '05/09/2026;PRICESMART TEGUCIGALPA;"2,310.00";;17114.50',
      '10/09/2026;DEPOSITO PLANILLA;;15,000.00;32114.50', '12/09/2026;TRANSFERENCIA A TERCEROS;1000.00;;31114.50', 'Totales;;;;'].join('\n');
    await page.evaluate(() => abrirImportarBanco());
    await page.setInputFiles('#imp-archivo', { name: 'estado.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await page.waitForSelector('#imp-lista .imp-fila');
    await page.selectOption('#imp-destino', 'ahorro');
    await page.waitForTimeout(100);
    const filas = await page.evaluate(() => _imp.movimientos.map(m => [m.desc, m.tipo, m.monto, m.cat, m.marcado]));
    assert.deepEqual(filas, [
      ['UBER TRIP HELP', 'gasto', 125.5, 'Transporte', true],
      ['BALEADAS DOÑA TERE', 'gasto', 450, 'Comida', false],
      ['PRICESMART TEGUCIGALPA', 'gasto', 2310, 'Supermercado', true],
      ['DEPOSITO PLANILLA', 'ingreso', 15000, 'Salario', true],
      ['TRANSFERENCIA A TERCEROS', 'gasto', 1000, 'Otros', false],
    ]);
    await page.click('#imp-lista .btn-primary');
    await page.waitForFunction(() => state.transactions.length === 4);
    assert.equal(await page.evaluate(() => getCuentaBalance('ahorro')), 20000 - 450 - 125.5 - 2310 + 15000);
    assert.equal(await page.evaluate(() => state.transactions.filter(t => t.importado).length), 3);
    assert.deepEqual(page.errores, []);
  });

  it('también entiende un Excel exportado como CSV con una sola columna de monto y fechas cortas; y a una tarjeta', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase({ tarjetas: [{ id: 'tarjeta0001', nombre: 'BAC Visa', limite: 30000, saldo: 0, saldoBase: 0, corte: 20, pago: 5 }] }));
    const csv = ['Date,Description,Amount', '9/1/26,NETFLIX.COM,-399.00', '14/9/26,SU PAGO GRACIAS,5000.00', '15-sep-2026,Shell Los Próceres,(650.00)'].join('\n');
    await page.evaluate(() => abrirImportarBanco());
    await page.setInputFiles('#imp-archivo', { name: 'tarjeta.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await page.waitForSelector('#imp-lista .imp-fila');
    await page.selectOption('#imp-destino', 'tc:tarjeta0001');
    await page.selectOption('#imp-signo', 'ingresos'); // aquí los positivos son abonos
    await page.waitForTimeout(100);
    const filas = await page.evaluate(() => _imp.movimientos.map(m => [m.fecha.getDate(), m.desc, m.tipo, m.monto, m.marcado]));
    assert.deepEqual(filas, [[9, 'NETFLIX.COM', 'gasto', 399, true], [14, 'SU PAGO GRACIAS', 'ingreso', 5000, false], [15, 'Shell Los Próceres', 'gasto', 650, true]]);
    await page.click('#imp-lista .btn-primary');
    await page.waitForFunction(() => state.transactions.length === 2);
    assert.equal(await page.evaluate(() => state.tarjetas[0].saldo), 1049);
    assert.deepEqual(await page.evaluate(() => state.transactions.map(t => t.cat)), ['Suscripciones', 'Gasolina']);
  });

  it('la guía explica cada truco y sus botones llevan a probarlo', async () => {
    const page = await env.pagina();
    await sembrar(page, conCafe());
    await page.evaluate(() => abrirGuia('importar'));
    await page.waitForTimeout(150);
    assert.equal(await page.locator('#guia-lista .guia-tema').count(), 17);
    assert.equal(await page.evaluate(() => document.getElementById('guia-importar').open), true);
    await page.click('#guia-importar .guia-btn');
    assert.equal(await page.isVisible('#modal-importar-banco'), true);
    const man = require('../manifest.json');
    assert.deepEqual(man.shortcuts.map(s => s.url), ['./?action=new-expense', './?action=dictar', './?action=favoritos', './?action=balance']);
    assert.deepEqual(page.errores, []);
  });
});
