// Fase 1, segunda tanda: transferencias que se editan y borran enteras, respaldos
// manipulados, dos pestañas, pagos fijos del mes pasado, sincronización y centavos
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, esperarCarga, estadoBase } = require('./helpers');

const par = () => estadoBase({
  cuentasIniciales: { efectivo: 1000, ahorro: 0 },
  transactions: [
    // Transferencia vieja: sin parId, se empareja por monto y hora
    { id: 'salida01', type: 'expense', amount: 300, cat: 'Transferencia', subcat: 'Salida de Efectivo', cuenta: 'efectivo', tipo: 'fijo', esTransferencia: true, date: '2026-09-10T15:00:00.000Z' },
    { id: 'entrada01', type: 'income', amount: 300, cat: 'Transferencia', subcat: 'Entrada a Ahorro', cuenta: 'ahorro', esTransferencia: true, date: '2026-09-10T15:00:00.002Z' },
    // Otra del mismo monto pero de otro día: no debe tocarse
    { id: 'salida02', type: 'expense', amount: 300, cat: 'Transferencia', cuenta: 'efectivo', esTransferencia: true, date: '2026-09-12T15:00:00.000Z' },
    { id: 'entrada02', type: 'income', amount: 300, cat: 'Transferencia', cuenta: 'ahorro', esTransferencia: true, date: '2026-09-12T15:00:00.000Z' },
  ],
});
const saldos = page => page.evaluate(() => [getCuentaBalance('efectivo'), getCuentaBalance('ahorro')]);

