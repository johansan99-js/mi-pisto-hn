#!/usr/bin/env node
/**
 * Mi Pisto HN — Updater de tasas v3 (con compra/venta)
 * ─────────────────────────────────────────────────────
 * Cambios v3:
 *  ✅ Genera tasas con estructura { bid, ask, mid }
 *      bid = tasa de COMPRA del banco (cuando vendes esa moneda)
 *      ask = tasa de VENTA del banco (cuando compras esa moneda)
 *      mid = tasa media (referencia)
 *  ✅ Intenta primero scrapear BCH (tasa real compra/venta del USD)
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
    const numRegex = /(\d{2}\.\d{2,4})/g;
    const matches = [...html.matchAll(numRegex)]
      .map(m => parseFloat(m[1]))
      .filter(n => n >= USD_HNL_RANGE.min && n <= USD_HNL_RANGE.max);
    if (matches.length < 2) {
      console.warn('  ❌ Insuficientes números en rango USD/HNL');
      return null;
    }
    const sorted = [...new Set(matches)].sort((a, b) => a - b);
    const bid = sorted[0];
    const ask = sorted[sorted.length - 1] !== bid ? sorted[sorted.length - 1] : bid * (1 + DEFAULT_SPREAD * 2);
    if (ask < bid || ask - bid > 1) {
      console.warn('  ⚠️ Spread USD irrazonable, descartando');
      return null;
    }
    console.log('  ✅ BCH oficial: USD bid=' + bid + ', ask=' + ask);
    return { bid: bid, ask: ask, mid: (bid + ask) / 2 };
  } catch (e) {
    console.warn('  ❌ BCH no accesible:', e.message);
    return null;
  }
}

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
  console.log('  Mi Pisto HN — Update Rates v3');
  console.log('  Fecha: ' + new Date().toISOString());
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const apiResult = await getRatesFromApi();
  if (!apiResult) {
    console.error('❌ Ninguna API funcionó');
    process.exit(1);
  }
  const midRates = apiResult.midRates;
  const source = apiResult.source;

  let bchUSD = await tryFetchBCHOfficial();
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
    if ((code === 'USD' || code === 'PAB') && bchUSD) {
      bid = bchUSD.bid;
      ask = bchUSD.ask;
      mid = bchUSD.mid;
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
    note: 'format_version 2: cada moneda tiene { bid, ask, mid }. bid=tasa compra del banco (cuando TÚ vendes esa moneda), ask=tasa venta (cuando TÚ compras). USD usa BCH oficial cuando es accesible; resto deriva con spread 0.5%.',
    source: bchUSD ? ('BCH oficial (USD) + ' + source) : source,
    rates: ratesOut,
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
  console.log('\n✅ Done');
})();
