// Consejero: soluciones con los números del usuario, calculadas en el teléfono
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase } = require('./helpers');

const hoy = new Date();
const d = (dd, mm = 0) => new Date(hoy.getFullYear(), hoy.getMonth() - mm, Math.min(dd, 28), 12).toISOString();
const base = (extra = {}) => {
  const tx = [
    { id: 'ing00001', type: 'income', amount: 18000, cat: 'Salario', cuenta: 'efectivo', date: d(1) },
    { id: 'ing00002', type: 'income', amount: 18000, cat: 'Salario', cuenta: 'efectivo', date: d(1, 1) },
    { id: 'gas00001', type: 'expense', amount: 9000, cat: 'Casa', tipo: 'fijo', cuenta: 'efectivo', date: d(3, 1) },
    { id: 'gas00002', type: 'expense', amount: 500, cat: 'Comida', cuenta: 'efectivo', date: d(2) },
    { id: 'gas00003', type: 'expense', amount: 300, cat: 'Comida', cuenta: 'efectivo', date: d(2, 1) },
  ];
  return estadoBase(Object.assign({ transactions: tx }, extra));
};

describe('Consejero', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('sin movimientos pide anotar primero, y en el Inicio no muestra nada', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase());
    assert.deepEqual(await page.evaluate(() => consejos().map(c => c.id)), ['empezar']);
    assert.equal(await page.isVisible('#consejo-inicio'), false);
    assert.deepEqual(page.errores, []);
  });

  it('una tarjeta con interés sugiere la cuota para salir en 12 meses y cuánto se ahorra', async () => {
    const page = await env.pagina();
    await sembrar(page, base({ tarjetas: [{ id: 'tarjeta0001', nombre: 'BAC Visa', limite: 30000, saldo: 0, saldoBase: 12000, corte: 20, pago: 5, tasaInteres: 48 }] }));
    const r = await page.evaluate(() => {
      const c = consejos().find(x => x.id === 'tarjeta-tarjeta0001');
      const cuota = Math.ceil(cuotaParaSaldarEn(12000, 48, 12));
      const ahorro = simularPagoTarjeta(12000, 48).interes - simularPagoTarjeta(12000, 48, cuota).interes;
      return { texto: c.texto, cuota: fL(cuota), ahorro: fL(ahorro), primero: consejos()[0].id };
    });
    assert.ok(r.texto.includes(r.cuota + ' al mes'), r.texto);
    assert.ok(r.texto.includes('te ahorras <strong>' + r.ahorro), r.texto);
    assert.equal(r.primero, 'tarjeta-tarjeta0001', 'es lo de más impacto');
    // Aparece en el Inicio como "Consejo para ti" y el botón lleva al simulador
    assert.match(await page.textContent('#consejo-inicio'), /Consejo para ti[\s\S]*Sal de BAC Visa en 12 meses/);
    await page.click('#consejo-inicio .consejo-btn');
    assert.equal(await page.isVisible('#modal-simulador'), true);
    assert.deepEqual(page.errores, []);
  });

  it('una cuenta en negativo va primero; hormiga, suscripciones y metas también salen', async () => {
    const page = await env.pagina();
    const est = base({ goals: [{ id: 'meta00001', nombre: 'Viaje', objetivo: 20000, actual: 1000 }] });
    for (let i = 0; i < 10; i++) est.transactions.push({ id: 'hor' + String(i).padStart(4, '0'), type: 'expense', amount: 80, cat: 'Comida', subcat: 'Baleadas', cuenta: 'efectivo', date: d(1 + (i % 3)) });
    est.transactions.push({ id: 'sus00001', type: 'expense', amount: 399, cat: 'Suscripciones', subcat: 'Netflix', cuenta: 'efectivo', date: d(2) });
    est.transactions.push({ id: 'sus00002', type: 'expense', amount: 219, cat: 'Suscripciones', subcat: 'Spotify', cuenta: 'efectivo', date: d(2) });
    est.transactions.push({ id: 'aho00001', type: 'expense', amount: 500, cat: 'Otro', cuenta: 'ahorro', date: d(2) });
    await sembrar(page, est);
    const ids = await page.evaluate(() => consejos().map(c => c.id));
    assert.equal(ids[0], 'negativo-ahorro');
    for (const id of ['hormiga', 'suscripciones', 'meta-meta00001']) assert.ok(ids.includes(id), id + ' en ' + ids.join(','));
    // "Ya lo vi" lo oculta este mes
    await page.evaluate(() => switchView('consejero'));
    const antes = await page.locator('#consejero-lista .consejo').count();
    await page.click('#consejero-lista .consejo:has-text("suscripciones") .consejo-link');
    assert.equal(await page.locator('#consejero-lista .consejo').count(), antes - 1);
    assert.ok(!(await page.evaluate(() => consejos().map(c => c.id))).includes('suscripciones'));
    assert.deepEqual(page.errores, []);
  });

  it('los nombres que escribe el usuario no se vuelven HTML', async () => {
    const page = await env.pagina();
    await sembrar(page, base({ goals: [{ id: 'meta00001', nombre: '<img src=x onerror=alert(1)>', objetivo: 20000, actual: 1000 }] }));
    await page.evaluate(() => switchView('consejero'));
    assert.equal(await page.locator('#consejero-lista img').count(), 0);
    assert.deepEqual(page.dialogos, []);
  });
});
