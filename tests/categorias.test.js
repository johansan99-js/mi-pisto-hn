// Categorías propias: crear con ícono y color, cambiar las de fábrica, ocultarlas, renombrar y borrar
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase, LS_KEY } = require('./helpers');

const dia = d => new Date(2026, 8, d, 10, 0).toISOString();
const TX = [
  { id: 'gas00001', type: 'expense', amount: 120, cat: 'Pulpería', date: dia(20), cuenta: 'efectivo', tipo: 'extra' },
  { id: 'gas00002', type: 'expense', amount: 300, cat: 'Varios (Pulpería, Hogar)', date: dia(21), cuenta: 'efectivo', tipo: 'extra', splits: [{ cat: 'Pulpería', monto: 200 }, { cat: 'Hogar', monto: 100 }] },
  { id: 'gas00003', type: 'expense', amount: 800, cat: 'Comida', date: dia(22), cuenta: 'efectivo', tipo: 'fijo' },
];

describe('Categorías propias', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });
  async function abrir(extra) {
    const page = await env.pagina();
    await sembrar(page, estadoBase(Object.assign({ cuentasIniciales: { efectivo: 5000, ahorro: 0 }, transactions: TX }, extra)));
    await page.evaluate(() => switchView('categorias'));
    return page;
  }
  const picker = page => page.evaluate(() => { abrirRegistro('gasto'); abrirSelectorRegistro('b'); return [...document.querySelectorAll('.reg-cat[data-cat]')].map(b => b.dataset.cat); });

  it('crea una categoría con su ícono y color, sale primero al registrar y queda elegida', async () => {
    const page = await abrir();
    await page.click('#categorias-contenido .btn-primary');
    await page.fill('#ce-nombre', 'Pupusas');
    await page.click('.ce-icono[data-i="🍕"]');
    await page.click('.ce-color[data-c="#FB8C00"]');
    await page.click('#ce-fijo-fila .switch');
    assert.match(await page.textContent('#ce-vista'), /🍕\s*Pupusas/);
    await page.click('#modal-categoria .btn-primary');
    const c = await page.evaluate(() => state.categorias.map(({ nombre, tipo, icono, color, fijo }) => ({ nombre, tipo, icono, color, fijo })));
    assert.deepEqual(c, [{ nombre: 'Pupusas', tipo: 'gasto', icono: '🍕', color: '#FB8C00', fijo: true }]);
    assert.deepEqual(await page.evaluate(() => { const x = iconoCategoria('pupusas', 'expense'); return [x.i, x.c, _tipoGastoDeCat('Pupusas')]; }), ['🍕', '#FB8C00', 'fijo']);
    assert.equal((await picker(page))[0], 'Pupusas');
    // "＋ Otra" desde el teclado abre el editor y la deja elegida
    await page.click('.reg-cat:has-text("Otra")');
    await page.fill('#ce-nombre', 'Colegio de Ana');
    await page.click('.ce-icono[data-i="📚"]');
    await page.click('#modal-categoria .btn-primary');
    assert.match(await page.textContent('#reg-btn-b'), /📚\s*Colegio de Ana/);
    // Se queda al recargar
    await page.reload(); await page.waitForTimeout(700);
    assert.deepEqual(await page.evaluate(() => state.categorias.map(c => c.nombre)), ['Pupusas', 'Colegio de Ana']);
    assert.deepEqual(page.errores, []);
  });

  it('a una de fábrica se le cambia el ícono y el color, y se oculta y se vuelve a mostrar', async () => {
    const page = await abrir();
    await page.click('.cat-fila[data-cat="Comida"]');
    assert.equal(await page.isDisabled('#ce-nombre'), true, 'las de fábrica no se renombran');
    assert.equal(await page.isVisible('#ce-borrar'), false);
    await page.click('.ce-icono[data-i="☕"]');
    await page.click('#modal-categoria .btn-primary');
    assert.equal(await page.evaluate(() => iconoCategoria('Comida', 'expense').i), '☕');
    assert.equal(await page.$eval('.cat-fila[data-cat="Comida"] .cat-circulo', e => e.textContent), '☕');
    // Ocultar Suscripciones
    await page.click('.cat-fila[data-cat="Suscripciones"]');
    await page.click('#ce-ocultar');
    assert.equal((await picker(page)).includes('Suscripciones'), false);
    await page.evaluate(() => { cerrarRegistro(); switchView('categorias'); });
    assert.match(await page.textContent('#categorias-contenido'), /Ocultas \(1\)[\s\S]*Suscripciones/);
    await page.click('.cat-fila[data-cat="Suscripciones"]');
    assert.match(await page.textContent('#ce-ocultar'), /Mostrar otra vez/);
    await page.click('#ce-ocultar');
    assert.equal((await picker(page)).includes('Suscripciones'), true);
  });

  it('renombrar una categoría de tus movimientos los cambia a todos, con sus partes y presupuestos', async () => {
    const page = await abrir({ presupuestos: [{ id: 'pre00001', cat: 'Pulpería', monto: 1000, periodo: 'mes' }] });
    assert.match(await page.textContent('.cat-fila[data-cat="Pulpería"]'), /De tus movimientos · 2 movimientos/);
    await page.click('.cat-fila[data-cat="Pulpería"]');
    await page.fill('#ce-nombre', 'Pulpería Doña Rosa');
    assert.match(await page.textContent('#ce-renombrar-fila'), /Cambiar también en 2 movimientos y sus presupuestos/);
    await page.click('.ce-icono[data-i="🏪"]');
    await page.click('#modal-categoria .btn-primary');
    const r = await page.evaluate(() => [state.transactions[0].cat, state.transactions[1].splits[0].cat, state.transactions[1].cat, state.presupuestos[0].cat, state.categorias[0].nombre]);
    assert.deepEqual(r, ['Pulpería Doña Rosa', 'Pulpería Doña Rosa', 'Varios (Pulpería, Hogar)', 'Pulpería Doña Rosa', 'Pulpería Doña Rosa']);
    assert.equal(await page.evaluate(() => iconoCategoria('Pulpería Doña Rosa', 'expense').i), '🏪');
  });

  it('valida el nombre, no repite categorías y al borrar una los movimientos la conservan', async () => {
    const page = await abrir({ categorias: [{ id: 'cat00001', nombre: 'Pupusas', tipo: 'gasto', icono: '🍕', color: '#FB8C00' }], transactions: TX.concat([{ id: 'gas00009', type: 'expense', amount: 90, cat: 'Pupusas', date: dia(23), cuenta: 'efectivo', tipo: 'extra' }]) });
    await page.evaluate(() => abrirEditorCategoria(null, 'gasto'));
    await page.click('#modal-categoria .btn-primary');
    assert.match(page.dialogos.pop(), /Escribe el nombre/);
    for (const nombre of ['comida', 'PUPUSAS', 'Transferencia']) {
      await page.fill('#ce-nombre', nombre);
      await page.click('#modal-categoria .btn-primary');
      assert.match(page.dialogos.pop(), /Ya tienes una categoría|lo usa la app/, nombre);
    }
    await page.evaluate(() => closeModal('modal-categoria'));
    await page.click('.cat-fila[data-cat="Pupusas"]');
    await page.click('#ce-borrar');
    assert.match(page.dialogos.pop(), /Borrar la categoría Pupusas[\s\S]*1 movimientos la conservan/);
    assert.deepEqual(await page.evaluate(() => [state.categorias.length, state.transactions.find(t => t.id === 'gas00009').cat, iconoCategoria('Pupusas', 'expense').letra]), [0, 'Pupusas', true]);
  });

  it('las categorías de ingreso van aparte, y un respaldo con categorías se valida', async () => {
    const page = await abrir();
    await page.click('#categorias-contenido .an-seg-btn:has-text("Ingresos")');
    assert.match(await page.textContent('#categorias-contenido'), /Salario[\s\S]*Remesa/);
    await page.click('#categorias-contenido .btn-primary');
    assert.equal(await page.isVisible('#ce-fijo-fila'), false, '"fijo" es solo para gastos');
    await page.fill('#ce-nombre', 'Alquiler del cuarto');
    await page.click('#modal-categoria .btn-primary');
    assert.equal(await page.evaluate(() => state.categorias[0].tipo), 'ingreso');
    assert.equal(await page.evaluate(() => { abrirRegistro('ingreso'); abrirSelectorRegistro('b'); return document.querySelector('.reg-cat[data-cat]').dataset.cat; }), 'Alquiler del cuarto');
    const v = await page.evaluate(() => [
      _validarSchemaBackup({ setup: true, categorias: [{ id: 'cat00001', nombre: 'Pupusas', tipo: 'gasto', icono: '🍕', color: '#FB8C00' }] }),
      _validarSchemaBackup({ setup: true, categorias: [{ id: 'cat00001', nombre: '<img src=x>', tipo: 'gasto', icono: '🍕', color: '#FB8C00' }] }),
      _validarSchemaBackup({ setup: true, categorias: [{ id: 'cat00001', nombre: 'Pupusas', tipo: 'gasto', icono: '"><b>', color: '#FB8C00' }] }),
      _validarSchemaBackup({ setup: true, categorias: [{ id: 'cat00001', nombre: 'Pupusas', tipo: 'gasto', icono: '🍕', color: 'red' }] }),
    ]);
    assert.equal(v[0], null);
    assert.deepEqual(v.slice(1).map(x => !!x), [true, true, true]);
  });
});
