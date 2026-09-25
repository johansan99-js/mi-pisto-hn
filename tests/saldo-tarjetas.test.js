const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase, UUID_TC } = require('./helpers');

// Tarjeta de una versión anterior: saldo guardado a mano, sin saldoBase
const tarjetaVieja = (extra = {}) => Object.assign({ id: UUID_TC, nombre: 'BAC Oro', corte: 20, pago: 5, limite: 30000, saldo: 1500, tasaInteres: 48 }, extra);
const compra = (id, amount, extra = {}) => Object.assign({ id, type: 'expense', amount, cat: 'Comida', pago: 'credito', cuenta: null, tarjetaId: UUID_TC, date: '2026-09-10T15:00:00Z' }, extra);
const saldo = page => page.evaluate(() => state.tarjetas[0].saldo);

async function comprarConTarjeta(page, monto) {
  await page.evaluate(m => {
    openModal('modal-gasto');
    document.getElementById('gasto-monto').value = m;
    document.getElementById('gasto-cat').value = 'Comida';
    document.getElementById('gasto-cuenta').value = 'credito'; checkCreditCard();
    document.getElementById('gasto-tarjeta').value = state.tarjetas[0].id;
    saveGasto();
  }, String(monto));
  return page.evaluate(() => state.transactions[state.transactions.length - 1].id);
}

describe('Saldo de tarjetas calculado con los movimientos', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('al actualizar, cada tarjeta conserva el saldo que tenía', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase({ tarjetas: [tarjetaVieja()], transactions: [compra('c1', 1000), compra('c2', 300, { deletedAt: '2026-09-11T00:00:00Z' })] }));
    assert.deepEqual(await page.evaluate(() => [state.tarjetas[0].saldo, state.tarjetas[0].saldoBase]), [1500, 500]);
  });

  it('borrar, restaurar y editar una compra mueve el saldo', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase({ tarjetas: [tarjetaVieja({ saldo: 0 })] }));
    const id = await comprarConTarjeta(page, 800);
    assert.equal(await saldo(page), 800);
    page.respuestas = [true];
    await page.evaluate(i => eliminarGastoConPapelera(i), id);
    assert.equal(await saldo(page), 0, 'la compra borrada ya no se debe');
    await page.evaluate(i => restaurarGastoDePapelera(i), id);
    assert.equal(await saldo(page), 800);
    await page.evaluate(i => {
      const t = state.transactions.find(x => x.id === i);
      document.getElementById('edit-tx-id').value = i;
      document.getElementById('edit-monto').value = '650';
      document.getElementById('edit-cat').value = t.cat;
      document.getElementById('edit-fecha').value = t.date.slice(0, 16);
      _editTxType = 'expense';
      guardarEdicionTx();
    }, id);
    assert.equal(await saldo(page), 650);
    // Pagar baja el saldo y lo que se paga de más queda a favor
    page.respuestas = ['700', true, false];
    await page.evaluate(i => pagarTarjeta(i), UUID_TC);
    assert.equal(await saldo(page), -50);
  });

  it('conciliar: los cargos registrados y los ajustes llegan al saldo del estado de cuenta', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase({ tarjetas: [tarjetaVieja({ saldo: 1000 })] }));
    page.respuestas = ['1,120', true]; // estado de cuenta; registrar L 120 como cargo bancario
    await page.evaluate(i => ajustarSaldoTarjeta(i), UUID_TC);
    assert.equal(await saldo(page), 1120);
    assert.equal(await page.evaluate(() => state.transactions.filter(t => t.cat === 'Cargos Bancarios').length), 1);
    page.respuestas = ['1,100', false]; // reembolso: solo corregir
    await page.evaluate(i => ajustarSaldoTarjeta(i), UUID_TC);
    assert.equal(await saldo(page), 1100);
    // Tras recargar, el saldo sigue saliendo de la base y los movimientos
    await page.reload(); await page.waitForTimeout(800);
    assert.equal(await saldo(page), 1100);
  });

  it('las compras Tasa Cero no suben el saldo que genera intereses', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase({ tarjetas: [tarjetaVieja({ saldo: 0, saldoBase: 0 })], transactions: [compra('q1', 12000, { planCuotasId: 'plan1' })] }));
    assert.equal(await saldo(page), 0);
  });

  it('al combinar dos teléfonos se suman las compras de ambos', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase());
    const r = await page.evaluate(([id]) => {
      const base = o => Object.assign({ setup: true, sellosV: 1, eliminados: {}, transactions: [], goals: [], receivables: [], payables: [], prestamos: [], tarjetas: [], pagosRecurrentes: [], transferenciasProgramadas: [] }, o);
      const tc = s => ({ id, nombre: 'BAC', saldoBase: 0, saldo: s, updatedAt: new Date().toISOString() });
      const c = (cid, m) => ({ id: cid, type: 'expense', amount: m, cat: 'X', pago: 'credito', tarjetaId: id, date: '2026-09-10T15:00:00Z', updatedAt: new Date().toISOString() });
      // Teléfono A compró 300 y el B compró 200: cada uno ve solo su compra
      const { merged } = cloudSync.mergeStates(base({ tarjetas: [tc(300)], transactions: [c('ca', 300)] }), base({ tarjetas: [tc(200)], transactions: [c('cb', 200)] }));
      state = merged;
      recalcularSaldosTarjetas();
      return state.tarjetas[0].saldo;
    }, [UUID_TC]);
    assert.equal(r, 500);
  });
});
