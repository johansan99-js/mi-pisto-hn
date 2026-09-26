// Ventanas propias (js/35-dialogos.js) en vez de alert / confirm / prompt del navegador
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase } = require('./helpers');

// Sin el atajo de las pruebas: se usan las ventanas de verdad
const sinAtajo = page => page.evaluate(() => { window.__dialogoPrueba = null; });
const visible = page => page.isVisible('#dialogo-app');

describe('Ventanas propias', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('un aviso se ve con el diseño de la app, en fila, y no abre el diálogo del navegador', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase());
    await sinAtajo(page);
    const nativos = [];
    page.on('dialog', d => nativos.push(d.message()));
    await page.evaluate(() => { alert('Primero'); alert('Segundo\ncon dos líneas'); });
    assert.equal(await visible(page), true);
    assert.equal(await page.textContent('#dialogo-app .dlg-texto'), 'Primero');
    await page.click('#dialogo-app .dlg-si');
    await page.waitForFunction(() => document.querySelector('#dialogo-app .dlg-texto')?.textContent.startsWith('Segundo'));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    assert.equal(await visible(page), false);
    assert.deepEqual(nativos, []);
    assert.deepEqual(page.errores, []);
  });

  it('una confirmación de borrar se ve en rojo y "Cancelar" no borra', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase({ tarjetas: [{ id: 'tarjeta0001', nombre: 'Visa', limite: 1000, saldo: 0, corte: 20, pago: 5 }] }));
    await sinAtajo(page);
    const hecho = page.evaluate(() => deleteTarjeta('tarjeta0001'));
    await page.waitForSelector('#dialogo-app');
    assert.equal(await page.getAttribute('#dialogo-app .dlg-si', 'class'), 'btn btn-danger dlg-si');
    assert.equal(await page.textContent('#dialogo-app .dlg-si'), 'Eliminar');
    await page.click('#dialogo-app .dlg-no');
    await hecho;
    assert.equal(await page.evaluate(() => state.tarjetas.length), 1);
    const otra = page.evaluate(() => deleteTarjeta('tarjeta0001'));
    await page.waitForSelector('#dialogo-app');
    await page.click('#dialogo-app .dlg-si');
    await otra;
    assert.equal(await page.evaluate(() => state.tarjetas.length), 0);
  });

  it('las opciones "[Aceptar] = … / [Cancelar] = …" se vuelven los botones', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase());
    await sinAtajo(page);
    const r = page.evaluate(() => confirmar('¿De dónde sale?\n\n[Aceptar] = Cuenta de Ahorro\n[Cancelar] = Efectivo'));
    await page.waitForSelector('#dialogo-app');
    assert.equal(await page.textContent('#dialogo-app .dlg-si'), 'Cuenta de Ahorro');
    assert.equal(await page.textContent('#dialogo-app .dlg-no'), 'Efectivo');
    assert.doesNotMatch(await page.textContent('#dialogo-app'), /\[Aceptar\]/);
    await page.click('#dialogo-app .dlg-no');
    assert.equal(await r, false);
  });

  it('una pregunta trae el valor sugerido, Enter la acepta y Esc la cancela; el PIN va oculto', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase());
    await sinAtajo(page);
    let r = page.evaluate(() => preguntar('¿Cuánto pagaste?', '250.00'));
    await page.waitForSelector('#dialogo-app .dlg-input');
    assert.equal(await page.inputValue('#dialogo-app .dlg-input'), '250.00');
    assert.equal(await page.getAttribute('#dialogo-app .dlg-input', 'inputmode'), 'decimal');
    await page.fill('#dialogo-app .dlg-input', '300');
    await page.keyboard.press('Enter');
    assert.equal(await r, '300');
    r = page.evaluate(() => preguntar('¿Nombre?'));
    await page.waitForSelector('#dialogo-app .dlg-input');
    await page.keyboard.press('Escape');
    assert.equal(await r, null);
    r = page.evaluate(() => preguntar('Crea tu PIN (6 a 8 dígitos):'));
    await page.waitForSelector('#dialogo-app .dlg-input');
    assert.equal(await page.getAttribute('#dialogo-app .dlg-input', 'type'), 'password');
    await page.keyboard.type('123456');
    await page.click('#dialogo-app .dlg-si');
    assert.equal(await r, '123456');
  });

  it('con la app bloqueada, la ventana se ve encima del candado', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase());
    await sinAtajo(page);
    await page.evaluate(() => { _bloquearVista(true); document.getElementById('modal-pin').style.display = 'flex'; alert('Clave incorrecta'); });
    await page.waitForSelector('#dialogo-app');
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('dialogo-app')).visibility), 'visible');
    await page.click('#dialogo-app .dlg-si');
    assert.equal(await visible(page), false);
  });
});
