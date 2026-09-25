// Pantalla de Presupuestos por categoría: límite, gastado, restante y "Poner presupuesto"
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase } = require('./helpers');

const HOY = new Date(2026, 8, 25, 12, 0); // viernes 25 de septiembre
const dia = (d, m = 8) => new Date(2026, m, d, 10, 0).toISOString();
const g = (id, amount, cat, d, m = 8, extra = {}) => Object.assign({ id, type: 'expense', amount, cat, date: dia(d, m), cuenta: 'efectivo', tipo: 'extra' }, extra);
const TX = [
  g('gas00001', 1455, 'Ropa', 3), g('gas00002', 1301.5, 'Salidas', 12), g('gas00003', 3702.5, 'Comida', 20),
  g('gas00004', 950, 'Transporte', 22), g('gas00005', 2300, 'Luz', 10),
  g('tra00001', 5000, 'Comida', 21, 8, { esTransferencia: true }),
  g('ago00001', 3400, 'Comida', 12, 7), g('ago00002', 1100, 'Salidas', 5, 7), g('jul00001', 3900, 'Comida', 12, 6),
];
const PRESU = [{ id: 'pre00001', cat: 'Ropa', monto: 2000, periodo: 'mes' }, { id: 'pre00002', cat: 'Salidas', monto: 1200, periodo: 'mes' }, { id: 'pre00003', cat: 'Comida', monto: 4000, periodo: 'mes' }];

