const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase, UUID_TC } = require('./helpers');

const leer = (page, txt) => page.evaluate(t => interpretarMensajeBanco(t), txt);
const tarjetas = [
  { id: UUID_TC, nombre: 'BAC Oro', ultimos4: '1234', corte: 20, pago: 5, limite: 30000, saldo: 0 },
  { id: 'tc-ficohsa', nombre: 'Ficohsa Visa', corte: 15, pago: 1, limite: 20000, saldo: 0 },
];

describe('Pegar SMS del banco y recordatorio diario', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('lee monto, moneda, comercio, tarjeta y tipo de distintos mensajes', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase());
    const bac = await leer(page, 'BAC Credomatic: Compra aprobada por L.1,250.50 en PRICESMART TEGUCIGALPA con tarjeta ***1234 el 25/09 a las 14:03');
    assert.deepEqual([bac.monto, bac.moneda, bac.comercio, bac.ultimos4, bac.banco, bac.tipo, bac.categoria, bac.tipoGasto],
      [1250.5, 'HNL', 'PRICESMART TEGUCIGALPA', '1234', 'BAC', 'gasto', 'Alimentación', 'fijo']);
    const fico = await leer(page, 'Ficohsa le informa: consumo de 350.00 HNL en PIZZA HUT, tarjeta terminada en 9876.');
    assert.deepEqual([fico.monto, fico.moneda, fico.comercio, fico.ultimos4, fico.banco, fico.tipoGasto], [350, 'HNL', 'PIZZA HUT', '9876', 'Ficohsa', 'extra']);
    const usd = await leer(page, 'Compra por USD 15.99 en NETFLIX.COM tarjeta x4321');
    assert.deepEqual([usd.monto, usd.moneda, usd.categoria, usd.subcategoria], [15.99, 'USD', 'Ocio', 'Streaming']);
    assert.equal((await leer(page, 'Retiro en cajero por L. 2,000.00 tarjeta de débito ***5555')).tipo, 'retiro');
    assert.equal((await leer(page, 'Has recibido un depósito de L 5,000.00 en tu cuenta')).tipo, 'ingreso');
    assert.equal(await leer(page, 'Tu código de verificación es para iniciar sesión'), null);
    assert.equal((await leer(page, 'Compra con tarjeta de débito por L.100 en FARMACIA KIELSA')).debito, true);
  });

  it('elige la tarjeta por los últimos 4 o por el banco, y llena el formulario', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase({ tarjetas }));
    const r = await page.evaluate(() => ({
      por4: (tarjetaDelMensaje(interpretarMensajeBanco('Compra L.10 en X con tarjeta ***1234')) || {}).id,
      porBanco: (tarjetaDelMensaje(interpretarMensajeBanco('Ficohsa: compra de L.10 en X')) || {}).id,
      ninguna: tarjetaDelMensaje(interpretarMensajeBanco('Compra L.10 en X con tarjeta ***0000')),
    }));
    assert.deepEqual(r, { por4: UUID_TC, porBanco: 'tc-ficohsa', ninguna: null });

    await page.evaluate(() => { openModal('modal-gasto'); abrirModalSMS('BAC: Compra por L.1,250.50 en PRICESMART con tarjeta ***1234'); });
    assert.match(await page.textContent('#sms-resultado'), /BAC Oro/);
    await page.click('#btn-sms-usar');
    const form = await page.evaluate(() => Object.fromEntries(['gasto-monto', 'gasto-moneda', 'gasto-cat', 'gasto-subcat', 'gasto-tipo', 'gasto-cuenta', 'gasto-tarjeta'].map(id => [id, document.getElementById(id).value])));
    assert.deepEqual(form, { 'gasto-monto': '1250.50', 'gasto-moneda': 'HNL', 'gasto-cat': 'Alimentación', 'gasto-subcat': 'PriceSmart', 'gasto-tipo': 'fijo', 'gasto-cuenta': 'credito', 'gasto-tarjeta': UUID_TC });
    assert.equal(await page.isVisible('#modal-sms'), false);

    // Un retiro de cajero no se puede usar como gasto
    await page.evaluate(() => abrirModalSMS('Retiro por L.500 en cajero'));
    assert.equal(await page.isDisabled('#btn-sms-usar'), true);
    assert.match(await page.textContent('#sms-resultado'), /retiro/);
  });

  it('el recordatorio avisa una vez, después de la hora y solo si hoy no hay movimientos', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase());
    const r = await page.evaluate(async () => {
      // Chromium sin interfaz no concede el permiso de notificaciones
      Object.defineProperty(Notification, 'permission', { get: () => 'granted' });
      const avisos = [];
      enviarNotificacion = (titulo, cuerpo, icono, extra) => avisos.push(extra && extra.tag);
      localStorage.setItem('mph_recordatorio', JSON.stringify({ activo: true, hora: '20:00' }));
      const d = (h, m) => { const x = new Date(); x.setHours(h, m, 0, 0); return x; };
      const antes = verificarRegistroDiario(d(19, 59));
      state.transactions.push({ id: 'hoy1', type: 'expense', amount: 5, cat: 'Café', cuenta: 'efectivo', date: new Date().toISOString() });
      const conMovimiento = verificarRegistroDiario(d(20, 30));
      state.transactions = [];
      const primera = verificarRegistroDiario(d(20, 30));
      const segunda = verificarRegistroDiario(d(22, 0));
      await new Promise(r => setTimeout(r, 300));
      const ficha = await (await (await caches.open('mph-recordatorio')).match('ficha.json')).json();
      return { antes, conMovimiento, primera, segunda, avisos, ficha: [ficha.activo, ficha.hora, ficha.avisado === fechaLocal()] };
    });
    assert.deepEqual(r, { antes: false, conMovimiento: false, primera: true, segunda: false, avisos: ['mph-recordatorio'], ficha: [true, '20:00', true] });
  });

  it('los enlaces ?action=new-expense y Compartir abren el formulario', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase());
    await page.goto(env.url + '?action=new-expense');
    await page.waitForSelector('#modal-gasto', { state: 'visible', timeout: 15000 });
    assert.equal(new URL(page.url()).search, '');

    await page.goto(env.url + '?title=BAC&text=' + encodeURIComponent('Compra por L.99.00 en KFC'));
    await page.waitForSelector('#modal-sms', { state: 'visible', timeout: 15000 });
    assert.match(await page.inputValue('#sms-texto'), /L\.99\.00 en KFC/);
    assert.equal(new URL(page.url()).search, '', 'el texto del SMS no queda en la URL');
  });
});
