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
const dia = (d, h = 11) => new Date(2026, 8, d, h, 0).toISOString();
let n = 0; const id = p => p + String(++n).padStart(6, '0');
const g = (cat, amount, d, cuenta = 'efectivo', extra = {}) => Object.assign({ id: id('tx'), type: 'expense', cat, amount, date: dia(d), cuenta, tipo: 'extra' }, extra);
const TC2 = '3f2a9c1e-2222-4a2b-9c3d-000000000002';
const tx = [
  { id: id('tx'), type: 'income', cat: 'Salario', subcat: 'Quincena', amount: 14500, date: dia(15, 8), cuenta: 'ahorro', tipo: 'fijo' },
  g('Comida', 420, 16, 'efectivo', { subcat: 'Baleadas y café' }), g('Supermercado', 1650, 17, 'ahorro', { subcat: 'La Colonia' }),
  g('Transporte', 380, 18, 'efectivo', { subcat: 'Gasolina' }), g('Servicios', 1180, 19, 'ahorro', { subcat: 'ENEE', tipo: 'fijo' }),
  g('Salidas', 950, 20, null, { subcat: 'Cine y cena', tarjetaId: UUID_TC, pago: 'credito' }), g('Comida', 680, 21, 'efectivo', { subcat: 'Almuerzos' }),
  g('Transporte', 260, 22, 'efectivo', { subcat: 'Taxi' }), g('Comida', 1120, 23, null, { subcat: 'Supermercado', tarjetaId: TC2, pago: 'credito' }),
  g('Salidas', 540, 24, 'efectivo', { subcat: 'Cumpleaños' }), g('Servicios', 699, 24, 'ahorro', { subcat: 'Tigo Internet', tipo: 'fijo' }),
  g('Comida', 210, 25, 'efectivo', { subcat: 'Pupusas' }),
  // Primera quincena, para el resumen del mes
  { id: id('tx'), type: 'income', cat: 'Salario', subcat: 'Quincena', amount: 14500, date: dia(1, 8), cuenta: 'ahorro', tipo: 'fijo' },
  g('Casa', 5500, 2, 'ahorro', { subcat: 'Alquiler', tipo: 'fijo' }), g('Supermercado', 1890, 5, 'ahorro'), g('Comida', 760, 8, 'efectivo'),
  g('Transporte', 520, 9, 'efectivo'), g('Salud', 640, 11, 'efectivo', { subcat: 'Farmacia Kielsa' }), g('Salidas', 820, 13, 'efectivo'),
];
const estado = estadoBase({
  nombre: 'María', saldoInicial: 30000, cuentasIniciales: { efectivo: 9000, ahorro: 21000 }, transactions: tx.concat([
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

const CAPS = [
  { f: '01-presupuesto-quincena', t: 'Tu presupuesto <b>por quincena</b>', s: 'Cuánto te queda y cuánto puedes gastar por día',
    prep: async p => { await p.evaluate(() => { elegirPeriodoInicio('quincena'); document.getElementById('presupuestos-card').scrollIntoView(); scrollBy(0, -70); }); } },
  { f: '02-mis-cuentas', t: 'Todas tus <b>cuentas</b>', s: 'Bancos, Tigo Money, plazos fijos y dólares',
    prep: async p => { await p.evaluate(() => { switchView('cuentas'); scrollTo(0, 150); }); } },
  { f: '03-dolar-de-tu-banco', t: 'El <b>dólar</b> de tu banco', s: 'Compra y venta de cada banco, al día',
    prep: async p => { await p.waitForFunction(() => currencyManager.ratesSource === 'json', null, { timeout: 15000 }); await p.evaluate(() => { switchView('config'); openRatesModal(); }); } },
  { f: '04-tarjetas', t: 'Tarjetas <b>sin sorpresas</b>', s: 'Lo que de verdad cuesta pagar solo el mínimo',
    prep: async p => { await p.evaluate(id => { switchView('tarjetas'); abrirSimuladorTarjeta(id); }, UUID_TC); } },
  { f: '05-sal-de-tus-deudas', t: 'Sal de tus <b>deudas</b>', s: 'Tu plan y el mes en que quedas libre',
    prep: async p => { await p.evaluate(() => { switchView('prestamos'); abrirPlanDeudas(); }); await p.waitForTimeout(300); } },
  { f: '06-gastos-compartidos', t: 'Gastos <b>compartidos</b>', s: 'Quién le debe a quién, sin enredos',
    prep: async p => { await p.evaluate(() => { switchView('grupos'); abrirGrupo('grupo001'); scrollTo(0, 150); }); } },
  { f: '07-resumen-del-mes', t: 'Entiende <b>tu mes</b>', s: 'En qué se fue tu pisto, y en PDF',
    prep: async p => { await p.evaluate(() => { switchView('historico'); document.getElementById('resumen-mes-card').scrollIntoView(); scrollBy(0, -70); }); } },
  { f: '08-privado', t: 'Privado y <b>sin anuncios</b>', s: 'Cifrado en tu teléfono. Oculta los montos en público',
    prep: async p => { await p.evaluate(() => { switchView('dashboard'); toggleModoDiscreto(); document.querySelector('.balance-card').scrollIntoView(); scrollBy(0, -70); }); } },
];

(async () => {
  const env = await crearEntorno();
  for (const c of CAPS) {
    const page = await env.pagina({ viewport: { width: 360, height: 600 }, deviceScaleFactor: 3 }, {
      antes: ctx => ctx.route(/tasas\.json/, r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(tasas) })),
    });
    await page.clock.setFixedTime(HOY);
    await sembrar(page, estado);
    await page.evaluate(() => {
      localStorage.setItem('mph_primeros_pasos', 'oculto'); localStorage.setItem('mph_fondo_oculto', '1');
      localStorage.setItem('mph_ultimo_cuadre', new Date().toISOString()); localStorage.setItem('mph_resumen_visto', 'x');
      state.tarjetas[0].beneficios = state.tarjetas[0].beneficios || []; renderAll();
    });
    await page.waitForTimeout(400);
    await c.prep(page);
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SP, c.f + '-raw.png') });
    if (page.errores.length) console.log(c.f, page.errores);
    await page.close();
  }
  // Composición 1080x1920
  const b = env.browser;
  for (const c of CAPS) {
    const img = 'data:image/png;base64,' + fs.readFileSync(path.join(SP, c.f + '-raw.png')).toString('base64');
    const html = `<!doctype html><html><head><style>
      @font-face{font-family:Outfit;src:url(${F}Outfit-Bold.ttf);font-weight:700}
      @font-face{font-family:Outfit;src:url(${F}Outfit-Regular.ttf);font-weight:400}
      html,body{margin:0;width:1080px;height:1920px;overflow:hidden}
      body{background:radial-gradient(120% 60% at 50% 0%,#3A1016 0%,#1C080B 55%,#130507 100%);font-family:Outfit;color:#FFF0E8;position:relative}
      .cab{position:absolute;top:128px;left:80px;right:80px;height:300px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:26px;text-align:center}
      .t{font-weight:700;font-size:82px;line-height:1.02;letter-spacing:-2px}
      .t b{color:#F5C800}
      .s{font-weight:400;font-size:38px;color:rgba(255,240,232,.72);line-height:1.25}
      .tel{position:absolute;top:470px;left:100px;width:880px;height:1500px;border-radius:64px 64px 0 0;background:#0A0304;padding:18px 18px 0;box-sizing:border-box;
        box-shadow:0 0 0 2px rgba(255,240,232,.10),0 -20px 80px rgba(255,68,68,.18)}
      .tel img{width:844px;display:block;border-radius:48px 48px 0 0}
      .acento{position:absolute;top:92px;left:50%;width:64px;height:6px;margin-left:-32px;border-radius:3px;background:#FF4444}
    </style></head><body><div class="acento"></div><div class="cab"><div class="t">${c.t}</div><div class="s">${c.s}</div></div><div class="tel"><img src="${img}"></div></body></html>`;
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
