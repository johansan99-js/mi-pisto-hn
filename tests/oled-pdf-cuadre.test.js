// Modo OLED, reporte del mes en PDF y aviso semanal para cuadrar cuentas
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno, sembrar, estadoBase } = require('./helpers');

const HOY = new Date(2026, 8, 25, 12, 0);
const dia = d => new Date(2026, 8, d, 10, 0).toISOString();
const movs = n => Array.from({ length: n }, (_, i) => ({ id: 'mov' + String(i).padStart(5, '0'), type: 'expense', amount: 100 + i, cat: i % 2 ? 'Comida' : 'Transporte', date: dia(1 + i), cuenta: 'efectivo', tipo: 'extra' }));

describe('OLED, PDF y cuadrar cuentas', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('el modo OLED pone el fondo en negro puro y se mantiene al recargar', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase());
    await page.evaluate(() => { switchView('config'); document.querySelector('#cfg-temas [onclick="elegirTema(\'oled\')"]').click(); });
    const fondo = () => page.evaluate(() => [document.documentElement.classList.contains('oled'), getComputedStyle(document.body).backgroundColor, document.querySelector('meta[name="theme-color"]').content]);
    assert.deepEqual(await fondo(), [true, 'rgb(0, 0, 0)', '#000000']);
    await page.reload(); await page.waitForTimeout(600);
    assert.deepEqual(await fondo(), [true, 'rgb(0, 0, 0)', '#000000']);
    await page.evaluate(() => elegirTema('normal'));
    assert.equal((await fondo())[0], false);
  });

  it('los temas blanco, negro y turquesa cambian toda la paleta y se recuerdan', async () => {
    const page = await env.pagina();
    await sembrar(page, estadoBase());
    const colores = () => page.evaluate(() => {
      const bg = sel => getComputedStyle(document.querySelector(sel)).backgroundColor;
      return { tema: document.documentElement.dataset.tema || 'clasico', body: getComputedStyle(document.body).backgroundColor, texto: getComputedStyle(document.body).color, meta: document.querySelector('meta[name="theme-color"]').content, activo: document.querySelector('#cfg-temas .tema-op.activo')?.textContent.trim() };
    });
    await page.evaluate(() => switchView('config'));
    assert.equal((await colores()).activo, 'Clásico');
    await page.evaluate(() => elegirTema('blanco'));
    assert.deepEqual(await colores(), { tema: 'blanco', body: 'rgb(243, 245, 248)', texto: 'rgb(17, 24, 39)', meta: '#FFFFFF', activo: 'Blanco pro' });
    await page.evaluate(() => elegirTema('negro'));
    assert.equal((await colores()).body, 'rgb(13, 17, 23)');
    await page.evaluate(() => elegirTema('turquesa'));
    const t = await colores();
    assert.equal(t.body, 'rgb(6, 24, 28)');
    // El botón principal toma el acento turquesa
    assert.match(await page.evaluate(() => { const b = document.createElement('button'); b.className = 'btn btn-primary'; document.body.appendChild(b); const v = getComputedStyle(b).backgroundColor; b.remove(); return v; }), /rgb\(46, 196, 182\)/);
    await page.reload(); await page.waitForTimeout(600);
    assert.equal((await colores()).tema, 'turquesa', 'se aplica antes de pintar al volver a abrir');
    assert.deepEqual(page.errores, []);
  });

  it('el reporte del mes trae totales, categorías, cuentas y movimientos, y abre imprimir', async () => {
    const page = await env.pagina();
    await page.clock.setFixedTime(HOY);
    await sembrar(page, estadoBase({ nombre: 'Ana', cuentasIniciales: { efectivo: 10000, ahorro: 0 }, transactions: movs(4).concat([{ id: 'ing00001', type: 'income', amount: 9000, cat: 'Salario', date: dia(15), cuenta: 'efectivo' }]), payables: [{ id: 'deuda01', creditor: 'Tía Rosa', monto: 1000, pagado: 0 }] }));
    await page.evaluate(() => { window.__impreso = 0; window.print = () => { window.__impreso++; window.__clase = document.body.classList.contains('imprimiendo'); window.__titulo = document.title; }; toggleModoDiscreto(); switchView('historico'); imprimirReporteMes(); });
    await page.waitForFunction(() => window.__impreso === 1);
    assert.deepEqual(await page.evaluate(() => [window.__clase, window.__titulo]), [true, 'Mi Pisto HN - septiembre 2026']);
    const txt = await page.textContent('#reporte-imprimible');
    assert.match(txt, /Reporte de septiembre 2026[\s\S]*Ana/);
    assert.match(txt, /Ingresos\s*L 9,000\.00\s*Gastos\s*L 406\.00\s*Te sobró\s*L 8,594\.00/, 'con montos completos aunque esté el modo discreto');
    assert.match(txt, /Transporte\s*50%\s*L 202\.00/);
    assert.match(txt, /Tus cuentas hoy[\s\S]*Efectivo\s*L 18,594\.00[\s\S]*Lo que debes hoy[\s\S]*Tía Rosa\s*L 1,000\.00/);
    assert.match(txt, /Movimientos \(5\)/);
    assert.equal(await page.evaluate(() => document.body.classList.contains('imprimiendo')), true, 'sigue listo mientras el diálogo de imprimir está abierto');
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    assert.deepEqual(await page.evaluate(() => [document.body.classList.contains('imprimiendo'), document.title]), [false, 'Mi Pisto HN · Tu dinero, tu control']);
  });

  it('cada semana invita a cuadrar las cuentas; un ajuste o "Ya cuadran" lo quita', async () => {
    const page = await env.pagina();
    await page.clock.setFixedTime(HOY);
    await sembrar(page, estadoBase({ transactions: movs(6) }));
    assert.equal(await page.isVisible('#aviso-cuadre'), true);
    assert.match(await page.textContent('#aviso-cuadre'), /¿Cuadran tus cuentas\?/);
    await page.evaluate(() => marcarCuadre());
    assert.equal(await page.isVisible('#aviso-cuadre'), false);
    // Pocos movimientos todavía: no molesta (página nueva: al recargar, la app guarda lo anterior)
    const p2 = await env.pagina();
    await p2.clock.setFixedTime(HOY);
    await sembrar(p2, estadoBase({ transactions: movs(3) }));
    assert.equal(await p2.isVisible('#aviso-cuadre'), false);
    // Un ajuste de saldo reciente cuenta como cuadre
    const p3 = await env.pagina();
    await p3.clock.setFixedTime(HOY);
    await sembrar(p3, estadoBase({ transactions: movs(6).concat([{ id: 'conc0001', type: 'income', amount: 5, cat: 'Conciliación', date: dia(24), cuenta: 'efectivo', esConciliacion: true }]) }));
    assert.equal(await p3.isVisible('#aviso-cuadre'), false);
  });
});
