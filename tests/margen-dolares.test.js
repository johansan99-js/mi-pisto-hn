const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase, UUID_TC } = require('./helpers');

const tarjeta = { id: UUID_TC, nombre: 'BAC Oro', corte: 20, pago: 5, limite: 30000, saldo: 0, saldoBase: 0, tasaInteres: 48 };
// Compra de $100 a la referencia 26.90 = L 2,690.00
const compraUSD = (id, extra = {}) => Object.assign({ id, type: 'expense', amount: 2690, cat: 'Compras', subcat: 'Amazon', pago: 'credito', cuenta: null, tarjetaId: UUID_TC,
  originalAmount: 100, originalCurrency: 'USD', conversionRate: 26.9, conversionSide: 'ask', date: new Date().toISOString() }, extra);

describe('Margen del banco en compras en dólares', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('el SMS con las dos monedas llena lo que cobró el banco, y un saldo aparte no confunde', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase());
    const r = await page.evaluate(() => [
      interpretarMensajeBanco('BAC: Compra por USD 15.99 (L 430.12) en NETFLIX.COM tarjeta ***1234'),
      interpretarMensajeBanco('Compra por L 430.12 (USD 15.99) en SPOTIFY'),
      interpretarMensajeBanco('Compra por L 350.00 en PIZZA HUT. Saldo disponible en dolares: USD 1,000.00'),
    ].map(x => [x.monto, x.moneda, x.montoLempiras || null]));
    assert.deepEqual(r, [[15.99, 'USD', 430.12], [15.99, 'USD', 430.12], [350, 'HNL', null]]);
  });

  it('al anotar lo que cobró el banco, el gasto y la tarjeta quedan por ese monto', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase({ tarjetas: [tarjeta] }));
    const r = await page.evaluate(() => {
      window.currencyManager.getRate = () => ({ bid: 26.8, ask: 26.9, mid: 26.85 });
      openModal('modal-gasto');
      document.getElementById('gasto-monto').value = '100';
      document.getElementById('gasto-moneda').value = 'USD';
      document.getElementById('gasto-cobrado').value = '2,750';
      actualizarConversionGasto();
      const vista = document.getElementById('gasto-margen-info').textContent;
      document.getElementById('gasto-cat').value = 'Compras';
      document.getElementById('gasto-cuenta').value = 'credito'; checkCreditCard();
      document.getElementById('gasto-tarjeta').value = state.tarjetas[0].id;
      saveGasto();
      const t = state.transactions[state.transactions.length - 1];
      return { vista, amount: t.amount, cobrado: t.cobradoBanco, ref: referenciaHNL(t), saldo: state.tarjetas[0].saldo };
    });
    assert.match(r.vista, /L\. ?60\.00 de más \(\+2\.2%\)/);
    assert.deepEqual([r.amount, r.cobrado, r.ref, r.saldo], [2750, true, 2690, 2750]);
  });

  it('la pestaña TC resume el margen y lista las compras sin confirmar', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase({ tarjetas: [tarjeta], transactions: [
      compraUSD('usd001', { amount: 2750, cobradoBanco: true }),
      compraUSD('usd002', { amount: 2780, cobradoBanco: true }),
      compraUSD('usd003'),
    ] }));
    const r = await page.evaluate(() => resumenMargenExtranjero());
    assert.deepEqual([r.confirmadas, r.pendientes.length, r.margen, r.tasaBancoUSD.toFixed(2)], [2, 1, 150, '27.65']);
    const texto = await page.textContent('#margen-dolares');
    assert.match(texto, /L\. ?150\.00 de más \(\+2\.8%\) en 2 compras/);
    assert.match(texto, /1 compra sin confirmar/);

    // Confirmar la pendiente desde la lista, en la edición
    await page.evaluate(() => { switchView('tarjetas'); });
    await page.click('#margen-dolares [data-tx="usd003"]');
    await page.fill('#edit-cobrado', '2720');
    assert.match(await page.textContent('#edit-margen-info'), /L\. ?30\.00 de más/);
    await page.evaluate(() => guardarEdicionTx());
    const t = await page.evaluate(() => { const t = state.transactions.find(x => x.id === 'usd003'); return [t.amount, t.cobradoBanco, state.tarjetas[0].saldo]; });
    assert.deepEqual(t, [2720, true, 8250]);
  });

  it('un gasto dividido reparte lo cobrado entre sus partes', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase());
    const r = await page.evaluate(() => _escalarSplits([{ cat: 'A', monto: 1345 }, { cat: 'B', monto: 1345 }], 2750.01));
    assert.deepEqual(r, [{ cat: 'A', monto: 1375.01 }, { cat: 'B', monto: 1375 }]);
  });
});
