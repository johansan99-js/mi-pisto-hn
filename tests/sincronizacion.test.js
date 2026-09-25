const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, esperarCarga, desbloquear, estadoBase, conectarNube } = require('./helpers');

const conDatos = () => estadoBase({ nombre: 'Ana', transactions: [
  { id: 'aaaaa1', type: 'expense', amount: 50, cat: 'Comida', cuenta: 'efectivo', date: '2026-09-01T10:00:00Z' },
  { id: 'aaaaa2', type: 'expense', amount: 80, cat: 'Taxi', cuenta: 'efectivo', date: '2026-09-02T10:00:00Z' },
], receivables: [{ id: 'cobro1', persona: 'Luis', monto: 500, pagado: 0 }] });

async function crearPIN(page, pin) {
  page.respuestas = [pin, true];
  await page.evaluate(() => configurarPIN());
  await page.waitForFunction(() => !!_sessionDEK, null, { timeout: 15000 });
}

describe('Sincronización entre dispositivos', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('save() sella solo lo que cambió y anota los borrados definitivos', async () => {
    const page = await env.pagina();
    await sembrar(page, Object.assign(conDatos(), { sellosV: 0 }));
    const r = await page.evaluate(async () => {
      await save();
      const primera = state.transactions.filter(t => t.updatedAt).length;
      state.transactions[0].amount = 55; await save();
      const sellados = state.transactions.map(t => !!t.updatedAt);
      state.receivables = []; await save();
      await save();
      return { primera, sellados, eliminados: Object.keys(state.eliminados), sinCambios: state.transactions.filter(t => t.updatedAt).length };
    });
    assert.deepEqual(r, { primera: 0, sellados: [true, false], eliminados: ['cobro1'], sinCambios: 1 });
  });

  it('el merge conserva el cambio más reciente y no revive lo borrado', async () => {
    const page = await env.pagina();
    const r = await page.evaluate(() => {
      const t = s => new Date(Date.parse('2026-09-24T12:00:00Z') + s * 1000).toISOString();
      const base = o => Object.assign({ setup: true, sellosV: 1, eliminados: {}, transactions: [], goals: [], receivables: [], payables: [], prestamos: [], tarjetas: [], pagosRecurrentes: [], transferenciasProgramadas: [] }, o);
      const M = (L, R) => cloudSync.mergeStates(base(L), base(R));
      return {
        localNuevo: M({ transactions: [{ id: 't1', amount: 100, updatedAt: t(20) }] }, { transactions: [{ id: 't1', amount: 90, updatedAt: t(10) }] }).merged.transactions[0].amount,
        remotoNuevo: M({ transactions: [{ id: 't1', amount: 100, updatedAt: t(10) }] }, { transactions: [{ id: 't1', amount: 90, updatedAt: t(20) }] }).merged.transactions[0].amount,
        restaurado: M({ transactions: [{ id: 't1', deletedAt: null, updatedAt: t(30) }] }, { transactions: [{ id: 't1', deletedAt: t(10), updatedAt: t(10) }] }).merged.transactions[0].deletedAt,
        borradoEnOtro: M({ receivables: [{ id: 'c1', updatedAt: t(5) }] }, { eliminados: { c1: t(10) } }).merged.receivables.length,
        editadoTrasBorrar: M({ receivables: [{ id: 'c1', updatedAt: t(20) }] }, { eliminados: { c1: t(10) } }).merged.receivables.length,
        noRevive: M({ eliminados: { c1: t(10) } }, { receivables: [{ id: 'c1', updatedAt: t(5) }] }).merged.receivables.length,
        retiroMeta: M({ goals: [{ id: 'g1', actual: 2000, updatedAt: t(30) }] }, { goals: [{ id: 'g1', actual: 3000, updatedAt: t(10) }] }).merged.goals[0].actual,
        sinSellos: M({ transactions: [{ id: 't1', amount: 1 }] }, { transactions: [{ id: 't1', amount: 2 }] }).merged.transactions[0].amount,
      };
    });
    assert.deepEqual(r, { localNuevo: 100, remotoNuevo: 90, restaurado: null, borradoEnOtro: 0, editadoTrasBorrar: 1, noRevive: 0, retiroMeta: 2000, sinSellos: 2 });
  });

  it('no sube encima de la nube si no pudo leer su versión más nueva', async () => {
    const page = await env.pagina();
    await sembrar(page, conDatos());
    await crearPIN(page, '123456');
    await conectarNube(page);
    const r = await page.evaluate(async () => {
      let subidas = 0;
      cloudSync.uploadState = async () => { subidas++; return { ok: true, version: 9 }; };
      cloudSync.setLocalSyncVersion(1);
      cloudSync.getRemoteInfo = async () => ({ version: 5, updated_at: new Date().toISOString() });
      cloudSync._downloadAndDecrypt = async () => ({ ok: false, error: 'PIN cambiado' });
      const fallaDescarga = (await cloudSync._autoMergeAndUpload()).ok;
      cloudSync.getRemoteInfo = async o => { if (o && o.strict) throw new Error('red caída'); return null; };
      const redCaida = (await cloudSync._autoMergeAndUpload()).ok;
      cloudSync.getRemoteInfo = async () => null;
      const primeraVez = (await cloudSync._autoMergeAndUpload()).ok;
      return { fallaDescarga, redCaida, primeraVez, subidas };
    });
    assert.deepEqual(r, { fallaDescarga: false, redCaida: false, primeraVez: true, subidas: 1 });
  });

  it('la nube usa su propia contraseña y otro teléfono baja los datos con ella', async () => {
    const A = await env.pagina();
    await sembrar(A, conDatos());
    await crearPIN(A, '123456');
    await conectarNube(A);
    assert.equal((await A.evaluate(() => cloudSync.uploadState())).needsPassphrase, true);
    await A.evaluate(() => { if (!document.getElementById('btn-cloud-upload')) document.body.insertAdjacentHTML('beforeend', '<button id="btn-cloud-upload"></button>'); window.__sub = subirDatosCloud(); });
    await A.waitForSelector('#modal-cloud-pass', { state: 'visible' });
    await A.fill('#cloud-pass-1', '12345678901234'); await A.fill('#cloud-pass-2', '12345678901234');
    await A.click('#btn-cloud-pass-ok');
    assert.match(await A.textContent('#cloud-pass-error'), /solo números/);
    await A.fill('#cloud-pass-1', 'mi perro se llama Toby'); await A.fill('#cloud-pass-2', 'mi perro se llama Toby');
    A.respuestas = [true];
    await A.click('#btn-cloud-pass-ok');
    await A.evaluate(() => window.__sub);
    const row = await A.evaluate(() => __store.row);
    assert.ok(row.pin_salt.startsWith('p2:'));

    const B = await env.pagina();
    await conectarNube(B, row);
    assert.match((await B.evaluate(() => cloudSync.downloadState({ pin: '654321', passphrase: 'otra cualquiera' }))).error, /incorrecta/);
    assert.equal((await B.evaluate(() => cloudSync.downloadState({ pin: '654321', passphrase: 'mi perro se llama Toby' }))).ok, true);
    await B.reload(); await esperarCarga(B);
    await desbloquear(B, '654321');
    assert.deepEqual(await B.evaluate(() => [state.nombre, state.transactions.length]), ['Ana', 2]);
    await conectarNube(B, row);
    assert.equal((await B.evaluate(() => cloudSync.uploadState())).ok, true, 'el auto-sync no vuelve a pedir la contraseña');
  });

  it('eliminar la cuenta borra la nube y conserva los datos del teléfono', async () => {
    const page = await env.pagina();
    await sembrar(page, conDatos());
    await crearPIN(page, '123456');
    await conectarNube(page, { ciphertext: 'x', version: 4, updated_at: new Date().toISOString() });
    await page.evaluate(() => { localStorage.setItem('mph_cloud_dek', 'a'); localStorage.setItem('mph_cloud_dek_iv', 'b'); localStorage.setItem('mph_cloud_salt', 'p2:c'); });
    page.respuestas = [true, true, true];
    await page.evaluate(() => eliminarCuentaCloud());
    const r = await page.evaluate(() => ({ store: __store, claveNube: cloudSync.hasCloudKey(), usuario: cloudSync.user, tx: state.transactions.length }));
    assert.equal(r.store.rpc, 'eliminar_mi_cuenta');
    assert.equal(r.store.row, null);
    assert.equal(r.store.sesionCerrada, true);
    assert.deepEqual([r.claveNube, r.usuario, r.tx], [false, null, 2]);
  });

  it('un blob viejo protegido con el PIN se sigue bajando', async () => {
    const page = await env.pagina();
    const row = await page.evaluate(async () => {
      const dek = _generateDEK(), salt = crypto.getRandomValues(new Uint8Array(16));
      const { encrypted, iv } = await _encryptDEK(dek, await _deriveKEKFromPIN('4321', salt));
      return { ciphertext: await _encryptState({ setup: true, nombre: 'Viejo', transactions: [] }, dek), dek_ciphertext: _b64EncodeArr(encrypted), dek_iv: _b64EncodeArr(iv), pin_salt: _b64EncodeArr(salt), version: 3, updated_at: new Date().toISOString() };
    });
    await conectarNube(page, row);
    assert.equal((await page.evaluate(() => cloudSync.downloadState({ pin: '4321' }))).ok, true);
    assert.equal(await page.evaluate(() => state.nombre), 'Viejo');
  });
});
