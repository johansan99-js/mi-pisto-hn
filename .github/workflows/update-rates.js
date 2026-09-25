#!/usr/bin/env node
/**
 * Mi Pisto HN — Updater de tasas v4 (con compra/venta y tasas de bancos)
 * ─────────────────────────────────────────────────────
 * Cambios v3:
 *  ✅ Genera tasas con estructura { bid, ask, mid }
 *      bid = tasa de COMPRA del banco (cuando vendes esa moneda)
 *      ask = tasa de VENTA del banco (cuando compras esa moneda)
 *      mid = tasa media (referencia)
 *  ✅ v4: lee la compra/venta del dólar de varios bancos (Promerica,
 *     Ficohsa, Occidente, Atlántida, Davivienda) y usa su mediana
 *  ✅ Si ningún banco responde, intenta el BCH (tasa real compra/venta del USD)
 *  ✅ Para otras monedas, deriva bid/ask con spread implícito 0.5%
 *  ✅ Mantiene _legacy_rates_for_compat para clientes antiguos
 *  ✅ Validaciones heredadas: rango USD/HNL, NaN/Infinity, min 4 monedas
 */

const fs = require('fs');
const path = require('path');

const SUPPORTED = ['USD', 'EUR', 'GTQ', 'NIO', 'MXN', 'CRC', 'PAB'];
const USD_HNL_RANGE = { min: 20, max: 35 };
const DEFAULT_SPREAD = 0.0025;

const APIS = [
  'https://open.er-api.com/v6/latest/USD',
  'https://api.exchangerate-api.com/v4/latest/USD'
];

const BCH_URL = 'https://www.bch.hn/estadisticas-y-publicaciones-economicas/tipo-de-cambio-nominal';

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms || 10000);
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'mi-pisto-hn-updater/3.0' }
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r;
  } finally {
    clearTimeout(timer);
  }
}

async function tryFetchBCHOfficial() {
  try {
    console.log('🌐 Intentando BCH oficial...');
    const r = await fetchWithTimeout(BCH_URL, 20000); // el sitio del BCH es lento: con 8 s a veces no respondía
    const html = await r.text();
    const lower = html.toLowerCase();
    if (lower.indexOf('compra') < 0 || lower.indexOf('venta') < 0) {
      console.warn('  ❌ HTML del BCH sin etiquetas compra/venta');
      return null;
    }
    // Primero, el número pegado a "compra" y a "venta" en el texto visible.
    // Antes se tomaba cualquier número en rango de todo el HTML y salía uno
    // viejo (25.20 cuando la tasa del día era ~26.9).
    const texto = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
    const ctx = [...texto.matchAll(/.{0,80}(compra|venta).{0,80}/gi)].slice(0, 6).map(m => m[0].trim());
    console.log('  🔎 Contexto BCH:\n    ' + ctx.join('\n    '));
    const par = texto.match(/compra\D{0,40}(\d{2}\.\d{2,4})\D{0,80}?venta\D{0,40}(\d{2}\.\d{2,4})/i);
    if (par) {
      const bid = parseFloat(par[1]), ask = parseFloat(par[2]);
      if (bid >= USD_HNL_RANGE.min && ask <= USD_HNL_RANGE.max && ask >= bid && ask - bid < 1) {
        console.log('  ✅ BCH oficial (compra/venta juntas): USD bid=' + bid + ', ask=' + ask);
        return { bid: bid, ask: ask, mid: (bid + ask) / 2 };
      }
    }
    // La página del BCH solo trae el título: la tasa del día se carga después
    // con JavaScript desde otro sistema. Tomar "cualquier número en rango"
    // daba cifras que no eran la tasa (25.20), así que sin compra/venta
    // juntas en el texto se usa la referencia del mercado.
    console.warn('  ❌ El HTML del BCH no trae compra/venta del día');
    return null;
  } catch (e) {
    console.warn('  ❌ BCH no accesible:', e.message);
    return null;
  }
}