describe('Fase 1: segunda tanda', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('editar una transferencia cambia las dos mitades y no deja cambiarla a ingreso', async () => {
    const page = await env.pagina();
    await sembrar(page, par());
    await page.evaluate(() => abrirEdicionTx('salida01'));
    assert.equal(await page.isVisible('#modal-edit-tx .edit-type-toggle'), false);
    await page.fill('#edit-monto', '450');
    await page.evaluate(() => { setEditType('income'); guardarEdicionTx(); });
    const r = await page.evaluate(() => state.transactions.map(t => [t.id, t.type, t.amount]));
    assert.deepEqual(r, [['salida01', 'expense', 450], ['entrada01', 'income', 450], ['salida02', 'expense', 300], ['entrada02', 'income', 300]]);
    assert.deepEqual(await saldos(page), [250, 750]);
    assert.deepEqual(page.errores, []);
  });

  it('una fecha vacía al editar avisa y no rompe nada', async () => {
    const page = await env.pagina();
    await sembrar(page, par());
    await page.evaluate(() => abrirEdicionTx('entrada02'));
    await page.fill('#edit-fecha', '');
    await page.evaluate(() => guardarEdicionTx());
    assert.ok(page.dialogos.some(d => /fecha/i.test(d)), page.dialogos.join(' | '));
    assert.equal(await page.evaluate(() => state.transactions.find(t => t.id === 'entrada02').date), '2026-09-12T15:00:00.000Z');
    assert.deepEqual(page.errores, []);
  });

  it('borrar una mitad borra la transferencia entera, y deshacer o restaurar la devuelve entera', async () => {
    const page = await env.pagina();
    await sembrar(page, par());
    await page.evaluate(() => softDeleteTx('entrada01'));
    assert.deepEqual(await saldos(page), [700, 300]);
    await page.evaluate(() => _undoDeleteFromToast());
    assert.deepEqual(await saldos(page), [400, 600]);
    page.respuestas = [true];
    await page.evaluate(() => eliminarGastoConPapelera('salida02'));
    assert.deepEqual(await saldos(page), [700, 300]);
    await page.evaluate(() => restaurarGastoDePapelera('entrada02'));
    assert.deepEqual(await saldos(page), [400, 600]);
    // Las transferencias nuevas llevan un parId común
    await page.evaluate(() => { openModal('modal-transferir'); document.getElementById('transfer-from').value = 'efectivo'; document.getElementById('transfer-to').value = 'ahorro'; document.getElementById('transfer-monto').value = '100'; ejecutarTransferencia({ silencioso: true }); });
    const nuevas = await page.evaluate(() => state.transactions.slice(-2).map(t => t.parId));
    assert.ok(nuevas[0] && nuevas[0] === nuevas[1]);
    assert.deepEqual(page.errores, []);
  });

  it('se puede transferir hasta el último centavo (sin errores de redondeo)', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase({
      transactions: [0.1, 0.2, 0.5].map((a, i) => ({ id: 'centavo' + i, type: 'income', amount: a, cat: 'Otro', cuenta: 'efectivo', date: '2026-09-01T10:00:00Z' })),
    }));
    assert.equal(await page.evaluate(() => getCuentaBalance('efectivo')), 0.8);
    await page.evaluate(() => { openModal('modal-transferir'); document.getElementById('transfer-from').value = 'efectivo'; document.getElementById('transfer-to').value = 'ahorro'; document.getElementById('transfer-monto').value = '0.80'; ejecutarTransferencia({ silencioso: true }); });
    assert.deepEqual(await saldos(page), [0, 0.8]);
    assert.ok(!page.dialogos.some(d => /insuficiente/i.test(d)), page.dialogos.join(' | '));
  });

  it('un respaldo manipulado se rechaza aunque el problema esté después del movimiento 100', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase());
    const r = await page.evaluate(() => {
      const base = () => ({ setup: true, transactions: Array.from({ length: 150 }, (_, i) => ({ id: 'mov' + String(i).padStart(4, '0'), type: 'expense', amount: 10, cat: 'Comida', date: '2026-09-01T10:00:00Z' })) });
      const casos = {};
      let o = base(); casos.bueno = _validarSchemaBackup(o);
      o = base(); o.transactions[140].amount = '100'; casos.montoTexto = _validarSchemaBackup(o);
      o = base(); o.transactions[149].cat = '<img src=x onerror=alert(1)>'; casos.html = _validarSchemaBackup(o);
      o = base(); o.transactions[120].tarjetaId = "x');alert(1);//"; casos.idRef = _validarSchemaBackup(o);
      o = base(); o.pagosRecurrentes = [{ id: 'pagofijo1', servicio: 'Luz', dia: '1"><script>' }]; casos.dia = _validarSchemaBackup(o);
      o = base(); o.grupos = [{ id: 'grupo0001', nombre: 'Casa', miembros: [], gastos: [], pagos: [{ id: "a'b", monto: 1 }] }]; casos.abono = _validarSchemaBackup(o);
      o = base(); o.transferenciasProgramadas = [{ id: 'tprog0001', nombre: 'Ahorro', monto: 'mil', dia: 5 }]; casos.tprog = _validarSchemaBackup(o);
      return casos;
    });
    assert.equal(r.bueno, null);
    for (const k of ['montoTexto', 'html', 'idRef', 'dia', 'abono', 'tprog']) assert.ok(r[k], k + ' debió rechazarse');
  });

  it('con la app abierta en dos pestañas, la de atrás deja de guardar y pide recargar', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase({ nombre: 'Ana' }));
    const otra = await page.context().newPage();
    await otra.goto(env.url); await esperarCarga(otra);
    await otra.evaluate(() => { state.nombre = 'Cambio en otra pestaña'; return save(); });
    await page.waitForSelector('#aviso-otra-pestana', { timeout: 5000 });
    const guardo = await page.evaluate(() => { state.nombre = 'Viejo'; return save(); });
    assert.equal(guardo, false);
    const nombre = await otra.evaluate(k => JSON.parse(localStorage.getItem(k)).nombre, 'mifinanzashn_pro_v20_full');
    assert.equal(nombre, 'Cambio en otra pestaña');
    assert.deepEqual(page.errores, []);
  });

  it('un pago fijo del 31 se anota aunque no abriste la app hasta el mes siguiente', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase({
      cuentasIniciales: { efectivo: 5000, ahorro: 0 },
      pagosRecurrentes: [{ id: 'pagofijo31', servicio: 'Alquiler', monto: 3000, dia: 31, tipo: 'gasto', cuenta: 'efectivo', auto: true, autoDesde: '2026-07-01T06:00:00.000Z', pagado: 0, anotados: { '2026-6-31': 'pf1' } }],
    }));
    const r = await page.evaluate(() => {
      state.transactions = state.transactions.filter(t => !/^pf/.test(t.id));
      state.pagosRecurrentes[0].anotados = { '2026-6-31': 'pf1' };
      // La última vez que se abrió fue en agosto (antes del 31)
      state.pagosRevisadosMes = 2026 * 12 + 7;
      verificarPagosAutomaticos(new Date(2026, 8, 5, 12));
      return state.transactions.filter(t => /^pf/.test(t.id)).map(t => { const d = new Date(t.date); return [d.getMonth(), d.getDate()]; });
    });
    assert.deepEqual(r, [[7, 31]]);
    // Volver a revisar no lo repite
    const otraVez = await page.evaluate(() => verificarPagosAutomaticos(new Date(2026, 8, 6, 12)).length);
    assert.equal(otraVez, 0);
    // Tras meses sin abrir la app no se rellena el mes pasado
    const tarde = await page.evaluate(() => { state.pagosRevisadosMes = 2026 * 12 + 5; return verificarPagosAutomaticos(new Date(2026, 9, 2, 12)).length; });
    assert.equal(tarde, 0);
  });

  it('sincronizar: el saldo calculado no re-sella la tarjeta y los ajustes los gana el cambio más nuevo', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase({ tarjetas: [{ id: 'tarjeta0001', nombre: 'Visa', limite: 20000, saldo: 0, corte: 20, pago: 5 }] }));
    const r = await page.evaluate(async () => {
      await save();
      const antes = state.tarjetas[0].updatedAt;
      state.transactions.push({ id: 'compra001', type: 'expense', amount: 500, cat: 'Comida', pago: 'credito', tarjetaId: 'tarjeta0001', date: new Date().toISOString() });
      await new Promise(r => setTimeout(r, 15));
      await save();
      const selloTarjeta = [antes, state.tarjetas[0].updatedAt, state.tarjetas[0].saldo];
      // Cambiar el nombre aquí después de que la nube tiene otro
      const remoto = JSON.parse(JSON.stringify(state));
      remoto.nombre = 'Nube'; remoto.sellosAjustes = { nombre: new Date(Date.now() - 60000).toISOString() };
      state.nombre = 'Aquí'; await save();
      const m1 = cloudSync.mergeStates(state, remoto).merged.nombre;
      remoto.sellosAjustes.nombre = new Date(Date.now() + 60000).toISOString();
      const m2 = cloudSync.mergeStates(state, remoto).merged.nombre;
      return { selloTarjeta, m1, m2 };
    });
    assert.equal(r.selloTarjeta[0], r.selloTarjeta[1], 'la compra no debe re-sellar la tarjeta');
    assert.equal(r.selloTarjeta[2], 500);
    assert.equal(r.m1, 'Aquí');
    assert.equal(r.m2, 'Nube');
    assert.deepEqual(page.errores, []);
  });
});
