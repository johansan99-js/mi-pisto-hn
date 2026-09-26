// Mis cuentas: bancos, billeteras y plazos fijos además de Efectivo y Ahorro
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase } = require('./helpers');

const conSaldo = (extra = {}) => estadoBase(Object.assign({ nombre: 'Ana', saldoInicial: 5000, cuentasIniciales: { efectivo: 1000, ahorro: 4000 } }, extra));
const mes = page => page.evaluate(() => { const h = new Date(); const m = calcularResumenMes(h.getFullYear(), h.getMonth()); return [m.ingresos, m.gastos]; });
async function nuevaCuenta(page, { grupo, nombre, tipo, saldo, tasa }) {
  await page.evaluate(o => {
    abrirModalCuenta();
    document.getElementById('cuenta-grupo').value = o.grupo || '';
    document.getElementById('cuenta-nombre').value = o.nombre;
    document.getElementById('cuenta-tipo').value = o.tipo || 'ahorro';
    document.getElementById('cuenta-saldo').value = o.saldo || '';
    document.getElementById('cuenta-tasa').value = o.tasa || '';
    guardarCuenta();
  }, { grupo, nombre, tipo, saldo, tasa });
  return page.evaluate(() => state.misCuentas[state.misCuentas.length - 1]);
}

describe('Mis cuentas', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('una cuenta nueva suma su saldo al patrimonio sin contar como ingreso y aparece en todos los selectores', async () => {
    const page = await env.pagina();
    await sembrar(page, conSaldo());
    const pat = await page.evaluate(() => calcBalance());
    const c = await nuevaCuenta(page, { grupo: 'BAC', nombre: 'Nómina', saldo: '12,500' });
    assert.deepEqual([c.nombre, c.grupo, c.tipo, c.icono], ['Nómina', 'BAC', 'ahorro', '🏦']);
    assert.deepEqual(await page.evaluate(id => [getCuentaBalance(id), calcBalance(), totalEnCuentas()], c.id), [12500, pat + 12500, 17500]);
    assert.deepEqual(await mes(page), [0, 0], 'el saldo inicial no es un ingreso');
    // En el Inicio y en los selectores de gasto, ingreso y transferencia
    assert.match(await page.textContent('#cuentas-extra-tiles'), /BAC\s*Nómina\s*L\. ?12,500\.00/);
    const opciones = await page.evaluate(() => ['gasto-cuenta', 'ingreso-cuenta', 'transfer-from', 'transfer-to', 'abono-cuenta'].map(id => [...document.getElementById(id).options].map(o => o.textContent.trim())));
    opciones.forEach(o => assert.ok(o.includes('🏦 BAC · Nómina'), o.join('|')));

    // Un gasto desde esa cuenta baja su saldo y avisa con su nombre si queda en negativo
    await page.evaluate(id => { openModal('modal-gasto'); document.getElementById('gasto-monto').value = '13,000'; document.getElementById('gasto-cat').value = 'Comida'; document.getElementById('gasto-cuenta').value = id; checkCreditCard(); }, c.id);
    page.respuestas = [false];
    await page.evaluate(() => saveGasto());
    assert.ok(page.dialogos.some(m => /Tu BAC · Nómina tiene L\. ?12,500\.00/.test(m)));
    await page.evaluate(() => { document.getElementById('gasto-monto').value = '500'; saveGasto(); });
    assert.equal(await page.evaluate(id => getCuentaBalance(id), c.id), 12000);

    // Transferir a Efectivo
    await page.evaluate(id => { openTransferirCuentas(); document.getElementById('transfer-from').value = id; document.getElementById('transfer-to').value = 'efectivo'; document.getElementById('transfer-monto').value = '2000'; ejecutarTransferencia(); }, c.id);
    assert.deepEqual(await page.evaluate(id => [getCuentaBalance(id), getCuentaBalance('efectivo')], c.id), [10000, 3000]);
    assert.ok(page.dialogos.some(m => /BAC · Nómina: L\. ?10,000\.00/.test(m)));
    assert.deepEqual(page.errores, []);
  });

  it('se agrupan por banco, estiman intereses y se ajusta el saldo al real', async () => {
    const page = await env.pagina();
    await sembrar(page, conSaldo());
    const pf = await nuevaCuenta(page, { grupo: 'Banco Atlántida', nombre: 'Plazo fijo', tipo: 'plazo', saldo: '60000', tasa: '6' });
    await nuevaCuenta(page, { grupo: 'Banco Atlántida', nombre: 'Ahorro', saldo: '3000' });
    await nuevaCuenta(page, { grupo: 'Tigo Money', nombre: 'Billetera', tipo: 'billetera', saldo: '250' });
    await page.evaluate(() => switchView('cuentas'));
    const txt = await page.textContent('#cuentas-contenido');
    assert.match(txt, /TIENES EN TUS CUENTAS\s*L\. ?68,250\.00/);
    assert.match(txt, /Tus intereses: ~L\. ?300\.00 al mes/);
    assert.match(txt, /Banco Atlántida\s*L\. ?63,000\.00[\s\S]*Plazo fijo[\s\S]*6% anual[\s\S]*Gana ~L\. ?300\.00 al mes[\s\S]*Tigo Money\s*L\. ?250\.00/);
    // Anotar intereses: es un ingreso de esa cuenta
    page.respuestas = ['300'];
    await page.evaluate(id => registrarRendimiento(id), pf.id);
    assert.equal(await page.evaluate(id => getCuentaBalance(id), pf.id), 60300);
    assert.deepEqual(await mes(page), [300, 0]);
    // Ajustar el saldo al real: queda como conciliación
    page.respuestas = ['60,450'];
    await page.evaluate(id => ajustarSaldoCuenta(id), pf.id);
    const t = await page.evaluate(() => state.transactions[state.transactions.length - 1]);
    assert.deepEqual([t.amount, t.type, t.esConciliacion, await page.evaluate(id => getCuentaBalance(id), pf.id)], [150, 'income', true, 60450]);
  });

  it('pagos con varias cuentas preguntan por número; archivar pide dejarla en cero', async () => {
    const page = await env.pagina();
    await sembrar(page, conSaldo({ pagosRecurrentes: [{ id: 'pagorec1', servicio: 'Netflix', monto: 300, dia: 10, pagado: 0 }] }));
    const c = await nuevaCuenta(page, { grupo: 'Ficohsa', nombre: 'Débito', saldo: '1000' });
    page.respuestas = ['3'];
    await page.evaluate(() => marcarPagoRecurrente('pagorec1'));
    assert.ok(page.dialogos.some(m => /1\. Efectivo[\s\S]*2\. Cuenta de Ahorro[\s\S]*3\. Ficohsa · Débito \(L\. ?1,000\.00\)/.test(m)));
    assert.equal(await page.evaluate(id => getCuentaBalance(id), c.id), 700);
    // No se archiva con dinero adentro
    await page.evaluate(id => { abrirModalCuenta(id); archivarCuenta(); }, c.id);
    assert.match(page.dialogos.pop(), /tiene L\. ?700\.00\. Transfiere el dinero/);
    page.respuestas = ['0', true];
    await page.evaluate(async id => { closeModal('modal-cuenta'); await ajustarSaldoCuenta(id); abrirModalCuenta(id); await archivarCuenta(); }, c.id);
    assert.equal(await page.evaluate(() => state.misCuentas[0].archivada), true);
    const opciones = await page.evaluate(() => [...document.getElementById('gasto-cuenta').options].map(o => o.value));
    assert.ok(!opciones.includes(c.id), 'una cuenta archivada ya no se ofrece');
    // Nombres repetidos y HTML
    await nuevaCuenta(page, { grupo: 'Ficohsa', nombre: 'débito' });
    assert.match(page.dialogos.pop(), /Ya tienes una cuenta con ese nombre/);
    const x = await nuevaCuenta(page, { nombre: '<b>Caja</b>' });
    assert.equal(x.nombre, 'bCaja/b');
    assert.deepEqual(page.errores, []);
  });
});
