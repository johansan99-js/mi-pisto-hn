const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase } = require('./helpers');

// Un gasto por día en los últimos n días (hoy incluido): racha de n días
function diasSeguidos(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(); d.setDate(d.getDate() - i); d.setHours(12, 0, 0, 0);
    out.push({ id: 'tx' + String(i).padStart(4, '0'), type: 'expense', amount: 50, cat: 'Comida', cuenta: 'efectivo', date: d.toISOString() });
  }
  return out;
}
async function abrir(env, { play = true, transactions = [] } = {}) {
  const page = await env.pagina();
  await sembrar(page, estadoBase({ transactions }));
  await page.evaluate(p => {
    if (p) localStorage.setItem('mph_desde_play', '1');
    window.__abiertas = [];
    window.open = u => { window.__abiertas.push(u); return null; };
  }, play);
  return page;
}

describe('Pedir la calificación en Google Play', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('reconoce la app de Play por su referrer', async () => {
    const page = await abrir(env, { play: false });
    const r = await page.evaluate(() => {
      _marcarSiVieneDePlay('https://www.google.com/');
      const antes = _esAppDePlay();
      _marcarSiVieneDePlay('android-app://hn.mipisto.app/');
      return [antes, _esAppDePlay()];
    });
    assert.deepEqual(r, [false, true]);
  });

  it('con 7 días seguidos anotando lo ofrece, y "Calificar" abre la ficha una sola vez', async () => {
    const page = await abrir(env, { transactions: diasSeguidos(7) });
    assert.equal(await page.evaluate(() => revisarCalificacion()), true);
    assert.match(await page.textContent('#dlg-calificar'), /7 días seguidos/);
    await page.click('#dlg-calificar .cal-si');
    assert.deepEqual(await page.evaluate(() => __abiertas), ['https://play.google.com/store/apps/details?id=hn.mipisto.app']);
    assert.equal(await page.evaluate(() => !!document.getElementById('dlg-calificar')), false);
    assert.equal(await page.evaluate(() => _momentoDeCalificar()), null, 'no se vuelve a pedir');
  });

  it('"Ahora no" espera 30 días, y después de dos veces no insiste más', async () => {
    const page = await abrir(env, { transactions: diasSeguidos(8) });
    await page.evaluate(() => revisarCalificacion());
    await page.click('#dlg-calificar .cal-no');
    const r = await page.evaluate(() => {
      const dia = 86400000, ahora = Date.now();
      const e = JSON.parse(localStorage.getItem('mph_calificar'));
      const out = [_momentoDeCalificar(ahora) === null, Math.round((e.proxima - ahora) / dia) === 30];
      // Pasados los 30 días (y con la racha viva) vuelve a ofrecerlo; tras el segundo "Ahora no", ya no
      e.proxima = ahora - 1; localStorage.setItem('mph_calificar', JSON.stringify(e));
      out.push(_momentoDeCalificar(ahora) !== null);
      e.veces = 2; localStorage.setItem('mph_calificar', JSON.stringify(e));
      out.push(_momentoDeCalificar(ahora) === null);
      return out;
    });
    assert.deepEqual(r, [true, true, true, true]);
  });

  it('no lo pide en la web, ni recién instalada, ni con una ventana abierta', async () => {
    const web = await abrir(env, { play: false, transactions: diasSeguidos(10) });
    assert.equal(await web.evaluate(() => revisarCalificacion()), false);

    const nueva = await abrir(env, { transactions: diasSeguidos(2) });
    assert.equal(await nueva.evaluate(() => _momentoDeCalificar()), null);

    const ocupada = await abrir(env, { transactions: diasSeguidos(7) });
    const r = await ocupada.evaluate(() => { openModal('modal-meta'); const a = revisarCalificacion(); closeModal('modal-meta'); return [a, revisarCalificacion()]; });
    assert.deepEqual(r, [false, true], 'espera a que se cierre la ventana');
  });
});
