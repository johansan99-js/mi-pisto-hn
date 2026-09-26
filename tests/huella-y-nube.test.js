const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, esperarCarga, estadoBase, conectarNube } = require('./helpers');

const conDatos = () => estadoBase({ nombre: 'Ana', transactions: [{ id: 'tx0001', type: 'expense', amount: 50, cat: 'Comida', cuenta: 'efectivo', date: '2026-09-01T10:00:00Z' }] });

// Lector de huellas simulado: con PRF entrega siempre el mismo secreto (el "dedo")
const lectorDeHuellas = ({ prf = true, dedo = 7 } = {}) => `(() => {
  const secreto = () => new Uint8Array(32).fill(Number(localStorage.getItem('__dedo') || ${dedo})).buffer;
  window.PublicKeyCredential = window.PublicKeyCredential || function () {};
  const res = () => (${prf} ? { prf: { enabled: true, results: { first: secreto() } } } : { prf: { enabled: false } });
  navigator.credentials.create = async () => ({ rawId: new Uint8Array([1, 2, 3, 4]).buffer, getClientExtensionResults: res });
  navigator.credentials.get = async () => { window.__huellaPedida = (window.__huellaPedida || 0) + 1; return { getClientExtensionResults: res }; };
})();`;

async function conPIN(page, pin = '123456') {
  page.respuestas = [pin, pin, true];
  await page.evaluate(() => configurarPIN());
  await page.waitForFunction(() => !!_sessionDEK, null, { timeout: 15000 });
}

