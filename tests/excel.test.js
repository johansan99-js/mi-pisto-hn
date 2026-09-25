// Reporte en Excel: se genera el archivo real con SheetJS y se vuelve a leer
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const XLSX = require('xlsx');
const { crearEntorno, sembrar, estadoBase, UUID_TC } = require('./helpers');

const HOY = new Date(2026, 8, 25, 12, 0);
const dia = (d, m = 8) => new Date(2026, m, d, 10, 0).toISOString();
const estado = () => estadoBase({
  nombre: 'María José', saldoInicial: 20000, cuentasIniciales: { efectivo: 5000, ahorro: 15000 },
  transactions: [
    { id: 'ing00001', type: 'income', amount: 14500, cat: 'Salario', subcat: 'Quincena', date: dia(15), cuenta: 'ahorro' },
    { id: 'gas00001', type: 'expense', amount: 1200, cat: 'Comida', subcat: 'Súper', date: dia(16), cuenta: 'efectivo', nota: 'Con Luis' },
    { id: 'gas00002', type: 'expense', amount: 800, cat: 'Súper', date: dia(18), cuenta: 'ahorro', splits: [{ cat: 'Comida', monto: 500 }, { cat: 'Casa', monto: 300 }] },
    { id: 'gas00003', type: 'expense', amount: 1350, cat: 'Compras', date: dia(20), cuenta: null, tarjetaId: UUID_TC, originalCurrency: 'USD', originalAmount: 50, conversionRate: 27 },
    { id: 'tra00001', type: 'expense', amount: 2000, cat: 'Transferencia', subcat: 'Salida de Ahorro', date: dia(21), cuenta: 'ahorro', esTransferencia: true },
    { id: 'tra00002', type: 'income', amount: 2000, cat: 'Transferencia', subcat: 'Entrada a Efectivo', date: dia(21), cuenta: 'efectivo', esTransferencia: true },
    { id: 'bor00001', type: 'expense', amount: 99999, cat: 'Borrado', date: dia(22), cuenta: 'efectivo', deletedAt: dia(22) },
    { id: 'ago00001', type: 'expense', amount: 3000, cat: 'Casa', date: dia(3, 7), cuenta: 'ahorro' },
    { id: 'ago00002', type: 'income', amount: 29000, cat: 'Salario', date: dia(1, 7), cuenta: 'ahorro' },
  ],
  tarjetas: [{ id: UUID_TC, nombre: 'BAC Visa', ultimos4: '4821', corte: 20, pago: 5, limite: 40000, saldo: 1350, saldoBase: 0, tasaInteres: 48, historialPagos: [] }],
  payables: [{ id: 'deuda001', creditor: 'Tía Rosa', tipo: 'persona', monto: 1000, pagado: 200 }],
  receivables: [{ id: 'cobro001', persona: 'Luis', monto: 600, pagado: 0 }],
  goals: [{ id: 'meta0001', nombre: 'Viaje', objetivo: 10000, actual: 2500 }],
  presupuestos: [{ id: 'pres0001', cat: 'Comida', monto: 3000, periodo: 'quincena' }],
});

