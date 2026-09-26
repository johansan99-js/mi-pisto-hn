const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase, UUID_TC } = require('./helpers');

const FICO = '3f2a9c1e-1111-4a2b-9c3d-000000000002';
const tarjetas = () => [
  { id: UUID_TC, nombre: 'BAC Oro', corte: 20, pago: 5, limite: 30000, saldo: 0, saldoBase: 0, tasaInteres: 48,
    beneficios: [{ id: 'benef01', porcentaje: 3, categoria: 'Alimentación', tope: 100 }] },
  { id: FICO, nombre: 'Ficohsa Platinum', corte: 15, pago: 1, limite: 20000, saldo: 0, saldoBase: 0, tasaInteres: 48,
    beneficios: [{ id: 'benef02', porcentaje: 1 }, { id: 'benef03', porcentaje: 5, comercio: 'PriceSmart' }] },
];
const hoy = () => new Date().toISOString();
const compra = (id, amount, tarjetaId, extra = {}) => Object.assign({ id, type: 'expense', amount, cat: 'Alimentación', subcat: 'La Colonia', pago: 'credito', cuenta: null, tarjetaId, date: hoy() }, extra);

describe('Beneficios de tarjetas y recomendador', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('el formulario de tarjeta aclara que no pedimos número, fecha ni CVV', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase());
    assert.match(await page.textContent('#modal-tarjeta .aviso-seguridad-tc'), /No pedimos el número de tu tarjeta, la fecha de vencimiento ni el CVV/);
  });

  it('se anotan beneficios con validación y se ven en la tarjeta', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase({ tarjetas: [Object.assign(tarjetas()[0], { beneficios: [] })] }));
    await page.evaluate(id => { switchView('tarjetas'); abrirBeneficios(id); }, UUID_TC);
    await page.fill('#benef-porcentaje', '50');
    page.respuestas = [true];
    await page.click('#modal-beneficios .btn-primary');
    // El aviso llega por la ventana propia (asíncrona): se espera a que aparezca
    for (let i = 0; i < 50 && !page.dialogos.some(m => /entre 0.1 y 30/.test(m)); i++) await page.waitForTimeout(20);
    assert.ok(page.dialogos.some(m => /entre 0.1 y 30/.test(m)));
    await page.fill('#benef-porcentaje', '3');
    await page.selectOption('#benef-aplica', 'categoria');
    await page.fill('#benef-valor', 'Alimentación');
    await page.fill('#benef-tope', '500');
    await page.click('#modal-beneficios .btn-primary');
    assert.match(await page.textContent('#benef-lista'), /3% en Alimentación \(tope L\. ?500\.00\/mes\)/);
    assert.match(await page.textContent('#tarjetas-list'), /3% en Alimentación/);
    await page.click('#benef-lista button');
    assert.equal(await page.evaluate(() => state.tarjetas[0].beneficios.length), 0);
  });

  it('recomienda por la regla más específica y respeta el tope del mes', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase({ tarjetas: tarjetas(), transactions: [compra('compra1', 3000, UUID_TC)] })); // BAC ya ganó L 90 de su tope de 100
    const r = await page.evaluate(() => {
      const top = c => recomendarTarjeta(c).map(x => [x.tarjeta.nombre, x.ganancia]);
      return {
        priceSmart: top({ cat: 'Alimentación', subcat: 'PriceSmart Tegucigalpa', amount: 1000 }),
        colonia: top({ cat: 'Alimentación', subcat: 'La Colonia', amount: 1000 }),
        gasolina: top({ cat: 'Transporte', subcat: 'Shell', amount: 1000 }),
      };
    });
    assert.deepEqual(r.priceSmart, [['Ficohsa Platinum', 50], ['BAC Oro', 10]]);
    assert.deepEqual(r.colonia, [['BAC Oro', 10], ['Ficohsa Platinum', 10]]);
    assert.deepEqual(r.gasolina, [['Ficohsa Platinum', 10], ['BAC Oro', 0]]);
  });

  it('el formulario de gasto sugiere la tarjeta y la elige con un toque', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase({ tarjetas: tarjetas() }));
    await page.evaluate(() => openModal('modal-gasto'));
    await page.fill('#gasto-monto', '1000');
    await page.fill('#gasto-cat', 'Alimentación');
    await page.fill('#gasto-subcat', 'PriceSmart');
    assert.match(await page.textContent('#gasto-sugerencia-tc'), /Si pagas con Ficohsa Platinum te devuelven ~L\. ?50\.00 \(5% en PriceSmart\)/);
    await page.click('#gasto-sugerencia-tc button');
    assert.deepEqual(await page.evaluate(() => [document.getElementById('gasto-cuenta').value, document.getElementById('gasto-tarjeta').value]), ['credito', '3f2a9c1e-1111-4a2b-9c3d-000000000002']);
    assert.match(await page.textContent('#gasto-sugerencia-tc'), /Buena elección/);
    await page.selectOption('#gasto-tarjeta', UUID_TC);
    assert.match(await page.textContent('#gasto-sugerencia-tc'), /L\. ?20\.00 más que con la tarjeta elegida/);
    await page.check('#gasto-es-cuotas');
    assert.equal(await page.isVisible('#gasto-sugerencia-tc'), false, 'Tasa Cero no da beneficios');
  });

  it('el resumen del mes dice cuánto devolvieron y cuánto se dejó de ganar', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase({ tarjetas: tarjetas(), transactions: [
      compra('compra1', 1000, UUID_TC),                                  // BAC 3% = 30 (Ficohsa daba 10)
      compra('compra2', 2000, UUID_TC, { subcat: 'PriceSmart' }),        // BAC 3% = 60 (Ficohsa daba 100)
      compra('compra3', 500, FICO, { cat: 'Transporte', subcat: 'Uber' }), // Ficohsa 1% = 5 (BAC 0)
      compra('compra4', 9000, UUID_TC, { planCuotasId: 'plan01' }),      // Tasa Cero: no cuenta
    ] }));
    const r = await page.evaluate(() => { const h = new Date(); return resumenBeneficiosMes(h.getFullYear(), h.getMonth()); });
    assert.deepEqual([r.ganado, r.perdido, r.mayorPerdida.tarjeta, r.mayorPerdida.compra], [95, 40, 'Ficohsa Platinum', 'PriceSmart']);
    await page.evaluate(() => switchView('tarjetas'));
    assert.match(await page.textContent('#beneficios-mes'), /devuelven ~L\. ?95\.00.*Dejaste de ganar ~L\. ?40\.00/s);
    const idea = await page.evaluate(() => { const h = new Date(); return ideasDelResumen(calcularResumenMes(h.getFullYear(), h.getMonth())).join('\n'); });
    assert.match(idea, /Tus tarjetas te devolvieron ~L\. ?95\.00; con la mejor tarjeta en cada compra ganabas L\. ?40\.00 más/);
  });
});
