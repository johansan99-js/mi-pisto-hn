// Mi Pisto HN · 00-config.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.
window.TESSERACT_CONFIG = {
  workerPath: 'https://unpkg.com/tesseract.js@4.0.2/dist/worker.min.js',
  langPath: 'https://tessdata.projectnaptha.com/4.0.0',
  corePath: 'https://unpkg.com/tesseract.js-core@4.0.2/tesseract-core.wasm.js'
};
