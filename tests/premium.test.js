// Mi Pisto Premium: preparado pero apagado; prueba de 30 días y restaurar compra
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase } = require('./helpers');

describe('Mi Pisto Premium', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('apagado: nada se bloquea y la tarjeta explica que todo es gratis y que tus datos nunca se bloquean', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase());
    assert.equal(await page.evaluate(() => [PREMIUM.activo, tienePremium()].join()), 'false,true');
    await page.evaluate(() => switchView('config'));
    const txt = await page.textContent('#premium-card');
    assert.match(txt, /todo es gratis[\s\S]*Sincronización en la nube[\s\S]*Tus datos nunca se bloquean[\s\S]*Restaurar mi compra/);
    assert.doesNotMatch(txt, /Probar 30 días/);
    // Fuera de la app de Play, restaurar explica qué hacer
    await page.evaluate(() => restaurarCompra());
    assert.match(page.dialogos.pop(), /app instalada desde Google Play[\s\S]*mipistohn@gmail\.com/);
  });

  it('encendido: 30 días de prueba una sola vez, y restaurar la compra con Google Play', async () => {
    const page = await env.pagina();
    await page.clock.setFixedTime(new Date(2026, 8, 25, 12));
    await sembrar(page, estadoBase());
    await page.evaluate(() => { PREMIUM.activo = true; renderPremium(); });
    assert.equal(await page.evaluate(() => tienePremium()), false);
    assert.match(await page.textContent('#premium-card'), /Probar 30 días gratis/);
    await page.evaluate(() => iniciarPrueba());
    assert.deepEqual(await page.evaluate(() => { const e = estadoPremium(); return [e.enPrueba, e.diasPrueba, tienePremium()]; }), [true, 30, true]);
    assert.match(await page.textContent('#premium-card'), /te quedan 30 días/);
    // Al día 31 termina y no se puede repetir
    await page.clock.setFixedTime(new Date(2026, 9, 26, 12));
    assert.deepEqual(await page.evaluate(() => [estadoPremium().enPrueba, tienePremium()]), [false, false]);
    await page.evaluate(() => iniciarPrueba());
    assert.match(page.dialogos.pop(), /Ya usaste tu mes de prueba/);
    // Restaurar con la Digital Goods API de Play
    await page.evaluate(() => { window.getDigitalGoodsService = async () => ({ listPurchases: async () => [{ itemId: 'mipisto_premium', purchaseToken: 'tok123' }] }); });
    await page.evaluate(() => restaurarCompra());
    assert.match(page.dialogos.pop(), /Premium está activo de nuevo/);
    assert.deepEqual(await page.evaluate(() => [estadoPremium().compraVigente, tienePremium(), state.premium.compra.token]), [true, true, 'tok123']);
    // Otra cuenta de Google sin la compra: lo explica
    await page.evaluate(() => { state.premium.compra = null; window.getDigitalGoodsService = async () => ({ listPurchases: async () => [] }); restaurarCompra(); });
    await page.waitForTimeout(100);
    assert.match(page.dialogos.pop(), /con otra cuenta de Google, cámbiala en Play Store/);
    assert.deepEqual(page.errores, []);
  });
});
