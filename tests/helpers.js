// Utilidades compartidas: servidor estático, navegador y estado de prueba.
// Playwright solo intercepta las peticiones del service worker con esta
// variable, y hay que fijarla antes de lanzar el navegador.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const LS_KEY = 'mifinanzashn_pro_v20_full';
const UUID_TC = '3f2a9c1e-1111-4a2b-9c3d-000000000001';

function servir() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': TIPOS[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, url: `http://127.0.0.1:${srv.address().port}/` }));
  });
}

function estadoBase(extra = {}) {
  return Object.assign({
    setup: true, nombre: 'Prueba', saldoInicial: 5000,
    cuentas: { efectivo: 0, ahorro: 0 }, cuentasIniciales: { efectivo: 0, ahorro: 0 }, cuentasInicialesV: 2,
    sellosV: 1, eliminados: {},
    transactions: [], goals: [], receivables: [], payables: [], prestamos: [], tarjetas: [],
    pagosRecurrentes: [], transferenciasProgramadas: [],
    budgetRules: { gastos: 65, ahorro: 20, extra: 15 },
  }, extra);
}

// Entorno por archivo de prueba: un servidor y un navegador compartidos.
async function crearEntorno() {
  const { srv, url } = await servir();
  const browser = await chromium.launch();
  return {
    url,
    browser,
    async cerrar() { await browser.close(); srv.close(); },
    /** Página nueva y aislada. `respuestas` es la cola de respuestas a diálogos:
        string para prompt, false para cancelar un confirm, cualquier otra cosa acepta. */
    async pagina(opts = {}, { antes } = {}) {
      const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, acceptDownloads: true }, opts));
      // Sin red externa: CDN, APIs de tasas y Supabase se simulan o se bloquean
      await ctx.route(/cdn\.jsdelivr|cdn\.sheetjs|unpkg|er-api|exchangerate|supabase/, r => r.abort());
      // Rutas propias de la prueba (las registradas después tienen prioridad)
      if (antes) await antes(ctx);
      // Las ventanas propias de la app (js/35-dialogos.js) se contestan con la misma cola
      let pagina = null;
      await ctx.exposeBinding('__dialogoPrueba', (_origen, tipo, mensaje, valor) => {
        const r = pagina.respuestas.shift();
        pagina.dialogos.push(mensaje);
        if (tipo === 'prompt') return r === undefined ? '' : String(r);
        if (tipo === 'confirm') return r !== false;
        return undefined;
      });
      const page = await ctx.newPage();
      pagina = page;
      page.errores = [];
      page.dialogos = [];
      page.respuestas = [];
      page.on('pageerror', e => page.errores.push(e.message));
      page.on('dialog', d => {
        // El aviso de salida no es parte del flujo: no consume respuestas
        if (d.type() === 'beforeunload') return d.accept();
        const r = page.respuestas.shift();
        page.dialogos.push(d.message());
        if (d.type() === 'prompt') d.accept(r === undefined ? '' : String(r));
        else if (r === false) d.dismiss();
        else d.accept();
      });
      await page.goto(url);
      return page;
    },
  };
}

// Guarda un estado en plano (sin PIN) y recarga hasta que la app terminó de cargar
async function sembrar(page, estado) {
  await page.evaluate(([k, e]) => { localStorage.clear(); localStorage.setItem(k, JSON.stringify(e)); }, [LS_KEY, estado]);
  await page.reload();
  await esperarCarga(page);
}

async function esperarCarga(page) {
  await page.waitForFunction(() => {
    const modal = document.getElementById('modal-pin');
    return window.state && (window.state.setup || (modal && getComputedStyle(modal).display === 'flex'));
  }, null, { timeout: 15000 });
  await page.waitForTimeout(300);
}

async function desbloquear(page, pin) {
  await page.fill('#pin-input', pin);
  await page.evaluate(() => verificarPIN());
  await page.waitForFunction(() => window.state.setup || document.getElementById('pin-error').style.display === 'block', null, { timeout: 15000 });
  await page.waitForTimeout(300);
}

// Cliente de Supabase en memoria: una sola fila en `store.row`
const MOCK_SUPABASE = `
window.__mockSupabase = (store) => ({
  from() {
    const q = {
      select() { return q; }, eq() { return q; },
      async maybeSingle() { return { data: store.row ? JSON.parse(JSON.stringify(store.row)) : null, error: null }; },
      upsert(payload) {
        if (payload && payload.ciphertext !== undefined) {
          store.row = Object.assign({}, store.row || {}, payload, { version: ((store.row && store.row.version) || 0) + 1, updated_at: new Date().toISOString() });
        }
        return { select() { return { async single() { return { data: store.row, error: null }; } }; }, then(ok) { ok({ error: null }); } };
      },
    };
    return q;
  },
  async rpc(nombre) {
    store.rpc = nombre;
    if (nombre === 'eliminar_mi_cuenta') { store.row = null; store.cuentaEliminada = true; }
    return { error: null };
  },
  auth: { async signOut() { store.sesionCerrada = true; return { error: null }; } },
});
window.__conectarNube = (store) => {
  cloudSync.client = __mockSupabase(store);
  cloudSync.user = { id: 'u1', email: 'prueba@x.hn' };
  cloudSync.init = async () => true;
  cloudSync.ready = true;
};`;

async function conectarNube(page, row) {
  await page.addScriptTag({ content: MOCK_SUPABASE });
  await page.evaluate(r => { window.__store = { row: r || null }; __conectarNube(__store); }, row || null);
}

module.exports = { crearEntorno, sembrar, esperarCarga, desbloquear, estadoBase, conectarNube, LS_KEY, UUID_TC };
