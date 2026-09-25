// Capturas para la ficha de Play Store (1080x1920): la pantalla real de la
// app con datos de ejemplo y un título arriba. Para rehacerlas después de
// cambiar la app:  node play-store/generar-capturas.js
// (usa el mismo servidor y navegador de las pruebas; los datos son ficticios)
const fs = require('fs');
const path = require('path');
const os = require('os');
const { crearEntorno, sembrar, estadoBase, UUID_TC } = require('../tests/helpers');
const SP = fs.mkdtempSync(path.join(os.tmpdir(), 'capturas-'));
const OUT = path.join(__dirname, 'capturas-ficha');
const F = 'file://' + path.join(__dirname, 'fuentes') + '/';
const HOY = new Date(2026, 8, 25, 18, 30);
const dia = (d, h = 11, m = 8) => new Date(2026, m, d, h, 0).toISOString();
let n = 0; const id = p => p + String(++n).padStart(6, '0');
const g = (cat, amount, d, cuenta = 'efectivo', extra = {}, m = 8) => Object.assign({ id: id('tx'), type: 'expense', cat, amount, date: dia(d, 11, m), cuenta, tipo: 'extra' }, extra);
const TC2 = '3f2a9c1e-2222-4a2b-9c3d-000000000002';
const tx = [
  { id: id('tx'), type: 'income', cat: 'Salario', subcat: 'Quincena', amount: 14500, date: dia(15, 8), cuenta: 'ahorro', tipo: 'fijo' },
  g('Comida', 420, 16, 'efectivo', { subcat: 'Baleadas y café' }), g('Supermercado', 1650, 17, 'ahorro', { subcat: 'La Colonia' }),
  g('Gasolina', 380, 18, 'efectivo', { subcat: 'Puma' }), g('Luz', 1180, 19, 'ahorro', { subcat: 'ENEE', tipo: 'fijo' }),
  g('Salidas', 950, 20, null, { subcat: 'Cine y cena', tarjetaId: UUID_TC, pago: 'credito' }), g('Comida', 680, 21, 'efectivo', { subcat: 'Almuerzos' }),
  g('Transporte', 260, 22, 'efectivo', { subcat: 'Taxi' }), g('Supermercado', 1120, 23, null, { subcat: 'PriceSmart', tarjetaId: TC2, pago: 'credito' }),
  g('Salidas', 540, 24, 'efectivo', { subcat: 'Cumpleaños' }), g('Internet y teléfono', 699, 24, 'ahorro', { subcat: 'Tigo', tipo: 'fijo' }),
  g('Pupusas', 210, 25, 'efectivo', { subcat: 'Doña Tere' }),
  // Agosto, para comparar en Análisis
  g('Comida', 2100, 8, 'efectivo', {}, 7), g('Supermercado', 2900, 6, 'ahorro', {}, 7), g('Salidas', 1900, 16, 'efectivo', {}, 7), g('Gasolina', 900, 12, 'efectivo', {}, 7), g('Luz', 1240, 19, 'ahorro', { tipo: 'fijo' }, 7),
  // Primera quincena, para el resumen del mes
  { id: id('tx'), type: 'income', cat: 'Salario', subcat: 'Quincena', amount: 14500, date: dia(1, 8), cuenta: 'ahorro', tipo: 'fijo' },
  g('Alquiler', 5500, 2, 'ahorro', { subcat: 'Colonia Kennedy', tipo: 'fijo' }), g('Supermercado', 1890, 5, 'ahorro'), g('Comida', 760, 8, 'efectivo'),
  g('Transporte', 520, 9, 'efectivo'), g('Salud', 640, 11, 'efectivo', { subcat: 'Farmacia Kielsa' }), g('Salidas', 820, 13, 'efectivo'),
];
const estado = estadoBase({
  nombre: 'María', saldoInicial: 36000, cuentasIniciales: { efectivo: 15000, ahorro: 21000 }, transactions: tx.concat([
    { id: 'sini0001', type: 'income', amount: 24500, cat: 'Saldo inicial', subcat: 'Saldo inicial de BAC · Nómina', cuenta: 'cta00001', tipo: 'fijo', esConciliacion: true, esSaldoInicial: true, date: dia(1, 7) },
    { id: 'sini0002', type: 'income', amount: 60000, cat: 'Saldo inicial', subcat: 'Saldo inicial de Banco Atlántida · Plazo fijo', cuenta: 'cta00002', tipo: 'fijo', esConciliacion: true, esSaldoInicial: true, date: dia(1, 7) },
    { id: 'sini0003', type: 'income', amount: 850, cat: 'Saldo inicial', subcat: 'Saldo inicial de Tigo Money · Billetera', cuenta: 'cta00003', tipo: 'fijo', esConciliacion: true, esSaldoInicial: true, date: dia(1, 7) },
    { id: 'sini0004', type: 'income', amount: 32271.6, montoUSD: 1200, cat: 'Saldo inicial', subcat: 'Saldo inicial de BAC · Dólares', cuenta: 'cta00004', tipo: 'fijo', esConciliacion: true, esSaldoInicial: true, date: dia(1, 7) },
  ]),
  misCuentas: [
    { id: 'cta00001', nombre: 'Nómina', grupo: 'BAC', tipo: 'ahorro', icono: '🏦', color: '#EA4335', tasaAnual: 0 },
    { id: 'cta00002', nombre: 'Plazo fijo', grupo: 'Banco Atlántida', tipo: 'plazo', icono: '📈', color: '#34A853', tasaAnual: 6.5 },
    { id: 'cta00003', nombre: 'Billetera', grupo: 'Tigo Money', tipo: 'billetera', icono: '📱', color: '#00ACC1', tasaAnual: 0 },
    { id: 'cta00004', nombre: 'Dólares', grupo: 'BAC', tipo: 'ahorro', icono: '🏦', color: '#A142F4', tasaAnual: 0, moneda: 'USD' },
  ],
  tarjetas: [
    { id: UUID_TC, nombre: 'BAC Visa Oro', ultimos4: '4821', corte: 20, pago: 5, limite: 40000, saldo: 8500, saldoBase: 7550, tasaInteres: 48, calcularMinimo: true, historialPagos: [],
      beneficios: [{ id: 'benef001', tipo: 'cashback', valor: 3, categoria: 'Supermercado' }] },
    { id: TC2, nombre: 'Ficohsa Mastercard', ultimos4: '1936', corte: 5, pago: 25, limite: 25000, saldo: 3200, saldoBase: 2080, tasaInteres: 54, calcularMinimo: true, historialPagos: [] },
  ],
  prestamos: [{ id: 'prest001', entidad: 'Banco Atlántida · Moto', monto: 45000, tasaInteres: 22, cuota: 2335.55, cuotasPagadas: 8, cuotasTotal: 24 }],
  payables: [
    { id: 'deuda001', creditor: 'BAC Credomatic', tipo: 'banco', monto: 20000, pagado: 6500, fecha: '2026-06-10', vence: '2027-06-10' },
    { id: 'deuda002', creditor: 'Tía Rosa', tipo: 'persona', monto: 1500, pagado: 500, fecha: '2026-09-01', vence: '2026-10-15' },
  ],
  goals: [{ id: 'meta0001', nombre: 'Viaje a Roatán', objetivo: 12000, actual: 7400 }],
  categorias: [{ id: 'cate0001', nombre: 'Pupusas', tipo: 'gasto', icono: '🍕', color: '#FB8C00', fijo: false }],
  presupuestos: [
    { id: 'pres0001', cat: 'Comida', monto: 3000, periodo: 'quincena' },
    { id: 'pres0002', cat: 'Transporte', monto: 1200, periodo: 'quincena' },
    { id: 'pres0003', cat: 'Salidas', monto: 1400, periodo: 'quincena' },
  ],
  grupos: [{ id: 'grupo001', nombre: 'Viaje a Roatán', creado: dia(10), miembros: [{ id: 'miem0001', nombre: 'Luis' }, { id: 'miem0002', nombre: 'Sofía' }],
    gastos: [
      { id: 'ggas0001', desc: 'Hotel en West Bay', cat: 'Viaje', monto: 6300, pagadoPor: 'yo', partes: { yo: 2100, miem0001: 2100, miem0002: 2100 }, fecha: dia(12), txIds: [] },
      { id: 'ggas0002', desc: 'Ferry', cat: 'Transporte', monto: 2430, pagadoPor: 'miem0001', partes: { yo: 810, miem0001: 810, miem0002: 810 }, fecha: dia(13), txIds: [] },
      { id: 'ggas0003', desc: 'Cena de mariscos', cat: 'Comida', monto: 1950, pagadoPor: 'miem0002', partes: { yo: 650, miem0001: 650, miem0002: 650 }, fecha: dia(14), txIds: [] },
    ], pagos: [] }],
});
const tasas = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tasas.json'), 'utf8'));

