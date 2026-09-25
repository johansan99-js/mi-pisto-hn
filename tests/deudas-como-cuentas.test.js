// Deudas con bancos y personas como cuentas, y tasas del dólar por banco
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase } = require('./helpers');

const conSaldo = (extra = {}) => estadoBase(Object.assign({ nombre: 'Ana', saldoInicial: 5000, cuentasIniciales: { efectivo: 1000, ahorro: 4000 } }, extra));
const mes = page => page.evaluate(() => { const h = new Date(); const m = calcularResumenMes(h.getFullYear(), h.getMonth()); return [m.ingresos, m.gastos]; });

describe('Deudas como cuentas', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('un préstamo del banco entra a la cuenta sin ser ingreso; abonar y liquidar salen de la cuenta y solo los intereses son gasto', async () => {
    const page = await env.pagina();
    await sembrar(page, conSaldo());
    const pat = await page.evaluate(() => calcBalance());
    await page.evaluate(() => {
      abrirNuevaDeuda('banco');
      document.getElementById('pagar-creditor').value = 'BAC Credomatic';
      document.getElementById('pagar-monto').value = '20,000';
      document.getElementById('pagar-entrada').value = 'ahorro';
      savePagar();
    });
    assert.deepEqual(await page.evaluate(() => [getCuentaBalance('ahorro'), calcBalance(), state.payables[0].tipo]), [24000, pat, 'banco']);
    assert.deepEqual(await mes(page), [0, 0], 'pedir prestado no es un ingreso');
    assert.equal(await page.isVisible('#cuenta-deudas-tile'), true);
    assert.match(await page.textContent('#cuenta-deudas-val'), /-L\. ?20,000\.00/);

    const id = await page.evaluate(() => state.payables[0].id);
    await page.evaluate(id => {
      abonarPagar(id);
      document.getElementById('abono-deuda-cuenta').value = 'ahorro';
      document.getElementById('abono-deuda-monto').value = '5,000';
      document.getElementById('abono-deuda-interes').value = '300';
      _renderAbonoDeuda();
    }, id);
    assert.match(await page.textContent('#abono-deuda-resumen'), /quedaría en L\. ?18,700\.00[\s\S]*te faltará L\. ?15,000\.00/);
    await page.evaluate(() => guardarAbonoDeuda());
    assert.deepEqual(await page.evaluate(() => [getCuentaBalance('ahorro'), calcBalance()]), [18700, pat - 300]);
    assert.deepEqual(await mes(page), [0, 300], 'solo los intereses cuentan como gasto');

    await page.evaluate(() => switchView('pagar'));
    assert.match(await page.textContent('#pagar-list'), /Bancos y financieras[\s\S]*BAC Credomatic[\s\S]*-L\. ?15,000\.00/);
    assert.match(await page.textContent('#total-pagar'), /L\. ?15,000\.00/);

    // Liquidar: el monto pendiente viene lleno
    await page.evaluate(id => liquidarDeuda(id), id);
    assert.equal(await page.inputValue('#abono-deuda-monto'), '15000.00');
    assert.equal(await page.textContent('#abono-deuda-btn'), '✅ Liquidar deuda');
    page.respuestas = [true];
    await page.evaluate(() => guardarAbonoDeuda());
    const d = await page.evaluate(() => state.payables[0]);
    assert.deepEqual([d.pagado, !!d.liquidadaEn], [20000, true]);
    assert.deepEqual(await page.evaluate(() => [getCuentaBalance('ahorro'), calcBalance()]), [3700, pat - 300]);
    assert.ok(page.dialogos.some(m => /Liquidaste tu deuda con BAC Credomatic/.test(m)));
    assert.match(await page.textContent('#total-pagar'), /L\. ?0\.00/);
    assert.match(await page.textContent('#pagar-list'), /No debes nada[\s\S]*Liquidadas \(1\)/);
    assert.equal(await page.isVisible('#cuenta-deudas-tile'), false);
    // Ya no aparece en el plan para salir de deudas
    assert.equal(await page.evaluate(() => deudasParaPlan().length), 0);
    assert.deepEqual(page.errores, []);
  });

  it('una deuda de antes con una persona: el abono es gasto y avisa si deja la cuenta en negativo', async () => {
    const page = await env.pagina();
    await sembrar(page, conSaldo({ payables: [{ id: 'deuda01', creditor: 'Tía <Rosa>', monto: 3000, pagado: 500 }] }));
    const pat = await page.evaluate(() => calcBalance());
    await page.evaluate(() => { abonarPagar('deuda01'); document.getElementById('abono-deuda-cuenta').value = 'efectivo'; document.getElementById('abono-deuda-monto').value = '1,200'; });
    page.respuestas = [false];
    await page.evaluate(() => guardarAbonoDeuda());
    assert.ok(page.dialogos.some(m => /efectivo tiene L\. ?1,000\.00: con este pago quedaría en -?L\. ?-?200\.00/.test(m)));
    assert.equal(await page.evaluate(() => state.transactions.length), 0, 'cancelar no guarda nada');
    await page.evaluate(() => { document.getElementById('abono-deuda-monto').value = '800'; guardarAbonoDeuda(); });
    const t = await page.evaluate(() => state.transactions[0]);
    assert.deepEqual([t.subcat, t.cuenta, t.deudaId, !!t.esTransferencia], ['Pago a Tía <Rosa>', 'efectivo', 'deuda01', false]);
    assert.deepEqual(await page.evaluate(() => [calcBalance(), getCuentaBalance('efectivo')]), [pat - 800, 200]);
    await page.evaluate(() => switchView('pagar'));
    assert.match(await page.textContent('#pagar-list'), /Personas[\s\S]*Tía <Rosa>[\s\S]*-L\. ?1,700\.00/);
    // Datos viejos sin "tipo" se ven como persona y el nombre no se interpreta como HTML
    assert.equal(await page.evaluate(() => document.querySelector('#pagar-list rosa')), null);
  });

  it('una deuda nueva pide nombre y monto, y lo pagado debe ser menor que la deuda', async () => {
    const page = await env.pagina();
    await sembrar(page, conSaldo());
    await page.evaluate(() => { abrirNuevaDeuda('persona'); savePagar(); });
    await page.evaluate(() => { document.getElementById('pagar-creditor').value = 'Juan'; document.getElementById('pagar-monto').value = '1000'; document.getElementById('pagar-pagado').value = '1000'; savePagar(); });
    assert.deepEqual(page.dialogos, ['Escribe a quién le debes.', 'Lo que ya pagaste tiene que ser menor que la deuda.']);
    assert.equal(await page.evaluate(() => state.payables.length), 0);
    await page.evaluate(() => { document.getElementById('pagar-pagado').value = '250'; document.getElementById('pagar-vence').value = '2000-01-01'; savePagar(); });
    const p = await page.evaluate(() => state.payables[0]);
    assert.deepEqual([p.creditor, p.monto, p.pagado, p.tipo, p.entrada], ['Juan', 1000, 250, 'persona', null]);
    await page.evaluate(() => switchView('pagar'));
    assert.match(await page.textContent('#pagar-list'), /Venció hace \d+ días/);
  });
});

