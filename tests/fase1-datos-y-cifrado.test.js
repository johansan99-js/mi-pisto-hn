// Fase 1 de la revisión: no perder datos al desbloquear, nunca guardar en claro con PIN,
// la copia más nueva manda, el candado tapa todo y cambiar el PIN pide el actual
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, esperarCarga, desbloquear, estadoBase, LS_KEY } = require('./helpers');

const leerIDB = page => page.evaluate(() => new Promise(res => {
  initDB().then(db => { const g = db.transaction('app_state').objectStore('app_state').get('current_state'); g.onsuccess = () => res(g.result); });
}));
async function crearPIN(page, pin) {
  page.respuestas = [pin, pin, true];
  await page.evaluate(() => configurarPIN());
  await page.waitForFunction(() => !!_sessionDEK, null, { timeout: 15000 });
  await page.waitForTimeout(300);
}
const completo = () => estadoBase({
  nombre: 'Ana',
  transactions: [{ id: 'aaaaa1', type: 'expense', amount: 50, cat: 'Pupusas', cuenta: 'efectivo', date: '2026-09-01T10:00:00Z' }],
  categorias: [{ id: 'cate0001', nombre: 'Pupusas', tipo: 'gasto', icono: '🫓', color: '#FB8C00' }],
  diasSinGastos: ['2026-09-02'], mejorRacha: 9, diasPago: [15, 30], tarjetaAlPagar: true, premium: { pruebaInicio: '2026-09-01T00:00:00Z' },
});