// tema: el de la app en esa captura. La pantalla es de 360x610 (lo que cabe en el teléfono dibujado)
const irA = sel => `window.scrollTo(0, document.querySelector('${sel}').getBoundingClientRect().top + scrollY - 64)`;
const CAPS = [
  { f: '01-inicio-por-dia', tema: 'claro', t: 'Tu mes, <b>día por día</b>', s: 'Cada gasto con su categoría, de un vistazo',
    prep: async p => { await p.evaluate(irA('#registros-mes')); } },
  { f: '02-registra-en-segundos', tema: 'claro', t: 'Anota en <b>3 toques</b>', s: 'Monto, cuenta y categoría con su propio teclado',
    prep: async p => { await p.evaluate(() => { abrirRegistro('gasto'); ['1', '5', '0', '+', '9', '5'].forEach(teclaRegistro); elegirCatRegistro('Comida'); document.getElementById('reg-nota').value = 'Baleadas y café'; }); } },
  { f: '03-analisis', tema: 'oscuro', t: '¿En qué se fue <b>tu pisto</b>?', s: 'Toca la dona y compara con el mes pasado',
    prep: async p => { await p.evaluate(() => { switchView('historico'); elegirSegmentoAnalisis('Supermercado'); }); await p.evaluate(irA('#analisis')); } },
  { f: '04-presupuestos', tema: 'claro', t: 'Presupuesto <b>por quincena</b>', s: 'Te avisa antes de pasarte y cuánto te queda por día',
    prep: async p => { await p.evaluate(() => { switchView('presupuestos'); periodoPresupuestos('quincena'); }); await p.evaluate(irA('#presupuestos-vista')); } },
  { f: '05-cuentas-y-tarjetas', tema: 'oscuro', t: 'Cuentas y <b>tarjetas</b>', s: 'Bancos, Tigo Money, dólares y lo que debes',
    prep: async p => { await p.evaluate(() => switchView('cuentas')); await p.evaluate(() => { const g = [...document.querySelectorAll('#cuentas-contenido .deuda-grupo')]; const tc = g.find(x => /Tarjetas/.test(x.textContent)); window.scrollTo(0, tc.getBoundingClientRect().top + scrollY - 330); }); } },
  { f: '06-dolar-de-tu-banco', tema: 'claro', t: 'El <b>dólar</b> de tu banco', s: 'Compra y venta de cada banco, al día',
    prep: async p => { await p.waitForFunction(() => currencyManager.ratesSource === 'json', null, { timeout: 15000 }); await p.evaluate(() => { switchView('config'); openRatesModal(); }); } },
  { f: '07-sal-de-tus-deudas', tema: 'oscuro', t: 'Sal de tus <b>deudas</b>', s: 'Tu plan y el mes en que quedas libre',
    prep: async p => { await p.evaluate(() => { switchView('prestamos'); abrirPlanDeudas(); }); await p.waitForTimeout(300); } },
  // La última junta el mismo Inicio en los dos temas
  { f: '08-claro-u-oscuro', dos: true, t: 'Claro u <b>oscuro</b>', s: 'Sin anuncios y cifrada en tu teléfono',
    prep: async p => { await p.evaluate(() => { document.querySelector('.balance-card').scrollIntoView(); scrollBy(0, -70); }); } },
];
const COLORES = {
  claro: { fondo: 'linear-gradient(180deg,#FFFFFF 0%,#EAF5EE 55%,#D9EEE1 100%)', texto: '#0F3D2A', acento: '#0A8F4E', sub: 'rgba(15,61,42,.68)', marco: '#FFFFFF', borde: 'rgba(15,61,42,.10)', sombra: 'rgba(10,143,78,.22)' },
  oscuro: { fondo: 'radial-gradient(120% 60% at 50% 0%,#0F3B25 0%,#07170F 55%,#000 100%)', texto: '#F2F5F3', acento: '#22C55E', sub: 'rgba(242,245,243,.70)', marco: '#0B0B0B', borde: 'rgba(255,255,255,.10)', sombra: 'rgba(34,197,94,.25)' },
};