describe('Tasas del dólar por banco', () => {
  const tasas = {
    updated_at: new Date().toISOString(), base: 'HNL', format_version: 2,
    source: 'Bancos de Honduras (USD) + https://open.er-api.com/v6/latest/USD',
    rates: { USD: { bid: 26.8931, ask: 27.0276, mid: 26.96035 }, EUR: { bid: 30.49, ask: 30.65, mid: 30.57 }, GTQ: { bid: 3.5, ask: 3.52, mid: 3.51 }, PAB: { bid: 26.8931, ask: 27.0276, mid: 26.96035 } },
    bancos: { promerica: { nombre: 'Promerica', bid: 26.8842, ask: 27.0186 }, ficohsa: { nombre: 'Ficohsa', bid: 26.8931, ask: 27.0276 }, malo: { nombre: '<img src=x>', bid: 3, ask: 4 } },
  };
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('elige el banco con que cambias dólares y se mantiene al volver a abrir la app', async () => {
    const page = await env.pagina({}, { antes: ctx => ctx.route(/tasas\.json/, r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(tasas) })) });
    await sembrar(page, estadoBase());
    await page.waitForFunction(() => currencyManager.ratesSource === 'json', null, { timeout: 15000 });
    await page.evaluate(() => openRatesModal());
    assert.match(await page.textContent('#rates-fuente'), /promedio de 2 bancos de Honduras/);
    const botones = await page.$$eval('#rates-bancos button', bs => bs.map(b => b.innerText.replace(/\s+/g, ' ').trim()));
    assert.deepEqual(botones, ['Promedio de los bancos El punto medio entre 2', 'Promerica Compra 26.8842 · Venta 27.0186', 'Ficohsa Compra 26.8931 · Venta 27.0276'], 'el banco con datos inválidos se descarta');
    await page.click('#rates-bancos button[data-banco="promerica"]');
    await page.waitForFunction(() => currencyManager.ratesOrigin === 'banco');
    const usd = () => page.evaluate(() => [currencyManager.getRate('USD').bid, currencyManager.getRate('USD').ask, currencyManager.getRate('PAB').ask]);
    assert.deepEqual(await usd(), [26.8842, 27.0186, 27.0186]);
    assert.match(await page.textContent('#rates-fuente'), /Promerica \(se actualiza/);
    assert.equal(await page.getAttribute('#rates-bancos button[data-banco="promerica"]', 'class'), 'activa');

    await page.reload(); await page.waitForTimeout(2500);
    assert.deepEqual(await usd(), [26.8842, 27.0186, 27.0186]);
    await page.evaluate(() => elegirBancoTasas(''));
    assert.deepEqual(await usd(), [26.8931, 27.0276, 27.0276]);
    assert.deepEqual(page.errores, []);
  });
});
