const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase } = require('./helpers');

const PNG64 = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==';

// Gasto y "Me deben" con su foto
async function conFotos(env, { compartir } = {}) {
  const page = await env.pagina();
  await sembrar(page, estadoBase({ nombre: 'Ana' }));
  await page.evaluate(async ({ png, compartir }) => {
    localStorage.setItem('mph_primeros_pasos', 'oculto');
    if (compartir) {
      window.__compartido = null;
      navigator.canShare = () => true;
      navigator.share = async d => { window.__compartido = { nombre: d.files[0].name, tipo: d.files[0].type, bytes: d.files[0].size }; };
    }
    const id = await _guardarTempFactura('data:image/png;base64,' + png);
    const id2 = await _guardarTempFactura('data:image/png;base64,' + png);
    state.transactions.push({ id: 'tx0001', type: 'expense', amount: 245.5, cat: 'Comida', nota: 'Burger King', cuenta: 'efectivo', date: '2026-09-20T15:00:00Z', facturaImagenId: id });
    state.receivables.push({ id: 'rc0001', persona: 'Luis Pérez', monto: 1500, facturaImagenId: id2 });
    await save();
  }, { png: PNG64, compartir: !!compartir });
  return page;
}

describe('Compartir y descargar la foto de la factura', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('el nombre del archivo lleva la fecha y el detalle', async () => {
    const page = await conFotos(env);
    const r = await page.evaluate(() => [
      _nombreArchivoFoto('data:image/jpeg;base64,xx', '2026-09-20T15:00:00Z', 'Pulpería Doña Ána!'),
      _nombreArchivoFoto('data:image/png;base64,xx', '2026-09-20T15:00:00Z', ''),
    ]);
    assert.deepEqual(r, ['Factura-2026-09-20-Pulperia-Dona-Ana.jpg', 'Factura-2026-09-20.png']);
  });

  it('desde el gasto: "Descargar" guarda la foto en los archivos', async () => {
    const page = await conFotos(env);
    await page.evaluate(() => verFactura('tx0001'));
    await page.waitForSelector('#visor-factura .foto-descargar');
    assert.equal(await page.locator('#visor-factura .foto-compartir').count(), 0, 'sin menú de compartir no se ofrece');
    const [descarga] = await Promise.all([page.waitForEvent('download'), page.click('#visor-factura .foto-descargar')]);
    assert.equal(descarga.suggestedFilename(), 'Factura-2026-09-20-Burger-King.png');
    const ruta = await descarga.path();
    assert.deepEqual(require('fs').readFileSync(ruta), Buffer.from(PNG64, 'base64'), 'es la misma foto');
  });

  it('desde "Me deben": "Compartir" abre el menú del teléfono (WhatsApp) con la foto', async () => {
    const page = await conFotos(env, { compartir: true });
    await page.evaluate(() => _adjVer('cobrar', 'rc0001'));
    await page.waitForSelector('#visor-factura .foto-compartir');
    await page.click('#visor-factura .foto-compartir');
    await page.waitForFunction(() => !!window.__compartido, null, { timeout: 5000 });
    const r = await page.evaluate(() => __compartido);
    assert.equal(r.tipo, 'image/png');
    assert.equal(r.bytes, Buffer.from(PNG64, 'base64').length);
    assert.match(r.nombre, /^Factura-\d{4}-\d{2}-\d{2}-Luis-Perez\.png$/);
    // Los botones de antes siguen ahí
    assert.equal(await page.locator('#visor-factura button', { hasText: 'Quitar foto' }).count(), 1);
  });
});
