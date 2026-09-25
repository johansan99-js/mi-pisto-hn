// Tu mes en historias: pantallas del informe, presupuestos del mes, constancia y compartir sin montos
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase } = require('./helpers');

const HOY = new Date(2026, 9, 2, 12, 0); // 2 de octubre: septiembre acaba de cerrar
const tx = (id, type, amount, cat, d, m = 8, extra = {}) => Object.assign({ id, type, amount, cat, cuenta: 'efectivo', tipo: 'extra', date: new Date(2026, m, d, 15).toISOString() }, extra);
const base = extra => estadoBase(Object.assign({ nombre: 'Ana', cuentasIniciales: { efectivo: 10000, ahorro: 0 }, transactions: [
  tx('ago00001', 'income', 20000, 'Salario', 1, 7), tx('ago00002', 'expense', 5000, 'Comida', 5, 7),
  tx('sep00001', 'income', 20000, 'Salario', 1), tx('sep00002', 'expense', 3000, 'Comida', 5), tx('sep00003', 'expense', 1500, 'Transporte', 9),
  tx('sep00004', 'expense', 500, 'Comida', 20), tx('sep00005', 'expense', 900, 'Salidas', 20),
] }, extra));

describe('Tu mes en historias', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('calcula presupuestos, constancia, el día más caro, remesas y metas del mes', async () => {
    const page = await env.pagina();
    await page.clock.setFixedTime(HOY);
    await sembrar(page, base({
      presupuestos: [{ id: 'presu0001', cat: 'Comida', monto: 3000, periodo: 'mes' }, { id: 'presu0002', cat: 'Transporte', monto: 2000, periodo: 'mes' }],
      goals: [{ id: 'meta00001', nombre: 'Viaje', objetivo: 10000, actual: 2500 }],
    }));
    const d = await page.evaluate(() => { const d = informeDelMes(2026, 8); return { ah: d.pctAhorro, cambio: d.cambioGasto, top: d.top.map(c => [c.cat, c.pct]), cumplidos: d.cumplidos, presus: d.presus.map(p => [p.cat, p.cumplido, p.pasado]), dias: d.dias, diasMes: d.diasMes, diaMax: d.diaMax, metas: d.metas, remesas: d.remesas }; });
    assert.deepEqual(d, {
      ah: 71, cambio: 18, top: [['Comida', 59], ['Transporte', 25], ['Salidas', 15]],
      cumplidos: 1, presus: [['Comida', false, 500], ['Transporte', true, 0]],
      dias: 4, diasMes: 30, diaMax: { fecha: '2026-09-05', monto: 3000 }, metas: [{ nombre: 'Viaje', pct: 25 }], remesas: null,
    });
    assert.deepEqual(page.errores, []);
  });

  it('el Inicio lo avisa, las pantallas se pasan tocando y se comparte como imagen sin montos', async () => {
    const page = await env.pagina();
    await page.clock.setFixedTime(HOY);
    await sembrar(page, base({ presupuestos: [{ id: 'presu0001', cat: 'Comida', monto: 3000, periodo: 'mes' }] }));
    await page.waitForSelector('#aviso-resumen', { state: 'visible' });
    await page.click('#aviso-resumen .btn-primary');
    assert.equal(await page.isVisible('#modal-informe-mes'), true);
    const txt = () => page.textContent('#informe-mes');
    assert.match(await txt(), /Septiembre 2026[\s\S]*Te sobró\s*L\. 14,100\.00\s*71% de lo que ganaste[\s\S]*Gastaste 18% más que en agosto[\s\S]*Guardaste más de lo recomendado/);
    // Sin metas ni remesas: cómo te fue, categorías, presupuestos, constancia y consejo
    assert.equal(await page.evaluate(() => _inf.pantallas.length), 5);
    await page.click('#informe-mes', { position: { x: 300, y: 400 } });
    assert.match(await txt(), /Tus 3 categorías[\s\S]*1\. Comida[\s\S]*59%/);
    // Tocar a la izquierda regresa
    await page.click('#informe-mes', { position: { x: 20, y: 400 } });
    assert.match(await txt(), /Septiembre 2026/);
    await page.evaluate(() => pasarInforme(2));
    assert.match(await txt(), /Cumpliste 0 de 1[\s\S]*Comida: te pasaste L\. 500\.00/);
    await page.evaluate(() => pasarInforme(1));
    assert.match(await txt(), /Anotaste 4 de 30 días/);
    await page.evaluate(() => pasarInforme(1));
    assert.match(await txt(), /Para octubre[\s\S]*Compartir \(sin montos\)/);
    // Compartir: sin Web Share se descarga la imagen PNG
    await page.evaluate(() => { navigator.canShare = () => false; window.__descargas = []; descargarArchivo = (b, n) => window.__descargas.push([b.type, n, b.size]); });
    await page.click('#informe-mes .btn-primary');
    await page.waitForFunction(() => window.__descargas.length === 1);
    const [tipo, nombre, tam] = await page.evaluate(() => window.__descargas[0]);
    assert.deepEqual([tipo, nombre], ['image/png', 'MiPisto_septiembre_2026.png']);
    assert.ok(tam > 10000);
    await page.click('#informe-mes .btn-secondary');
    assert.equal(await page.isVisible('#modal-informe-mes'), false);
    assert.equal(await page.isVisible('#aviso-resumen'), false, 'ya visto');
    // Desde Análisis se puede ver cualquier mes
    await page.evaluate(() => { switchView('historico'); document.getElementById('resumen-mes').value = '2026-7'; renderResumenMes(); });
    await page.click('#resumen-mes-cuerpo .inf-ver');
    assert.match(await txt(), /Agosto 2026/);
    assert.deepEqual(page.errores, []);
  });
});
