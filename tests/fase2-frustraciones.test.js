// Fase 2 de la revisión: lo que más frustra al usarla en el teléfono
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase } = require('./helpers');

describe('Fase 2: frustraciones', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('los montos se leen como los escribe la gente', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase());
    const r = await page.evaluate(() => ['1.500', '1,500', '1,500.50', '1.500,50', '1.500.000', '1,500,000', '12.5', '12,50', '0.500', '350', '100+50', 'abc', '1.2.3']
      .map(x => parseMonto(x)));
    assert.deepEqual(r, [1500, 1500, 1500.5, 1500.5, 1500000, 1500000, 12.5, 12.5, 0.5, 350, 150, null, null]);
  });

  it('el botón atrás cierra la ventana abierta, luego vuelve al Inicio y avisa antes de salir', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase());
    const atras = async () => { await page.evaluate(() => history.back()); await page.waitForTimeout(250); };
    await page.evaluate(() => { switchView('metas'); abrirRegistro('gasto'); });
    assert.equal(await page.isVisible('#modal-registro'), true);
    await atras();
    assert.equal(await page.isVisible('#modal-registro'), false);
    assert.equal(await page.evaluate(() => document.querySelector('.view.active').id), 'view-metas');
    await page.evaluate(() => toggleHamburger());
    await atras();
    assert.equal(await page.evaluate(() => document.getElementById('hamburgerPanel').classList.contains('active')), false);
    await atras();
    assert.equal(await page.evaluate(() => document.querySelector('.view.active').id), 'view-dashboard');
    await atras();
    assert.match(await page.textContent('#aviso-rapido'), /otra vez para salir/);
    assert.deepEqual(page.errores, []);
  });

  it('la tasa de la tarjeta viene vacía (antes escribir 36 daba 4836%) y se rechaza una absurda', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase());
    assert.equal(await page.inputValue('#tc-tasa'), '');
    await page.evaluate(() => { document.getElementById('tc-nombre').value = 'Visa'; document.getElementById('tc-limite').value = '10000'; document.getElementById('tc-tasa').value = '4836'; saveTarjeta(); });
    assert.equal(await page.evaluate(() => state.tarjetas.length), 0);
    assert.ok(page.dialogos.some(d => /tasa de interés/i.test(d)));
    await page.evaluate(() => { document.getElementById('tc-tasa').value = '36%'; saveTarjeta(); });
    assert.equal(await page.evaluate(() => state.tarjetas[0].tasaInteres), 36);
  });

  it('el Inicio dice cuánto debes y el patrimonio de verdad', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase({
      saldoInicial: 5000,
      tarjetas: [{ id: 'tarjeta0001', nombre: 'Visa', limite: 20000, saldo: 0, saldoBase: 7000, corte: 20, pago: 5 }],
      payables: [{ id: 'deuda0001', creditor: 'Juan', monto: 1000, pagado: 0, tipo: 'persona' }],
    }));
    assert.equal(await page.textContent('#balance-amount'), 'L. 5,000.00');
    assert.equal(await page.textContent('#balance-status'), 'Debes L. 8,000.00 · Patrimonio neto L. -3,000.00');
  });

  it('borrar avisa que queda en la Papelera, y la Papelera está en el menú', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase({ transactions: [{ id: 'gasto0001', type: 'expense', amount: 80, cat: 'Comida', cuenta: 'efectivo', date: '2026-09-01T10:00:00Z' }] }));
    await page.evaluate(() => softDeleteTx('gasto0001'));
    assert.match(await page.textContent('#undo-toast-el'), /Papelera/);
    await page.waitForTimeout(250);
    assert.equal(await page.textContent('#papelera-cuenta'), '(1)');
    await page.evaluate(() => abrirPapelera());
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => document.querySelector('.view.active').id), 'view-config');
    assert.match(await page.textContent('#trash-list'), /Comida · -L\. 80\.00/);
  });

  it('el tutorial abre el registro rápido, la ✕ del menú ☰ se puede tocar y la tarjeta no se queda pegada', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase({ tarjetas: [{ id: 'tarjeta0001', nombre: 'Visa', limite: 20000, saldo: 0, corte: 20, pago: 5 }] }));
    await page.evaluate(() => tourRegistrarGasto());
    assert.equal(await page.isVisible('#modal-registro'), true);
    assert.equal(await page.isVisible('#modal-gasto'), false);
    await page.evaluate(() => cerrarRegistro());
    await page.evaluate(() => toggleHamburger());
    await page.waitForTimeout(400);
    await page.click('.hamburger-close');
    assert.equal(await page.evaluate(() => document.getElementById('hamburgerPanel').classList.contains('active')), false);
    // Pagó con tarjeta hace 5 horas: el siguiente gasto ya no va a la tarjeta
    await page.evaluate(() => localStorage.setItem(_REG_ULTIMA, JSON.stringify({ cuenta: 'efectivo', tarjeta: 'tarjeta0001', en: Date.now() - 5 * 3600e3 })));
    await page.evaluate(() => abrirRegistro('gasto'));
    assert.equal(await page.evaluate(() => _reg.tarjeta), null);
    await page.evaluate(() => { cerrarRegistro(); localStorage.setItem(_REG_ULTIMA, JSON.stringify({ cuenta: 'efectivo', tarjeta: 'tarjeta0001', en: Date.now() - 60e3 })); abrirRegistro('gasto'); });
    assert.equal(await page.evaluate(() => _reg.tarjeta), 'tarjeta0001');
    assert.deepEqual(page.errores, []);
  });

  it('con el teléfono acostado el teclado del registro se puede usar completo', async () => {
    const page = await env.pagina({ viewport: { width: 844, height: 390 } });
    await sembrar(page, estadoBase());
    await page.evaluate(() => abrirRegistro('gasto'));
    const boton = page.locator('#modal-registro .reg-accion.guardar').last();
    await boton.scrollIntoViewIfNeeded();
    const caja = await boton.boundingBox();
    assert.ok(caja && caja.y >= 0 && caja.y + caja.height <= 390, JSON.stringify(caja));
  });
});
