const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, esperarCarga, desbloquear, estadoBase, LS_KEY } = require('./helpers');

const leerIDB = (page, store, key) => page.evaluate(([s, k]) => new Promise(res => {
  initDB().then(db => { const g = db.transaction(s).objectStore(s).get(k); g.onsuccess = () => res(g.result); });
}), [store, key]);

const conGasto = () => estadoBase({ nombre: 'Ana', transactions: [
  { id: 'aaaaa1', type: 'expense', amount: 50, cat: 'Comida', cuenta: 'efectivo', date: '2026-09-01T10:00:00Z' },
] });

async function crearPIN(page, pin) {
  page.respuestas = [pin, pin, true];
  await page.evaluate(() => configurarPIN());
  await page.waitForFunction(() => !!_sessionDEK, null, { timeout: 15000 });
  await page.waitForTimeout(300);
}

describe('PIN, cifrado y recuperación', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('con PIN, localStorage e IndexedDB quedan cifrados y se desbloquea al recargar', async () => {
    const page = await env.pagina();
    await sembrar(page, conGasto());
    await crearPIN(page, '123456');
    assert.equal((await page.evaluate(k => localStorage.getItem(k), LS_KEY)).startsWith('{'), false);
    assert.deepEqual(Object.keys(await leerIDB(page, 'app_state', 'current_state')).sort(), ['_enc', '_lastSave', '_version']);
    await page.reload(); await esperarCarga(page);
    assert.equal(await page.evaluate(() => state.setup), false, 'no debe haber datos antes del PIN');
    await desbloquear(page, '000000');
    assert.equal(await page.evaluate(() => state.setup), false, 'un PIN incorrecto no abre');
    await desbloquear(page, '123456');
    assert.deepEqual(await page.evaluate(() => [state.nombre, state.transactions.length]), ['Ana', 1]);
  });

  it('rechaza PINs nuevos de menos de 6 dígitos', async () => {
    const page = await env.pagina();
    await sembrar(page, conGasto());
    page.respuestas = ['12345'];
    await page.evaluate(() => configurarPIN());
    assert.equal(await page.evaluate(() => localStorage.getItem('finanzas_pin_hash')), null);
  });

  it('un PIN con parámetros viejos se actualiza a 600k al desbloquear', async () => {
    const page = await env.pagina();
    await page.evaluate(async ([k, st]) => {
      localStorage.clear();
      const salt = crypto.getRandomValues(new Uint8Array(16)), dek = _generateDEK();
      localStorage.setItem('finanzas_pin_hash', await _derivarHashPIN('1234', salt)); // 100k
      localStorage.setItem('finanzas_pin_salt', _b64EncodeArr(salt));
      const { encrypted, iv } = await _encryptDEK(dek, await _deriveKEKFromPIN('1234', salt)); // 250k
      _saveDEKToStorage(encrypted, iv);
      localStorage.setItem(k, await _encryptState(st, dek));
    }, [LS_KEY, conGasto()]);
    await page.reload(); await esperarCarga(page);
    page.respuestas = [false]; // no cambiar el PIN corto ahora
    await desbloquear(page, '1234');
    await page.waitForFunction(() => localStorage.getItem('finanzas_pin_kdf') === 'v2', null, { timeout: 15000 });
    // El hash guardado no puede ser la KEK (mismo PIN, salt e iteraciones)
    const hashEsKEK = await page.evaluate(async () => {
      const salt = _b64DecodeArr(localStorage.getItem('finanzas_pin_salt'));
      const km = await crypto.subtle.importKey('raw', new TextEncoder().encode('1234'), { name: 'PBKDF2' }, false, ['deriveBits']);
      const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' }, km, 256));
      return Array.from(bits).map(b => b.toString(16).padStart(2, '0')).join('') === localStorage.getItem('finanzas_pin_hash');
    });
    assert.equal(hashEsKEK, false);
    await page.reload(); await esperarCarga(page);
    page.respuestas = [false];
    await desbloquear(page, '1234');
    assert.equal(await page.evaluate(() => state.transactions.length), 1);
  });

  it('quitar el PIN conserva los datos y las facturas', async () => {
    const page = await env.pagina();
    await sembrar(page, conGasto());
    await crearPIN(page, '123456');
    const facId = await page.evaluate(() => _guardarTempFactura('data:image/png;base64,QUJD'));
    assert.ok((await leerIDB(page, 'facturas', facId))._enc, 'la factura se guarda cifrada');
    page.respuestas = ['123456', '', true, true];
    await page.evaluate(() => configurarPIN());
    await page.waitForFunction(() => !localStorage.getItem('finanzas_pin_hash'));
    await page.reload(); await esperarCarga(page);
    assert.deepEqual(await page.evaluate(() => [state.setup, state.transactions.length]), [true, 1]);
    assert.equal(await leerIDB(page, 'facturas', facId), 'data:image/png;base64,QUJD');
  });

  it('el kit de recuperación permite crear un PIN nuevo sin perder datos', async () => {
    const page = await env.pagina();
    await sembrar(page, conGasto());
    await crearPIN(page, '123456');
    await page.evaluate(() => generarKitRecuperacion());
    const clave = await page.textContent('#kit-rec-clave');
    assert.match(clave, /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{1,4}){6}$/);
    await page.reload(); await esperarCarga(page);
    // Clave equivocada: no borra nada
    page.respuestas = [true, 'ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZ', true, false];
    await page.evaluate(() => olvidePIN());
    assert.ok(await page.evaluate(k => !!localStorage.getItem(k) && !!localStorage.getItem('finanzas_pin_hash'), LS_KEY));
    // Clave correcta, en minúsculas y sin guiones
    page.respuestas = [true, clave.replace(/-/g, '').toLowerCase(), '654321', '654321', true];
    await Promise.all([page.waitForNavigation(), page.evaluate(() => olvidePIN())]);
    await esperarCarga(page);
    await desbloquear(page, '123456');
    assert.equal(await page.evaluate(() => state.setup), false, 'el PIN viejo ya no abre');
    await desbloquear(page, '654321');
    assert.deepEqual(await page.evaluate(() => [state.nombre, state.transactions.length]), ['Ana', 1]);
  });

  it('la huella sin la clave de cifrado pide el PIN en vez de abrir la app vacía', async () => {
    const page = await env.pagina();
    await sembrar(page, conGasto());
    await crearPIN(page, '123456');
    const r = await page.evaluate(async () => {
      _sessionDEK = null; state.setup = false;
      authenticateWithWebAuthn = async () => true;
      await intentarBiometriaDesdePin();
      await new Promise(res => setTimeout(res, 1300));
      return { pin: getComputedStyle(document.getElementById('modal-pin')).display, onboarding: getComputedStyle(document.getElementById('onboarding')).display };
    });
    assert.deepEqual(r, { pin: 'flex', onboarding: 'none' });
  });

  it('el respaldo cifrado usa 600k iteraciones y abre respaldos viejos', async () => {
    const page = await env.pagina();
    await sembrar(page, conGasto());
    // Se toma el archivo al entregarlo a descargarArchivo (en vez de esperar el
    // evento de descarga del navegador, que en CI a veces no llegaba): así la
    // prueba solo espera lo que hace la app, con margen para los 600k de PBKDF2.
    await page.evaluate(() => {
      window.__respaldo = null;
      descargarArchivo = (blob, nombre) => { blob.text().then(t => { window.__respaldo = { nombre, t }; }); };
      window.__exp = exportDataEncriptado();
    });
    await page.waitForSelector('#modal-cloud-pass', { state: 'visible' });
    await page.fill('#cloud-pass-1', 'corta'); await page.fill('#cloud-pass-2', 'corta');
    await page.click('#btn-cloud-pass-ok');
    assert.match(await page.textContent('#cloud-pass-error'), /10 caracteres/);
    await page.fill('#cloud-pass-1', 'respaldo seguro 2026'); await page.fill('#cloud-pass-2', 'respaldo seguro 2026');
    page.respuestas = [true];
    await page.click('#btn-cloud-pass-ok');
    await page.waitForFunction(() => window.__respaldo, null, { timeout: 60000 }).catch(e => { throw new Error('No se generó el respaldo. Diálogos: ' + JSON.stringify(page.dialogos) + ' · Errores: ' + JSON.stringify(page.errores)); });
    const { nombre, t } = await page.evaluate(() => window.__respaldo);
    assert.match(nombre, /^Backup_MiPistoHN_\d{4}-\d{2}-\d{2}\.json$/);
    const archivo = JSON.parse(t);
    assert.equal(archivo.iteraciones, 600000);
    assert.equal(await page.evaluate(a => _descifrarBackupAES(a, 'respaldo seguro 2026').then(s => s.nombre), archivo), 'Ana');
    const viejo = await page.evaluate(async () => {
      const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
      const key = await _deriveBackupKey('ocho1234', salt); // 250k, sin campo de iteraciones
      const c = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode('{"setup":true,"nombre":"Viejo"}'));
      return (await _descifrarBackupAES({ salt: _b64Encode(salt), iv: _b64Encode(iv), datos: _b64Encode(c) }, 'ocho1234')).nombre;
    });
    assert.equal(viejo, 'Viejo');
  });

  it('no ejecuta HTML de etiquetas, categorías ni del aviso de deshacer', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase({ transactions: [
      { id: 'aaaaa1', type: 'expense', amount: 5, cat: '<img src=x onerror=window.__xss=1>', banco: '<img src=x onerror=window.__xss=2>', cuenta: 'efectivo', date: new Date().toISOString(), deletedAt: new Date().toISOString() },
    ] }));
    await page.evaluate(() => {
      renderPapelera();
      _showUndoToast('<img src=x onerror=window.__xss=3> eliminado', '-L.1', () => {});
      document.body.insertAdjacentHTML('beforeend', '<div id="etiqueta-dropdown"></div><input id="etiqueta-input">');
      renderEtiquetaDropdown([{ label: "pa' la casa", count: 2 }, { label: '<img src=x onerror=window.__xss=4>', count: 1 }], 'nuevo');
    });
    await page.locator('.etiqueta-option').first().evaluate(el => el.click());
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.__xss), undefined);
    assert.equal(await page.inputValue('#etiqueta-input'), "pa' la casa");
    // Restaurar desde la papelera funciona (el id iba sin comillas en el onclick)
    await page.locator('.btn-restore').first().evaluate(el => el.click());
    assert.equal(await page.evaluate(() => state.transactions[0].deletedAt), null);
  });
});