// ─── Tasas de los bancos ────────────────────────────────────────────────
// Cada banco publica su compra/venta del dólar en su sitio. Se leen las que
// responden sin navegador (BAC y Banpaís bloquean estas consultas).
const UA_NAVEGADOR = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
async function _texto(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms || 15000);
  try {
    const r = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': UA_NAVEGADOR, 'Accept-Language': 'es-HN,es' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.text();
  } finally { clearTimeout(timer); }
}
const _num = s => parseFloat(String(s).replace(/[^\d.]/g, ''));
const _fechaHN = () => { const d = new Date(Date.now() - 6 * 3600e3); return [String(d.getUTCDate()).padStart(2, '0'), String(d.getUTCMonth() + 1).padStart(2, '0'), d.getUTCFullYear()].join('-'); };
const BANCOS = [
  { key: 'promerica', nombre: 'Promerica', async leer() {
    const h = await _texto('https://www.bancopromerica.com/banco-promerica-honduras/seccion-home/fila-tipo-de-cambio/');
    const c = h.match(/tipoCambioCompra\s*=\s*([\d.]+)/), v = h.match(/tipoCambioVenta\s*=\s*([\d.]+)/);
    return c && v ? { compra: _num(c[1]), venta: _num(v[1]) } : null;
  } },
  { key: 'ficohsa', nombre: 'Ficohsa', async leer() {
    const h = await _texto('https://www.ficohsa.hn/');
    const c = h.match(/buys-value value-one[^>]*>\s*L\s*([\d.]+)/), v = h.match(/sale-value value-one[^>]*>\s*L\s*([\d.]+)/);
    return c && v ? { compra: _num(c[1]), venta: _num(v[1]) } : null;
  } },
  { key: 'occidente', nombre: 'Banco de Occidente', async leer() {
    const h = await _texto('https://www.bancodeoccidente.hn/');
    const c = h.match(/id="cusd"[^>]*>\s*([\d.]+)/), v = h.match(/id="vusd"[^>]*>\s*([\d.]+)/);
    return c && v ? { compra: _num(c[1]), venta: _num(v[1]) } : null;
  } },
  { key: 'atlantida', nombre: 'Banco Atlántida', async leer() {
    // El sitio carga este JSON con las tasas por día ("DD-MM-YYYY")
    const j = JSON.parse(await _texto('https://d1s04f7gesr75p.cloudfront.net/tasa-de-cambio-managed.json'));
    const orden = k => { const p = k.split('-'); return p.length === 3 ? +(p[2] + p[1] + p[0]) : -1; };
    const k = j[_fechaHN()] ? _fechaHN() : Object.keys(j).sort((a, b) => orden(b) - orden(a))[0];
    const u = k && j[k] && j[k].USD;
    return u ? { compra: _num(u.compra), venta: _num(u.venta), fecha: k } : null;
  } },
  { key: 'davivienda', nombre: 'Davivienda', async leer() {
    const t = await _texto('https://api.davivienda.com.hn/exchange-rate/hn/v1');
    console.log('  🔎 Davivienda: ' + t.slice(0, 400).replace(/\s+/g, ' '));
    // Formato no documentado: se busca un objeto con compra/venta (o buy/sell) de USD
    let par = null;
    const buscar = o => {
      if (!o || typeof o !== 'object' || par) return;
      const ks = Object.keys(o), k = n => ks.find(x => new RegExp(n, 'i').test(x));
      const kc = k('^(compra|buy|purchase)'), kv = k('^(venta|sell|sale)');
      if (kc && kv && _num(o[kc]) > 20 && _num(o[kv]) > 20 && (!ks.some(x => /moneda|currency|code/i.test(x)) || /USD|D[ÓO]LAR/i.test(JSON.stringify(o)))) par = { compra: _num(o[kc]), venta: _num(o[kv]) };
      ks.forEach(x => buscar(o[x]));
    };
    try { buscar(JSON.parse(t)); } catch (e) { /* no era JSON */ }
    return par;
  } },
];
async function getBankRates(midUSD) {
  const out = {};
  await Promise.all(BANCOS.map(async b => {
    try {
      const r = await b.leer();
      if (!r) { console.warn('  ❌ ' + b.nombre + ': no se encontró la tasa'); return; }
      const ok = r.compra >= USD_HNL_RANGE.min && r.venta <= USD_HNL_RANGE.max && r.venta >= r.compra && r.venta - r.compra < 1 &&
        (!midUSD || Math.abs((r.compra + r.venta) / 2 - midUSD) / midUSD < 0.03);
      if (!ok) { console.warn('  ❌ ' + b.nombre + ': tasa fuera de rango', r); return; }
      out[b.key] = { nombre: b.nombre, bid: r.compra, ask: r.venta };
      console.log('  ✅ ' + b.nombre + ': compra ' + r.compra + ', venta ' + r.venta + (r.fecha ? ' (' + r.fecha + ')' : ''));
    } catch (e) {
      console.warn('  ❌ ' + b.nombre + ': ' + e.message);
    }
  }));
  // Mismo orden siempre, para que el JSON no cambie sin motivo
  const ordenado = {};
  BANCOS.forEach(b => { if (out[b.key]) ordenado[b.key] = out[b.key]; });
  return ordenado;
}
const _mediana = xs => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

