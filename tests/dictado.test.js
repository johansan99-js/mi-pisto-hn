// Dictar un movimiento: la frase llena el teclado y quien dicta revisa y guarda
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase } = require('./helpers');

const HOY = new Date(2026, 8, 25, 12, 0); // viernes
const extra = {
  tarjetas: [{ id: 'tc1', nombre: 'BAC Visa', banco: 'BAC', limite: 20000, saldo: 0, diaCorte: 5, diaPago: 25 }],
  misCuentas: [{ id: 'cta1', nombre: 'Tigo Money', tipo: 'billetera', icono: '📱', color: '#1E88E5' }],
};

describe('Dictar un movimiento', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('entiende las frases de todos los días', async () => {
    const page = await env.pagina();
    await page.clock.setFixedTime(HOY);
    await sembrar(page, estadoBase(extra));
    const casos = await page.evaluate(frases => frases.map(f => {
      const r = interpretarDictado(f);
      return [r.tipo, r.monto, r.moneda, r.cat, r.cuenta, r.tarjeta, r.hacia, r.fecha ? fechaLocal(r.fecha) : null, r.nota, r.remesa];
    }), [
      'Gasté 350 en comida',
      'ayer pagué 1,200 de luz con la tarjeta BAC',
      'me pagaron la quincena 15 mil',
      'pasé 500 del efectivo al ahorro',
      'Mi mamá me mandó 200 dólares por Remitly',
      'compré unas baleadas donde doña Mary 85 lempiras en efectivo',
      'doscientos cincuenta de gasolina el lunes',
      'gasté mil quinientos en el super con Tigo Money',
      '20 dólares de Netflix con tarjeta',
      '350 con 50 de farmacia',
      '$45 de uber antier',
      'me depositaron 3.500 de un trabajo en el ahorro',
    ]);
    assert.deepEqual(casos, [
      ['gasto', 350, 'HNL', 'Comida', null, null, null, null, '', null],
      ['gasto', 1200, 'HNL', 'Luz', null, 'tc1', null, '2026-09-24', '', null],
      ['ingreso', 15000, 'HNL', 'Salario', null, null, null, null, '', null],
      ['transferencia', 500, 'HNL', null, 'efectivo', null, 'ahorro', null, '', null],
      ['ingreso', 200, 'USD', 'Remesa', null, null, null, null, '', { de: 'Mamá', via: 'Remitly' }],
      ['gasto', 85, 'HNL', 'Comida', 'efectivo', null, null, null, 'Baleadas donde doña Mary', null],
      ['gasto', 250, 'HNL', 'Gasolina', null, null, null, '2026-09-21', '', null],
      ['gasto', 1500, 'HNL', 'Supermercado', 'cta1', null, null, null, 'Super', null],
      ['gasto', 20, 'USD', 'Suscripciones', null, 'tc1', null, null, 'Netflix', null],
      ['gasto', 350.5, 'HNL', 'Salud', null, null, null, null, 'Farmacia', null],
      ['gasto', 45, 'USD', 'Transporte', null, null, null, '2026-09-23', 'Uber', null],
      ['ingreso', 3500, 'HNL', null, 'ahorro', null, null, null, '', null],
    ]);
    assert.deepEqual(page.errores, []);
  });

  it('con el micrófono llena el teclado y se guarda al tocar Guardar', async () => {
    const page = await env.pagina();
    await page.clock.setFixedTime(HOY);
    await sembrar(page, estadoBase(extra));
    await page.evaluate(() => {
      window.__frase = 'ayer pagué 1,200 de luz con la tarjeta BAC';
      window.webkitSpeechRecognition = class {
        start() {
          window.__lang = this.lang;
          setTimeout(() => {
            this.onstart && this.onstart();
            const res = [[{ transcript: window.__frase }]]; res[0].isFinal = true;
            this.onresult({ resultIndex: 0, results: res });
            this.onend();
          }, 30);
        }
        abort() {}
      };
      window.SpeechRecognition = window.webkitSpeechRecognition;
      abrirRegistro('gasto');
    });
    await page.click('.reg-extras .dic-btn');
    await page.waitForFunction(() => _reg.expr === '1200');
    assert.equal(await page.evaluate(() => window.__lang), 'es-HN');
    assert.match(await page.textContent('#reg-btn-a'), /BAC Visa/);
    assert.match(await page.textContent('#reg-btn-b'), /Luz/);
    assert.equal(await page.inputValue('#reg-fecha'), '2026-09-24');
    assert.match(await page.textContent('#aviso-rapido'), /Revisa y toca Guardar/);
    assert.equal(await page.evaluate(() => state.transactions.length), 0, 'no se guarda solo');
    await page.click('.reg-accion.guardar');
    const t = await page.evaluate(() => { const t = state.transactions.at(-1); return [t.type, t.amount, t.cat, String(t.tarjetaId), fechaLocal(new Date(t.date))]; });
    assert.deepEqual(t, ['expense', 1200, 'Luz', 'tc1', '2026-09-24']);
    // Una remesa dictada llega con quién, por dónde y en dólares
    await page.evaluate(() => { window.__frase = 'mi mamá me mandó 200 dólares por Remitly'; abrirRegistro('gasto'); });
    await page.click('.reg-extras .dic-btn');
    await page.waitForFunction(() => _reg.expr === '200');
    assert.match(await page.textContent('#reg-remesa'), /De Mamá · Remitly/);
    assert.equal(await page.textContent('#modal-registro .reg-moneda'), 'US$');
    await page.click('.reg-accion.guardar');
    assert.deepEqual(await page.evaluate(() => { const t = state.transactions.at(-1); return [t.type, t.cat, t.originalAmount, t.remesa.de, t.remesa.via]; }), ['income', 'Remesa', 200, 'Mamá', 'Remitly']);
    // Sin la categoría, abre la lista para elegirla
    await page.evaluate(() => { window.__frase = 'gasté 75 en cositas'; abrirRegistro('gasto'); });
    await page.click('.reg-extras .dic-btn');
    await page.waitForFunction(() => _reg.expr === '75');
    assert.match(await page.textContent('#aviso-rapido'), /No entendí la categoría/);
    assert.equal(await page.isVisible('#reg-selector .reg-cats'), true);
    assert.equal(await page.inputValue('#reg-nota'), 'Cositas');
    assert.deepEqual(page.errores, []);
  });

  it('sin reconocimiento de voz deja escribir la frase; mantener presionado el + abre el dictado', async () => {
    const page = await env.pagina();
    await page.clock.setFixedTime(HOY);
    await sembrar(page, estadoBase(extra));
    await page.evaluate(() => { window.SpeechRecognition = undefined; window.webkitSpeechRecognition = undefined; });
    await page.hover('#nav-fab-btn');
    await page.mouse.down();
    await page.waitForTimeout(800);
    await page.mouse.up();
    await page.waitForTimeout(200);
    assert.equal(await page.isVisible('#modal-registro'), true);
    assert.equal(await page.isVisible('#dic-texto'), true);
    assert.equal(await page.isVisible('#dic-mic'), false);
    assert.match(await page.textContent('#reg-selector'), /micrófono del teclado de tu celular/);
    await page.fill('#dic-texto', '20 dólares de Netflix con tarjeta');
    await page.press('#dic-texto', 'Enter');
    const ask = await page.evaluate(() => tasaUSD('ask'));
    assert.equal(await page.evaluate(() => Number(_reg.expr)), Math.round(20 * ask * 100) / 100);
    assert.match(await page.inputValue('#reg-nota'), /^Netflix · US\$ 20 ≈ L\. /);
    assert.match(await page.textContent('#reg-btn-b'), /Suscripciones/);
    // Un toque corto en el + sigue abriendo el teclado sin dictado
    await page.evaluate(() => cerrarRegistro());
    await page.click('#nav-fab-btn');
    assert.equal(await page.isVisible('#modal-registro'), true);
    assert.equal(await page.isVisible('#dic-texto'), false);
    assert.deepEqual(page.errores, []);
  });
});
