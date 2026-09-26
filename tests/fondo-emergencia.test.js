const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase } = require('./helpers');

// Fecha fija: los "últimos 3 meses completos" son junio, julio y agosto
const HOY = new Date('2026-09-15T12:00:00');
const g = (id, amount, fecha, tipo = 'fijo', extra = {}) => Object.assign({ id, type: 'expense', amount, cat: 'Casa', tipo, cuenta: 'ahorro', date: fecha + 'T15:00:00' }, extra);
const historial = () => [
  g('jun00001', 9000, '2026-06-05'), g('jun00002', 2000, '2026-06-20', 'extra'),
  g('jul00001', 10000, '2026-07-05'), g('jul00002', 1500, '2026-07-20', 'extra'),
  g('ago00001', 11000, '2026-08-05'), g('ago00002', 2500, '2026-08-20', 'extra'),
  g('sep00001', 99999, '2026-09-02'),                                           // mes en curso: no cuenta
  g('ago00003', 7000, '2026-08-10', 'fijo', { esTransferencia: true }),          // transferencia: no cuenta
];
const conSaldo = extra => estadoBase(Object.assign({ nombre: 'Ana', saldoInicial: 210000, cuentasIniciales: { efectivo: 10000, ahorro: 200000 } }, extra));

describe('Fondo de emergencia guiado', () => {
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

  it('calcula el gasto esencial con los fijos de los 3 meses completos', async () => {
    const page = await pagina(conSaldo({ transactions: historial() }));
    assert.deepEqual(await page.evaluate(() => gastoMensualEsencial()), { monto: 10000, fuente: 'fijos', meses: 3 });
  });

  it('si casi nada es fijo usa el total, y sin historial los compromisos conocidos', async () => {
    let page = await pagina(conSaldo({ transactions: [g('jul00001', 500, '2026-07-05'), g('jul00002', 9500, '2026-07-20', 'extra')] }));
    assert.deepEqual(await page.evaluate(() => gastoMensualEsencial()), { monto: 10000, fuente: 'todos', meses: 1 });
    page = await pagina(conSaldo({ pagosRecurrentes: [{ id: 'pagorec1', servicio: 'Luz', monto: 1200, dia: 5, pagado: 0 }],
      prestamos: [{ id: 'prest001', entidad: 'BAC', monto: 50000, cuota: 2496.21, cuotasPagadas: 0, cuotasTotal: 24 }] }));
    assert.deepEqual(await page.evaluate(() => gastoMensualEsencial()), { monto: 3696.21, fuente: 'compromisos', meses: 0 });
  });

  it('el inicio sugiere crearlo, se crea con 3 o 6 meses y se ve el avance', async () => {
    const page = await pagina(conSaldo({ transactions: historial() }));
    assert.match(await page.textContent('#fondo-emergencia-card'), /3 meses: L\. ?30,000\.00/);
    await page.click('#fondo-emergencia-card .btn-primary');
    assert.equal(await page.inputValue('#fondo-base'), '10000.00');
    assert.match(await page.textContent('#fondo-fuente'), /gastos fijos de los últimos 3 meses/);
    await page.click('#modal-fondo [data-meses="6"]');
    assert.match(await page.textContent('#fondo-objetivo'), /L\. ?60,000\.00/);
    await page.click('#modal-fondo [data-meses="3"]');
    await page.click('#fondo-btn-guardar');
    const f = await page.evaluate(() => fondoEmergencia());
    assert.deepEqual([f.nombre, f.objetivo, f.baseMensual, f.meses, f.actual], ['Fondo de emergencia', 30000, 10000, 3, 0]);
    const txt = await page.textContent('#fondo-emergencia-card');
    assert.match(txt, /cubre 0\.0 de 3 meses/);
    assert.match(txt, /L\. ?2,500\.00 al mes lo completas en un año \(o L\. ?5,000\.00 en 6 meses\)/);

    // Abonar usa el flujo de metas: el patrimonio no baja
    const antes = await page.evaluate(() => calcBalance());
    await page.click('#fondo-emergencia-card .btn-secondary');
    await page.fill('#abono-monto', '15,000');
    await page.evaluate(() => { document.getElementById('abono-cuenta').value = 'ahorro'; saveAbono(); });
    assert.equal(await page.evaluate(() => calcBalance()), antes);
    assert.match(await page.textContent('#fondo-emergencia-card'), /cubre 1\.5 de 3 meses/);
    await page.evaluate(() => switchView('metas'));
    assert.match(await page.textContent('#metas-list'), /🛟 Cubre 1\.5 de 3 meses/);
  });

  it('completo muestra el respaldo; y el resumen del mes lo menciona', async () => {
    const page = await pagina(conSaldo({ transactions: historial(), goals: [{ id: 'fondo001', nombre: 'Fondo de emergencia', objetivo: 30000, actual: 30000, esFondoEmergencia: true, baseMensual: 10000, meses: 3 }] }));
    assert.match(await page.textContent('#fondo-emergencia-card'), /¡Completo! Ya tienes 3\.0 meses de respaldo/);
    const ideas = await page.evaluate(() => ideasDelResumen(calcularResumenMes(2026, 7)).join('|'));
    assert.match(ideas, /Tu fondo de emergencia cubre 3\.0 de 3 meses/);
  });

  it('eliminar una meta desde la lista devuelve lo abonado a una cuenta', async () => {
    const page = await pagina(conSaldo({ goals: [{ id: 'meta0001', nombre: 'Viaje', objetivo: 10000, actual: 0 }] }));
    await page.evaluate(() => { openAbono('meta0001'); document.getElementById('abono-cuenta').value = 'ahorro'; document.getElementById('abono-monto').value = '2000'; saveAbono(); switchView('metas'); });
    page.respuestas = [true, true]; // eliminar; devolver a ahorro
    await page.click('#metas-list .goal-pro-btn.eliminar');
    // Eliminar espera las dos respuestas (ventanas propias): se espera a que termine
    await page.waitForFunction(() => state.goals.length === 0 && getCuentaBalance('ahorro') === 200000, null, { timeout: 5000 }).catch(() => {});
    assert.deepEqual(await page.evaluate(() => [state.goals.length, getCuentaBalance('ahorro')]), [0, 200000]);
  });

  it('la sugerencia se puede ocultar y no aparece sin gastos', async () => {
    let page = await pagina(conSaldo({ transactions: historial() }));
    await page.click('#fondo-emergencia-card button[aria-label="Ocultar"]');
    assert.equal(await page.isVisible('#fondo-emergencia-card'), false);
    page = await pagina(conSaldo());
    assert.equal(await page.isVisible('#fondo-emergencia-card'), false);
  });
});
