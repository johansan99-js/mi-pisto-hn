// Mi Pisto HN · 45-adjuntos-deudas.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.
// ========== DESCRIPCIÓN Y FACTURA EN "ME DEBEN", "DEBO" Y PRÉSTAMOS ==========
// Igual que en los gastos: se toma la foto del recibo, del pagaré o de la factura,
// la app lee el total (si el monto está vacío lo llena) y la foto queda guardada
// con esa cuenta, cifrada (y en la nube si está conectada). Además, cada una
// lleva una descripción: de qué es ese dinero.

const _ADJ = {
  cobrar: { modal: 'modal-cobrar', lista: 'receivables', monto: 'cobrar-monto', editar: 'editarCobrar', eliminar: 'eliminarCobrar', render: 'renderCobrar', guardar: 'saveCobrar', nombre: x => x.persona,
    ejemplo: 'Ej. le presté para el pasaje, le vendí el celular' },
  pagar: { modal: 'modal-pagar', lista: 'payables', monto: 'pagar-monto', editar: 'editarPagar', eliminar: 'eliminarPagar', render: 'renderPagar', guardar: 'savePagar', nombre: x => x.creditor,
    ejemplo: 'Ej. la refri a crédito, préstamo para la moto' },
  prestamo: { modal: 'modal-prestamo', lista: 'prestamos', monto: 'prest-monto', editar: 'editarPrestamo', eliminar: 'eliminarPrestamo', render: 'renderPrestamos', guardar: 'savePrestamo', nombre: x => x.entidad,
    ejemplo: 'Ej. para el carro, los estudios, la casa' },
};
const _adjPend = {}; // foto tomada en el formulario que todavía no se guardó

const _adjItem = (k, id) => (state[_ADJ[k].lista] || []).find(x => String(x.id) === String(id));
const _adjDataURL = blob => new Promise(res => { const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = () => res(null); r.readAsDataURL(blob); });

/** Bloque de descripción + foto dentro del formulario de nueva cuenta */
function _adjBloque(k) {
  const modal = document.getElementById(_ADJ[k].modal);
  if (!modal || document.getElementById('adj-' + k)) return;
  const caja = modal.querySelector('.modal-content');
  const antes = caja && caja.querySelector('.btn-primary');
  if (!antes) return;
  const div = document.createElement('div');
  div.id = 'adj-' + k;
  div.className = 'adj-bloque';
  div.innerHTML = `<label for="adj-${k}-desc" class="adj-label">📝 Descripción (¿de qué es?)</label>
    <textarea id="adj-${k}-desc" class="input-field adj-desc-input" maxlength="200" rows="2" placeholder="${esc(_ADJ[k].ejemplo)}"></textarea>
    <input type="file" id="adj-${k}-foto" accept="image/*" capture="environment" style="display:none" onchange="_adjElegirFoto('${k}', event)">
    <label for="adj-${k}-foto" class="btn btn-secondary adj-foto-btn">📸 Foto del recibo, pagaré o factura</label>
    <p id="adj-${k}-estado" class="adj-estado"></p>
    <img id="adj-${k}-prev" class="adj-prev" alt="Foto adjunta" style="display:none">`;
  antes.before(div);
}
function _adjLimpiar(k) {
  const pend = _adjPend[k];
  if (pend) { _eliminarFactura(pend); delete _adjPend[k]; }
  const desc = document.getElementById('adj-' + k + '-desc'); if (desc) desc.value = '';
  const est = document.getElementById('adj-' + k + '-estado'); if (est) est.textContent = '';
  const prev = document.getElementById('adj-' + k + '-prev'); if (prev) { prev.style.display = 'none'; prev.removeAttribute('src'); }
}

