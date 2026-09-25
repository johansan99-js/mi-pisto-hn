// Tarjetas con saldo en lempiras y dólares: dos saldos, compras en dólares aparte y cada saldo se paga por separado
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase } = require('./helpers');

const HOY = new Date(2026, 8, 25, 12, 0);
// Tasa fija para que las cuentas sean exactas
const tasaFija = page => page.evaluate(() => {
  tasaUSD = lado => lado === 'ask' ? 25 : 24.5;
  currencyManager.getRate = m => m === 'USD' ? { bid: 24.5, ask: 25 } : null;
});

describe('Tarjetas en lempiras y dólares', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('se crea con los dos saldos, las compras en dólares van aparte y cada saldo se paga', async () => {
    const page = await env.pagina();
    await page.clock.setFixedTime(HOY);
    await sembrar(page, estadoBase({ cuentasIniciales: { efectivo: 20000, ahorro: 0 } }));
    await tasaFija(page);
    // Crear
    await page.evaluate(() => { switchView('tarjetas'); openModal('modal-tarjeta'); });
    await page.fill('#tc-nombre', 'BAC Visa');
    await page.fill('#tc-corte', '5'); await page.fill('#tc-pago', '25');
    await page.fill('#tc-limite', '40000');
    await page.fill('#tc-saldo', '3000');
    assert.equal(await page.isVisible('#tc-saldo-usd'), false);
    await page.check('#tc-bimoneda');
    await page.fill('#tc-saldo-usd', '100');
    await page.click('#modal-tarjeta .btn-primary');
    const tc = () => page.evaluate(() => { const t = state.tarjetas[0]; return [t.bimoneda, t.saldo, t.saldoUSD]; });
    assert.deepEqual(await tc(), [true, 3000, 100]);
    const txt = await page.textContent('#tarjetas-list');
    assert.match(txt, /Lempiras\s*L\. 3,000\.00\s*Dólares\s*US\$ 100\.00\s*Total ≈ L\. 5,500\.00/);
    assert.match(txt, /Disponible: L\. 34,500\.00/);
    // Pago mínimo: 5% de L 3,000 = L 150 + 5% de US$ 100 = US$ 5 (L 125)
    assert.match(txt, /Pago Mínimo:\s*L\. 275\.00\s*L\. 150\.00 \+ US\$ 5\.00/);
    assert.match(txt, /🧾 L[\s\S]*🧾 US\$/);
    assert.doesNotMatch(txt, /Actívalo/);
    assert.match(await page.textContent('#total-deuda-tc'), /5,500\.00/);

    // Comprar en dólares desde el teclado: tocar la L la cambia a US$
    await page.evaluate(() => { abrirRegistro('gasto'); elegirTarjetaRegistro(state.tarjetas[0].id); elegirCatRegistro('Suscripciones'); });
    assert.equal(await page.textContent('#modal-registro .reg-moneda'), 'L');
    await page.click('#modal-registro .reg-moneda.cambiable');
    assert.equal(await page.textContent('#modal-registro .reg-moneda'), 'US$');
    for (const k of '20') await page.click(`.reg-teclado button:text-is("${k}")`);
    assert.match(await page.textContent('#reg-resultado'), /≈ L\. 500\.00/);
    await page.click('.reg-accion.guardar');
    assert.match(await page.textContent('#aviso-rapido'), /Gasto guardado: US\$ 20 · Suscripciones/);
    assert.deepEqual(await page.evaluate(() => { const t = state.transactions.at(-1); return [t.amount, t.originalAmount, t.originalCurrency]; }), [500, 20, 'USD']);
    assert.deepEqual(await tc(), [true, 3000, 120]);
    // Y una en lempiras al saldo en lempiras
    await page.evaluate(() => { abrirRegistro('gasto'); elegirTarjetaRegistro(state.tarjetas[0].id); elegirCatRegistro('Comida'); });
    assert.equal(await page.textContent('#modal-registro .reg-moneda'), 'L', 'cada registro empieza en lempiras');
    for (const k of '500') await page.click(`.reg-teclado button:text-is("${k}")`);
    await page.click('.reg-accion.guardar');
    assert.deepEqual(await tc(), [true, 3500, 120]);
    // Con efectivo no se puede cambiar la moneda
    await page.evaluate(() => { abrirRegistro('gasto'); elegirCuentaRegistro('cuenta', 'efectivo'); });
    assert.equal(await page.$('#modal-registro .reg-moneda.cambiable'), null);
    await page.evaluate(() => cerrarRegistro());

    // Pagar el saldo en dólares desde el efectivo
    await page.evaluate(() => { switchView('tarjetas'); pagarTarjeta(state.tarjetas[0].id); });
    assert.equal(await page.isVisible('#modal-pago-tc'), true);
    await page.click('#ptc-moneda .an-seg-btn[data-m="USD"]');
    assert.match(await page.textContent('#ptc-saldo'), /Debes US\$ 120\.00 · pago mínimo US\$ 6\.00/);
    await page.fill('#ptc-monto', '50');
    assert.match(await page.textContent('#ptc-conversion'), /salen ≈ L\. 1,250\.00/);
    const efectivoAntes = await page.evaluate(() => getCuentaBalance('efectivo'));
    await page.click('#modal-pago-tc .btn-primary');
    assert.deepEqual(await tc(), [true, 3500, 70]);
    assert.equal(await page.evaluate(() => getCuentaBalance('efectivo')), efectivoAntes - 1250);
    // Con lo que de verdad cobró el banco
    await page.evaluate(() => pagarTarjeta(state.tarjetas[0].id));
    await page.click('#ptc-moneda .an-seg-btn[data-m="USD"]');
    await page.fill('#ptc-monto', '20');
    await page.fill('#ptc-cobrado', '505');
    await page.click('#modal-pago-tc .btn-primary');
    assert.deepEqual(await page.evaluate(() => { const t = state.transactions.at(-1); return [t.amount, t.pagoUSD, t.esTransferencia]; }), [505, 20, true]);
    assert.deepEqual(await tc(), [true, 3500, 50]);
    // El saldo en lempiras
    await page.evaluate(() => pagarTarjeta(state.tarjetas[0].id));
    await page.click('#ptc-rapidos .rem-chip:has-text("Todo")');
    await page.click('#modal-pago-tc .btn-primary');
    assert.deepEqual(await tc(), [true, 0, 50]);

    // Conciliar los dólares: el banco dice US$ 62 (una membresía de US$ 12)
    page.respuestas.push('62', true);
    await page.evaluate(() => ajustarSaldoTarjetaUSD(state.tarjetas[0].id));
    assert.deepEqual(await tc(), [true, 0, 62]);
    assert.deepEqual(await page.evaluate(() => { const t = state.transactions.at(-1); return [t.cat, t.amount, t.originalAmount]; }), ['Cargos Bancarios', 300, 12]);

    // Los totales la cuentan en lempiras
    assert.deepEqual(await page.evaluate(() => deudasParaPlan().map(d => [d.nombre, d.saldo])), [['BAC Visa', 1550]]);
    await page.evaluate(() => switchView('cuentas'));
    assert.match(await page.textContent('#view-cuentas'), /BAC Visa[\s\S]*L\. 0\.00 \+ US\$ 62\.00/);
    assert.deepEqual(page.errores, []);
  });

  it('una tarjeta que ya tenías se activa sin cambiar lo que debes en lempiras', async () => {
    const page = await env.pagina();
    await page.clock.setFixedTime(HOY);
    await sembrar(page, estadoBase({
      tarjetas: [{ id: 'tarj001', nombre: 'Ficohsa Oro', limite: 30000, saldo: 0, saldoBase: 1000, corte: 5, pago: 25, tasaInteres: 48, calcularMinimo: true }],
      // Una compra en dólares de antes: ya estaba sumada en lempiras
      transactions: [{ id: 'tx000001', type: 'expense', amount: 530, cat: 'Compras', pago: 'credito', cuenta: null, tipo: 'extra', tarjetaId: 'tarj001', originalAmount: 20, originalCurrency: 'USD', conversionRate: 26.5, date: new Date(2026, 8, 10, 10).toISOString() }],
    }));
    await tasaFija(page);
    await page.evaluate(() => { recalcularSaldosTarjetas(); switchView('tarjetas'); });
    assert.equal(await page.evaluate(() => state.tarjetas[0].saldo), 1530);
    page.respuestas.push('40');
    await page.click('.tc-activar-usd');
    assert.deepEqual(await page.evaluate(() => { const t = state.tarjetas[0]; return [t.bimoneda, t.saldo, t.saldoUSD]; }), [true, 1530, 40]);
    assert.match(await page.textContent('#tarjetas-list'), /Lempiras\s*L\. 1,530\.00\s*Dólares\s*US\$ 40\.00/);
    // Dictar una compra en dólares con esa tarjeta la deja en dólares
    await page.evaluate(() => { abrirRegistro('gasto'); aplicarDictado(interpretarDictado('20 dólares de Netflix con la tarjeta Ficohsa Oro')); });
    assert.deepEqual(await page.evaluate(() => [_reg.expr, _reg.moneda, String(_reg.tarjeta)]), ['20', 'USD', 'tarj001']);
    assert.equal(await page.textContent('#modal-registro .reg-moneda'), 'US$');
    await page.click('.reg-accion.guardar');
    assert.deepEqual(await page.evaluate(() => { const t = state.tarjetas[0]; return [t.saldo, t.saldoUSD]; }), [1530, 60]);
    assert.deepEqual(page.errores, []);
  });
});
