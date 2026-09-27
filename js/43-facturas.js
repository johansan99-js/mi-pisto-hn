// Mi Pisto HN · 43-facturas.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.
// ========== LA FOTO DE LA FACTURA DENTRO DEL GASTO ==========
// Al editar un gasto se ve su factura (tocarla la agranda), y se puede
// agregar, cambiar o quitar. La foto vive cifrada en este dispositivo (IndexedDB).

async function _pintarFacturaEdicion(id) {
  const el = document.getElementById('edit-factura');
  if (!el) return;
  const t = state.transactions.find(x => String(x.id) === String(id));
  if (!t || (t.type !== 'expense' && t.type !== 'income')) { el.innerHTML = ''; return; }
  // En un ingreso la foto es el comprobante (depósito, transferencia); en un gasto, la factura
  const que = t.type === 'income' ? 'del comprobante' : 'de la factura';
  const onchange = `adjuntarFacturaAGasto(event, '${esc(t.id)}')`;
  if (!t.facturaImagenId && !t.facturaImagen) {
    el.innerHTML = `<p class="edit-factura-titulo">🧾 Foto ${que}</p>` + _htmlBotonesFoto('edit-factura-input', onchange, {}, 'edit-factura-agregar');
    return;
  }
  const input = `<input type="file" id="edit-factura-input" accept="image/*" capture="environment" style="display:none" onchange="${onchange}">` +
    `<input type="file" id="edit-factura-input-gal" accept="image/*" style="display:none" onchange="${onchange}">`;
  el.innerHTML = `${input}<div class="edit-factura-caja"><span class="edit-factura-cargando">🧾 Cargando la foto…</span></div>`;
  const img = t.facturaImagenId ? await _obtenerFactura(t.facturaImagenId) : t.facturaImagen;
  if (String(document.getElementById('edit-tx-id').value) !== String(id)) return; // se abrió otro mientras cargaba
  const valida = img && /^data:image\/[a-z0-9.+-]+;base64,/i.test(img);
  el.innerHTML = `${input}<div class="edit-factura-caja">
    ${valida ? `<img src="${img}" alt="Foto ${que}" class="edit-factura-img" onclick="verFactura('${esc(t.id)}')">
    <small>Toca la foto para verla en grande</small>` : '<span class="edit-factura-cargando">🧾 La foto no está en este dispositivo</span>'}
    <div class="edit-factura-botones">
      <label for="edit-factura-input" class="btn btn-secondary">📷 Otra foto</label>
      <label for="edit-factura-input-gal" class="btn btn-secondary">🖼️ Subir otra</label>
      <button type="button" class="btn btn-secondary" onclick="quitarFacturaDeGasto('${esc(t.id)}')">🗑️ Quitar</button>
    </div>
  </div>`;
}

async function adjuntarFacturaAGasto(event, id) {
  const archivo = event.target.files && event.target.files[0];
  event.target.value = '';
  const t = state.transactions.find(x => String(x.id) === String(id));
  if (!archivo || !t) return;
  const foto = await _comprimirImagenParaOCR(archivo);
  const dataURL = await new Promise(res => { const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = () => res(null); r.readAsDataURL(foto); });
  const nuevoId = dataURL && await _guardarTempFactura(dataURL);
  if (!nuevoId) return avisar('❌ No se pudo guardar la foto. Intenta de nuevo.');
  if (t.facturaImagenId) _eliminarFactura(t.facturaImagenId);
  t.facturaImagenId = nuevoId;
  t.facturaImagen = null;
  await save();
  renderAll();
  _pintarFacturaEdicion(id);
  if (typeof avisoRapido === 'function') avisoRapido('🧾 Foto guardada con el gasto');
}

async function quitarFacturaDeGasto(id) {
  const t = state.transactions.find(x => String(x.id) === String(id));
  if (!t) return;
  if (!(await confirmar('¿Quitar la foto de la factura de este gasto?\n\n[Aceptar] = Quitar\n[Cancelar] = Dejarla'))) return;
  if (t.facturaImagenId) _eliminarFactura(t.facturaImagenId);
  t.facturaImagenId = null;
  t.facturaImagen = null;
  await save();
  renderAll();
  _pintarFacturaEdicion(id);
}

const _abrirEdicionTxBase = abrirEdicionTx;
abrirEdicionTx = function (id) {
  const r = _abrirEdicionTxBase.apply(this, arguments);
  _pintarFacturaEdicion(id);
  return r;
};
