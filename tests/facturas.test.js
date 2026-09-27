const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase } = require('./helpers');

// Foto de prueba: PNG de 2×2 píxeles
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');
const foto = { name: 'factura.png', mimeType: 'image/png', buffer: PNG };

// Lector de facturas simulado (sin descargar nada)
const lectorQueLee = texto => `window.Tesseract = { createWorker: async () => ({ loadLanguage: async () => {}, initialize: async () => {}, recognize: async () => ({ data: { text: ${JSON.stringify(texto)} } }), terminate: async () => {} }) };`;

describe('Foto de la factura', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });
  async function pagina() {
    const page = await env.pagina();
    await sembrar(page, estadoBase({ nombre: 'Ana' }));
    await page.evaluate(() => { localStorage.setItem('mph_primeros_pasos', 'oculto'); openModal('modal-gasto'); });
    return page;
  }

  it('si el lector no carga, la foto igual queda guardada con el gasto', async () => {
    const page = await pagina();
    await page.evaluate(() => { _cargarTesseractLib = async () => { throw new Error('sin internet'); }; });
    await page.setInputFiles('#ocr-input', foto);
    await page.waitForFunction(() => /queda guardada/.test(document.getElementById('ocr-status').textContent), null, { timeout: 10000 });
    assert.equal(await page.isVisible('#ocr-preview'), true);
    await page.fill('#gasto-monto', '120');
    await page.fill('#gasto-cat', 'Comida');
    await page.evaluate(() => saveGasto({ silencioso: true }));
    const t = await page.evaluate(() => state.transactions[state.transactions.length - 1]);
    assert.equal(t.amount, 120);
    assert.ok(t.facturaImagenId, 'el gasto tiene su foto');
    assert.match(await page.evaluate(id => _obtenerFactura(id), t.facturaImagenId), /^data:image\//);
  });

  it('lee el total y el comercio, con las categorías de la app', async () => {
    const page = await pagina();
    await page.addScriptTag({ content: lectorQueLee('BURGER KING\nRango autorizado 001-001\nWHOPPER 180.00\nTOTAL L. 245.50\nGracias') });
    await page.setInputFiles('#ocr-input', foto);
    await page.waitForFunction(() => /Total: L\. 245\.50/.test(document.getElementById('ocr-status').textContent), null, { timeout: 10000 });
    const r = await page.evaluate(() => ['gasto-monto', 'gasto-cat', 'gasto-subcat', 'gasto-tipo'].map(id => document.getElementById(id).value).concat(!!_tempFacturaId));
    assert.deepEqual(r, ['245.50', 'Comida', 'Burger King', 'extra', true], '"autorizado" ya no la vuelve Repuestos');
  });

  it('sin total en la foto lo dice y deja la foto adjunta', async () => {
    const page = await pagina();
    await page.addScriptTag({ content: lectorQueLee('texto borroso sin numeros') });
    await page.setInputFiles('#ocr-input', foto);
    await page.waitForFunction(() => /No encontré el total/.test(document.getElementById('ocr-status').textContent), null, { timeout: 10000 });
    assert.equal(await page.evaluate(() => !!_tempFacturaId), true);
  });

  it('al editar el gasto se ve la foto y se puede cambiar, quitar o agregar', async () => {
    const page = await pagina();
    await page.evaluate(async () => {
      const id = await _guardarTempFactura('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==');
      state.transactions.push({ id: 'tx0001', type: 'expense', amount: 245.5, cat: 'Comida', subcat: 'Burger King', cuenta: 'efectivo', date: new Date().toISOString(), facturaImagenId: id });
      await save(); closeModal('modal-gasto'); abrirEdicionTx('tx0001');
    });
    await page.waitForSelector('#edit-factura .edit-factura-img', { timeout: 5000 });
    await page.click('#edit-factura .edit-factura-img');
    await page.waitForSelector('#visor-factura img', { timeout: 5000 });
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('visor-factura')).zIndex), '100000', 'se abre en grande por encima');
    await page.evaluate(() => document.getElementById('visor-factura').remove());
    // Quitar
    page.respuestas = [true];
    await page.click('#edit-factura button');
    await page.waitForSelector('#edit-factura .edit-factura-agregar', { timeout: 5000 });
    assert.equal(await page.evaluate(() => state.transactions[0].facturaImagenId), null);
    // Agregar una nueva
    await page.setInputFiles('#edit-factura-input', foto);
    await page.waitForSelector('#edit-factura .edit-factura-img', { timeout: 5000 });
    assert.ok(await page.evaluate(() => state.transactions[0].facturaImagenId));
  });
});
