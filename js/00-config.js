// Mi Pisto HN · 00-config.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.
window.TESSERACT_CONFIG = {
  workerPath: 'https://unpkg.com/tesseract.js@4.0.2/dist/worker.min.js',
  langPath: 'https://tessdata.projectnaptha.com/4.0.0',
  corePath: 'https://unpkg.com/tesseract.js-core@4.0.2/tesseract-core.wasm.js'
};
// Tema antes de pintar para que no parpadee (ver TEMAS en 20-extras.js)
try {
  const _t = localStorage.getItem('mph_tema');
  if (['negro', 'blanco', 'turquesa', 'oled'].includes(_t)) {
    document.documentElement.dataset.tema = _t;
    if (_t === 'oled') document.documentElement.classList.add('oled');
    const _m = document.querySelector('meta[name="theme-color"]');
    if (_m) _m.setAttribute('content', { negro: '#0D1117', blanco: '#FFFFFF', turquesa: '#06181C', oled: '#000000' }[_t]);
  }
} catch (e) {}