describe('Fase 1: datos y cifrado', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('desbloquear con el PIN conserva categorías, racha, días de pago y Premium', async () => {
    const page = await env.pagina();
    await sembrar(page, completo());
    await crearPIN(page, '123456');
    for (let vuelta = 0; vuelta < 2; vuelta++) {
      await page.reload(); await esperarCarga(page);
      await desbloquear(page, '123456');
      const r = await page.evaluate(() => [state.categorias.length, state.diasSinGastos, state.mejorRacha, state.diasPago, state.tarjetaAlPagar, !!(state.premium && state.premium.pruebaInicio)]);
      assert.deepEqual(r, [1, ['2026-09-02'], 9, [15, 30], true, true], 'vuelta ' + vuelta);
      await page.evaluate(() => save());
    }
    assert.deepEqual(page.errores, []);
  });

  it('con la app bloqueada no se guarda nada en claro, la memoria se vacía y el candado tapa todo', async () => {
    const page = await env.pagina();
    await page.setViewportSize({ width: 1366, height: 768 });
    await sembrar(page, completo());
    await crearPIN(page, '123456');
    await page.reload(); await esperarCarga(page);
    await desbloquear(page, '123456');
    // Un pago fijo que se anota solo al volver a la app
    await page.evaluate(() => { state.pagosRecurrentes.push({ id: 'pagofijo1', servicio: 'Luz', monto: 850, dia: 1, tipo: 'gasto', cuenta: 'efectivo', auto: true, autoDesde: new Date(2020, 0, 1).toISOString(), pagado: 0 }); return save(); });
    await page.evaluate(() => { state.pagosRecurrentes[0].anotados = {}; });
    // Pasa más de un minuto en segundo plano
    await page.evaluate(() => {
      sessionStorage.setItem('_ocultoDesde', String(Date.now() - 120000));
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(400);
    assert.equal(await page.isVisible('#modal-pin'), true);
    const ls = await page.evaluate(k => localStorage.getItem(k), LS_KEY);
    assert.ok(!ls.includes('"nombre"') && !ls.includes('Pupusas'), 'localStorage sigue cifrado');
    assert.deepEqual(Object.keys(await leerIDB(page)).sort(), ['_enc', '_lastSave', '_version'], 'IndexedDB sigue cifrado');
    assert.deepEqual(await page.evaluate(() => [state.transactions.length, state.nombre, document.body.classList.contains('app-bloqueada')]), [0, '', true], 'la memoria se vació');
    // Nada detrás del candado se ve ni se puede tocar
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('main-scroll-area') || document.querySelector('.view')).visibility), 'hidden');
    assert.equal(await page.evaluate(() => [...document.body.children].filter(e => e.id !== 'modal-pin' && e.tagName !== 'SCRIPT' && e.id !== 'bio-screen').every(e => e.inert)), true);
    // Un guardado mientras está bloqueada no escribe
    await page.evaluate(() => { state.nombre = 'Intruso'; return save(); });
    assert.equal(await page.evaluate(k => localStorage.getItem(k), LS_KEY), ls);
    // Al desbloquear vuelven los datos y la página
    await desbloquear(page, '123456');
    assert.deepEqual(await page.evaluate(() => [state.nombre, state.categorias.length, document.body.classList.contains('app-bloqueada')]), ['Ana', 1, false]);
    assert.deepEqual(page.errores, []);
  });

  it('al abrir se usa la copia más nueva: una recarga a medio guardar no pierde el último cambio', async () => {
    const page = await env.pagina();
    await sembrar(page, completo());
    // Guardado completo, y luego localStorage más nuevo que IndexedDB (IDB aún no terminó)
    await page.evaluate(() => save());
    await page.evaluate(k => { const s = JSON.parse(localStorage.getItem(k)); s.transactions.push({ id: 'nuevo01', type: 'expense', amount: 99, cat: 'Comida', cuenta: 'efectivo', date: new Date().toISOString() }); s._guardadoEn = Date.now() + 1000; localStorage.setItem(k, JSON.stringify(s)); }, LS_KEY);
    await page.reload(); await esperarCarga(page);
    assert.equal(await page.evaluate(() => state.transactions.some(t => t.id === 'nuevo01')), true, 'gana localStorage, que es más nuevo');
    // Y al revés: localStorage lleno (viejo) e IndexedDB con lo último
    await page.evaluate(k => { const s = JSON.parse(localStorage.getItem(k)); s.transactions = s.transactions.filter(t => t.id !== 'nuevo01'); s._guardadoEn = 1; localStorage.setItem(k, JSON.stringify(s)); }, LS_KEY);
    await page.reload(); await esperarCarga(page);
    assert.equal(await page.evaluate(() => state.transactions.some(t => t.id === 'nuevo01')), true, 'gana IndexedDB, que es más nueva');
    // Si localStorage se llena, se sigue guardando en IndexedDB sin perder nada
    await page.evaluate(() => { Storage.prototype._set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === LS_KEY) throw new DOMException('lleno', 'QuotaExceededError'); return this._set(k, v); }; state.nombre = 'Ana María'; return save(); });
    assert.equal((await leerIDB(page)).nombre, 'Ana María');
    assert.deepEqual(page.dialogos, [], 'no alarma si IndexedDB sí guardó');
    assert.deepEqual(page.errores, []);
  });

  it('cambiar el PIN pide el actual y repetir el nuevo', async () => {
    const page = await env.pagina();
    await sembrar(page, completo());
    await crearPIN(page, '123456');
    const hash = () => page.evaluate(() => localStorage.getItem('finanzas_pin_hash'));
    const antes = await hash();
    page.respuestas = ['999999'];
    await page.evaluate(() => configurarPIN({ soloCambiar: true }));
    assert.match(page.dialogos.at(-1), /Ese no es tu PIN actual/);
    page.respuestas = ['123456', '654321', '654320'];
    await page.evaluate(() => configurarPIN({ soloCambiar: true }));
    assert.match(page.dialogos.at(-1), /no coinciden/);
    assert.equal(await hash(), antes, 'nada cambió');
    page.respuestas = ['123456', '654321', '654321', true];
    await page.evaluate(() => configurarPIN({ soloCambiar: true }));
    await page.waitForFunction(h => localStorage.getItem('finanzas_pin_hash') !== h, antes);
    assert.match(page.dialogos.at(-1), /PIN cambiado/);
    await page.reload(); await esperarCarga(page);
    await desbloquear(page, '654321');
    assert.equal(await page.evaluate(() => state.nombre), 'Ana');
  });
});
