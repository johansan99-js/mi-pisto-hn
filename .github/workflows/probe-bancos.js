// Sonda temporal (2): contexto de las tasas en cada banco
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36', 'Accept-Language': 'es-HN,es' };
async function get(u, ms) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms || 25000);
  try { const r = await fetch(u, { signal: c.signal, headers: UA }); const s = await r.text(); console.log('HTTP ' + r.status + ' len=' + s.length + ' final=' + r.url); return s; }
  catch (e) { console.log('ERR ' + e.message + (e.cause ? ' ' + e.cause.code + ' ' + e.cause.message : '')); return ''; }
  finally { clearTimeout(t); }
}
const ctx = (s, re, n, a, b) => [...s.matchAll(re)].slice(0, n || 6).map(m => s.slice(Math.max(0, m.index - (a || 150)), m.index + (b || 250)).replace(/\s+/g, ' '));
(async () => {
  console.log('\n===== FICOHSA'); let s = await get('https://www.ficohsa.hn/');
  console.log(ctx(s, /gff-indicadores-divisas-v1__(buys|sale|date)/g, 8, 60, 300).join('\n---\n'));
  console.log('\n===== ATLANTIDA JS'); s = await get('https://d3jy0vxpchhipv.cloudfront.net/Scripts/js/home/tasa-de-cambio.min.js');
  console.log(s.slice(0, 3000));
  s = await get('https://bancatlan.hn/');
  console.log(ctx(s, /tasascambiowr|dolar-compra"|tasacambio/g, 5, 200, 400).join('\n---\n'));
  console.log('\n===== DAVIVIENDA'); s = await get('https://www.davivienda.com.hn/banco');
  console.log(ctx(s, /exchangeRate/gi, 6, 100, 300).join('\n---\n'));
  console.log('\n===== LAFISE'); s = await get('https://www.lafise.com/blh/');
  console.log(ctx(s, /_tasa_container|tasa|compra/gi, 6, 100, 400).join('\n---\n'));
  for (const u of ['https://www.banpais.hn/', 'https://www.banpais.hn/divisas/barradolar.php', 'http://www.banpais.hn/divisas/barradolar.php']) {
    console.log('\n===== ' + u); s = await get(u); console.log(ctx(s, /2[5-8]\.\d{2,4}/g, 6, 150, 60).join('\n---\n'));
  }
  for (const u of ['https://www.baccredomatic.com/es-hn/personas', 'https://www.baccredomatic.com/es-hn', 'https://www.baccredomatic.com/es-hn/tipo-de-cambio']) {
    console.log('\n===== ' + u); s = await get(u, 40000); console.log(ctx(s, /2[5-8]\.\d{2,4}|tipo.de.cambio|exchange/gi, 8, 150, 150).join('\n---\n'));
  }
  console.log('\n===== BCH'); s = await get('https://www.bch.hn/', 40000); console.log(ctx(s, /2[5-8]\.\d{4}/g, 6, 200, 60).join('\n---\n'));
})();
