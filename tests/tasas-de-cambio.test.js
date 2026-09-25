const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { crearEntorno, sembrar, estadoBase } = require('./helpers');

const tasasJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tasas.json'), 'utf8'));
const usd = page => page.evaluate(() => [currencyManager.getRate('USD').bid, currencyManager.getRate('USD').ask, currencyManager.ratesSource]);

describe('Tasas de cambio', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('dice de dónde salen las tasas y que cada banco cobra distinto', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase());
    await page.waitForFunction(() => currencyManager.ratesSource === 'json', null, { timeout: 15000 });
    await page.evaluate(() => openRatesModal());
    const txt = await page.textContent('#rates-fuente');
    assert.match(txt, /Fuente: .*(Banco Central de Honduras|mercado internacional)/);
    assert.match(txt, /Cada banco cobra distinto/);
  });

  it('las tasas de tu banco se mantienen al volver a abrir la app, hasta tocar Auto', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase());
    await page.waitForFunction(() => currencyManager.ratesSource === 'json', null, { timeout: 15000 });
    await page.evaluate(() => openRatesModal());
    await page.fill('.rate-input-bid[data-currency="USD"]', '26.8842');
    await page.fill('.rate-input-ask[data-currency="USD"]', '27.0186');
    page.respuestas = [true];
    await page.click('#modal-rates .btn-primary');
    assert.deepEqual(await usd(page), [26.8842, 27.0186, 'manual']);

    // Antes, la siguiente carga las reemplazaba por las de tasas.json
    await page.reload(); await page.waitForTimeout(2500);
    assert.deepEqual(await usd(page), [26.8842, 27.0186, 'manual']);
    await page.evaluate(() => openRatesModal());
    assert.match(await page.textContent('#rates-fuente'), /las tasas de tu banco/);

    page.respuestas = [true];
    await page.click('#modal-rates button:has-text("Auto")');
    await page.waitForFunction(() => currencyManager.ratesSource === 'json', null, { timeout: 15000 });
    const [bid, ask] = await usd(page);
    assert.deepEqual([bid, ask], [tasasJson.rates.USD.bid, tasasJson.rates.USD.ask]);
  });

  it('un gasto en dólares usa la tasa de tu banco', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase({ cuentasIniciales: { efectivo: 50000, ahorro: 0 } }));
    await page.evaluate(() => currencyManager.updateExchangeRates({ USD: { bid: 26.8842, ask: 27.0186 } }));
    await page.evaluate(() => { openModal('modal-gasto'); document.getElementById('gasto-monto').value = '100'; document.getElementById('gasto-moneda').value = 'USD'; document.getElementById('gasto-cat').value = 'Compras'; document.getElementById('gasto-cuenta').value = 'efectivo'; checkCreditCard(); saveGasto(); });
    assert.equal(await page.evaluate(() => state.transactions[0].amount), 2701.86);
  });
});
