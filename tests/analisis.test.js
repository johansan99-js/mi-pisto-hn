// Pantalla de Análisis: dona por categoría, comparación con el periodo anterior y gasto por día
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase } = require('./helpers');

const HOY = new Date(2026, 8, 25, 12, 0); // viernes 25 de septiembre
const dia = (d, m = 8, h = 10) => new Date(2026, m, d, h, 0).toISOString();
const gasto = (id, amount, cat, d, m = 8, extra = {}) => Object.assign({ id, type: 'expense', amount, cat, date: dia(d, m), cuenta: 'efectivo', tipo: 'extra' }, extra);

const TX = [
  { id: 'ing00001', type: 'income', amount: 10000, cat: 'Salario', subcat: 'salario', date: dia(15), cuenta: 'ahorro' },
  { id: 'ing00002', type: 'income', amount: 2000, cat: 'Remesa', subcat: 'extra', date: dia(5), cuenta: 'efectivo' },
  gasto('gas00001', 600, 'Comida', 24),
  gasto('gas00002', 400, 'Comida', 22),
  gasto('gas00003', 2000, 'Luz', 10, 8, { tipo: 'fijo' }),
  // Un pago dividido: cada parte a su categoría
  gasto('gas00004', 1000, 'Varios (Supermercado, Hogar)', 21, 8, { splits: [{ cat: 'Supermercado', monto: 700 }, { cat: 'Hogar', monto: 300 }] }),
  // No cuentan: transferencia, ajuste, borrado
  gasto('tra00001', 5000, 'Transferencia', 20, 8, { esTransferencia: true }),
  gasto('con00001', 50, 'Conciliación', 19, 8, { esConciliacion: true }),
  gasto('bor00001', 999, 'Comida', 18, 8, { deletedAt: dia(18) }),
  // Agosto, para comparar
  gasto('ago00001', 500, 'Comida', 12, 7),
  gasto('ago00002', 2500, 'Luz', 10, 7),
];

