// Remesas: anotarlas desde el teclado (quién, por dónde, moneda y comisión) y la pantalla con los totales
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase } = require('./helpers');

const HOY = new Date(2026, 8, 25, 12, 0);
const dia = (d, m = 8, y = 2026) => new Date(y, m, d, 10, 0).toISOString();

describe('Remesas', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('se anota desde el teclado en dólares, con quién, por dónde y la comisión; la siguiente ya viene llena', async () => {
    const page = await env.pagina();
    await page.clock.setFixedTime(HOY);
    await sembrar(page, estadoBase());
    await page.evaluate(() => { abrirRegistro('ingreso'); elegirCatRegistro('Remesa'); });
    assert.equal(await page.isVisible('#reg-remesa'), true);
    assert.equal(await page.textContent('#modal-registro .reg-moneda'), 'L', 'la primera va en lempiras');
    await page.click('.reg-remesa-btn');
    await page.click('.rem-moneda .an-seg-btn:text("Dólares")');
    await page.click('.rem-form .btn-primary');
    assert.equal(await page.textContent('#modal-registro .reg-moneda'), 'US$');
    for (const k of '200') await page.click(`.reg-teclado button:text-is("${k}")`);
    const bid = await page.evaluate(() => { renderMontoRegistro(); return tasaUSD('bid'); });
    assert.match(await page.textContent('#reg-resultado'), new RegExp('≈ L\\. ' + (200 * bid).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace('.', '\\.')));
    await page.click('.reg-remesa-btn');
    await page.fill('#rem-de', 'Mamá');
    await page.click('.rem-chip:text-is("Remitly")');
    await page.fill('#rem-comision', '5');
    await page.click('.rem-form .btn-primary');
    assert.match(await page.textContent('#reg-remesa'), /De Mamá · Remitly · comisión US\$ 5/);
    await page.click('.reg-accion.guardar');
    assert.match(await page.textContent('#aviso-rapido'), /Ingreso guardado: US\$ 200 · Remesa/);
    const tx = await page.evaluate(() => { const t = state.transactions.at(-1); return { amount: t.amount, cat: t.cat, o: t.originalAmount, m: t.originalCurrency, r: t.remesa, tasa: t.conversionRate }; });
    // Con la tasa de compra con la que se guardó
    const tasa = tx.tasa; delete tx.tasa;
    assert.ok(tasa > 20 && tasa < 40, 'tasa ' + tasa);
    assert.deepEqual(tx, { amount: Math.round(200 * tasa * 100) / 100, cat: 'Remesa', o: 200, m: 'USD', r: { de: 'Mamá', via: 'Remitly', moneda: 'USD', comision: 5, comisionL: Math.round(5 * tasa * 100) / 100 } });
    // En el Inicio se ve de quién y por dónde
    assert.match(await page.textContent('#registros-mes'), /De Mamá · Remitly · US\$ 200\.00/);
    // La siguiente viene con Mamá y Remitly; esta vez en lempiras y sin comisión
    await page.evaluate(() => { abrirRegistro('ingreso'); elegirCatRegistro('Remesa'); });
    assert.match(await page.textContent('#reg-remesa'), /De Mamá · Remitly/);
    assert.equal(await page.textContent('#modal-registro .reg-moneda'), 'US$', 'como la última');
    await page.click('.reg-remesa-btn');
    await page.click('.rem-moneda .an-seg-btn:text("Lempiras")');
    await page.click('.rem-form .btn-primary');
    assert.equal(await page.textContent('#modal-registro .reg-moneda'), 'L');
    for (const k of '3000') await page.click(`.reg-teclado button:text-is("${k}")`);
    await page.click('.reg-accion.guardar');
    assert.deepEqual(await page.evaluate(() => { const t = state.transactions.at(-1); return [t.amount, t.originalCurrency || null, t.remesa]; }), [3000, null, { de: 'Mamá', via: 'Remitly', moneda: 'HNL' }]);
    // Otra categoría de ingreso no pregunta nada de esto
    await page.evaluate(() => { abrirRegistro('ingreso'); elegirCatRegistro('Salario'); });
    assert.equal(await page.isVisible('#reg-remesa'), false);
    assert.equal(await page.textContent('#modal-registro .reg-moneda'), 'L');
    // Y se encuentra buscando por quién la manda
    await page.evaluate(() => cerrarRegistro());
    await page.fill('#rm-q', 'mama');
    assert.match(await page.textContent('#registros-mes'), /2 resultados/);
    assert.deepEqual(page.errores, []);
  });

  const rem = (id, amount, d, m, remesa, usd) => Object.assign({ id, type: 'income', amount, cat: 'Remesa', subcat: 'extra', cuenta: 'efectivo', date: dia(d, m), remesa }, usd ? { originalAmount: usd, originalCurrency: 'USD' } : {});
  const TX = [
    rem('r1', 4900, 5, 8, { de: 'Mamá', via: 'Remitly', moneda: 'USD', comision: 2, comisionL: 49 }, 200),
    rem('r2', 4900, 6, 7, { de: 'Mamá', via: 'Remitly', moneda: 'USD', comision: 2, comisionL: 49 }, 200),
    rem('r3', 2450, 20, 7, { de: 'Carlos', via: 'Western Union', moneda: 'USD', comision: 5, comisionL: 122.5 }, 100),
    rem('r4', 3000, 15, 6, { de: 'Carlos', via: 'Western Union', moneda: 'HNL' }),
    // Una vieja, de antes de que existieran los detalles
    { id: 'r5', type: 'income', amount: 1000, cat: 'Remesa', subcat: 'extra', cuenta: 'efectivo', date: dia(3, 1) },
    { id: 'r6', type: 'income', amount: 9000, cat: 'Remesa', subcat: 'extra', cuenta: 'efectivo', date: dia(3, 10, 2025) },
    { id: 's1', type: 'income', amount: 20000, cat: 'Salario', subcat: 'salario', cuenta: 'efectivo', date: dia(1) },
  ];

  it('la pantalla suma el mes y el año, por quién y por dónde, y dice qué servicio cobra menos', async () => {
    const page = await env.pagina();
    await page.clock.setFixedTime(HOY);
    await sembrar(page, estadoBase({ transactions: TX }));
    await page.evaluate(() => switchView('remesas'));
    const txt = () => page.textContent('#remesas-contenido');
    const t = await txt();
    assert.match(t, /Este mes\s*L\. 4,900\.00\s*US\$ 200\.00/);
    assert.match(t, /En 2026\s*L\. 16,250\.00\s*US\$ 500\.00/);
    // (49+49+122.5) / (4900+4900+2450)
    assert.match(t, /Comisiones\s*L\. 220\.50\s*1\.8% de lo recibido/);
    assert.match(t, /Remitly te cobra menos: 1% de comisión, contra 5% de Western Union\. Lo que te llegó por Western Union, por Remitly te habría costado unos L\. 98\.00 menos/);
    assert.match(t, /¿Quién te manda\?\s*Mamá\s*2 envíos\s*L\. 9,800\.00\s*Carlos\s*2 envíos\s*L\. 5,450\.00\s*Sin decir quién\s*1 envío\s*L\. 1,000\.00/);
    assert.match(t, /Western Union\s*2 envíos · comisión 5%/);
    assert.doesNotMatch(t, /Salario/);
    assert.match(t, /En promedio recibes L\. 4,062\.50 en los meses que te mandan/);
    assert.equal(await page.$$eval('#remesas-contenido .rem-barra', e => e.length), 9);
    // El año pasado
    await page.click('#remesas-contenido button[aria-label="Año anterior"]');
    assert.match(await txt(), /2025[\s\S]*Promedio al mes\s*L\. 9,000\.00[\s\S]*En 2025\s*L\. 9,000\.00/);
    assert.deepEqual(page.errores, []);
  });

  it('sin remesas explica para qué sirve y deja registrar una', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase());
    await page.evaluate(() => switchView('remesas'));
    assert.match(await page.textContent('#remesas-contenido'), /Lleva la cuenta de lo que te mandan/);
    await page.click('#remesas-contenido .btn-primary');
    assert.equal(await page.isVisible('#reg-remesa'), true);
    assert.match(await page.textContent('#reg-btn-b'), /Remesa/);
  });
});
