const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase } = require('./helpers');

describe('Varias metas de ahorro', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('con una meta ya creada se pueden agregar más desde la pantalla de Metas', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase({ goals: [{ id: 'meta0001', nombre: 'Fondo de emergencia', objetivo: 30000, actual: 0, esFondoEmergencia: true }] }));
    await page.evaluate(() => { localStorage.setItem('mph_primeros_pasos', 'oculto'); switchView('metas'); });
    for (const [nombre, monto] of [['Viaje a Roatán', '15000'], ['Moto', '40000'], ['Escuela', '8000']]) {
      await page.click('#btn-nueva-meta');
      await page.fill('#meta-nombre', nombre);
      await page.fill('#meta-objetivo', monto);
      await page.click('#modal-meta .btn-primary');
    }
    assert.deepEqual(await page.evaluate(() => state.goals.map(g => g.nombre)), ['Fondo de emergencia', 'Viaje a Roatán', 'Moto', 'Escuela']);
    assert.equal(await page.locator('#metas-list .goal-card-pro').count(), 4);
    assert.ok(await page.isVisible('#btn-nueva-meta'), 'el botón sigue a la vista');
    // En el Inicio salen 3 y un enlace a todas
    await page.evaluate(() => switchView('dashboard'));
    assert.equal(await page.locator('#dashboard-goals .goal-mini').count(), 3);
    assert.match(await page.textContent('#dashboard-goals .goal-mini-mas'), /Ver las 4 metas/);
    await page.click('#inicio-nueva-meta');
    assert.ok(await page.isVisible('#modal-meta'));
  });
});
