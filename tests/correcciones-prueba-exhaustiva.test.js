// Regresiones de la prueba exhaustiva de septiembre 2026
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase } = require('./helpers');

const conSaldo = (extra = {}) => estadoBase(Object.assign({ nombre: 'Ana', saldoInicial: 5000, cuentasIniciales: { efectivo: 1000, ahorro: 4000 } }, extra));
const hoy = () => new Date().toISOString();

describe('Correcciones de la prueba exhaustiva', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('conciliar el efectivo entiende "1,200.50" y muestra el saldo registrado al abrir', async () => {
    const page = await env.pagina();
    await sembrar(page, conSaldo());
    assert.match(await page.textContent('#reconcile-current'), /L\. ?1,000\.00/, 'antes mostraba L. 0.00');
    page.respuestas = [true];
    await page.evaluate(() => { document.getElementById('reconcile-cuenta').value = 'efectivo'; document.getElementById('reconcile-balance').value = '1,200.50'; reconcileBalance(); });
    assert.equal(await page.evaluate(() => getCuentaBalance('efectivo')), 1200.5, 'antes dejaba el efectivo en 1');
  });

  it('abonar a una meta no baja el patrimonio ni cuenta como gasto, y al borrarla el dinero vuelve', async () => {
    const page = await env.pagina();
    await sembrar(page, conSaldo({ goals: [{ id: 'meta01', nombre: 'Viaje', objetivo: 10000, actual: 0 }] }));
    const antes = await page.evaluate(() => calcBalance());
    await page.evaluate(() => { openAbono('meta01'); document.getElementById('abono-cuenta').value = 'ahorro'; document.getElementById('abono-monto').value = '1,000'; saveAbono(); });
    const r = await page.evaluate(() => { const h = new Date(); const m = calcularResumenMes(h.getFullYear(), h.getMonth()); return { pat: calcBalance(), ah: getCuentaBalance('ahorro'), gastos: m.gastos, aMetas: m.aMetas, ideas: ideasDelResumen(m).join('|') }; });
    assert.deepEqual([r.pat, r.ah, r.gastos, r.aMetas], [antes, 3000, 0, 1000]);
    assert.match(r.ideas, /Guardaste L\. ?1,000\.00 en tus metas/);
    page.respuestas = [true, false]; // eliminar; devolver a efectivo
    await page.evaluate(() => deleteMeta('meta01'));
    assert.deepEqual(await page.evaluate(() => [getCuentaBalance('efectivo'), getCuentaBalance('ahorro'), calcBalance()]), [2000, 3000, antes]);
  });

  it('los abonos a metas de versiones anteriores dejan de contar como gasto', async () => {
    const page = await env.pagina();
    await sembrar(page, conSaldo({ transactions: [
      { id: 'viejo001', type: 'expense', amount: 500, cat: 'Ahorros', subcat: 'Meta: Carro', cuenta: 'ahorro', date: hoy() },
      { id: 'viejo002', type: 'income', amount: 200, cat: 'Cobro Deuda', subcat: 'Cobro a José &amp; María', cuenta: 'efectivo', date: hoy() },
    ], prestamos: [{ id: 'prest01', entidad: 'BAC', monto: 50000, cuota: 2496.205098475449, cuotasPagadas: 0, cuotasTotal: 24 }] }));
    const r = await page.evaluate(() => [state.transactions[0].esTransferencia, calcBalance(), state.transactions[1].subcat, state.prestamos[0].cuota]);
    assert.deepEqual(r, [true, 5200, 'Cobro a José & María', 2496.21]);
  });

  it('"Marcar pagado" en un pago recurrente registra el gasto y lo muestra pagado', async () => {
    const page = await env.pagina();
    await sembrar(page, conSaldo({ pagosRecurrentes: [{ id: 'pagorec1', servicio: 'Netflix', monto: 300, dia: 10, pagado: 0 }] }));
    page.respuestas = [false]; // de efectivo
    await page.evaluate(() => marcarPagoRecurrente('pagorec1'));
    const t = await page.evaluate(() => state.transactions[state.transactions.length - 1]);
    assert.deepEqual([t.amount, t.cat, t.subcat, t.cuenta, t.pagoRecurrenteId], [300, 'Servicios', 'Netflix', 'efectivo', 'pagorec1']);
    await page.evaluate(() => switchView('pagos'));
    assert.match(await page.textContent('#pagos-list'), /Pagado este mes/);
    page.respuestas = [false]; // no registrar otro pago
    await page.evaluate(() => marcarPagoRecurrente('pagorec1'));
    assert.equal(await page.evaluate(() => state.transactions.length), 1);
  });

  it('cobros y pagos a personas: la cuenta se elige y el nombre se guarda tal cual', async () => {
    const page = await env.pagina();
    await sembrar(page, conSaldo({ receivables: [{ id: 'cobro01', persona: 'José & María', monto: 2000, pagado: 0 }], payables: [{ id: 'deuda01', creditor: 'Tía <Rosa>', monto: 1000, pagado: 0 }] }));
    page.respuestas = ['500', true];
    await page.evaluate(() => abonarCobrar('cobro01'));
    page.respuestas = ['300', false];
    await page.evaluate(() => abonarPagar('deuda01'));
    const [c, p] = await page.evaluate(() => state.transactions.slice(-2));
    assert.deepEqual([c.subcat, c.cuenta, p.subcat, p.cuenta], ['Cobro a José & María', 'ahorro', 'Pago a Tía <Rosa>', 'efectivo']);
    assert.ok(page.dialogos.some(m => m.includes('¿Cuánto te pagó José & María?')));
    await page.evaluate(() => switchView('cobrar'));
    assert.match(await page.textContent('#total-cobrar'), /L\. ?1,500\.00/, 'el total nunca se calculaba');
    assert.match(await page.textContent('#total-pagar'), /L\. ?700\.00/);
  });

  it('la cuota del préstamo se guarda en centavos', async () => {
    const page = await env.pagina();
    await sembrar(page, conSaldo());
    await page.evaluate(() => { openModal('modal-prestamo'); document.getElementById('prest-entidad').value = 'Atlántida'; document.getElementById('prest-monto').value = '50,000'; document.getElementById('prest-cuotas').value = '24'; document.getElementById('prest-tasa').value = '18'; savePrestamo(); });
    assert.equal(await page.evaluate(() => state.prestamos[0].cuota), 2496.21);
  });

  it('avisa antes de dejar una cuenta en negativo', async () => {
    const page = await env.pagina();
    await sembrar(page, conSaldo());
    const gastar = () => page.evaluate(() => { openModal('modal-gasto'); document.getElementById('gasto-monto').value = '1,500'; document.getElementById('gasto-cat').value = 'Comida'; document.getElementById('gasto-cuenta').value = 'efectivo'; checkCreditCard(); saveGasto(); });
    page.respuestas = [false];
    await gastar();
    assert.equal(await page.evaluate(() => state.transactions.length), 0);
    assert.ok(page.dialogos.some(m => /quedaría en -?L\. ?-?500\.00/.test(m)));
    page.respuestas = [true];
    await gastar();
    assert.equal(await page.evaluate(() => getCuentaBalance('efectivo')), -500);
  });

  it('una transferencia no aparece como duplicado posible', async () => {
    const page = await env.pagina();
    await sembrar(page, conSaldo());
    await page.evaluate(() => { openTransferirCuentas(); document.getElementById('transfer-from').value = 'ahorro'; document.getElementById('transfer-to').value = 'efectivo'; document.getElementById('transfer-monto').value = '1000'; ejecutarTransferencia(); });
    await page.waitForTimeout(400); // la detección corre 100 ms después de redibujar
    assert.equal(await page.isVisible('#duplicates-alert'), false);
    // Dos gastos iguales seguidos sí, y se puede descartar el aviso
    await page.evaluate(() => { const t = { type: 'expense', amount: 150, cat: 'Café', cuenta: 'efectivo', date: new Date().toISOString() }; state.transactions.push(Object.assign({ id: 'dup00001' }, t), Object.assign({ id: 'dup00002' }, t)); save(); renderAll(); });
    await page.waitForTimeout(400);
    assert.match(await page.textContent('#duplicates-alert'), /Café L\. ?150\.00/);
    await page.click('#duplicates-alert button:has-text("No es duplicado")');
    await page.waitForTimeout(400);
    assert.equal(await page.isVisible('#duplicates-alert'), false);
  });

  it('modo discreto: el total por cobrar, los pagos recurrentes y la conciliación también se tapan', async () => {
    const page = await env.pagina();
    await sembrar(page, conSaldo({ pagosRecurrentes: [{ id: 'pagorec1', servicio: 'Netflix', monto: 300, dia: 10, pagado: 0 }] }));
    await page.evaluate(() => toggleModoDiscreto());
    const textos = [];
    for (const v of ['dashboard', 'cobrar', 'pagar', 'pagos']) { await page.evaluate(x => switchView(x), v); await page.waitForTimeout(120); textos.push(await page.evaluate(() => document.querySelector('.view.active').innerText)); }
    for (const t of textos) assert.doesNotMatch(t, /(L\.?|\$)\s?\d/);
  });

  it('Gastos: "Este mes" suma solo el mes y la lista carga de 50 en 50', async () => {
    const page = await env.pagina();
    const viejos = Array.from({ length: 120 }, (_, i) => ({ id: 'gasto' + String(i).padStart(3, '0'), type: 'expense', amount: 10, cat: 'Comida', cuenta: 'efectivo', date: new Date(Date.now() - (i < 5 ? 0 : 40) * 864e5).toISOString() }));
    await sembrar(page, conSaldo({ transactions: viejos }));
    await page.evaluate(() => switchView('gastos'));
    assert.match(await page.textContent('#gastos-mes'), /L\. ?50\.00/);
    assert.equal(await page.locator('#gastos-list .btn-tx-delete').count(), 50);
    await page.click('#btn-mas-gastos');
    assert.equal(await page.locator('#gastos-list .btn-tx-delete').count(), 100);
    await page.click('#btn-mas-gastos');
    assert.equal(await page.locator('#gastos-list .btn-tx-delete').count(), 120);
    assert.equal(await page.locator('#btn-mas-gastos').count(), 0);
  });

  it('el resumen de tres columnas cabe en un teléfono de 360 px', async () => {
    const page = await env.pagina({ viewport: { width: 360, height: 740 } });
    await sembrar(page, conSaldo({ transactions: [{ id: 'grande01', type: 'expense', amount: 123456.78, cat: 'Carro', cuenta: 'ahorro', date: hoy() }] }));
    const d = await page.evaluate(() => { const w = document.documentElement.clientWidth; return [...document.querySelectorAll('.summary-box, .summary-value')].map(e => Math.round(e.getBoundingClientRect().right)).filter(r => r > w); });
    assert.deepEqual(d, []);
  });
});