async function getRatesFromApi() {
  for (const url of APIS) {
    try {
      console.log('🌐 Probando ' + url + '...');
      const r = await fetchWithTimeout(url);
      const data = await r.json();
      if (!data || !data.rates) {
        console.warn('  ❌ Respuesta sin "rates"');
        continue;
      }
      const usdToHnl = data.rates.HNL;
      if (!usdToHnl || usdToHnl < USD_HNL_RANGE.min || usdToHnl > USD_HNL_RANGE.max) {
        console.warn('  ❌ USD/HNL fuera de rango: ' + usdToHnl);
        continue;
      }
      const midRates = {};
      const missing = [];
      for (const code of SUPPORTED) {
        if (code === 'USD' || code === 'PAB') {
          midRates[code] = usdToHnl;
        } else if (data.rates[code] && data.rates[code] > 0) {
          const calc = usdToHnl / data.rates[code];
          if (!isFinite(calc) || calc <= 0) {
            console.warn('  ⚠️ Inválido para ' + code + ': ' + calc);
            missing.push(code);
            continue;
          }
          midRates[code] = calc;
        } else {
          console.warn('  ⚠️ ' + code + ' no disponible');
          missing.push(code);
        }
      }
      const count = Object.keys(midRates).length;
      if (count < 4) {
        console.warn('  ❌ Solo ' + count + ' tasas válidas (min 4)');
        continue;
      }
      if (missing.length) console.warn('  ⚠️ Faltan [' + missing.join(', ') + '], seguimos con ' + count);
      console.log('  ✅ OK');
      return { midRates: midRates, source: url };
    } catch (e) {
      console.warn('  ❌ ' + e.message);
    }
  }
  return null;
}

(async () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Mi Pisto HN — Update Rates v4');
  console.log('  Fecha: ' + new Date().toISOString());
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const apiResult = await getRatesFromApi();
  if (!apiResult) {
    console.error('❌ Ninguna API funcionó');
    process.exit(1);
  }
  const midRates = apiResult.midRates;
  const source = apiResult.source;

  console.log('🏦 Tasas de los bancos...');
  const bancos = await getBankRates(midRates.USD);
  const nBancos = Object.keys(bancos).length;
  // Con tasas de bancos, el dólar de la app es la mediana de lo que cobran
  // los bancos (la referencia internacional queda ~0.3% por debajo)
  const bancosUSD = nBancos ? {
    bid: _mediana(Object.values(bancos).map(b => b.bid)),
    ask: _mediana(Object.values(bancos).map(b => b.ask))
  } : null;
  if (bancosUSD) bancosUSD.mid = (bancosUSD.bid + bancosUSD.ask) / 2;

  let bchUSD = bancosUSD ? null : await tryFetchBCHOfficial();
  // El scraper toma cualquier número en rango del HTML del BCH, así que puede
  // agarrar una cifra que no es la tasa del día: se contrasta con la API.
  const MAX_DESVIO_BCH = 0.015;
  if (bchUSD) {
    const desvio = Math.abs(bchUSD.mid - midRates.USD) / midRates.USD;
    if (desvio > MAX_DESVIO_BCH) {
      console.warn('  ⚠️ BCH (' + bchUSD.mid.toFixed(4) + ') se desvía ' + (desvio * 100).toFixed(1) +
        '% de la API (' + midRates.USD.toFixed(4) + '), se descarta');
      bchUSD = null;
    }
  }

  const ratesOut = {};
  const legacyRates = {};
  for (const code of SUPPORTED) {
    if (!midRates[code]) continue;
    let bid, ask, mid;
    const usdReal = bancosUSD || bchUSD;
    if ((code === 'USD' || code === 'PAB') && usdReal) {
      bid = usdReal.bid;
      ask = usdReal.ask;
      mid = usdReal.mid;
    } else {
      mid = midRates[code];
      bid = mid * (1 - DEFAULT_SPREAD);
      ask = mid * (1 + DEFAULT_SPREAD);
    }
    if (!isFinite(bid) || !isFinite(ask) || bid <= 0 || ask <= 0) {
      console.error('❌ Inválido para ' + code);
      process.exit(1);
    }
    ratesOut[code] = {
      bid: parseFloat(bid.toFixed(4)),
      ask: parseFloat(ask.toFixed(4)),
      mid: parseFloat(mid.toFixed(4))
    };
    legacyRates[code] = parseFloat(mid.toFixed(4));
  }

  const output = {
    updated_at: new Date().toISOString(),
    base: 'HNL',
    format_version: 2,
    note: 'format_version 2: cada moneda tiene { bid, ask, mid }. bid=tasa compra del banco (cuando TÚ vendes esa moneda), ask=tasa venta (cuando TÚ compras). USD es la mediana de los bancos de "bancos" (o el BCH si ninguno responde); el resto deriva de la referencia internacional con spread 0.5%.',
    source: bancosUSD ? ('Bancos de Honduras (USD) + ' + source) : bchUSD ? ('BCH oficial (USD) + ' + source) : source,
    rates: ratesOut,
    bancos: bancos,
    _legacy_rates_for_compat: legacyRates
  };

  // __dirname es .github/workflows/ — el archivo lo consume la app desde la raíz del repo
  const outPath = path.join(__dirname, '..', '..', 'tasas.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');

  console.log('\n📝 Escrito: ' + outPath);
  console.log('📊 Tasas:');
  for (const code of Object.keys(ratesOut)) {
    const r = ratesOut[code];
    console.log('   ' + code + ': compra L.' + r.bid + ', venta L.' + r.ask + ', media L.' + r.mid);
  }
  for (const k of Object.keys(bancos)) console.log('   🏦 ' + bancos[k].nombre + ': compra L.' + bancos[k].bid + ', venta L.' + bancos[k].ask);
  console.log('\n✅ Done');
})();
