// Registro rápido con teclado-calculadora y el inicio con los movimientos del mes por día
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase, UUID_TC } = require('./helpers');

const HOY = new Date(2026, 8, 25, 12, 0);
const dia = (d, h = 10, m = 8) => new Date(2026, m, d, h, 0).toISOString();
const TARJETA = { id: UUID_TC, nombre: 'BAC Visa', corte: 20, pago: 5, limite: 40000, saldo: 0, saldoBase: 0, tasaInteres: 48, historialPagos: [] };
const teclear = (page, s) => page.evaluate(s => [...s].forEach(k => teclaRegistro(k)), s);
const ultima = page => page.evaluate(() => state.transactions[state.transactions.length - 1]);

describe('Registro rápido con teclado', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('el + abre el teclado; 150+200 da 350 y se guarda como gasto con su categoría', async () => {
    const page = await env.pagina();
    await page.clock.setFixedTime(HOY);
    await sembrar(page, estadoBase({ cuentasIniciales: { efectivo: 5000, ahorro: 0 } }));
    await page.click('#nav-fab-btn');
    await page.waitForSelector('#modal-registro', { state: 'visible' });
    for (const k of ['1', '5', '0', '+', '2', '0', '0']) await page.click(`.reg-teclado button:text-is("${k}")`);
    assert.equal(await page.textContent('#reg-monto'), '150+200');
    assert.equal(await page.textContent('#reg-resultado'), '= L. 350.00');
    // Sin categoría no guarda: abre la lista de categorías
    await page.click('.reg-accion.guardar');
    assert.equal(await page.evaluate(() => document.getElementById('reg-selector').classList.contains('abierto')), true);
    assert.equal(await page.evaluate(() => state.transactions.length), 0);
    await page.click('.reg-cat[data-cat="Comida"]');
    await page.fill('#reg-nota', 'Baleadas');
    await page.click('.reg-accion.guardar');
    const t = await ultima(page);
    assert.deepEqual([t.type, t.amount, t.cat, t.subcat, t.cuenta, t.tipo, t.date], ['expense', 350, 'Comida', 'Baleadas', 'efectivo', 'fijo', HOY.toISOString()]);
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('modal-registro')).display), 'none');
    assert.match(await page.textContent('#aviso-rapido'), /Gasto guardado: L\. 350\.00 · Comida/);
    assert.deepEqual(page.dialogos, [], 'sin alertas de por medio');
    assert.deepEqual(page.errores, []);
  });

  it('el teclado no deja montos inválidos: dos decimales, un punto y sin operación al inicio', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase());
    await page.evaluate(() => abrirRegistro());
    await teclear(page, '+00.5.55');
    assert.equal(await page.textContent('#reg-monto'), '0.55');
    await teclear(page, '*3');
    assert.equal(await page.textContent('#reg-resultado'), '= L. 1.65');
    await teclear(page, '=');
    assert.equal(await page.textContent('#reg-monto'), '1.65');
    await page.evaluate(() => { teclaRegistro('borrar'); teclaRegistro('borrar'); teclaRegistro('borrar'); teclaRegistro('borrar'); });
    assert.equal(await page.textContent('#reg-monto'), '0');
    // Guardar sin monto no hace nada más que avisar
    await page.evaluate(() => { elegirCatRegistro('Comida'); guardarRegistro(); });
    assert.equal(await page.evaluate(() => state.transactions.length), 0);
    assert.match(await page.textContent('#aviso-rapido'), /monto/);
  });

  it('ingreso con su categoría y cuenta, y una fecha pasada', async () => {
    const page = await env.pagina();
    await page.clock.setFixedTime(HOY);
    await sembrar(page, estadoBase());
    await page.evaluate(() => abrirRegistro());
    await page.click('.reg-tab[data-tipo="ingreso"]');
    assert.equal(await page.textContent('#reg-lbl-b'), 'Categoría');
    await page.click('#reg-btn-a');
    await page.click('.reg-cuenta[data-id="ahorro"]');
    await page.click('#reg-btn-b');
    await page.click('.reg-cat[data-cat="Remesa"]');
    await teclear(page, '4500');
    await page.fill('#reg-fecha', '2026-09-20');
    await page.click('.reg-accion.guardar');
    const t = await ultima(page);
    assert.deepEqual([t.type, t.amount, t.cat, t.subcat, t.cuenta, new Date(t.date).getDate()], ['income', 4500, 'Remesa', 'extra', 'ahorro', 20]);
    // Recuerda la última cuenta usada
    await page.evaluate(() => abrirRegistro());
    assert.match(await page.textContent('#reg-btn-a'), /Cuenta de Ahorro/);
  });

  it('gasto con tarjeta de crédito: sube el saldo de la tarjeta, no toca las cuentas', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase({ cuentasIniciales: { efectivo: 1000, ahorro: 0 }, tarjetas: [TARJETA] }));
    await page.evaluate(() => abrirRegistro('gasto'));
    await page.click('#reg-btn-a');
    await page.click(`.reg-cuenta[data-id="${UUID_TC}"]`);
    assert.match(await page.textContent('#reg-btn-a'), /💳 BAC Visa/);
    await page.evaluate(() => elegirCatRegistro('Ropa'));
    await teclear(page, '1200');
    await page.click('.reg-accion.guardar');
    const t = await ultima(page);
    assert.deepEqual([t.amount, t.cat, t.cuenta, t.tarjetaId, t.tipo], [1200, 'Ropa', null, UUID_TC, 'extra']);
    assert.deepEqual(await page.evaluate(() => [state.tarjetas[0].saldo, getCuentaBalance('efectivo')]), [1200, 1000]);
  });

  it('transferencia entre cuentas y "Más opciones" pasa lo escrito al formulario completo', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase({ cuentasIniciales: { efectivo: 3000, ahorro: 0 } }));
    await page.evaluate(() => abrirRegistro('transferencia'));
    assert.deepEqual([await page.textContent('#reg-lbl-a'), await page.textContent('#reg-lbl-b')], ['Desde', 'Hacia']);
    await teclear(page, '1000');
    await page.click('.reg-accion.guardar');
    assert.deepEqual(await page.evaluate(() => [getCuentaBalance('efectivo'), getCuentaBalance('ahorro'), state.transactions.filter(t => t.esTransferencia).length]), [2000, 1000, 2]);
    assert.deepEqual(page.dialogos, []);
    // Más opciones
    await page.evaluate(() => { abrirRegistro('gasto'); elegirCatRegistro('Salud'); });
    await teclear(page, '75.5');
    await page.fill('#reg-nota', 'Farmacia Kielsa');
    await page.click('.reg-extras button:text("Más opciones")');
    assert.deepEqual(await page.evaluate(() => [getComputedStyle(document.getElementById('modal-gasto')).display, document.getElementById('gasto-monto').value, document.getElementById('gasto-cat').value, document.getElementById('gasto-subcat').value, document.getElementById('gasto-tipo').value]),
      ['flex', '75.5', 'Salud', 'Farmacia Kielsa', 'fijo']);
    assert.deepEqual(page.errores, []);
  });
  it('al elegir la categoría muestra su presupuesto y avisa si con el gasto te pasas', async () => {
    const page = await env.pagina();
    await page.clock.setFixedTime(HOY);
    await sembrar(page, estadoBase({ cuentasIniciales: { efectivo: 9000, ahorro: 0 },
      transactions: [{ id: 'gas00001', type: 'expense', amount: 1100, cat: 'Comida', date: dia(20), cuenta: 'efectivo', tipo: 'fijo' }],
      presupuestos: [{ id: 'pre00001', cat: 'Comida', monto: 3000, periodo: 'quincena' }, { id: 'pre00002', cat: '*', monto: 20000, periodo: 'mes' }] }));
    await page.evaluate(() => abrirRegistro('gasto'));
    const presu = () => page.evaluate(() => { const e = document.getElementById('reg-presu'); return e.style.display === 'none' ? null : [e.className, e.textContent]; });
    assert.equal(await presu(), null, 'sin categoría no dice nada');
    await page.evaluate(() => elegirCatRegistro('Comida'));
    assert.deepEqual(await presu(), ['reg-presu bien', '📅 Comida: te quedan L. 1,900.00 de L. 3,000.00 esta quincena']);
    await teclear(page, '1600');
    assert.deepEqual(await presu(), ['reg-presu aviso', '⚠️ Comida: después de este gasto te quedan L. 300.00 de L. 3,000.00 esta quincena']);
    await teclear(page, '0');
    assert.deepEqual(await presu(), ['reg-presu pasado', '🚨 Con este gasto te pasas en Comida por L. 14,100.00 (te quedan L. 1,900.00 de L. 3,000.00 esta quincena)']);
    // Sin tope propio usa el de todos los gastos
    await page.evaluate(() => { ['borrar', 'borrar', 'borrar', 'borrar', 'borrar'].forEach(teclaRegistro); elegirCatRegistro('Ropa'); });
    assert.deepEqual(await presu(), ['reg-presu bien', '📅 Todos tus gastos: te quedan L. 18,900.00 de L. 20,000.00 este mes']);
    // En ingresos no aplica
    await page.evaluate(() => { cambiarTipoRegistro('ingreso'); elegirCatRegistro('Salario'); });
    assert.equal(await presu(), null);
  });

  it('las advertencias van en amarillo, no en el verde principal', async () => {
    for (const esquema of ['light', 'dark']) {
      const page = await env.pagina({ colorScheme: esquema });
      await sembrar(page, estadoBase());
      const [acento, aviso] = await page.evaluate(() => { const c = getComputedStyle(document.documentElement); return [c.getPropertyValue('--amber').trim(), c.getPropertyValue('--aviso').trim()]; });
      assert.ok(aviso && aviso !== acento, esquema);
      assert.equal(await page.evaluate(() => { const d = document.createElement('span'); d.className = 'badge-liq-warning'; document.body.appendChild(d); return getComputedStyle(d).color; }),
        esquema === 'light' ? 'rgb(180, 83, 9)' : 'rgb(245, 181, 68)');
    }
  });
});

