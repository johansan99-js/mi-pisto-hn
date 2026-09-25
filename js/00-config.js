// Mi Pisto HN · 00-config.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.
window.TESSERACT_CONFIG = {
  workerPath: 'https://unpkg.com/tesseract.js@4.0.2/dist/worker.min.js',
  langPath: 'https://tessdata.projectnaptha.com/4.0.0',
  corePath: 'https://unpkg.com/tesseract.js-core@4.0.2/tesseract-core.wasm.js'
};
// Tema antes de pintar para que no parpadee (ver TEMAS en 20-extras.js)
try {
  const _g = localStorage.getItem('mph_tema');
  const _t = _g === 'claro' || _g === 'blanco' ? 'claro'
    : ['oscuro', 'oled', 'negro', 'turquesa'].includes(_g) ? 'oscuro'
    : (window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 'claro' : 'oscuro');
  document.documentElement.dataset.tema = _t;
  const _m = document.querySelector('meta[name="theme-color"]');
  if (_m) _m.setAttribute('content', _t === 'claro' ? '#FFFFFF' : '#000000');
} catch (e) {}
