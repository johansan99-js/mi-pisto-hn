// Racha de días anotando 🔥
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase } = require('./helpers');

const HOY = new Date(2026, 8, 25, 12, 0);
const dia = (d, m = 8) => new Date(2026, m, d, 10, 0).toISOString();
const gasto = (d, id) => ({ id: id || 'gasto' + String(d).padStart(3, '0'), type: 'expense', amount: 100, cat: 'Comida', date: dia(d), cuenta: 'efectivo', tipo: 'extra' });

describe('Racha de días anotando', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });
  async function pagina(estado) {
    const page = await env.pagina();
    await page.clock.setFixedTime(HOY);
    await sembrar(page, estado);
    return page;
  }

  it('cuenta los días seguidos hasta ayer si hoy todavía no anotas, y "Hoy no gasté nada" la mantiene', async () => {
    // 18 al 24 de septiembre: 7 días seguidos; el 16 suelto
    const page = await pagina(estadoBase({ transactions: [16, 18, 19, 20, 21, 22, 23, 24].map(d => gasto(d)) }));
    let r = await page.evaluate(() => { const r = calcularRacha(); return [r.actual, r.mejor, r.hoyHecho, r.enRiesgo, r.siguiente]; });
    assert.deepEqual(r, [7, 7, false, true, 14]);
    const txt = await page.textContent('#racha-card');
    assert.match(txt, /🔥\s*7\s*días seguidos/);
    assert.match(txt, /Hoy todavía no anotas nada/);
    assert.match(txt, /¡Llegaste a 7 días seguidos!/);
    assert.equal(await page.locator('#racha-card .racha-dia.hecho').count(), 6, 'los últimos 7 días: del 19 al 24 anotados, hoy no');
    await page.evaluate(() => marcarDiaSinGastos());
    r = await page.evaluate(() => { const r = calcularRacha(); return [r.actual, r.hoyHecho, state.diasSinGastos]; });
    assert.deepEqual(r, [8, true, ['2026-09-25']]);
    assert.match(await page.textContent('#racha-card'), /8\s*días seguidos[\s\S]*Te faltan 6 días para llegar a 14/);
    // "Hoy no gasté nada" cuenta como día anotado para el recordatorio diario
    assert.equal(await page.evaluate(() => ultimoDiaConMovimientos()), '2026-09-25');
    // Se mantiene al recargar
    await page.reload(); await page.waitForTimeout(800);
    assert.equal(await page.evaluate(() => calcularRacha().actual), 8);
    assert.deepEqual(page.errores, []);
  });

  it('se corta si falta un día; la mejor racha se recuerda y los saldos iniciales no cuentan', async () => {
    const txs = [5, 6, 7, 8, 9].map(d => gasto(d)).concat([gasto(23), { id: 'saldoini1', type: 'income', amount: 500, cat: 'Saldo inicial', date: dia(24), cuenta: 'efectivo', esConciliacion: true, esSaldoInicial: true }]);
    const page = await pagina(estadoBase({ transactions: txs }));
    const r = await page.evaluate(() => { const r = calcularRacha(); return [r.actual, r.mejor, r.enRiesgo]; });
    assert.deepEqual(r, [0, 5, false], 'el 24 solo tiene el saldo inicial: la racha del 23 ya se cortó');
    assert.match(await page.textContent('#racha-card'), /🔥\s*0\s*días seguidos[\s\S]*Tu mejor racha: 5 días/);
    assert.equal(await page.evaluate(() => state.mejorRacha), 5);
  });

  it('el recordatorio diario invita a no perder la racha', async () => {
    const page = await pagina(estadoBase({ transactions: [22, 23, 24].map(d => gasto(d)) }));
    await page.evaluate(() => {
      window.__notifs = [];
      window.enviarNotificacion = (t, b) => window.__notifs.push(t);
      Object.defineProperty(window, 'Notification', { value: { permission: 'granted' }, configurable: true });
      localStorage.setItem('mph_recordatorio', JSON.stringify({ activo: true, hora: '08:00' }));
      verificarRegistroDiario(new Date(2026, 8, 25, 20, 0));
    });
    assert.deepEqual(await page.evaluate(() => window.__notifs), ['🔥 No pierdas tu racha de 3 días']);
  });

  it('sin movimientos no muestra nada', async () => {
    const page = await pagina(estadoBase());
    assert.equal(await page.isVisible('#racha-card'), false);
  });
});