async function _adjElegirFoto(k, event) {
  const archivo = event.target.files && event.target.files[0];
  event.target.value = '';
  if (!archivo) return;
  const est = document.getElementById('adj-' + k + '-estado');
  const decir = (t, color) => { if (est) { est.textContent = t; est.style.color = color || 'var(--text2)'; } };
  decir('🗜️ Guardando la foto…');
  const foto = await _comprimirImagenParaOCR(archivo);
  const dataURL = await _adjDataURL(foto);
  const id = dataURL && await _guardarTempFactura(dataURL);
  if (!id) return decir('❌ No se pudo guardar la foto. Intenta de nuevo.', 'var(--red)');
  if (_adjPend[k]) _eliminarFactura(_adjPend[k]);
  _adjPend[k] = id;
  const prev = document.getElementById('adj-' + k + '-prev');
  if (prev) { prev.src = dataURL; prev.style.display = 'block'; }
  // Leer el total y el comercio, como en los gastos
  try {
    const texto = await _leerTextoFactura(foto, (t, c) => decir(t, c));
    const monto = _montoDeFactura(texto);
    const { subcatAsignada } = _comercioDeFactura(texto);
    const campo = document.getElementById(_ADJ[k].monto);
    const llenado = monto > 0 && campo && !leerMonto(campo.value);
    if (llenado) campo.value = monto.toFixed(2);
    const desc = document.getElementById('adj-' + k + '-desc');
    if (subcatAsignada && desc && !desc.value.trim()) desc.value = 'Factura de ' + subcatAsignada;
    decir(monto > 0 ? `✅ Total en la foto: L. ${monto.toFixed(2)}${llenado ? ' (ya lo puse en el monto)' : ''}. La foto queda guardada.` : '⚠️ No encontré el total: escríbelo tú. La foto queda guardada.', monto > 0 ? 'var(--green)' : 'var(--aviso)');
  } catch (e) {
    decir('⚠️ No se pudo leer la foto (revisa tu internet la primera vez). Igual queda guardada.', 'var(--aviso)');
  }
}

/** Al guardar la cuenta nueva, se le pegan la descripción y la foto */
function _adjAplicar(k, item) {
  const desc = (document.getElementById('adj-' + k + '-desc')?.value || '').trim().slice(0, 200);
  if (desc) item.descripcion = desc;
  if (_adjPend[k]) { item.facturaImagenId = _adjPend[k]; delete _adjPend[k]; }
  _adjLimpiar(k);
}

// ── En la lista: la descripción, ver la factura, agregar o cambiar ──────
function _adjDecorar(k) {
  const cfg = _ADJ[k];
  (state[cfg.lista] || []).forEach(x => {
    const boton = document.querySelector(`[onclick*="${cfg.editar}('${x.id}')"]`);
    const card = boton && boton.closest('.card');
    if (!card || card.querySelector('.adj-info')) return;
    const div = document.createElement('div');
    div.className = 'adj-info';
    div.innerHTML = (x.descripcion ? `<p class="adj-desc">📝 ${esc(x.descripcion)}</p>` : '') +
      `<div class="adj-acciones">
        ${x.facturaImagenId ? `<button type="button" onclick="_adjVer('${k}','${esc(x.id)}')">🧾 Ver factura</button>` : ''}
        <button type="button" onclick="_adjEditarDescripcion('${k}','${esc(x.id)}')">📝 ${x.descripcion ? 'Editar descripción' : 'Agregar descripción'}</button>
        <button type="button" onclick="_adjFotoDeCuenta('${k}','${esc(x.id)}')">📸 ${x.facturaImagenId ? 'Cambiar foto' : 'Adjuntar factura'}</button>
      </div>`;
    card.appendChild(div);
  });
}

async function _adjEditarDescripcion(k, id) {
  const x = _adjItem(k, id);
  if (!x) return;
  const nueva = await preguntar('📝 ¿De qué es? (' + _ADJ[k].nombre(x) + ')', x.descripcion || '');
  if (nueva === null) return;
  x.descripcion = String(nueva).trim().slice(0, 200);
  if (!x.descripcion) delete x.descripcion;
  await save();
  renderAll();
}

