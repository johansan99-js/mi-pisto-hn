const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase } = require('./helpers');

const conGasto = () => estadoBase({ nombre: 'Ana', transactions: [
  { id: 'g1', type: 'expense', amount: 50, cat: 'Comida', cuenta: 'efectivo', date: '2026-09-01T10:00:00Z' },
] });
const pasos = page => page.evaluate(() => {
  const card = document.getElementById('primeros-pasos');
  return card.style.display === 'none' ? null : [...card.querySelectorAll('.pasos-item')].map(el => el.dataset.paso + (el.classList.contains('hecho') ? ':hecho' : ''));
});

describe('Tutorial, primeros pasos y comentarios', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('al terminar la configuración inicial se abre el tutorial de 3 pasos', async () => {
    const page = await env.pagina();
    await page.waitForSelector('#onboarding', { state: 'visible', timeout: 15000 });
    await page.fill('#ob-nombre', 'Ana');
    page.respuestas = [true, '123456', '123456']; // crear PIN, PIN, confirmación
    await page.click('#onboarding .btn-primary');
    await page.waitForSelector('#modal-tour', { state: 'visible', timeout: 15000 });
    assert.equal(await page.evaluate(() => state.saldoInicial), 0, 'se puede empezar con saldo 0');
    assert.equal(await page.textContent('#tour-bienvenida'), '¡Bienvenido, Ana!');
    assert.deepEqual(await pasos(page), ['kit', 'gasto', 'recordatorio']);

    await page.click('#tour-siguiente');
    await page.click('#tour-siguiente');
    assert.equal(await page.textContent('#tour-siguiente'), '¡Listo!');
    // Sin permiso de notificaciones lo dice, en vez de quedarse callado
    await page.click('#modal-tour .tour-paso[data-paso="2"] .btn-primary');
    assert.match(await page.textContent('#tour-recordatorio-estado'), /permiso/);
    await page.click('#tour-siguiente');
    assert.equal(await page.isVisible('#modal-tour'), false);

    // El botón del tutorial lleva directo a registrar el gasto (con el teclado rápido, no el formulario viejo)
    await page.evaluate(() => abrirTour(1));
    await page.click('#modal-tour .tour-paso[data-paso="1"] .btn-primary');
    assert.deepEqual(await page.evaluate(() => [getComputedStyle(document.getElementById('modal-tour')).display, getComputedStyle(document.getElementById('modal-registro')).display]), ['none', 'flex']);
  });

  it('"Ver tutorial nuevamente" ya no abre la configuración inicial ni borra datos', async () => {
    const page = await env.pagina();
    await sembrar(page, conGasto());
    await page.evaluate(() => mostrarTutorialDeNuevo());
    assert.equal(await page.isVisible('#modal-tour'), true);
    assert.equal(await page.isVisible('#onboarding'), false);
    assert.equal(await page.evaluate(() => state.transactions.length), 1);
  });

  it('la lista de primeros pasos marca lo hecho y desaparece al completarla u ocultarla', async () => {
    const page = await env.pagina();
    await sembrar(page, conGasto());
    assert.deepEqual(await pasos(page), ['kit', 'gasto:hecho', 'recordatorio']);
    assert.match(await page.textContent('#primeros-pasos'), /1 de 3/);
    await page.evaluate(() => {
      localStorage.setItem('finanzas_rec_dek', 'x');
      localStorage.setItem('mph_recordatorio', JSON.stringify({ activo: true, hora: '20:00' }));
      renderPrimerosPasos();
    });
    assert.equal(await pasos(page), null);

    await page.evaluate(() => { localStorage.removeItem('finanzas_rec_dek'); renderPrimerosPasos(); });
    assert.deepEqual(await pasos(page), ['kit', 'gasto:hecho', 'recordatorio:hecho']);
    await page.click('#primeros-pasos button');
    assert.equal(await pasos(page), null);
    await page.reload(); await page.waitForTimeout(800);
    assert.equal(await pasos(page), null, 'ocultarla se recuerda');
  });

  it('el correo de comentarios lleva la versión y ningún dato financiero', async () => {
    const page = await env.pagina();
    await sembrar(page, conGasto());
    await page.waitForFunction(async () => (await caches.keys()).some(k => k.startsWith('mipistohn-')), null, { timeout: 15000 });
    const url = await page.evaluate(() => urlComentarios());
    assert.ok(url.startsWith('mailto:mipistohn@gmail.com?subject='));
    const cuerpo = decodeURIComponent(url.split('&body=')[1]);
    const version = await page.evaluate(() => fetch('sw.js').then(r => r.text()).then(t => t.match(/VERSION = '([^']+)'/)[1]));
    assert.match(cuerpo, new RegExp('Versión: ' + version));
    assert.doesNotMatch(cuerpo, /Ana|Comida/);
  });
});
