const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase, conectarNube } = require('./helpers');

const CLAVE = 'mi perro se llama Toby';

// Fila de la nube como la dejaría otro dispositivo (su propia DEK y contraseña)
async function filaDeOtroDispositivo(page, estado) {
  return page.evaluate(async ({ estado, clave }) => {
    const dek = _generateDEK(), salt = 'p2:' + _b64EncodeArr(crypto.getRandomValues(new Uint8Array(16)));
    const { encrypted, iv } = await _encryptDEK(dek, await cloudSync._kekDeContrasena(clave, salt));
    const ciphertext = await _encryptState(estado, dek);
    return { ciphertext, dek_ciphertext: _b64EncodeArr(encrypted), dek_iv: _b64EncodeArr(iv), pin_salt: salt, version: 3, updated_at: new Date().toISOString(), device_id: 'otro-dispositivo', device_name: 'Android', size_bytes: ciphertext.length };
  }, { estado, clave: CLAVE });
}
const visible = (page, id) => page.evaluate(i => getComputedStyle(document.getElementById(i)).display !== 'none', id);

describe('Llevar los datos a la compu', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  async function compuNueva(fila) {
    const page = await env.pagina();
    await page.waitForFunction(() => getComputedStyle(document.getElementById('onboarding')).display === 'flex', null, { timeout: 15000 });
    await conectarNube(page, fila);
    await page.evaluate(() => { window.supabase = { createClient() {} }; });
    return page;
  }

  it('desde la bienvenida trae los datos sin llenar el perfil', async () => {
    const tmp = await env.pagina();
    const fila = await filaDeOtroDispositivo(tmp, estadoBase({ nombre: 'Ana', transactions: [{ id: 'tx0001', type: 'expense', amount: 50, cat: 'Comida', cuenta: 'efectivo', date: '2026-09-01T10:00:00Z' }] }));
    const page = await compuNueva(fila);
    assert.ok(await visible(page, 'onboarding'));
    await page.click('#ob-traer-nube');
    await page.waitForSelector('#modal-cloud-download', { state: 'visible' });
    assert.equal(await visible(page, 'onboarding'), false);
    assert.equal(await visible(page, 'cloud-download-aviso'), false, 'sin datos locales no hay nada que se pierda');
    assert.match(await page.textContent('#btn-confirmar-bajar'), /Traer mis datos/);
    assert.match(await page.textContent('#cloud-download-info'), /prueba@x\.hn/);
    // Cancelar vuelve a la bienvenida
    await page.evaluate(() => cancelarBajarCloud());
    assert.ok(await visible(page, 'onboarding'));
    await page.click('#ob-traer-nube');
    await page.waitForSelector('#modal-cloud-download', { state: 'visible' });
    await page.fill('#cloud-download-pass', CLAVE);
    await page.fill('#cloud-download-pin', '654321');
    await page.evaluate(() => confirmarBajarCloud());
    await page.waitForFunction(() => state.setup && state.nombre === 'Ana', null, { timeout: 20000 });
    assert.equal(await page.evaluate(() => state.transactions.length), 1);
  });

  it('si la cuenta no tiene datos explica qué hacer y deja la bienvenida', async () => {
    const page = await compuNueva(null);
    await page.click('#ob-traer-nube');
    await page.waitForFunction(() => (window.__dialogos || []).length || document.getElementById('dialogo-app'), null, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
    const textos = page.dialogos.map(d => d.mensaje || d.message || String(d)).join('\n');
    assert.match(textos, /todavía no tiene datos/);
    assert.match(textos, /MISMA cuenta de Google/);
    assert.ok(await visible(page, 'onboarding'));
  });

  it('un dispositivo vacío no sube encima de los datos de otro', async () => {
    const tmp = await env.pagina();
    const fila = await filaDeOtroDispositivo(tmp, estadoBase({ nombre: 'Ana' }));
    const page = await env.pagina();
    await sembrar(page, estadoBase({ nombre: 'Compu' }));
    await page.evaluate(async () => { _sessionDEK = _generateDEK(); });
    await conectarNube(page, fila);
    await page.evaluate(() => { if (!document.getElementById('btn-cloud-upload')) document.body.insertAdjacentHTML('beforeend', '<button id="btn-cloud-upload"></button>'); });
    page.respuestas = [false];
    await page.evaluate(() => subirDatosCloud());
    assert.equal(await page.evaluate(() => __store.row.version), 3, 'no subió nada');
    assert.match(page.dialogos.map(d => d.mensaje || d.message || String(d)).join('\n'), /Lo normal en un dispositivo nuevo es BAJAR/);
  });

  it('si la nube tiene otros datos, se elige cuáles son los buenos', async () => {
    const tmp = await env.pagina();
    const fila = await filaDeOtroDispositivo(tmp, estadoBase({ nombre: 'Compu vacía' }));
    const page = await env.pagina();
    await sembrar(page, estadoBase({ nombre: 'Ana', transactions: [{ id: 'tx0001', type: 'expense', amount: 50, cat: 'Comida', cuenta: 'efectivo', date: '2026-09-01T10:00:00Z' }] }));
    page.respuestas = ['123456', '123456', true];
    await page.evaluate(() => configurarPIN());
    await page.waitForFunction(() => !!_sessionDEK, null, { timeout: 15000 });
    await conectarNube(page, fila);
    await page.evaluate(() => { if (!document.getElementById('btn-cloud-upload')) document.body.insertAdjacentHTML('beforeend', '<button id="btn-cloud-upload"></button>'); window.__sub = subirDatosCloud(); });
    await page.waitForSelector('#modal-cloud-pass', { state: 'visible' });
    await page.fill('#cloud-pass-1', CLAVE);
    page.respuestas = [false, true, true]; // los de este dispositivo · reemplazar · aviso final
    await page.click('#btn-cloud-pass-ok');
    await page.evaluate(() => window.__sub);
    const r = await page.evaluate(async () => {
      const d = await _decryptState(__store.row.ciphertext, _sessionDEK);
      return { nombre: d && d.nombre, version: __store.row.version };
    });
    assert.deepEqual(r, { nombre: 'Ana', version: 4 });
  });
});
