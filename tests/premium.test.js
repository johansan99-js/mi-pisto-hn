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
    assert.match(txt, /todo es gratis[\s\S]*Reportes en PDF[\s\S]*L 25 al mes[\s\S]*L 199 al año[\s\S]*Tus datos nunca se bloquean[\s\S]*Restaurar mi compra/);
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
    await page.evaluate(() => { window.getDigitalGoodsService = async () => ({ listPurchases: async () => [{ itemId: 'mipisto_premium_anual', purchaseToken: 'tok123' }] }); });
    await page.evaluate(() => restaurarCompra());
    assert.match(page.dialogos.pop(), /Premium está activo de nuevo/);
    assert.deepEqual(await page.evaluate(() => [estadoPremium().compraVigente, tienePremium(), state.premium.compra.token, state.premium.compra.plan]), [true, true, 'tok123', 'mipisto_premium_anual']);
    // Otra cuenta de Google sin la compra: lo explica
    await page.evaluate(() => { state.premium.compra = null; window.getDigitalGoodsService = async () => ({ listPurchases: async () => [] }); restaurarCompra(); });
    await page.waitForTimeout(100);
    assert.match(page.dialogos.pop(), /con otra cuenta de Google, cámbiala en Play Store/);
    assert.deepEqual(page.errores, []);
  });

  const cuenta = i => ({ id: 'cta' + i, nombre: 'Banco ' + i, tipo: 'ahorro', icono: '🏦', color: '#1E88E5' });
  const grupo = i => ({ id: 'grp' + i, nombre: 'Grupo ' + i, miembros: [{ id: 'm' + i, nombre: 'Ana' }], gastos: [], pagos: [] });
  const presu = (i, cat) => ({ id: 'pre' + i, cat, monto: 1000, periodo: 'mes' });
  const abierto = (page, id) => page.evaluate(i => document.getElementById(i).style.display === 'flex', id);

  it('encendido sin Premium: frena crear más de lo gratis y el PDF, pero lo que ya tienes sigue igual', async () => {
    const page = await env.pagina();
    await page.clock.setFixedTime(new Date(2026, 8, 25, 12));
    await sembrar(page, estadoBase({
      misCuentas: [cuenta(1), cuenta(2), cuenta(3), Object.assign(cuenta(4), { archivada: true })],
      grupos: [grupo(1), grupo(2)],
      presupuestos: [presu(1, 'Comida'), presu(2, 'Transporte'), presu(3, 'Salud')],
    }));
    await page.evaluate(() => { PREMIUM.activo = true; window.__impresiones = 0; window.print = () => { window.__impresiones++; }; });
    // Cuenta nueva: explica el límite; con "Cancelar" no pasa nada
    page.respuestas.push(false);
    await page.evaluate(() => abrirModalCuenta());
    assert.match(page.dialogos.pop(), /hasta 3 cuentas además de Efectivo y Ahorro[\s\S]*Pruébalo 30 días gratis, sin tarjeta[\s\S]*Lo que ya tienes sigue igual/);
    assert.equal(await abierto(page, 'modal-cuenta'), false);
    // Restaurar una archivada también cuenta
    page.respuestas.push(false);
    await page.evaluate(() => desarchivarCuenta('cta4'));
    assert.equal(await page.evaluate(() => state.misCuentas.find(c => c.id === 'cta4').archivada), true);
    // Editar una que ya tienes, sí
    await page.evaluate(() => abrirModalCuenta('cta1'));
    assert.equal(await abierto(page, 'modal-cuenta'), true);
    await page.evaluate(() => closeModal('modal-cuenta'));
    // Grupos: ya tenía 2 (de cuando era gratis); se editan, pero no se crea otro
    await page.evaluate(() => abrirModalGrupo('grp2'));
    assert.equal(await abierto(page, 'modal-grupo'), true);
    await page.evaluate(() => closeModal('modal-grupo'));
    page.respuestas.push(false);
    await page.evaluate(() => abrirModalGrupo());
    assert.match(page.dialogos.pop(), /1 grupo de gastos compartidos/);
    assert.equal(await abierto(page, 'modal-grupo'), false);
    // Presupuestos: cambiar el monto de uno existente, sí; uno nuevo, no
    await page.evaluate(() => { _abrirHojaPresu('Comida', state.presupuestos[0]); document.getElementById('pc-monto').value = '1500'; guardarPresupuestoCat(); });
    assert.equal(await page.evaluate(() => state.presupuestos[0].monto), 1500);
    page.respuestas.push(false);
    await page.evaluate(() => { _abrirHojaPresu('Ropa', null); document.getElementById('pc-monto').value = '800'; guardarPresupuestoCat(); });
    assert.match(page.dialogos.pop(), /hasta 3 presupuestos/);
    assert.equal(await page.evaluate(() => state.presupuestos.length), 3);
    // PDF
    page.respuestas.push(false);
    await page.evaluate(() => imprimirReporteMes());
    assert.match(page.dialogos.pop(), /reporte del mes en PDF es parte de Premium/);
    // "Aceptar" lleva a la tarjeta de Premium con los dos planes
    await page.evaluate(() => abrirModalCuenta());
    assert.equal(await page.isVisible('#view-config'), true);
    assert.match(await page.textContent('#premium-card .premium-planes'), /Mensual\s*L 25\s*al mes[\s\S]*Anual\s*L 199\s*al año\s*Ahorras 34%/);
    // Con la prueba gratis todo se abre
    await page.evaluate(() => iniciarPrueba());
    await page.evaluate(() => { imprimirReporteMes(); abrirModalCuenta(); });
    await page.waitForTimeout(100);
    assert.equal(await abierto(page, 'modal-cuenta'), true);
    assert.equal(await page.evaluate(() => window.__impresiones), 1);
    assert.deepEqual(page.errores, []);
  });

  it('compra con Google Play: precio real, plan elegido y revisar si la suscripción sigue', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase());
    await page.evaluate(() => {
      PREMIUM.activo = true;
      window.__compras = [];
      window.getDigitalGoodsService = async () => ({
        getDetails: async ids => ids.map(id => ({ itemId: id, price: { currency: 'HNL', value: id.endsWith('mensual') ? '29.00' : '249.00' } })),
        listPurchases: async () => window.__compras,
      });
      window.PaymentRequest = class {
        constructor(m) { window.__sku = m[0].data.sku; }
        async show() { return { details: { purchaseToken: 'tok-' + window.__sku }, complete: async () => {} }; }
      };
    });
    await page.evaluate(() => { switchView('config'); return cargarPreciosPlay(); });
    const planes = await page.textContent('#premium-card .premium-planes');
    assert.match(planes, /Mensual\s*L\s?29\.00[\s\S]*Anual\s*L\s?249\.00[\s\S]*Ahorras 28%/);
    await page.click('#premium-card .premium-plan:has-text("Anual")');
    await page.waitForTimeout(100);
    assert.match(page.dialogos.pop(), /Tu Premium está activo/);
    assert.deepEqual(await page.evaluate(() => [window.__sku, state.premium.compra.plan, tienePremium()]), ['mipisto_premium_anual', 'mipisto_premium_anual', true]);
    assert.match(await page.textContent('#premium-card'), /Premium activo \(anual\)/);
    assert.equal(await page.isVisible('#premium-card .premium-planes'), false);
    // Al abrir la app, Play ya no la tiene (se canceló o venció): se apaga sin tocar los datos
    await page.evaluate(() => revisarSuscripcion());
    assert.deepEqual(await page.evaluate(() => [state.premium.compra, tienePremium()]), [null, false]);
    // Y una hecha en otro teléfono con la misma cuenta de Google se activa sola
    await page.evaluate(() => { _suscripcionRevisada = false; window.__compras = [{ itemId: 'mipisto_premium_mensual', purchaseToken: 'otro' }]; return revisarSuscripcion(); });
    assert.deepEqual(await page.evaluate(() => [state.premium.compra.plan, tienePremium()]), ['mipisto_premium_mensual', true]);
    assert.deepEqual(page.errores, []);
  });
});