describe('Huella y nube', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('la huella abre la app y los datos sin escribir el PIN', async () => {
    const page = await env.pagina();
    await page.addInitScript(lectorDeHuellas());
    await sembrar(page, conDatos());
    await conPIN(page);
    await page.evaluate(() => registrarBiometria());
    assert.equal(await page.evaluate(() => huellaAbreLaApp()), true);
    await page.reload();
    await page.waitForFunction(() => state.setup && state.nombre === 'Ana', null, { timeout: 20000 });
    assert.equal(await page.evaluate(() => state.transactions.length), 1);
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('modal-pin')).display), 'none');
    assert.equal(await page.evaluate(() => window.__huellaPedida), 1);
  });

  it('otro dedo no abre: queda el PIN', async () => {
    const page = await env.pagina();
    await page.addInitScript(lectorDeHuellas());
    await sembrar(page, conDatos());
    await conPIN(page);
    await page.evaluate(() => registrarBiometria());
    await page.evaluate(() => localStorage.setItem('__dedo', '9'));
    await page.reload();
    await esperarCarga(page);
    await page.waitForFunction(() => getComputedStyle(document.getElementById('modal-pin')).display === 'flex', null, { timeout: 15000 });
    assert.equal(await page.evaluate(() => state.setup), false, 'sin la clave no se ve nada');
  });

  it('en un teléfono sin PRF no se activa y lo explica', async () => {
    const page = await env.pagina();
    await page.addInitScript(lectorDeHuellas({ prf: false }));
    await sembrar(page, conDatos());
    await conPIN(page);
    await page.evaluate(() => registrarBiometria());
    assert.equal(await page.evaluate(() => huellaAbreLaApp()), false);
    assert.match(page.dialogos.join('\n'), /no permite usarla para abrir tus datos/);
  });

  it('al terminar el perfil ofrece conectar la nube', async () => {
    const page = await env.pagina();
    await page.waitForFunction(() => getComputedStyle(document.getElementById('onboarding')).display === 'flex', null, { timeout: 15000 });
    await page.evaluate(() => {
      window.supabase = { createClient() {} };
      cloudSync.signInWithGoogle = async () => { window.__aGoogle = true; return { ok: true }; };
    });
    await page.fill('#ob-nombre', 'Luis');
    page.respuestas = [true, '123456', '123456', true]; // crear PIN · PIN · confirmar · conectar con Google
    await page.evaluate(() => finishOnboarding());
    await page.waitForFunction(() => window.__aGoogle, null, { timeout: 15000 });
    assert.match(page.dialogos.join('\n'), /Respaldar tus datos en la nube/);
    assert.deepEqual(await page.evaluate(() => [localStorage.getItem('mph_nube_empezar'), state.setup]), ['1', true]);
  });

  it('primer dispositivo conectado: crea la contraseña y sube', async () => {
    const page = await env.pagina();
    await sembrar(page, conDatos());
    await conPIN(page);
    await conectarNube(page, null);
    await page.evaluate(() => { window.__pc = cloudSync._primeraConexion(); });
    await page.waitForSelector('#modal-cloud-pass', { state: 'visible' });
    await page.fill('#cloud-pass-1', 'Toby2026casa'); await page.fill('#cloud-pass-2', 'Toby2026casa');
    page.respuestas = [true];
    await page.click('#btn-cloud-pass-ok');
    await page.evaluate(() => window.__pc);
    assert.equal(await page.evaluate(() => !!(__store.row && __store.row.pin_salt.startsWith('p2:'))), true);
    assert.match(page.dialogos.join('\n'), /quedan respaldados/);
  });

  it('la contraseña de la nube pide 10 caracteres y no solo números', async () => {
    const page = await env.pagina();
    await page.evaluate(() => { window.__p = pedirContrasenaNube(false); });
    await page.waitForSelector('#modal-cloud-pass', { state: 'visible' });
    await page.fill('#cloud-pass-1', 'corta123'); await page.fill('#cloud-pass-2', 'corta123');
    await page.click('#btn-cloud-pass-ok');
    assert.match(await page.textContent('#cloud-pass-error'), /10 caracteres/);
    await page.fill('#cloud-pass-1', '1234567890'); await page.fill('#cloud-pass-2', '1234567890');
    await page.click('#btn-cloud-pass-ok');
    assert.match(await page.textContent('#cloud-pass-error'), /solo números/);
    await page.fill('#cloud-pass-1', 'Toby2026ca'); await page.fill('#cloud-pass-2', 'Toby2026ca');
    await page.click('#btn-cloud-pass-ok');
    assert.equal(await page.evaluate(() => window.__p), 'Toby2026ca');
  });

  it('"Actualizar" trae lo que se anotó en el otro dispositivo', async () => {
    const page = await env.pagina();
    await sembrar(page, conDatos());
    await conPIN(page);
    const fila = await page.evaluate(async () => {
      const otro = JSON.parse(JSON.stringify(state));
      otro.transactions.push({ id: 'tx0099', type: 'expense', amount: 120, cat: 'Gasolina', cuenta: 'efectivo', date: '2026-09-03T10:00:00Z', updatedAt: new Date().toISOString() });
      ['mph_cloud_dek', 'mph_cloud_dek_iv'].forEach(k => localStorage.setItem(k, 'x'));
      localStorage.setItem('mph_cloud_salt', 'p2:x');
      return { ciphertext: await _encryptState(otro, _sessionDEK), version: 5, updated_at: new Date().toISOString(), device_id: 'otro', device_name: 'Windows' };
    });
    await conectarNube(page, fila);
    await page.evaluate(() => cloudSync.setLocalSyncVersion(4));
    await page.evaluate(() => actualizarDesdeNube());
    assert.deepEqual(await page.evaluate(() => [state.transactions.map(t => t.id).sort(), __store.row.version]), [['tx0001', 'tx0099'], 6]);
  });

  it('"Abrir en la computadora" muestra la dirección y el QR', async () => {
    const page = await env.pagina();
    await sembrar(page, conDatos());
    await page.evaluate(() => abrirEnLaComputadora());
    await page.waitForSelector('#compu-qr svg', { timeout: 10000 });
    assert.equal(await page.textContent('#compu-url'), await page.evaluate(() => direccionDeLaApp()));
    assert.doesNotMatch(await page.textContent('#compu-url'), /index\.html/);
  });
});

describe('Huella y cambio de PIN', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('entrando con la huella, cambiar el PIN igual pide el actual', async () => {
    const page = await env.pagina();
    await page.addInitScript(lectorDeHuellas());
    await sembrar(page, conDatos());
    await conPIN(page);
    await page.evaluate(() => registrarBiometria());
    await page.reload();
    await page.waitForFunction(() => state.setup && state.nombre === 'Ana', null, { timeout: 20000 });
    const hashAntes = await page.evaluate(() => localStorage.getItem('finanzas_pin_hash'));
    page.respuestas = ['999999'];
    await page.evaluate(() => configurarPIN({ soloCambiar: true }));
    assert.match(page.dialogos.join('\n'), /Ese no es tu PIN actual/);
    assert.equal(await page.evaluate(() => localStorage.getItem('finanzas_pin_hash')), hashAntes);
  });
});