describe('Análisis', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  async function abrir(estado) {
    const page = await env.pagina();
    await page.clock.setFixedTime(HOY);
    await sembrar(page, estadoBase(estado || { transactions: TX }));
    await page.click('#tab-historico');
    return page;
  }

  it('el mes: totales, dona por categoría y cada categoría con su % y la comparación con agosto', async () => {
    const page = await abrir();
    assert.equal(await page.textContent('#tab-historico .nav-label'), 'Análisis');
    const txt = await page.textContent('#analisis');
    assert.match(txt, /Septiembre 2026/);
    assert.match(txt, /Gastos\s*L\. 4,000\.00\s*Ingresos\s*L\. 12,000\.00\s*Saldo\s*L\. 8,000\.00/);
    const cats = await page.$$eval('#analisis .an-cat-fila', fs => fs.map(f => [f.dataset.cat, f.querySelector('.an-cat-pct').textContent]));
    assert.deepEqual(cats, [['Luz', '50%'], ['Comida', '25%'], ['Supermercado', '18%'], ['Hogar', '7.5%']]);
    assert.equal(await page.$$eval('#analisis .an-seg', s => s.length), 4);
    // Luz bajó (bien, en verde) y Comida subió (en rojo) contra agosto
    assert.match(await page.textContent('.an-cat-fila[data-cat="Luz"] .an-cat-bot'), /▼ 20% vs\. agosto/);
    assert.equal(await page.$eval('.an-cat-fila[data-cat="Luz"] .an-cat-bot small:last-child', e => e.className), 'verde');
    assert.match(await page.textContent('.an-cat-fila[data-cat="Comida"] .an-cat-bot'), /▲ 100% vs\. agosto/);
    assert.match(await page.textContent('.an-cat-fila[data-cat="Hogar"] .an-cat-bot'), /Nuevo/);
    // Tocar un pedazo de la dona dice cuánto es
    await page.click('.an-ley[data-cat="Comida"]');
    assert.match(await page.textContent('.an-dona'), /Comida\s*25%/);
    // Tocar una categoría muestra sus movimientos y desde ahí se editan
    await page.click('.an-cat-fila[data-cat="Comida"]');
    const det = await page.$$eval('.an-cat.abierta .an-det-fila', fs => fs.map(f => [...f.children].map(c => c.textContent.trim()).join(' ')));
    assert.deepEqual(det, ['24 sep 💵 Efectivo L. 600.00', '22 sep 💵 Efectivo L. 400.00']);
    await page.click('.an-cat.abierta .an-det-fila');
    assert.equal(await page.inputValue('#edit-tx-id'), 'gas00001');
    assert.deepEqual(page.errores, []);
  });

  it('ingresos por categoría y los meses anteriores con ‹ ›', async () => {
    const page = await abrir();
    await page.click('.an-vista .an-seg-btn:text("Ingresos")');
    assert.deepEqual(await page.$$eval('#analisis .an-cat-fila', fs => fs.map(f => f.dataset.cat)), ['Salario', 'Remesa']);
    assert.equal(await page.$eval('#analisis .rm-nav button:last-child', b => b.disabled), true, 'no hay meses futuros');
    await page.click('#analisis .rm-nav button:first-child');
    assert.match(await page.textContent('#analisis'), /Agosto 2026[\s\S]*No hay ingresos en este periodo/);
    await page.click('.an-vista .an-seg-btn:text("Gastos")');
    assert.deepEqual(await page.$$eval('#analisis .an-cat-fila', fs => fs.map(f => f.dataset.cat)), ['Luz', 'Comida']);
  });

  it('la semana va de domingo a sábado y el año junta todos sus meses', async () => {
    const page = await abrir();
    await page.click('.an-periodo .an-seg-btn:text("Semana")');
    const txt = await page.textContent('#analisis');
    assert.match(txt, /20 – 26 sep/);
    assert.match(txt, /Gastos\s*L\. 2,000\.00/, 'solo 21, 22 y 24 de septiembre');
    await page.click('#analisis .rm-nav button:first-child');
    assert.match(await page.textContent('#analisis'), /13 – 19 sep[\s\S]*Gastos\s*L\. 0\.00[\s\S]*Ingresos\s*L\. 10,000\.00/);
    await page.click('.an-periodo .an-seg-btn:text("Año")');
    assert.match(await page.textContent('#analisis'), /2026[\s\S]*Gastos\s*L\. 7,000\.00/);
    await page.click('.an-vista .an-seg-btn:text("Por día")');
    assert.equal(await page.$$eval('.an-cal-anio .an-dia', d => d.length), 12);
    assert.equal(await page.$$eval('.an-cal-anio .an-dia.futuro', d => d.length), 3, 'octubre a diciembre todavía no');
  });

  it('por día: curva, promedio, día más alto, días sin gastar y calendario', async () => {
    const page = await abrir();
    await page.click('.an-vista .an-seg-btn:text("Por día")');
    const stats = (await page.textContent('.an-stats')).replace(/\s+/g, ' ');
    // 4,000 en los 25 días que van del mes
    assert.match(stats, /Promedio diario\s*L\. 160\.00/);
    assert.match(stats, /Día más alto\s*L\. 2,000\.00\s*Jueves 10 sep/);
    assert.match(stats, /Días sin gastar\s*21/);
    assert.equal(await page.$$eval('.an-cal-dias .an-dia', d => d.length), 30);
    assert.equal(await page.$$eval('.an-cal-dias .an-dia.futuro', d => d.length), 5);
    // El 1 de septiembre de 2026 es martes: dos espacios antes
    assert.equal(await page.$$eval('.an-cal-dias > span', s => s.length), 2);
    await page.click('.an-cal-dias .an-dia:has(span:text-is("24"))');
    assert.match(await page.textContent('.an-punto'), /Jueves 24 sep\s*L\. 600\.00/);
    assert.equal(await page.$$eval('.an-curva .an-pt.activo', p => p.length), 1);
  });

  it('con más de 7 categorías la dona junta las pequeñas en "Otras"', async () => {
    const nombres = ['Comida', 'Luz', 'Agua', 'Ropa', 'Salud', 'Gasolina', 'Transporte', 'Regalos', 'Mascotas'];
    const page = await abrir({ transactions: nombres.map((c, i) => gasto('g' + String(i).padStart(7, '0'), 1000 - i * 100, c, 3 + i)) });
    assert.equal(await page.$$eval('.an-seg', s => s.length), 8);
    assert.match(await page.textContent('.an-leyenda'), /Otras/);
    assert.equal(await page.$$eval('.an-cat-fila', f => f.length), 9, 'la lista sí las muestra todas');
  });
});
