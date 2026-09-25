// Cuentas en dólares: saldo propio en USD y equivalente en lempiras
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase } = require('./helpers');

describe('Cuentas en dólares', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('lleva el saldo en dólares y convierte como el banco al entrar y salir lempiras', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase({ nombre: 'Ana', saldoInicial: 5000, cuentasIniciales: { efectivo: 30000, ahorro: 0 } }));
    await page.evaluate(() => currencyManager.updateExchangeRates({ USD: { bid: 26.80, ask: 27.00 } }));
    await page.evaluate(() => { abrirModalCuenta(); document.getElementById('cuenta-grupo').value = 'BAC'; document.getElementById('cuenta-nombre').value = 'Dólares'; document.getElementById('cuenta-moneda').value = 'USD'; document.getElementById('cuenta-saldo').value = '1,000'; guardarCuenta(); });
    const id = await page.evaluate(() => state.misCuentas[0].id);
    const est = () => page.evaluate(id => [saldoUSDCuenta(id), getCuentaBalance(id)], id);
    assert.deepEqual(await est(), [1000, 26800], 'L 26,800 a la tasa de compra');

    // Gasto en dólares desde la cuenta: baja el monto exacto en USD
    await page.evaluate(id => { openModal('modal-gasto'); document.getElementById('gasto-monto').value = '50'; document.getElementById('gasto-moneda').value = 'USD'; document.getElementById('gasto-cat').value = 'Compras'; document.getElementById('gasto-cuenta').value = id; checkCreditCard(); saveGasto(); }, id);
    assert.deepEqual(await est(), [950, 25460]);
    // Transferir L 2,700 de Efectivo a la cuenta en dólares: el banco vende a 27.00 → $100
    await page.evaluate(id => { openTransferirCuentas(); document.getElementById('transfer-from').value = 'efectivo'; document.getElementById('transfer-to').value = id; document.getElementById('transfer-monto').value = '2700'; ejecutarTransferencia(); }, id);
    assert.deepEqual(await est(), [1050, 28140]);
    // Si sube el dólar, el saldo en USD no cambia pero sí su equivalente
    await page.evaluate(() => currencyManager.updateExchangeRates({ USD: { bid: 27.50, ask: 27.70 } }));
    assert.deepEqual(await est(), [1050, 28875], 'los montos ya guardados no se recalculan');
    assert.ok(await page.evaluate(id => state.transactions.filter(t => t.cuenta === id).every(t => typeof t.montoUSD === 'number'), id));
    await page.evaluate(() => { renderAll(); switchView('cuentas'); });
    assert.match(await page.textContent('#cuentas-contenido'), /Dólares[\s\S]*\$ 1,050\.00\s*≈ L\. ?28,875\.00/);
    assert.match(await page.textContent('#cuentas-extra-tiles'), /\$ 1,050\.00/);
    // Ajustar en dólares
    page.respuestas = ['1,040'];
    await page.evaluate(id => ajustarSaldoCuenta(id), id);
    assert.deepEqual((await est())[0], 1040);
    // Recargar: se mantiene
    await page.reload(); await page.waitForTimeout(800);
    assert.equal((await est())[0], 1040);
    assert.deepEqual(page.errores, []);
  });
});