describe('Pantalla de Presupuestos', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });
  async function abrir(extra) {
    const page = await env.pagina();
    await page.clock.setFixedTime(HOY);
    await sembrar(page, estadoBase(Object.assign({ cuentasIniciales: { efectivo: 30000, ahorro: 0 }, transactions: TX, presupuestos: PRESU }, extra)));
    await page.evaluate(() => { localStorage.setItem('mph_primeros_pasos', 'oculto'); switchView('presupuestos'); });
    return page;
  }
  const tarjetas = page => page.$$eval('#presupuestos-vista .pv-tarjeta', ts => ts.map(t => t.innerText.replace(/\s+/g, ' ').trim()));

  it('cada categoría con límite, gastado, restante y el aviso de límite excedido', async () => {
    const page = await abrir();
    const txt = await page.textContent('#presupuestos-vista');
    assert.match(txt, /Septiembre 2026/);
    assert.match(txt, /Presupuesto\s*L\. 7,200\.00\s*Gastado\s*L\. 6,459\.00\s*Restante\s*L\. 741\.00/);
    const ts = await tarjetas(page);
    // Primero la que va peor
    assert.equal(ts.length, 3);
    assert.match(ts[0], /Salidas L\. 1,200\.00 Límite L\. 1,200\.00 Gastado L\. 1,301\.50 Restante L\. 0\.00 🚨 Límite excedido por L\. 101\.50$/i);
    assert.match(ts[1], /Comida .* Gastado L\. 3,702\.50 Restante L\. 297\.50 ⚠️ Puedes gastar L\. 49\.58 por día \(6 días\)$/i, 'la transferencia no cuenta');
    assert.match(ts[2], /Ropa .* Restante L\. 545\.00 Puedes gastar L\. 90\.83 por día \(6 días\)$/i);
    assert.deepEqual(await page.$$eval('.pv-barra', bs => bs.map(b => b.className)), ['pv-barra pasado', 'pv-barra aviso', 'pv-barra bien']);
    // Sin presupuesto: primero las que tuvieron gastos
    const sin = await page.$$eval('.pv-sin strong', s => s.map(x => x.textContent));
    assert.deepEqual(sin.slice(0, 3), ['Todos mis gastos', 'Luz', 'Transporte']);
    assert.match(await page.textContent('.pv-sin:has(strong:text-is("Luz"))'), /Gastaste L\. 2,300\.00/);
    // El mes anterior con los mismos topes, sin "por día"
    assert.equal(await page.$eval('#presupuestos-vista .rm-nav button:last-child', b => b.disabled), true);
    await page.click('#presupuestos-vista .rm-nav button:first-child');
    assert.match(await page.textContent('#presupuestos-vista'), /Agosto 2026[\s\S]*Gastado\s*L\. 4,500\.00\s*Restante\s*L\. 2,700\.00/);
    assert.doesNotMatch(await page.textContent('#presupuestos-vista'), /por día/);
    assert.deepEqual(page.errores, []);
  });

  it('"Poner presupuesto" sugiere un monto según lo que gastaste y lo guarda', async () => {
    const page = await abrir({ presupuestos: [] });
    assert.match(await page.textContent('#presupuestos-vista'), /Todavía no tienes categorías con presupuesto al mes/);
    await page.click('.pv-poner[data-cat="Comida"]');
    assert.match(await page.textContent('#pc-titulo'), /Comida/);
    // Agosto 3,400 y julio 3,900: promedio 3,650 → sugiere 3,700
    assert.match(await page.textContent('#pc-sugerencia'), /gastaste en promedio L\. 3,650\.00 al mes\. Usar L\. 3,700\.00/);
    await page.click('#pc-sugerencia button');
    assert.equal(await page.inputValue('#pc-monto'), '3700');
    await page.click('#modal-presu-cat .btn-primary');
    const p = await page.evaluate(() => state.presupuestos.map(({ cat, monto, periodo }) => ({ cat, monto, periodo })));
    assert.deepEqual(p, [{ cat: 'Comida', monto: 3700, periodo: 'mes' }]);
    assert.match(await page.textContent('#aviso-rapido'), /Comida: L\. 3,700\.00 al mes/);
    assert.equal((await tarjetas(page)).length, 1);
    // Sin monto no se guarda
    await page.click('.pv-poner[data-cat="Luz"]');
    await page.click('#modal-presu-cat .btn-primary');
    assert.match(page.dialogos.pop(), /cuánto quieres gastar/);
  });

  it('editar, pasarlo a quincena y quitarlo', async () => {
    const page = await abrir();
    await page.click('.pv-tarjeta[data-id="pre00001"]');
    assert.equal(await page.inputValue('#pc-monto'), '2000');
    await page.fill('#pc-monto', '1,500');
    await page.selectOption('#pc-periodo', 'quincena');
    await page.click('#modal-presu-cat .btn-primary');
    assert.deepEqual(await page.evaluate(() => { const p = state.presupuestos.find(x => x.id === 'pre00001'); return [p.monto, p.periodo, state.presupuestos.length]; }), [1500, 'quincena', 3]);
    // La pantalla se va a la quincena para mostrarlo
    assert.equal(await page.textContent('#presupuestos-vista .an-seg-btn.activa'), 'Quincena');
    assert.match(await page.textContent('#presupuestos-vista .rm-nav strong'), /15 – 29 sep/);
    assert.match((await tarjetas(page))[0], /Ropa/);
    await page.click('.pv-tarjeta[data-id="pre00001"]');
    await page.click('#pc-quitar');
    assert.match(page.dialogos.pop(), /Quitar el presupuesto de Ropa/);
    assert.equal(await page.evaluate(() => state.presupuestos.some(x => x.id === 'pre00001')), false);
  });

  it('el tope de todos mis gastos va aparte y no suma al total', async () => {
    const page = await abrir({ presupuestos: PRESU.concat([{ id: 'pre00009', cat: '*', monto: 10000, periodo: 'mes' }]) });
    const txt = await page.textContent('#presupuestos-vista');
    assert.match(txt, /Presupuesto\s*L\. 7,200\.00/);
    assert.match((await tarjetas(page))[0], /Σ Todos mis gastos L\. 10,000\.00 .* Gastado L\. 9,709\.00/i);
    assert.equal(await page.$$eval('.pv-sin strong', s => s.includes('Todos mis gastos')), false);
  });

  it('se llega desde la tarjeta del Inicio y desde el menú', async () => {
    const page = await abrir({ presupuestos: [] });
    await page.evaluate(() => switchView('dashboard'));
    await page.click('#presupuestos-card .btn-primary');
    assert.equal(await page.isVisible('#view-presupuestos'), true);
    await page.evaluate(() => switchView('dashboard'));
    await page.evaluate(() => toggleHamburger());
    await page.click('.hamburger-item:has-text("Presupuestos")');
    assert.equal(await page.isVisible('#view-presupuestos'), true);
  });
});
