const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase } = require('./helpers');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');
const foto = { name: 'comprobante.png', mimeType: 'image/png', buffer: PNG };
const lectorQueLee = texto => `window.Tesseract = { createWorker: async () => ({ loadLanguage: async () => {}, initialize: async () => {}, recognize: async () => ({ data: { text: ${JSON.stringify(texto)} } }), terminate: async () => {} }) };`;

// Para cada lugar con foto: [id de la cámara, ¿tiene capture?] y [id de la galería, ¿tiene capture?]
const entradas = (page, id) => page.evaluate(i => [i, i + '-gal'].map(x => { const el = document.getElementById(x); return el ? el.hasAttribute('capture') : 'no existe'; }), id);

describe('Subir una imagen de la galería o tomar foto', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });
  async function pagina(extra) {
    const page = await env.pagina();
    await sembrar(page, estadoBase(Object.assign({ nombre: 'Ana' }, extra || {})));
    await page.evaluate(() => localStorage.setItem('mph_primeros_pasos', 'oculto'));
    return page;
  }

  it('en gastos, deudas, préstamos e ingresos hay "Tomar foto" (cámara) y "Subir imagen" (galería)', async () => {
    const page = await pagina({ transactions: [{ id: 'tx0001', type: 'expense', amount: 50, cat: 'Comida', cuenta: 'efectivo', date: new Date().toISOString() }] });
    assert.deepEqual(await entradas(page, 'ocr-input'), [true, false], 'nuevo gasto');
    assert.deepEqual(await entradas(page, 'ingreso-foto'), [true, false], 'nuevo ingreso');
    await page.evaluate(() => { openModal('modal-cobrar'); openModal('modal-pagar'); openModal('modal-prestamo'); });
    for (const k of ['cobrar', 'pagar', 'prestamo']) assert.deepEqual(await entradas(page, 'adj-' + k + '-foto'), [true, false], k);
    await page.evaluate(() => { ['modal-cobrar', 'modal-pagar', 'modal-prestamo'].forEach(closeModal); abrirEdicionTx('tx0001'); });
    await page.waitForSelector('#edit-factura .foto-origen');
    assert.deepEqual(await entradas(page, 'edit-factura-input'), [true, false], 'editar gasto');
    assert.match(await page.textContent('#edit-factura'), /Tomar foto[\s\S]*Subir imagen/);
  });

  it('un gasto nuevo acepta una imagen de la galería', async () => {
    const page = await pagina();
    await page.addScriptTag({ content: lectorQueLee('SUPER\nTOTAL L. 99.00') });
    await page.evaluate(() => openModal('modal-gasto'));
    await page.setInputFiles('#ocr-input-gal', foto);
    await page.waitForFunction(() => /99\.00/.test(document.getElementById('ocr-status').textContent), null, { timeout: 10000 });
    assert.equal(await page.inputValue('#gasto-monto'), '99.00');
    assert.equal(await page.evaluate(() => !!_tempFacturaId), true);
  });

  it('ingreso: el comprobante de un depósito llena el monto y queda guardado con el ingreso', async () => {
    const page = await pagina();
    await page.addScriptTag({ content: lectorQueLee('BAC Credomatic\nTransferencia exitosa\nMonto: L. 1,500.00\nComisión L. 0.00') });
    await page.evaluate(() => openModal('modal-ingreso'));
    await page.setInputFiles('#ingreso-foto-gal', foto);
    await page.waitForFunction(() => /1500\.00/.test(document.getElementById('ingreso-foto-estado').textContent), null, { timeout: 10000 });
    assert.equal(await page.inputValue('#ingreso-monto'), '1500.00', 'el monto se llenó solo');
    assert.equal(await page.isVisible('#ingreso-foto-prev'), true);
    await page.fill('#ingreso-nota', 'Pago de Carlos');
    await page.evaluate(() => saveIngreso());
    const t = await page.evaluate(() => state.transactions[state.transactions.length - 1]);
    assert.equal(t.type, 'income');
    assert.equal(t.amount, 1500);
    assert.ok(t.facturaImagenId, 'el ingreso tiene su comprobante');
    assert.match(await page.evaluate(id => _obtenerFactura(id), t.facturaImagenId), /^data:image\//);
    // La ventana queda limpia para el siguiente
    assert.equal(await page.evaluate(() => [_ingresoFotoId, getComputedStyle(document.getElementById('ingreso-foto-prev')).display].join()), ',none');
    // Se ve, se comparte y se descarga como "Comprobante"
    await page.evaluate(id => verFactura(id), t.id);
    await page.waitForSelector('#visor-factura .foto-descargar');
    assert.match(await page.textContent('#visor-factura'), /Comprobante · Pago de Carlos/);
    const [descarga] = await Promise.all([page.waitForEvent('download'), page.click('#visor-factura .foto-descargar')]);
    assert.match(descarga.suggestedFilename(), /^Comprobante-\d{4}-\d{2}-\d{2}-Pago-de-Carlos\.jpg$/);
    // Y al editar el ingreso aparece su foto
    await page.evaluate(id => { document.getElementById('visor-factura').remove(); abrirEdicionTx(id); }, t.id);
    await page.waitForSelector('#edit-factura .edit-factura-img', { timeout: 5000 });
  });

  it('ingreso: si se cierra sin registrar, el comprobante no queda guardado', async () => {
    const page = await pagina();
    await page.addScriptTag({ content: lectorQueLee('sin montos') });
    await page.evaluate(() => openModal('modal-ingreso'));
    await page.setInputFiles('#ingreso-foto-gal', foto);
    await page.waitForFunction(() => /No encontré el monto/.test(document.getElementById('ingreso-foto-estado').textContent), null, { timeout: 10000 });
    const id = await page.evaluate(() => _ingresoFotoId);
    assert.ok(id);
    await page.evaluate(() => closeModal('modal-ingreso'));
    await page.waitForFunction(async i => !(await _obtenerFacturaLocal(i)), id, { timeout: 5000 });
    // Con monto inválido tampoco se pierde la foto: sigue esperando
    await page.evaluate(() => openModal('modal-ingreso'));
    await page.setInputFiles('#ingreso-foto-gal', foto);
    await page.waitForFunction(() => !!_ingresoFotoId && /No encontré/.test(document.getElementById('ingreso-foto-estado').textContent), null, { timeout: 10000 });
    page.respuestas = [undefined];
    await page.evaluate(() => { document.getElementById('ingreso-monto').value = ''; saveIngreso(); });
    assert.ok(await page.evaluate(() => _ingresoFotoId), 'la foto sigue lista para cuando ponga el monto');
  });

  it('en el registro rápido, "🧾 Comprobante" sale solo en los ingresos y abre la galería', async () => {
    const page = await pagina();
    await page.evaluate(() => abrirRegistro('gasto'));
    assert.equal(await page.isVisible('#modal-registro .solo-ingreso'), false);
    await page.evaluate(() => { cerrarRegistro(); abrirRegistro('ingreso'); });
    assert.equal(await page.isVisible('#modal-registro .solo-ingreso'), true);
    const chooser = page.waitForEvent('filechooser');
    await page.click('#modal-registro .solo-ingreso');
    const fc = await chooser;
    assert.equal(await fc.element().evaluate(el => el.id), 'ingreso-foto-gal');
    assert.equal(await page.isVisible('#modal-ingreso'), true);
  });

  it('lee el monto de comprobantes de depósito y transferencia', async () => {
    const page = await pagina();
    const r = await page.evaluate(() => [
      _montoDeComprobante('Transferencia exitosa\nMonto: L. 1,500.00\nComisión L. 0.00'),
      _montoDeComprobante('DEPOSITO A CUENTA\nValor HNL 800.00'),
      _montoDeComprobante('Tigo Money\nEnviaste L 350.50 a Juan'),
      _montoDeComprobante('TOTAL L. 245.50'),
      _montoDeComprobante('texto sin números'),
    ]);
    assert.deepEqual(r, [1500, 800, 350.5, 245.5, 0]);
  });
});
