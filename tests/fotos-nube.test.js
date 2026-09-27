const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase, conectarNube } = require('./helpers');

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==';

// Teléfono con PIN y nube conectada; Storage simulado en window.__fotos
async function conNube(env) {
  const page = await env.pagina();
  await sembrar(page, estadoBase({ nombre: 'Ana' }));
  page.respuestas = ['123456', '123456', true];
  await page.evaluate(() => configurarPIN());
  await page.waitForFunction(() => !!_sessionDEK, null, { timeout: 15000 });
  await conectarNube(page, null);
  await page.evaluate(() => {
    ['mph_cloud_dek', 'mph_cloud_dek_iv'].forEach(k => localStorage.setItem(k, 'x'));
    localStorage.setItem('mph_cloud_salt', 'p2:x');
    window.__fotos = {};
    const carpeta = {
      async upload(ruta, blob) { window.__fotos[ruta] = new Uint8Array(await blob.arrayBuffer()); return { error: null }; },
      async download(ruta) { const b = window.__fotos[ruta]; return b ? { data: new Blob([b]), error: null } : { data: null, error: { message: 'no existe' } }; },
      async remove(rutas) { rutas.forEach(r => delete window.__fotos[r]); return { error: null }; },
      async list(pref) { return { data: Object.keys(window.__fotos).filter(r => r.startsWith(pref + '/')).map(r => ({ name: r.split('/')[1] })), error: null }; },
    };
    cloudSync.client.storage = { from: b => { window.__bucket = b; return carpeta; } };
  });
  return page;
}
async function gastoConFoto(page) {
  return page.evaluate(async png => {
    const id = await _guardarTempFactura(png);
    state.transactions.push({ id: 'tx0001', type: 'expense', amount: 245.5, cat: 'Comida', cuenta: 'efectivo', date: new Date().toISOString(), facturaImagenId: id });
    await save();
    return id;
  }, PNG);
}

describe('Fotos de facturas en la nube', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('sube la foto cifrada a la carpeta de la cuenta, una sola vez', async () => {
    const page = await conNube(env);
    const id = await gastoConFoto(page);
    assert.equal(await page.evaluate(() => sincronizarFotos()), 1);
    assert.equal(await page.evaluate(() => sincronizarFotos()), 0, 'no se vuelve a subir');
    const r = await page.evaluate(id => {
      const b = window.__fotos['u1/' + id];
      const txt = Array.from(b.slice(0, 200)).map(c => String.fromCharCode(c)).join('');
      return { bucket: window.__bucket, rutas: Object.keys(window.__fotos), jpegEnClaro: /JFIF|Exif|PNG/.test(txt) };
    }, id);
    assert.deepEqual(r, { bucket: 'facturas', rutas: ['u1/' + id], jpegEnClaro: false });
  });

  it('en otro dispositivo la foto se baja de la nube al abrir el gasto', async () => {
    const page = await conNube(env);
    const id = await gastoConFoto(page);
    await page.evaluate(() => sincronizarFotos());
    // Como si fuera otro teléfono: la foto no está en este dispositivo
    await page.evaluate(async id => { await _eliminarFacturaLocal(id); }, id);
    assert.equal(await page.evaluate(id => _obtenerFacturaLocal(id), id), null);
    const bajada = await page.evaluate(id => _obtenerFactura(id), id);
    assert.match(bajada, /^data:image\/jpeg;base64,/);
    assert.match(await page.evaluate(id => _obtenerFacturaLocal(id), id), /^data:image\//, 'queda guardada aquí');
  });

  it('quitar la foto del gasto también la borra de la nube', async () => {
    const page = await conNube(env);
    await gastoConFoto(page);
    await page.evaluate(() => sincronizarFotos());
    page.respuestas = [true];
    await page.evaluate(() => quitarFacturaDeGasto('tx0001'));
    assert.deepEqual(await page.evaluate(() => Object.keys(window.__fotos)), []);
  });

  it('si los datos cambian de clave, las fotos del teléfono se siguen abriendo', async () => {
    const page = await conNube(env);
    const id = await gastoConFoto(page);
    const r = await page.evaluate(async id => {
      const vieja = _sessionDEK, nueva = _generateDEK();
      const n = await _recifrarFacturasLocales(vieja, nueva);
      _sessionDEK = nueva;
      return { n, abre: /^data:image\//.test(await _obtenerFacturaLocal(id) || '') };
    }, id);
    assert.deepEqual(r, { n: 1, abre: true });
  });

  it('eliminar la cuenta borra también sus fotos de la nube', async () => {
    const page = await conNube(env);
    await gastoConFoto(page);
    await page.evaluate(() => sincronizarFotos());
    await page.evaluate(() => cloudSync.eliminarCuenta());
    assert.deepEqual(await page.evaluate(() => Object.keys(window.__fotos)), []);
  });
});
