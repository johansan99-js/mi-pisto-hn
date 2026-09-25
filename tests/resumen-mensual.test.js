const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase } = require('./helpers');

// Fecha fija: 3 de octubre, primera semana del mes. El "mes pasado" es septiembre.
const HOY = new Date('2026-10-03T12:00:00');
const tx = (id, type, amount, cat, date, extra = {}) => Object.assign({ id, type, amount, cat, cuenta: 'efectivo', date, tipo: 'extra' }, extra);
const estado = () => estadoBase({ nombre: 'Ana', transactions: [
  // Agosto
  tx('a1', 'income', 20000, 'Salario', '2026-08-01T15:00:00'),
  tx('a2', 'expense', 3000, 'Alimentación', '2026-08-05T15:00:00', { tipo: 'fijo' }),
  tx('a3', 'expense', 1000, 'Ocio', '2026-08-10T15:00:00'),
  // Septiembre
  tx('s1', 'income', 20000, 'Salario', '2026-09-01T15:00:00'),
  tx('s2', 'expense', 5000, 'Alimentación', '2026-09-05T15:00:00', { tipo: 'fijo' }),
  tx('s3', 'expense', 900, 'Ocio', '2026-09-12T15:00:00'),
  ...[1, 2, 3, 4, 5, 6].map(i => tx('h' + i, 'expense', 50, 'Café', `2026-09-1${i}T15:00:00`)),
  // No cuentan: transferencia, ajuste de conciliación y un gasto borrado
  tx('t1', 'expense', 7000, 'Transferencia', '2026-09-20T15:00:00', { esTransferencia: true }),
  tx('c1', 'expense', 999, 'Ajuste', '2026-09-21T15:00:00', { esConciliacion: true }),
  tx('d1', 'expense', 888, 'Ocio', '2026-09-22T15:00:00', { deletedAt: '2026-09-23T00:00:00Z' }),
] });

describe('Resumen mensual', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  async function pagina() {
    const page = await env.pagina();
    await page.clock.setFixedTime(HOY);
    await sembrar(page, estado());
    return page;
  }

  it('calcula el mes y arma las frases importantes', async () => {
    const page = await pagina();
    const r = await page.evaluate(() => { const r = calcularResumenMes(2026, 8); return { r, ideas: ideasDelResumen(r) }; });
    assert.deepEqual([r.r.gastos, r.r.ingresos, r.r.sobrante, r.r.gastosPrev, r.r.hormiga.cantidad, r.r.hormiga.total],
      [6200, 20000, 13800, 4000, 6, 300]);
    assert.deepEqual(r.r.top.map(c => c.cat), ['Alimentación', 'Ocio', 'Café']);
    const texto = r.ideas.join('\n');
    assert.match(texto, /Gastaste 55% más que en agosto/);
    assert.match(texto, /Te sobró el 69% de lo que ganaste/);
    assert.match(texto, /Alimentación subió 67%/);
    assert.match(texto, /Gastos hormiga: 6 compras/);
    assert.match(texto, /gastos fijos fueron el 25% de tus ingresos/);
  });

  it('el inicio avisa del resumen en la primera semana y lleva a verlo', async () => {
    const page = await pagina();
    await page.waitForSelector('#aviso-resumen', { state: 'visible' });
    assert.match(await page.textContent('#aviso-resumen'), /resumen de septiembre está listo.*Gastaste L\. ?6,200\.00 y te sobraron L\. ?13,800\.00/s);
    await page.click('#aviso-resumen .btn-secondary');
    assert.equal(await page.isVisible('#view-historico'), true);
    assert.equal(await page.inputValue('#resumen-mes'), '2026-8');
    assert.equal(await page.locator('#resumen-mes-cuerpo .resumen-barra').count(), 3);
    assert.equal(await page.isVisible('#aviso-resumen'), false, 'una vez visto no vuelve a salir');
    await page.reload(); await page.waitForTimeout(800);
    assert.equal(await page.isVisible('#aviso-resumen'), false);
  });

  it('un mes sin movimientos lo dice', async () => {
    const page = await pagina();
    await page.evaluate(() => { document.getElementById('resumen-mes').value = '2026-3'; renderResumenMes(); });
    assert.match(await page.textContent('#resumen-mes-cuerpo'), /No hay movimientos en abril/);
  });

  it('el modo discreto también oculta las cifras del resumen', async () => {
    const page = await pagina();
    const cifras = await page.evaluate(() => {
      document.body.classList.add('modo-discreto');
      document.getElementById('resumen-mes').value = '2026-8'; renderResumenMes();
      return [...document.querySelectorAll('.resumen-cifra strong, .resumen-barra-top span:last-child')].map(e => e.textContent);
    });
    assert.ok(cifras.length > 3);
    for (const c of cifras) assert.doesNotMatch(c.replace(/\d+%$/, ''), /\d/, c);
  });
});
