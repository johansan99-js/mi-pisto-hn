const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase } = require('./helpers');

// "¿Deseas abandonar el sitio?" solo debe salir si hay una ventana abierta con algo escrito
async function avisaAlSalir(page) {
  return page.evaluate(() => {
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e);
    return e.defaultPrevented;
  });
}

describe('Aviso al salir de la app', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('no avisa cuando ya no hay ninguna ventana abierta', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase());
    await page.evaluate(() => { localStorage.setItem('mph_primeros_pasos', 'oculto'); switchView('metas'); });
    await page.click('#btn-nueva-meta');
    await page.fill('#meta-nombre', 'Viaje');
    assert.equal(await avisaAlSalir(page), true, 'con la ventana abierta y algo escrito, sí avisa');
    // La ventana se cierra por otro camino, sin pasar por closeModal
    await page.evaluate(() => { document.getElementById('modal-meta').style.display = 'none'; });
    assert.equal(await avisaAlSalir(page), false);
  });

  it('escribir el PIN no deja el aviso pegado', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase());
    await page.evaluate(() => {
      const m = document.getElementById('modal-pin');
      m.style.display = 'flex';
      const i = m.querySelector('input') || m.querySelector('.modal-content').appendChild(document.createElement('input'));
      i.value = '123456';
      i.dispatchEvent(new Event('input', { bubbles: true }));
    });
    assert.equal(await avisaAlSalir(page), false);
  });
});