function _adjFotoDeCuenta(k, id) {
  let input = document.getElementById('adj-cuenta-foto');
  if (!input) {
    input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.id = 'adj-cuenta-foto';
    input.setAttribute('capture', 'environment');
    input.style.display = 'none';
    input.onchange = e => _adjGuardarFotoDeCuenta(e);
    document.body.appendChild(input);
  }
  input.dataset.k = k;
  input.dataset.id = id;
  input.click();
}
async function _adjGuardarFotoDeCuenta(event) {
  const input = event.target, archivo = input.files && input.files[0];
  const { k, id } = input.dataset;
  input.value = '';
  const x = archivo && _adjItem(k, id);
  if (!x) return;
  const dataURL = await _adjDataURL(await _comprimirImagenParaOCR(archivo));
  const nuevo = dataURL && await _guardarTempFactura(dataURL);
  if (!nuevo) return avisar('❌ No se pudo guardar la foto. Intenta de nuevo.');
  if (x.facturaImagenId) _eliminarFactura(x.facturaImagenId);
  x.facturaImagenId = nuevo;
  await save();
  renderAll();
  if (typeof avisoRapido === 'function') avisoRapido('🧾 Factura guardada');
}

async function _adjVer(k, id) {
  const x = _adjItem(k, id);
  if (!x || !x.facturaImagenId) return;
  const img = await _obtenerFactura(x.facturaImagenId);
  if (!img || !/^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+$/i.test(img)) return avisar('🧾 La foto no está disponible en este dispositivo.');
  document.getElementById('visor-factura')?.remove();
  const visor = document.createElement('div');
  visor.id = 'visor-factura';
  visor.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:100000;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:20px;gap:12px';
  visor.innerHTML = `<img src="${img}" alt="Factura" style="max-width:100%;max-height:78vh;border-radius:8px;background:#fff">
    <div style="color:#fff;font-size:13px;text-align:center">${esc(_ADJ[k].nombre(x))}${x.descripcion ? ' · ' + esc(x.descripcion) : ''}</div>
    <div style="display:flex;gap:8px">
      <button type="button" class="btn btn-danger" style="width:auto;margin:0" onclick="_adjQuitarFoto('${k}','${esc(x.id)}')">🗑️ Quitar foto</button>
      <button type="button" class="btn btn-secondary" style="width:auto;margin:0" onclick="document.getElementById('visor-factura').remove()">✕ Cerrar</button>
    </div>`;
  visor.onclick = e => { if (e.target === visor) visor.remove(); };
  document.body.appendChild(visor);
}
async function _adjQuitarFoto(k, id) {
  const x = _adjItem(k, id);
  if (!x || !(await confirmar('¿Quitar la foto de la factura?\n\n[Aceptar] = Quitar\n[Cancelar] = Dejarla'))) return;
  document.getElementById('visor-factura')?.remove();
  if (x.facturaImagenId) _eliminarFactura(x.facturaImagenId);
  delete x.facturaImagenId;
  await save();
  renderAll();
}

// ── Enganches ───────────────────────────────────────────────────────────
Object.keys(_ADJ).forEach(k => {
  const cfg = _ADJ[k];
  _adjBloque(k);
  // Guardar: si se creó una cuenta nueva, lleva la descripción y la foto
  const guardarBase = window[cfg.guardar];
  if (typeof guardarBase === 'function') {
    window[cfg.guardar] = function () {
      const antes = (state[cfg.lista] || []).length;
      const r = guardarBase.apply(this, arguments);
      const lista = state[cfg.lista] || [];
      if (lista.length > antes) { _adjAplicar(k, lista[lista.length - 1]); save(); renderAll(); }
      return r;
    };
  }
  // Borrar la cuenta borra también su foto
  const eliminarBase = window[cfg.eliminar];
  if (typeof eliminarBase === 'function') {
    window[cfg.eliminar] = async function (id) {
      const foto = (_adjItem(k, id) || {}).facturaImagenId;
      const r = await eliminarBase.apply(this, arguments);
      if (foto && !_adjItem(k, id)) _eliminarFactura(foto);
      return r;
    };
  }
  const renderBase = window[cfg.render];
  if (typeof renderBase === 'function') {
    window[cfg.render] = function () { const r = renderBase.apply(this, arguments); _adjDecorar(k); return r; };
  }
});
// Al abrir el formulario para una cuenta nueva, el bloque empieza vacío
const _openModalAdj = openModal;
openModal = function (id) {
  const k = Object.keys(_ADJ).find(x => _ADJ[x].modal === id);
  if (k) { _adjBloque(k); _adjLimpiar(k); }
  return _openModalAdj.apply(this, arguments);
};
