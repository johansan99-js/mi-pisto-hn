const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase, conectarNube } = require('./helpers');

const conDatos = () => estadoBase({ nombre: 'Ana', transactions: [{ id: 'tx0001', type: 'expense', amount: 50, cat: 'Comida', cuenta: 'efectivo', date: '2026-09-01T10:00:00Z' }] });

// Teléfono con PIN, conectado a la nube; la nube tiene (versión 5) un gasto más,
// anotado en "otro" dispositivo con la misma clave
async function compuConectada(env) {
  const page = await env.pagina();
  await sembrar(page, conDatos());
  page.respuestas = ['123456', '123456', true];
  await page.evaluate(() => configurarPIN());
  await page.waitForFunction(() => !!_sessionDEK, null, { timeout: 15000 });
  const fila = await page.evaluate(async () => {
    const otro = JSON.parse(JSON.stringify(state));
    otro.transactions.push({ id: 'tx0099', type: 'expense', amount: 120, cat: 'Gasolina', cuenta: 'efectivo', date: '2026-09-03T10:00:00Z', updatedAt: new Date().toISOString() });
    ['mph_cloud_dek', 'mph_cloud_dek_iv'].forEach(k => localStorage.setItem(k, 'x'));
    localStorage.setItem('mph_cloud_salt', 'p2:x');
    return { ciphertext: await _encryptState(otro, _sessionDEK), version: 5, updated_at: new Date().toISOString(), device_id: 'otro', device_name: 'Android' };
  });
  await conectarNube(page, fila);
  await page.evaluate(() => {
    cloudSync.setLocalSyncVersion(4);
    // Canal de Realtime simulado: guarda a quién avisar
    cloudSync.client.channel = nombre => {
      const canal = { nombre, on(tipo, filtro, fn) { window.__rt = { tipo, filtro, fn }; return canal; }, subscribe() { window.__suscrito = nombre; return canal; } };
      return canal;
    };
    cloudSync.client.removeChannel = () => {};
  });
  return page;
}
const ids = page => page.evaluate(() => state.transactions.map(t => t.id).sort());

describe('Tiempo real entre dispositivos', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('escucha solo la fila de su cuenta y trae el cambio del otro dispositivo solo', async () => {
    const page = await compuConectada(env);
    await page.evaluate(() => renderCloudSyncUI());
    assert.deepEqual(await page.evaluate(() => [window.__suscrito, __rt.tipo, __rt.filtro.table, __rt.filtro.filter]), ['estado-u1', 'postgres_changes', 'encrypted_states', 'user_id=eq.u1']);
    // Un aviso de un cambio hecho por este mismo dispositivo no hace nada
    await page.evaluate(() => __rt.fn({ new: { device_id: cloudSync.getDeviceId(), version: 5 } }));
    await page.waitForTimeout(900);
    assert.deepEqual(await ids(page), ['tx0001']);
    // El del teléfono sí
    await page.evaluate(() => __rt.fn({ new: { device_id: 'otro', version: 5 } }));
    await page.waitForFunction(() => state.transactions.length === 2, null, { timeout: 5000 });
    assert.deepEqual(await ids(page), ['tx0001', 'tx0099']);
    assert.equal(await page.evaluate(() => cloudSync.getLocalSyncVersion()), 5);
    assert.equal(await page.evaluate(() => __store.row.version), 5, 'no hacía falta subir nada');
  });

  it('al abrir la app junta solo, sin el aviso de "Combinar"', async () => {
    const page = await compuConectada(env);
    await page.evaluate(() => cloudSync.checkForNewerVersion());
    assert.deepEqual(await ids(page), ['tx0001', 'tx0099']);
    assert.equal(await page.evaluate(() => !!document.getElementById('cloud-newer-banner')), false);
  });

  it('el Excel se arma con lo último de la cuenta', async () => {
    const page = await compuConectada(env);
    await page.evaluate(() => { window.XLSX = undefined; return exportToExcelPro(); });
    assert.deepEqual(await ids(page), ['tx0001', 'tx0099']);
  });

  it('al salir de la app lo pendiente se sube en ese momento', async () => {
    const page = await compuConectada(env);
    await page.evaluate(async () => { cloudSync.setLocalSyncVersion(5); localStorage.setItem(CLOUD_SYNC_CONFIG.enabledKey, 'true'); state.transactions.push({ id: 'tx0100', type: 'expense', amount: 30, cat: 'Café', cuenta: 'efectivo', date: new Date().toISOString() }); await save(); });
    assert.ok(await page.evaluate(() => !!cloudSync._autoSyncTimer), 'quedó esperando para subir');
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForFunction(() => __store.row.version === 6, null, { timeout: 1000 });
    const subidos = await page.evaluate(async () => (await _decryptState(__store.row.ciphertext, _sessionDEK)).transactions.map(t => t.id).sort());
    assert.deepEqual(subidos, ['tx0001', 'tx0100']);
  });
});
