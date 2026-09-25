// Sonda temporal: qué traen las páginas de los bancos
const URLS = process.argv.slice(2).length ? process.argv.slice(2) : [
  'https://www.bancopromerica.com/banco-promerica-honduras/seccion-home/fila-tipo-de-cambio/',
  'https://www.bancopromerica.com/',
  'https://www.banpais.hn/divisas/barradolar.php',
  'https://www.bancatlan.hn/',
  'https://www.ficohsa.com/hn/',
  'https://www.bancodeoccidente.hn/',
  'https://www.baccredomatic.com/es-hn',
  'https://www.davivienda.com.hn/',
  'https://www.lafise.com/blh/',
  'https://www.bancoazteca.com.hn/',
];
(async () => {
  for (const u of URLS) {
    console.log('\n===== ' + u);
    try {
      const c = new AbortController(); const t = setTimeout(() => c.abort(), 20000);
      const r = await fetch(u, { signal: c.signal, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36', 'Accept-Language': 'es-HN,es' } });
      clearTimeout(t);
      const html = await r.text();
      console.log('HTTP ' + r.status + ' len=' + html.length + ' final=' + r.url);
      const nums = [...html.matchAll(/.{0,120}\b2[4-8][.,]\d{2,4}\b.{0,60}/g)].slice(0, 12).map(m => m[0].replace(/\s+/g, ' '));
      console.log('NUMS:\n  ' + nums.join('\n  '));
      const urls = [...new Set([...html.matchAll(/["'(]([^"'()\s]*(?:cambio|divisa|tasa|exchange|rate|dolar)[^"'()\s]*)["')]/gi)].map(m => m[1]))].slice(0, 25);
      console.log('URLS:\n  ' + urls.join('\n  '));
    } catch (e) { console.log('ERR ' + e.message); }
  }
})();