async function tomar(env, c, tema, nombre) {
  const page = await env.pagina({ viewport: { width: 360, height: c.dos ? 1070 : 610 }, deviceScaleFactor: 3, colorScheme: tema === 'claro' ? 'light' : 'dark' }, {
    antes: ctx => ctx.route(/tasas\.json/, r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(tasas) })),
  });
  await page.clock.setFixedTime(HOY);
  await sembrar(page, estado);
  await page.evaluate(t => {
    localStorage.setItem('mph_primeros_pasos', 'oculto'); localStorage.setItem('mph_fondo_oculto', '1');
    localStorage.setItem('mph_ultimo_cuadre', new Date().toISOString()); localStorage.setItem('mph_resumen_visto', 'x');
    elegirTema(t); renderAll();
  }, tema);
  await page.waitForTimeout(400);
  await c.prep(page);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SP, nombre + '-raw.png') });
  if (page.errores.length) console.log(nombre, page.errores);
  await page.close();
}

(async () => {
  const env = await crearEntorno();
  for (const c of CAPS) {
    if (c.dos) { await tomar(env, c, 'claro', c.f + '-claro'); await tomar(env, c, 'oscuro', c.f + '-oscuro'); }
    else await tomar(env, c, c.tema, c.f);
  }
  const ave = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, '..', 'guacamaya.png')).toString('base64');
  const b64 = n => 'data:image/png;base64,' + fs.readFileSync(path.join(SP, n + '-raw.png')).toString('base64');
  const b = env.browser;
  for (const c of CAPS) {
    const k = COLORES[c.dos ? 'oscuro' : c.tema];
    const tel = (img, estilo, col) => `<div class="tel" style="${estilo};background:${col.marco};box-shadow:0 0 0 2px ${col.borde},0 -20px 80px ${col.sombra}"><img src="${img}"></div>`;
    const telefonos = c.dos
      ? tel(b64(c.f + '-claro'), 'left:60px;width:470px;top:520px;height:1400px;border-radius:44px 44px 0 0;padding:12px 12px 0', COLORES.claro)
        + tel(b64(c.f + '-oscuro'), 'left:550px;width:470px;top:520px;height:1400px;border-radius:44px 44px 0 0;padding:12px 12px 0', COLORES.oscuro)
      : tel(b64(c.f), 'left:100px;width:880px;top:470px;height:1500px;border-radius:64px 64px 0 0;padding:18px 18px 0', k);
    const html = `<!doctype html><html><head><style>
      @font-face{font-family:Outfit;src:url(${F}Outfit-Bold.ttf);font-weight:700}
      @font-face{font-family:Outfit;src:url(${F}Outfit-Regular.ttf);font-weight:400}
      html,body{margin:0;width:1080px;height:1920px;overflow:hidden}
      body{background:${k.fondo};font-family:Outfit;color:${k.texto};position:relative}
      .ave{position:absolute;top:60px;left:50%;width:110px;height:110px;margin-left:-55px}
      .cab{position:absolute;top:170px;left:70px;right:70px;height:270px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:22px;text-align:center}
      .t{font-weight:700;font-size:82px;line-height:1.02;letter-spacing:-2px}
      .t b{color:${k.acento}}
      .s{font-weight:400;font-size:38px;color:${k.sub};line-height:1.25}
      .tel{position:absolute;box-sizing:border-box;overflow:hidden}
      .tel img{width:100%;display:block;border-radius:inherit}
    </style></head><body><img class="ave" src="${ave}"><div class="cab"><div class="t">${c.t}</div><div class="s">${c.s}</div></div>${telefonos}</body></html>`;
    fs.writeFileSync(path.join(SP, c.f + '.html'), html);
    const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
    await p.goto('file://' + path.join(SP, c.f + '.html'));
    await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(200);
    await p.screenshot({ path: path.join(OUT, c.f + '.png') });
    await p.close();
  }
  await env.cerrar();
  console.log('Capturas en ' + OUT);
})();
