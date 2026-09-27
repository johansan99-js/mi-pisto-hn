const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase } = require('./helpers');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');
const foto = { name: 'recibo.png', mimeType: 'image/png', buffer: PNG };
const lectorQueLee = texto => `window.Tesseract = { createWorker: async () => ({ loadLanguage: async () => {}, initialize: async () => {}, recognize: async () => ({ data: { text: ${JSON.stringify(texto)} } }), terminate: async () => {} }) };`;

describe('Descripción y factura en Me deben, Debo y Préstamos', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });
  async function pagina(extra) {
    const page = await env.pagina();
    await sembrar(page, estadoBase(Object.assign({ nombre: 'Ana' }, extra || {})));
    await page.evaluate(() => localStorage.setItem('mph_primeros_pasos', 'oculto'));
    return page;
  }

  it('"Me deben": la foto lee el total, se guarda con la descripción y se ve en la lista', async () => {
    const page = await pagina();
    await page.addScriptTag({ content: lectorQueLee('RECIBO\nTOTAL L. 1,500.00') });
    await page.evaluate(() => openModal('modal-cobrar'));
    await page.fill('#cobrar-persona', 'Luis');
    await page.setInputFiles('#adj-cobrar-foto', foto);
    await page.waitForFunction(() => /1500\.00/.test(document.getElementById('adj-cobrar-estado').textContent), null, { timeout: 10000 });
    assert.equal(await page.inputValue('#cobrar-monto'), '1500.00', 'el monto se llenó solo');
    assert.equal(await page.isVisible('#adj-cobrar-prev'), true);
    await page.fill('#adj-cobrar-desc', 'Le presté para el pasaje');
    await page.evaluate(() => saveCobrar());
    const r = await page.evaluate(() => { const x = state.receivables[0]; return { persona: x.persona, monto: x.monto, descripcion: x.descripcion, foto: !!x.facturaImagenId }; });
    assert.deepEqual(r, { persona: 'Luis', monto: 1500, descripcion: 'Le presté para el pasaje', foto: true });
    await page.evaluate(() => switchView('cobrar'));
    assert.match(await page.textContent('#cobrar-list .adj-desc'), /Le presté para el pasaje/);
    await page.click('#cobrar-list .adj-acciones button');
    await page.waitForSelector('#visor-factura img', { timeout: 5000 });
    // Al abrir el formulario otra vez empieza limpio
    await page.evaluate(() => { document.getElementById('visor-factura').remove(); openModal('modal-cobrar'); });
    assert.deepEqual(await page.evaluate(() => [document.getElementById('adj-cobrar-desc').value, getComputedStyle(document.getElementById('adj-cobrar-prev')).display]), ['', 'none']);
  });

  it('"Debo": si el lector no carga, la foto igual queda con la deuda', async () => {
    const page = await pagina();
    await page.evaluate(() => { _cargarTesseractLib = async () => { throw new Error('sin internet'); }; openModal('modal-pagar'); });
    await page.fill('#pagar-creditor', 'Tienda La Curacao');
    await page.fill('#pagar-monto', '8000');
    await page.setInputFiles('#adj-pagar-foto', foto);
    await page.waitForFunction(() => /queda guardada/.test(document.getElementById('adj-pagar-estado').textContent), null, { timeout: 10000 });
    await page.fill('#adj-pagar-desc', 'La refri a crédito');
    await page.evaluate(() => savePagar());
    const r = await page.evaluate(() => { const x = state.payables[0]; return [x.descripcion, !!x.facturaImagenId]; });
    assert.deepEqual(r, ['La refri a crédito', true]);
  });

  it('préstamo ya guardado: se le agrega descripción y factura desde la lista', async () => {
    const page = await pagina({ prestamos: [{ id: 'prest001', entidad: 'Mi tío Juan', monto: 20000, cuota: 2000, cuotasPagadas: 0, cuotasTotal: 10 }] });
    await page.evaluate(() => switchView('prestamos'));
    await page.waitForSelector('#prestamos-list .adj-acciones');
    page.respuestas = ['Para la moto'];
    await page.click('#prestamos-list .adj-acciones button:has-text("Agregar descripción")');
    await page.waitForFunction(() => state.prestamos[0].descripcion === 'Para la moto');
    // Pregunta de dónde sale la foto: "Subir imagen" abre la galería (sin forzar la cámara)
    await page.click('#prestamos-list .adj-acciones button:has-text("Adjuntar factura")');
    await page.waitForSelector('#dlg-origen-foto');
    const chooser = page.waitForEvent('filechooser');
    await page.click('#dlg-origen-foto button[data-o="galeria"]');
    await (await chooser).setFiles(foto);
    assert.equal(await page.evaluate(() => document.getElementById('adj-cuenta-foto').hasAttribute('capture')), false);
    await page.waitForFunction(() => !!state.prestamos[0].facturaImagenId, null, { timeout: 5000 });
    assert.match(await page.textContent('#prestamos-list .adj-info'), /Para la moto[\s\S]*Ver factura/);
  });

  it('borrar la cuenta borra su foto, y las fotos de deudas también van a la nube', async () => {
    const page = await pagina();
    const r = await page.evaluate(async () => {
      const id = await _guardarTempFactura('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==');
      state.receivables.push({ id: 'cob001', persona: 'Luis', monto: 100, pagado: 0, facturaImagenId: id });
      state.payables.push({ id: 'deu001', creditor: 'BAC', monto: 100, pagado: 0, tipo: 'banco', facturaImagenId: 'otra-foto' });
      // ¿Qué fotos sube la sincronización? (sin nube real: se espía _subirFoto)
      const subidas = [];
      _fotosDisponible = () => true;
      cloudSync.user = { id: 'u1' };
      _subirFoto = async fid => { subidas.push(fid); return true; };
      await sincronizarFotos();
      return { id, subidas: subidas.sort() };
    });
    assert.deepEqual(r.subidas, [r.id, 'otra-foto'].sort());
    page.respuestas = [true];
    await page.evaluate(() => { cloudSync.user = null; return eliminarCobrar('cob001'); });
    assert.equal(await page.evaluate(id => _obtenerFacturaLocal(id), r.id), null);
  });
});