describe('Inicio: movimientos del mes por día', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  const TX = [
    { id: 'ing00001', type: 'income', amount: 18000, cat: 'Salario', subcat: 'salario', date: dia(15, 9), cuenta: 'ahorro' },
    { id: 'gas00001', type: 'expense', amount: 1250, cat: 'Supermercado', subcat: 'La Colonia', date: dia(24, 18), cuenta: 'efectivo', tipo: 'fijo' },
    { id: 'gas00002', type: 'expense', amount: 95, cat: 'almuerzo', date: dia(25, 8), cuenta: 'efectivo', tipo: 'extra' },
    { id: 'tra00001', type: 'expense', amount: 2000, cat: 'Transferencia', date: dia(22, 12), cuenta: 'ahorro', esTransferencia: true, tipo: 'fijo' },
    { id: 'tra00002', type: 'income', amount: 2000, cat: 'Transferencia', date: dia(22, 12), cuenta: 'efectivo', esTransferencia: true },
    { id: 'con00001', type: 'income', amount: 40, cat: 'Conciliación', date: dia(21, 12), cuenta: 'efectivo', esConciliacion: true },
    { id: 'ago00001', type: 'expense', amount: 700, cat: 'Luz', date: dia(10, 10, 7), cuenta: 'efectivo', tipo: 'fijo' },
    { id: 'bor00001', type: 'expense', amount: 999, cat: 'Comida', date: dia(24, 10), cuenta: 'efectivo', deletedAt: dia(24, 11) },
  ];

  it('muestra el mes con sus totales y cada día con sus movimientos', async () => {
    const page = await env.pagina();
    await page.clock.setFixedTime(HOY);
    await sembrar(page, estadoBase({ transactions: TX }));
    const txt = await page.textContent('#registros-mes');
    assert.match(txt, /Septiembre 2026/);
    // Gastos 1,345 (sin la transferencia ni el borrado), ingresos 18,000 (sin el ajuste)
    assert.match(txt, /Gastos\s*L\. 1,345\.00\s*Ingresos\s*L\. 18,000\.00\s*Saldo\s*L\. 16,655\.00/);
    const dias = await page.$$eval('#registros-mes .rm-dia-head span:first-child', els => els.map(e => e.textContent));
    assert.deepEqual(dias, ['Hoy · 25 sep, viernes', 'Ayer · 24 sep, jueves', '22 sep, martes', '21 sep, lunes', '15 sep, martes']);
    // "almuerzo" se reconoce como Comida; la transferencia sale una sola vez
    assert.equal(await page.$eval('#registros-mes .rm-fila', f => f.querySelector('.cat-circulo').textContent), '🍽️');
    assert.equal(await page.$$eval('#registros-mes .rm-cat', els => els.filter(e => e.textContent === 'Transferencia').length), 1);
    assert.doesNotMatch(txt, /999/);
    // El mes siguiente no existe todavía; el anterior tiene lo suyo
    assert.equal(await page.$eval('#registros-mes .rm-nav button:last-child', b => b.disabled), true);
    await page.click('#registros-mes .rm-nav button:first-child');
    assert.match(await page.textContent('#registros-mes'), /Agosto 2026[\s\S]*Gastos\s*L\. 700\.00[\s\S]*Luz/);
    // Tocar un movimiento lo abre para editarlo
    await page.click('#registros-mes .rm-fila');
    assert.equal(await page.inputValue('#edit-tx-id'), 'ago00001');
    assert.deepEqual(page.errores, []);
  });

  it('sin movimientos invita a registrar el primero con el teclado', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase());
    assert.match(await page.textContent('#registros-mes'), /Anota tu primer gasto/);
    await page.click('#registros-mes .rm-vacio .btn');
    await page.waitForSelector('#modal-registro', { state: 'visible' });
  });

  it('con muchos movimientos muestra los primeros y un botón para ver todo el mes', async () => {
    const page = await env.pagina();
    await page.clock.setFixedTime(HOY);
    const muchos = Array.from({ length: 40 }, (_, i) => ({ id: 'mov' + String(i).padStart(5, '0'), type: 'expense', amount: 10 + i, cat: 'Comida', date: dia(1 + (i % 24), 8 + (i % 10)), cuenta: 'efectivo', tipo: 'extra' }));
    await sembrar(page, estadoBase({ transactions: muchos }));
    const filas = () => page.$$eval('#registros-mes .rm-fila', f => f.length);
    assert.ok(await filas() < 40);
    await page.click('#registros-mes .rm-ver-todo');
    assert.equal(await filas(), 40);
  });
});
