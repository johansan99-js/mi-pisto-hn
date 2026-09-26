const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { crearEntorno } = require('./helpers');

const CDN = [
  'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js',
];
// El CDN real no está disponible en las pruebas: se responde con JS vacío
const cdnFalso = ctx => ctx.route(/cdn\.jsdelivr|cdn\.sheetjs/, r => r.fulfill({
  status: 200, contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: '/* prueba */',
}));

async function conServiceWorker(env) {
  const page = await env.pagina({}, { antes: cdnFalso });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(async n => {
    const c = await caches.open((await caches.keys())[0]);
    return (await c.keys()).filter(r => r.url.startsWith('https')).length >= n;
  }, CDN.length, { timeout: 15000, polling: 300 });
  return page;
}

describe('Service worker y modo sin conexión', () => {
  let env;
  before(async () => { env = await crearEntorno(); });
  after(async () => { await env.cerrar(); });

  it('las librerías del CDN que declara index.html se guardan al instalar', async () => {
    // Si alguien cambia la versión en index.html, también debe cambiarla en sw.js
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    for (const url of CDN) assert.ok(html.includes(`src="${url}"`), `index.html ya no carga ${url}`);
    const page = await conServiceWorker(env);
    const guardadas = await page.evaluate(async () => {
      const c = await caches.open((await caches.keys())[0]);
      return (await c.keys()).map(r => r.url).filter(u => u.startsWith('https')).sort();
    });
    assert.deepEqual(guardadas, [...CDN].sort());
  });

  it('sin conexión sirve las librerías y las tasas guardadas, sin inventar datos', async () => {
    const page = await conServiceWorker(env);
    await page.context().route(/.*/, r => r.abort()); // se cae la red por completo
    const r = await page.evaluate(async urls => {
      const libs = await Promise.all(urls.map(u => fetch(u, { mode: 'cors' }).then(x => x.status, () => 'error')));
      const tasas = await (await fetch('./tasas.json?d=2099-01-01')).json(); // un día que nunca se pidió
      return { libs, error: tasas.error || null, usd: typeof tasas.rates.USD };
    }, CDN);
    assert.deepEqual(r, { libs: CDN.map(() => 200), error: null, usd: 'object' });
  });

  it('la app abre sin conexión desde la caché', async () => {
    const page = await conServiceWorker(env);
    await page.context().route(/.*/, r => r.abort());
    await page.reload();
    assert.match(await page.title(), /Mi Pisto HN/);
  });

  it('"Reintentar" en la página offline vuelve a la app y no a otra ruta', () => {
    const offline = fs.readFileSync(path.join(__dirname, '..', 'offline.html'), 'utf8');
    assert.match(offline, /const APP_ROOT = '\.\/';/);
  });
});