describe('Reporte en Excel', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('trae hojas claras con fechas reales, montos con formato, filtros y sin movimientos borrados', async () => {
    const page = await env.pagina();
    await page.clock.setFixedTime(HOY);
    await sembrar(page, estado());
    await page.addScriptTag({ path: require.resolve('xlsx/dist/xlsx.full.min.js') });
    const ordenAntes = await page.evaluate(() => state.transactions.map(t => t.id).join());
    const r = await page.evaluate(() => {
      let salida = null;
      XLSX.writeFile = (wb, nombre, opts) => { salida = { nombre, b64: XLSX.write(wb, Object.assign({ type: 'base64', bookType: 'xlsx' }, opts)) }; };
      exportToExcelPro();
      return salida;
    });
    assert.equal(r.nombre, 'MiPisto_Maria_Jose_2026-09-25.xlsx');
    assert.equal(await page.evaluate(() => state.transactions.map(t => t.id).join()), ordenAntes, 'exportar ya no reordena los movimientos de la app');

    const wb = XLSX.read(Buffer.from(r.b64, 'base64'), { cellDates: true, cellNF: true, cellStyles: true });
    assert.deepEqual(wb.SheetNames, ['Resumen', 'Movimientos', 'Por mes', 'Categorías 2026', 'Cuentas', 'Deudas', 'Presupuestos', 'Metas']);

    const mov = XLSX.utils.sheet_to_json(wb.Sheets.Movimientos, { header: 1 });
    assert.deepEqual(mov[0], ['Fecha', 'Tipo', 'Categoría', 'Detalle', 'Cuenta', 'Tarjeta', 'Monto (L)', 'Moneda', 'Monto original', 'Nota']);
    assert.equal(mov.length, 9, '8 movimientos, sin el borrado');
    assert.ok(!mov.some(f => f.includes('Borrado')));
    const fila = id => mov.find(f => f[3] === id);
    assert.deepEqual(fila('Súper').slice(1, 7).concat(fila('Súper')[9]), ['Gasto', 'Comida', 'Súper', 'Efectivo', '', -1200, 'Con Luis']);
    assert.deepEqual(mov.find(f => f[2] === 'Comida + Casa').slice(1, 7), ['Gasto', 'Comida + Casa', '', 'Cuenta de Ahorro', '', -800]);
    const usd = mov.find(f => f[2] === 'Compras');
    assert.deepEqual([usd[1], usd[5], usd[6], usd[7], usd[8]], ['Gasto', 'BAC Visa', -1350, 'USD', 50]);
    assert.ok(mov.some(f => f[1] === 'Transferencia' && f[6] === 2000));
    // Fecha real y formatos
    const ws = wb.Sheets.Movimientos;
    assert.ok(ws.A2.v instanceof Date, 'la fecha es una fecha de Excel');
    assert.equal(ws.A2.z, 'dd/mm/yyyy');
    assert.equal(ws.G2.z, '"L "#,##0.00;[Red]-"L "#,##0.00');
    assert.equal(ws['!autofilter'].ref, 'A1:J9');
    assert.equal(ws['!cols'][3].wch, 30);

    // Resumen: sin borrados ni transferencias
    const res = Object.fromEntries(XLSX.utils.sheet_to_json(wb.Sheets.Resumen, { header: 1 }).filter(f => f.length > 1).map(f => [f[0], f[1]]));
    assert.equal(res['Dinero en tus cuentas'], 20000 + 14500 - 1200 - 800 + 29000 - 3000);
    assert.equal(res['Tarjetas de crédito'], 1350);
    assert.equal(res['Otras deudas'], 800);
    assert.equal(res['Te deben'], 600);
    assert.equal(res['Patrimonio neto'], 58500 + 600 - 1350 - 800);
    // Por mes, categorías, cuentas, deudas, presupuestos y metas
    const pm = XLSX.utils.sheet_to_json(wb.Sheets['Por mes'], { header: 1 });
    assert.deepEqual(pm.slice(1).map(f => f.slice(0, 4)), [['septiembre 2026', 14500, 3350, 11150], ['agosto 2026', 29000, 3000, 26000]]);
    const cat = XLSX.utils.sheet_to_json(wb.Sheets['Categorías 2026'], { header: 1 });
    assert.deepEqual(cat[0].slice(0, 2).concat(cat[0].slice(-1)), ['Categoría', 'ene', 'Total']);
    assert.deepEqual(cat.find(f => f[0] === 'Comida').slice(-1), [1700]);
    assert.deepEqual(cat.find(f => f[0] === 'Casa').slice(-1), [3300]);
    const deu = XLSX.utils.sheet_to_json(wb.Sheets.Deudas, { header: 1 });
    assert.deepEqual(deu.slice(1).map(f => [f[0], f[1], f[4]]), [['Tarjeta', 'BAC Visa •••• 4821', 1350], ['Debo (persona)', 'Tía Rosa', 800], ['Me deben', 'Luis', 600]]);
    const pre = XLSX.utils.sheet_to_json(wb.Sheets.Presupuestos, { header: 1 });
    assert.deepEqual(pre[1].slice(0, 6), ['Comida', 'Quincena', '15 sept al 29 sept', 3000, 1700, 1300]);
    const met = XLSX.utils.sheet_to_json(wb.Sheets.Metas, { header: 1 });
    assert.deepEqual(met[1], ['Viaje', 10000, 2500, 0.25]);
    assert.deepEqual(page.errores, []);
  });

  it('sin la herramienta de Excel lo explica en vez de fallar', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase());
    await page.evaluate(() => { window.XLSX = undefined; exportToExcelPro(); });
    assert.match(page.dialogos.pop(), /No se pudo cargar la herramienta de Excel/);
  });
});
