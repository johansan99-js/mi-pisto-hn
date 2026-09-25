// Gastos compartidos: grupos, división, saldos y quedar a mano
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase } = require('./helpers');

const conSaldo = (extra = {}) => estadoBase(Object.assign({ nombre: 'Ana', saldoInicial: 5000, cuentasIniciales: { efectivo: 2000, ahorro: 3000 } }, extra));
const mes = page => page.evaluate(() => { const h = new Date(); const m = calcularResumenMes(h.getFullYear(), h.getMonth()); return [m.ingresos, m.gastos]; });
async function crearGrupo(page, nombre, miembros) {
  await page.evaluate(([n, m]) => { abrirModalGrupo(); document.getElementById('grupo-nombre').value = n; document.getElementById('grupo-miembros').value = m; guardarGrupo(); }, [nombre, miembros]);
  return page.evaluate(() => state.grupos[state.grupos.length - 1]);
}
async function agregarGasto(page, gid, { desc, monto, pago, cuenta, exactos }) {
  await page.evaluate(([gid, o]) => {
    abrirGastoGrupo(gid);
    document.getElementById('gg-desc').value = o.desc;
    document.getElementById('gg-monto').value = o.monto;
    document.getElementById('gg-pago').value = o.pago;
    if (o.cuenta) document.getElementById('gg-cuenta').value = o.cuenta;
    if (o.exactos) {
      elegirDivision('exactos');
      document.querySelectorAll('#gg-partes .gg-parte').forEach(f => { f.querySelector('.gg-monto-parte').value = o.exactos[f.dataset.miembro] || ''; });
    }
    _renderGastoGrupo();
    guardarGastoGrupo();
  }, [gid, { desc, monto, pago, cuenta, exactos }]);
}

