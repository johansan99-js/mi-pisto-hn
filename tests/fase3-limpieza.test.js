// Fase 3 de la revisión: el Inicio sin bloques de relleno y la papelera que no deja fotos atrás
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase } = require('./helpers');

describe('Fase 3: limpieza', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('el Inicio ya no trae la regla 65/20/15, Vital vs Ocio, Índice de Libertad ni totales de toda la vida', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase({ transactions: [
      { id: 'mov00001', type: 'income', amount: 10000, cat: 'Salario', cuenta: 'efectivo', date: new Date().toISOString() },
      { id: 'mov00002', type: 'expense', amount: 9000, cat: 'Comida', cuenta: 'efectivo', tipo: 'extra', date: new Date().toISOString() },
    ] }));
    const texto = await page.textContent('#view-dashboard');
    for (const fuera of ['Distribución Personalizada', 'Vital vs Ocio', 'Libertad Financiera', 'Cobrado hoy', 'Conciliación de Cuentas', 'excedidos este mes'])
      assert.ok(!texto.includes(fuera), 'todavía aparece: ' + fuera);
    assert.equal(await page.evaluate(() => typeof Chart), 'undefined', 'Chart.js ya no se descarga');
    // Análisis sigue funcionando sin la gráfica vieja, y cambiar de tema no rompe nada
    await page.evaluate(() => { switchView('historico'); elegirTema('claro'); elegirTema('oscuro'); });
    assert.match(await page.textContent('#view-historico'), /Comida/);
    assert.ok(!(await page.textContent('#view-historico')).includes('Evolución de mi Patrimonio'));
    assert.deepEqual(page.errores, []);
  });

  it('vaciar la papelera borra también las fotos de las facturas', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase());
    const idFoto = await page.evaluate(async () => {
      const id = await _guardarTempFactura('data:image/png;base64,iVBORw0KGgo=');
      state.transactions.push({ id: 'mov00003', type: 'expense', amount: 50, cat: 'Comida', cuenta: 'efectivo', date: new Date().toISOString(), facturaImagenId: id, deletedAt: new Date().toISOString() });
      await save();
      return id;
    });
    const hay = id => page.evaluate(i => initDB().then(db => new Promise(r => { const g = db.transaction('facturas').objectStore('facturas').get(i); g.onsuccess = () => r(!!g.result); g.onerror = () => r(false); })), id);
    assert.equal(await hay(idFoto), true);
    page.respuestas = [true];
    await page.evaluate(() => vaciarPapelera());
    assert.equal(await page.evaluate(() => state.transactions.length), 0);
    assert.equal(await hay(idFoto), false);
  });
});
