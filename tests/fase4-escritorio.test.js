// Fase 4 de la revisión: la app en la computadora
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase } = require('./helpers');

const conMovimientos = () => estadoBase({ nombre: 'Ana', transactions: [
  { id: 'mov00001', type: 'income', amount: 20000, cat: 'Salario', cuenta: 'efectivo', date: new Date().toISOString() },
  { id: 'mov00002', type: 'expense', amount: 350, cat: 'Comida', subcat: 'Pupusas', cuenta: 'efectivo', date: new Date().toISOString() },
  { id: 'mov00003', type: 'expense', amount: 900, cat: 'Luz', subcat: 'ENEE', cuenta: 'efectivo', date: new Date().toISOString() },
] });
const dondeEsta = (page, id) => page.evaluate(i => { const el = document.getElementById(i); const col = el.closest('.esc-col'); return col ? 'columna ' + [...col.parentNode.children].indexOf(col) : el.closest('#desktop-grid-left') ? 'teléfono' : 'otro'; }, id);

describe('Fase 4: computadora', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('en pantalla ancha el Inicio va en columnas con la fila de datos clave, y vuelve a una columna al achicar', async () => {
    const page = await env.pagina({ viewport: { width: 1440, height: 900 } });
    await sembrar(page, conMovimientos());
    assert.equal(await page.locator('#esc-kpis .esc-kpi').count(), 5);
    assert.match(await page.textContent('#esc-kpis'), /Patrimonio neto[\s\S]*L\. 23,750\.00[\s\S]*Ingresos · [a-z]+L\. 20,000/);
    assert.match(await page.textContent('#esc-kpis'), /Gastos · [a-z]+L\. 1,250/);
    assert.equal(await dondeEsta(page, 'registros-mes'), 'columna 0');
    assert.equal(await dondeEsta(page, 'balance-card'), 'columna 1');
    await page.setViewportSize({ width: 1700, height: 900 });
    await page.waitForTimeout(150);
    assert.equal(await dondeEsta(page, 'presupuestos-card'), 'columna 2', 'en 1600 px o más hay tres columnas');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(150);
    assert.equal(await dondeEsta(page, 'registros-mes'), 'teléfono');
    assert.equal(await page.isVisible('#esc-kpis'), false);
    // El orden de siempre en el teléfono: la tarjeta de saldo va antes de los movimientos
    assert.ok(await page.evaluate(() => document.getElementById('balance-card').compareDocumentPosition(document.getElementById('registros-mes')) & Node.DOCUMENT_POSITION_FOLLOWING));
    assert.deepEqual(page.errores, []);
  });

  it('el menú lateral marca la pantalla aunque se llegue sin tocarlo, y trae Remesas, Categorías y Papelera', async () => {
    const page = await env.pagina({ viewport: { width: 1366, height: 768 } });
    await sembrar(page, conMovimientos());
    await page.evaluate(() => switchView('historico'));
    assert.equal(await page.getAttribute('#sb-historico', 'class'), 'sidebar-item active');
    assert.equal(await page.getAttribute('#sb-dashboard', 'class'), 'sidebar-item');
    for (const id of ['sb-remesas', 'sb-categorias', 'sb-papelera']) assert.equal(await page.isVisible('#' + id), true, id);
    await page.click('#sb-papelera');
    assert.equal(await page.evaluate(() => document.querySelector('.view.active').id), 'view-config');
    assert.equal(await page.isVisible('.desktop-hamburger'), false, 'ya no hay un segundo menú ☰');
    // Solo se ve la pantalla activa (Análisis se colaba debajo de las demás)
    for (const v of ['metas', 'consejero', 'tarjetas', 'dashboard']) {
      await page.evaluate(x => switchView(x), v);
      assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.view')].filter(e => getComputedStyle(e).display !== 'none').map(e => e.id)), ['view-' + v], v);
    }
  });

  it('atajos: N abre el registro, Esc lo cierra, / va al buscador y buscar filtra los movimientos', async () => {
    const page = await env.pagina({ viewport: { width: 1366, height: 768 } });
    await sembrar(page, conMovimientos());
    await page.keyboard.press('n');
    assert.equal(await page.isVisible('#modal-registro'), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.isVisible('#modal-registro'), false);
    await page.evaluate(() => switchView('metas'));
    await page.keyboard.press('/');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'dt-buscar');
    await page.keyboard.type('pupusas');
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => document.querySelector('.view.active').id), 'view-dashboard');
    const texto = await page.textContent('#registros-mes-cuerpo');
    assert.match(texto, /Pupusas/);
    assert.doesNotMatch(texto, /ENEE/);
    assert.deepEqual(page.errores, []);
  });

  it('el candado pide crear un PIN si no hay, y la letra Space Grotesk viene con la app', async () => {
    const page = await env.pagina({ viewport: { width: 1366, height: 768 } });
    await sembrar(page, conMovimientos());
    await page.evaluate(() => bloquearAhora());
    assert.match(page.dialogos.pop(), /primero crea un PIN/);
    const letra = await page.evaluate(async () => { await document.fonts.load('16px "Space Grotesk"'); return document.fonts.check('16px "Space Grotesk"') && [...document.fonts].some(f => f.family.includes('Space Grotesk') && f.status === 'loaded'); });
    assert.equal(letra, true);
  });
});