describe('Gastos compartidos', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('pagas tú y se divide en partes iguales: solo tu parte es gasto y los demás te deben', async () => {
    const page = await env.pagina();
    await sembrar(page, conSaldo());
    const pat = await page.evaluate(() => calcBalance());
    const g = await crearGrupo(page, 'Viaje a Roatán', 'Luis, María');
    assert.deepEqual(g.miembros.map(m => m.nombre), ['Luis', 'María']);
    await agregarGasto(page, g.id, { desc: 'Hotel', monto: '1,000', pago: 'yo', cuenta: 'ahorro' });
    const r = await page.evaluate(id => { const g = grupoPorId(id); return { partes: Object.values(g.gastos[0].partes), saldos: saldosGrupo(g), ah: getCuentaBalance('ahorro'), pat: calcBalance() }; }, g.id);
    assert.deepEqual(r.partes, [333.34, 333.33, 333.33], 'los centavos que sobran no se pierden');
    assert.equal(r.saldos.yo, 666.66);
    assert.deepEqual([r.ah, r.pat], [2000, pat - 333.34], 'sale todo de la cuenta pero el patrimonio solo baja tu parte');
    assert.deepEqual(await mes(page), [0, 333.34]);
    await page.evaluate(() => switchView('grupos'));
    assert.match(await page.textContent('#grupos-contenido'), /Luis le paga L\. ?333\.33 a ti[\s\S]*María le paga L\. ?333\.33 a ti/);

    // Luis te paga por transferencia
    await page.evaluate(id => abrirPagoGrupo(id, 0), g.id);
    assert.equal(await page.inputValue('#pg-monto'), '333.33');
    await page.evaluate(() => { document.getElementById('pg-cuenta').value = 'ahorro'; guardarPagoGrupo(); });
    assert.deepEqual(await page.evaluate(() => [getCuentaBalance('ahorro'), calcBalance()]), [2333.33, pat - 333.34]);
    assert.deepEqual(await mes(page), [0, 333.34], 'que te paguen no es un ingreso');
    assert.equal(await page.evaluate(id => saldosGrupo(grupoPorId(id)).yo, g.id), 333.33);
    assert.deepEqual(page.errores, []);
  });

  it('paga otro con montos exactos: tu parte es gasto sin tocar tus cuentas y al pagarle quedan a mano', async () => {
    const page = await env.pagina();
    await sembrar(page, conSaldo());
    const pat = await page.evaluate(() => calcBalance());
    const g = await crearGrupo(page, 'Casa', 'Carlos');
    const carlos = g.miembros[0].id;
    await agregarGasto(page, g.id, { desc: 'Súper', monto: '1500', pago: carlos, exactos: { yo: '1,000', [carlos]: '500' } });
    assert.deepEqual(await page.evaluate(() => [getCuentaBalance('efectivo'), getCuentaBalance('ahorro'), calcBalance()]), [2000, 3000, pat - 1000]);
    assert.deepEqual(await mes(page), [0, 1000]);
    await page.evaluate(() => switchView('gastos'));
    assert.match(await page.textContent('#gastos-list'), /Súper · pagó Carlos/);

    await page.evaluate(() => { switchView('grupos'); cerrarGrupo(); });
    assert.match(await page.textContent('#grupos-contenido'), /DEBES\s*L\. ?1,000\.00[\s\S]*Casa[\s\S]*Debes L\. ?1,000\.00/);
    await page.evaluate(id => abrirGrupo(id), g.id);
    await page.evaluate(id => { abrirPagoGrupo(id, 0); document.getElementById('pg-cuenta').value = 'efectivo'; guardarPagoGrupo(); }, g.id);
    assert.ok(page.dialogos.some(m => /quedó a mano/.test(m)));
    assert.deepEqual(await page.evaluate(() => [getCuentaBalance('efectivo'), calcBalance()]), [1000, pat - 1000], 'pagarle a Carlos no es otro gasto');
    assert.match(await page.textContent('#grupos-contenido'), /Todos están a mano/);
  });

  it('borrar un gasto del grupo también lo quita de tus cuentas', async () => {
    const page = await env.pagina();
    await sembrar(page, conSaldo());
    const pat = await page.evaluate(() => calcBalance());
    const g = await crearGrupo(page, 'Pareja', 'Leo');
    await agregarGasto(page, g.id, { desc: 'Cena', monto: '800', pago: 'yo', cuenta: 'efectivo' });
    const eid = await page.evaluate(id => grupoPorId(id).gastos[0].id, g.id);
    page.respuestas = [true];
    await page.evaluate(([g, e]) => eliminarMovGrupo(g, e), [g.id, eid]);
    assert.deepEqual(await page.evaluate(id => [getCuentaBalance('efectivo'), calcBalance(), grupoPorId(id).gastos.length], g.id), [2000, pat, 0]);
  });

  it('valida el grupo y el gasto, y el resumen para WhatsApp dice quién le paga a quién', async () => {
    const page = await env.pagina();
    await sembrar(page, conSaldo());
    await page.evaluate(() => { abrirModalGrupo(); document.getElementById('grupo-nombre').value = 'Oficina'; document.getElementById('grupo-miembros').value = 'yo, Tú'; guardarGrupo(); });
    assert.match(page.dialogos.pop(), /al menos una persona además de ti/);
    const g = await crearGrupo(page, 'Oficina', 'Pedro, <b>Sofía</b>, pedro');
    assert.deepEqual(g.miembros.map(m => m.nombre), ['Pedro', 'bSofía/b'], 'sin HTML ni repetidos');
    await agregarGasto(page, g.id, { desc: 'Pizza', monto: '600', pago: 'yo', exactos: { yo: '100' } });
    assert.match(page.dialogos.pop(), /Las partes suman L\. ?100\.00 y el gasto es L\. ?600\.00/);
    await agregarGasto(page, g.id, { desc: 'Pizza', monto: '600', pago: g.miembros[0].id });
    const txt = await page.evaluate(id => textoResumenGrupo(grupoPorId(id)), g.id);
    assert.match(txt, /\*Oficina\*[\s\S]*Total: L 600\.00[\s\S]*Ana le paga L 200\.00 a Pedro[\s\S]*bSofía\/b le paga L 200\.00 a Pedro/);
    // Quitar a alguien con movimientos no se permite
    await page.evaluate(id => { abrirModalGrupo(id); document.getElementById('grupo-miembros').value = 'Pedro'; guardarGrupo(); }, g.id);
    assert.match(page.dialogos.pop(), /ya tiene movimientos/);
    assert.deepEqual(page.errores, []);
  });
});
