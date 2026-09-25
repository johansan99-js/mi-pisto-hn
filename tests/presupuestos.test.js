// Presupuestos por quincena, semana o mes
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase } = require('./helpers');

const HOY = new Date(2026, 8, 25, 12, 0); // viernes 25 de septiembre
const dia = (d, m = 8) => new Date(2026, m, d, 10, 0).toISOString();
const gasto = (id, cat, amount, date, extra = {}) => Object.assign({ id, type: 'expense', cat, amount, date, cuenta: 'efectivo', tipo: 'extra' }, extra);
const conSaldo = extra => estadoBase(Object.assign({ nombre: 'Ana', saldoInicial: 20000, cuentasIniciales: { efectivo: 20000, ahorro: 0 } }, extra));

describe('Presupuestos por quincena', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });
  async function pagina(estado) {
    const page = await env.pagina();
    await page.clock.setFixedTime(HOY);
    await sembrar(page, estado);
    await page.evaluate(() => { localStorage.setItem('mph_primeros_pasos', 'oculto'); renderAll(); });
    return page;
  }

  it('la quincena va de un día de pago al siguiente, con el 30 como fin de mes en febrero', async () => {
    const page = await pagina(conSaldo());
    const r = await page.evaluate(() => {
      const f = (p, d) => { const x = rangoPeriodo(p, d); return [x.inicio.getMonth() + 1 + '/' + x.inicio.getDate(), x.fin.getMonth() + 1 + '/' + x.fin.getDate()].join('-'); };
      const out = [f('quincena', new Date(2026, 8, 25)), f('quincena', new Date(2026, 8, 5)), f('quincena', new Date(2026, 1, 20)), f('quincena', new Date(2026, 1, 28)), f('semana', new Date(2026, 8, 25)), f('mes', new Date(2026, 8, 25))];
      state.diasPago = [1, 15];
      out.push(f('quincena', new Date(2026, 8, 20)), f('quincena', new Date(2026, 8, 1)));
      return out;
    });
    assert.deepEqual(r, ['9/15-9/30', '8/30-9/15', '2/15-2/28', '2/28-3/15', '9/21-9/28', '9/1-10/1', '9/15-10/1', '9/1-9/15']);
  });

  it('avisa al 80%, cuenta las partes divididas y dice cuánto queda por día', async () => {
    const page = await pagina(conSaldo({ transactions: [
      gasto('tx000001', 'Comida', 1000, dia(16)),
      gasto('tx000002', 'comida ', 1500, dia(20)),
      gasto('tx000003', 'Comida', 500, dia(10)),                     // quincena anterior
      gasto('tx000004', 'Súper', 800, dia(22), { splits: [{ cat: 'Comida', monto: 200 }, { cat: 'Casa', monto: 600 }] }),
      gasto('tx000005', 'Transferencia', 999, dia(21), { esTransferencia: true }),
      { id: 'tx000006', type: 'income', cat: 'Salario', amount: 12000, date: dia(15), cuenta: 'efectivo' },
    ] }));
    // Sin presupuestos: invita a crear uno
    assert.match(await page.textContent('#presupuestos-card'), /Comida L\. ?3,000\.00 por quincena/);
    await page.evaluate(() => { abrirPresupuestos(); document.getElementById('presu-cat').value = 'comida'; document.getElementById('presu-monto').value = '3,000'; document.getElementById('presu-periodo').value = 'quincena'; guardarPresupuesto(); });
    const p = await page.evaluate(() => state.presupuestos[0]);
    assert.deepEqual([p.cat, p.monto, p.periodo], ['Comida', 3000, 'quincena'], 'usa el nombre de la categoría que ya existe');
    const e = await page.evaluate(() => { const e = estadoPresupuesto(state.presupuestos[0]); return [e.gastado, e.queda, e.dias, e.porDia, e.nivel]; });
    assert.deepEqual(e, [2700, 300, 5, 60, 'aviso']);
    await page.evaluate(() => { closeModal('modal-presupuestos'); elegirPeriodoInicio('quincena'); });
    const txt = await page.textContent('#presupuestos-card');
    assert.match(txt, /15 sept al 29 sept/);
    assert.match(txt, /Entró\s*L\. ?12,000\.00[\s\S]*Gastaste\s*L\. ?3,300\.00[\s\S]*Te queda\s*L\. ?8,700\.00/);
    assert.match(txt, /Comida\s*L\. ?2,700\.00 de L\. ?3,000\.00[\s\S]*⚠️ Quedan L\. ?300\.00 · L\. ?60\.00 por día/);

    // Guardar otra vez la misma categoría y período actualiza el tope
    await page.evaluate(() => { abrirPresupuestos(); document.getElementById('presu-cat').value = 'Comida'; document.getElementById('presu-monto').value = '2500'; guardarPresupuesto(); });
    assert.equal(await page.evaluate(() => state.presupuestos.length), 1);
    assert.match(await page.textContent('#presupuestos-card'), /🚨 Te pasaste L\. ?200\.00/);

    // Otro período: el mes muestra solo los presupuestos mensuales
    await page.evaluate(() => { document.getElementById('presu-cat').value = 'Todos mis gastos'; document.getElementById('presu-monto').value = '10000'; document.getElementById('presu-periodo').value = 'mes'; guardarPresupuesto(); closeModal('modal-presupuestos'); elegirPeriodoInicio('mes'); });
    const mes = await page.textContent('#presupuestos-card');
    assert.match(mes, /septiembre[\s\S]*Gastaste\s*L\. ?3,800\.00[\s\S]*Todos mis gastos\s*L\. ?3,800\.00 de L\. ?10,000\.00/);
    assert.doesNotMatch(mes, /Comida/);
    assert.equal(await page.evaluate(() => localStorage.getItem('mph_periodo_inicio')), 'mes');
    assert.deepEqual(page.errores, []);
  });

  it('los días de pago se cambian y se validan', async () => {
    const page = await pagina(conSaldo());
    await page.evaluate(() => { abrirPresupuestos(); document.getElementById('presu-dia1').value = '10'; document.getElementById('presu-dia2').value = '10'; guardarDiasPago(); });
    assert.match(page.dialogos.pop(), /dos días distintos/);
    await page.evaluate(() => { document.getElementById('presu-dia1').value = '25'; document.getElementById('presu-dia2').value = '10'; guardarDiasPago(); elegirPeriodoInicio('quincena'); });
    assert.deepEqual(await page.evaluate(() => state.diasPago), [10, 25]);
    assert.match(await page.textContent('#presupuestos-card'), /25 sept al 9 oct/);
    // Se quedan al recargar
    await page.reload(); await page.waitForTimeout(800);
    assert.deepEqual(await page.evaluate(() => state.diasPago), [10, 25]);
  });
});
