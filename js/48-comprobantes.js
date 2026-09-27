// Mi Pisto HN · 48-comprobantes.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.
// ========== EL COMPROBANTE DE UN INGRESO ==========
// El depósito o la transferencia de un cliente suele llegar como foto por WhatsApp
// o Telegram: en "Nuevo ingreso" se adjunta con 📷 Tomar foto o 🖼️ Subir imagen,
// la app lee el monto y la foto queda guardada con el ingreso, igual que la
// factura de un gasto (cifrada, en la nube si está conectada, y se puede ver,
// compartir o descargar después).

let _ingresoFotoId = null;

function _ingresoDecir(t, color) {
  const est = document.getElementById('ingreso-foto-estado');
  if (est) { est.textContent = t || ''; est.style.color = color || 'var(--text2)'; }
}
function _ingresoLimpiarFoto(borrar) {
  if (borrar && _ingresoFotoId) _eliminarFactura(_ingresoFotoId);
  _ingresoFotoId = null;
  _ingresoDecir('');
  const prev = document.getElementById('ingreso-foto-prev');
  if (prev) { prev.style.display = 'none'; prev.removeAttribute('src'); }
}

async function _ingresoElegirFoto(event) {
  const archivo = event.target.files && event.target.files[0];
  event.target.value = '';
  if (!archivo) return;
  _ingresoDecir('🗜️ Guardando el comprobante…');
  const foto = await _comprimirImagenParaOCR(archivo);
  const dataURL = await new Promise(res => { const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = () => res(null); r.readAsDataURL(foto); });
  const id = dataURL && await _guardarTempFactura(dataURL);
  if (!id) return _ingresoDecir('❌ No se pudo guardar la foto. Intenta de nuevo.', 'var(--red)');
  if (_ingresoFotoId) _eliminarFactura(_ingresoFotoId);
  _ingresoFotoId = id;
  const prev = document.getElementById('ingreso-foto-prev');
  if (prev) { prev.src = dataURL; prev.style.display = 'block'; }
  // El monto del comprobante, si el campo está vacío
  try {
    const texto = await _leerTextoFactura(foto, (t, c) => _ingresoDecir(t, c));
    const monto = _montoDeComprobante(texto);
    const campo = document.getElementById('ingreso-monto');
    const llenado = monto > 0 && campo && !parseMonto(campo.value);
    if (llenado) { campo.value = monto.toFixed(2); if (typeof actualizarConversionIngreso === 'function') actualizarConversionIngreso(); }
    _ingresoDecir(monto > 0
      ? `✅ Monto en el comprobante: L. ${monto.toFixed(2)}${llenado ? ' (ya lo puse arriba)' : ''}. Revisa y registra.`
      : '⚠️ No encontré el monto: escríbelo tú. La foto queda guardada con el ingreso.', monto > 0 ? 'var(--green)' : 'var(--aviso)');
  } catch (e) {
    _ingresoDecir('⚠️ No se pudo leer el comprobante (revisa tu internet la primera vez). Escribe el monto: la foto igual queda guardada.', 'var(--aviso)');
  }
}

// Al registrar el ingreso, la foto va con él
if (typeof saveIngreso === 'function') {
  const _saveIngresoSinFoto = saveIngreso;
  saveIngreso = window.saveIngreso = function (opts) {
    const foto = _ingresoFotoId;
    if (!foto) return _saveIngresoSinFoto.apply(this, arguments);
    opts = Object.assign({}, opts || {});
    opts.extra = Object.assign({}, opts.extra || {}, { facturaImagenId: foto });
    const antes = (state.transactions || []).length;
    _ingresoFotoId = null; // para que cerrar la ventana al guardar no la borre
    const r = _saveIngresoSinFoto.call(this, opts);
    if ((state.transactions || []).length > antes) {
      _ingresoLimpiarFoto(false);
      if (typeof sincronizarFotos === 'function') setTimeout(sincronizarFotos, 1500);
    } else _ingresoFotoId = foto; // no se guardó (monto inválido): la foto sigue esperando
    return r;
  };
}

// Si la ventana se cierra sin registrar, la foto que quedó esperando se borra
if (typeof closeModal === 'function') {
  const _closeModalComprobante = closeModal;
  closeModal = window.closeModal = function (id) {
    if (id === 'modal-ingreso' && _ingresoFotoId) _ingresoLimpiarFoto(true);
    return _closeModalComprobante.apply(this, arguments);
  };
}
