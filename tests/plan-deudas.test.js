const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase, UUID_TC } = require('./helpers');

const FICO = '3f2a9c1e-1111-4a2b-9c3d-000000000002';
const tc = (id, nombre, saldo, tasa, extra = {}) => Object.assign({ id, nombre, corte: 20, pago: 5, limite: 50000, saldo, saldoBase: saldo, tasaInteres: tasa, calcularMinimo: true }, extra);
const variasDeudas = () => estadoBase({ nombre: 'Ana',
  tarjetas: [tc(UUID_TC, 'BAC Oro', 20000, 48), tc(FICO, 'Ficohsa', 5000, 60, { cuotas: [{ id: 'plan0001', descripcion: 'Refri', total: 12000, meses: 12, cuotasPagadas: 2, cuota: 1000 }] })],
  prestamos: [{ id: 'prest001', entidad: 'Atlántida', monto: 50000, tasaInteres: 18, cuota: 2496.21, cuotasPagadas: 0, cuotasTotal: 24 }],
  payables: [{ id: 'deuda001', creditor: 'Tía Rosa', monto: 3000, pagado: 0 }] });

describe('Plan para salir de deudas', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('una tarjeta: coincide con el cálculo independiente y con el de solo mínimos', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase({ tarjetas: [tc(UUID_TC, 'BAC Oro', 10000, 48)] }));
    const r = await page.evaluate(() => {
      const d = deudasParaPlan();
      const plan = simularPlanDeudas(d, 1200, 'avalancha'), base = simularPlanDeudas(d, 0, 'avalancha', true);
      return [plan.meses, plan.interes, base.meses, base.interes];
    });
    // Calculado aparte: L 10,000 al 48% anual pagando L 1,200/mes → 11 meses y L 2,410.92;
    // con el mínimo (5%, mínimo L 100) → 174 meses y L 28,738.30
    assert.deepEqual(r, [11, 2410.92, 174, 28738.3]);
  });

  it('reúne tarjetas, cuotas Tasa Cero, préstamos y deudas con personas', async () => {
    const page = await env.pagina();
    await sembrar(page, variasDeudas());
    const d = await page.evaluate(() => deudasParaPlan().map(x => [x.tipo, x.nombre, x.saldo, Math.round(x.tasa)]));
    assert.deepEqual(d, [['tarjeta', 'BAC Oro', 20000, 48], ['tarjeta', 'Ficohsa', 5000, 60], ['cuotas', 'Refri · Ficohsa', 10000, 0], ['prestamo', 'Atlántida', 50000, 18], ['persona', 'Tía Rosa', 3000, 0]]);
  });

  it('avalancha ataca la tasa más alta y paga menos intereses; bola de nieve, la más chica', async () => {
    const page = await env.pagina();
    await sembrar(page, variasDeudas());
    const r = await page.evaluate(() => {
      const d = deudasParaPlan(), a = simularPlanDeudas(d, 8000, 'avalancha'), b = simularPlanDeudas(d, 8000, 'bola');
      return { a: a.orden.slice(0, 2), b: b.orden.slice(0, 2), ia: a.interes, ib: b.interes, libre: a.libre && b.libre,
        pagoMes: Math.round(Object.values(a.primerMes).reduce((x, y) => x + y, 0) * 100) / 100 };
    });
    assert.deepEqual(r.a, ['tc:' + FICO, 'tc:' + UUID_TC]);
    assert.deepEqual(r.b, ['pers:deuda001', 'tc:' + FICO]);
    assert.ok(r.libre);
    assert.ok(r.ia <= r.ib, `avalancha ${r.ia} ≤ bola ${r.ib}`);
    assert.equal(r.pagoMes, 8000, 'se usa todo el presupuesto');
  });

  it('desde TC: arma el plan, recuerda la estrategia y muestra la fecha de libertad', async () => {
    const page = await env.pagina();
    await sembrar(page, variasDeudas());
    await page.evaluate(() => switchView('tarjetas'));
    await page.click('#view-tarjetas .plan-acceso');
    await page.waitForSelector('#modal-plan-deudas', { state: 'visible' });
    assert.match(await page.textContent('#plan-total'), /Debes L\. ?88,000\.00 en 5 deudas/);
    await page.fill('#plan-presupuesto', '8,000');
    const txt = await page.textContent('#plan-resultado');
    assert.match(txt, /QUEDAS LIBRE DE DEUDAS EN/);
    assert.match(txt, /te ahorras L\. ?[\d,]+\.\d\d/);
    assert.match(txt, /1\. 💳 Ficohsa/);
    await page.click('[data-estrategia="bola"]');
    assert.match(await page.textContent('#plan-resultado'), /1\. 🤝 Tía Rosa/);
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('mph_plan_deudas'))), { presupuesto: 8000, estrategia: 'bola' });
    await page.evaluate(() => { closeModal('modal-plan-deudas'); renderAll(); });
    assert.match(await page.textContent('#view-tarjetas .plan-acceso'), /Con L\. ?8,000\.00 al mes quedas libre en [a-z]+ \d{4}/);
  });

  it('avisa si el presupuesto no cubre los mínimos', async () => {
    const page = await env.pagina();
    await sembrar(page, variasDeudas());
    await page.evaluate(() => abrirPlanDeudas());
    await page.fill('#plan-presupuesto', '1000');
    assert.match(await page.textContent('#plan-resultado'), /no alcanzas a cubrir los mínimos/);
  });

  it('sin deudas no aparece la tarjeta de acceso', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase({ tarjetas: [tc(UUID_TC, 'BAC Oro', 0, 48)] }));
    await page.evaluate(() => switchView('tarjetas'));
    assert.equal(await page.locator('.plan-acceso').count(), 0);
    await page.evaluate(() => abrirPlanDeudas());
    assert.match(await page.textContent('#plan-resultado'), /No tienes deudas/);
  });
});
