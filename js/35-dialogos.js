// Mi Pisto HN · 35-dialogos.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.
// ========== VENTANAS PROPIAS EN VEZ DE alert / confirm / prompt ==========
// Las del navegador se ven feas, dicen "La página dice…", bloquean todo y en
// algunos teléfonos traen la casilla "No permitir más diálogos". Estas usan el
// diseño de la app y devuelven promesas:
//   await avisar('Listo')                     → undefined
//   await confirmar('¿Borrar?')               → true / false
//   await preguntar('¿Cuánto?', '100')        → texto, o null si cancela
// En un confirm, las líneas "[Aceptar] = X" y "[Cancelar] = Y" se vuelven los
// nombres de los botones.

let _colaDialogos = Promise.resolve();

function _abrirDialogo(tipo, mensaje, valor) {
  const tarea = _colaDialogos.then(() => _mostrarDialogo(tipo, String(mensaje === undefined ? '' : mensaje), valor));
  _colaDialogos = tarea.catch(() => {});
  return tarea;
}

function _mostrarDialogo(tipo, mensaje, valor) {
  // Las pruebas automáticas contestan desde afuera
  if (typeof window.__dialogoPrueba === 'function') return window.__dialogoPrueba(tipo, mensaje, valor === undefined ? '' : String(valor));
  return new Promise(resolver => {
    let si = tipo === 'alert' ? 'Entendido' : 'Aceptar', no = 'Cancelar';
    if (tipo === 'confirm') {
      const mSi = mensaje.match(/\[Aceptar\]\s*=\s*([^\n]+)/i), mNo = mensaje.match(/\[Cancelar\]\s*=\s*([^\n]+)/i);
      if (mSi) si = mSi[1].trim();
      if (mNo) no = mNo[1].trim();
      mensaje = mensaje.replace(/\n?\[(Aceptar|Cancelar)\]\s*=[^\n]*/gi, '').trim();
    }
    const peligro = tipo === 'confirm' && /eliminar|borrar|vaciar|peligro|no se puede deshacer|quitar|archivar/i.test(mensaje);
    // En lo que borra, el botón dice qué hace
    if (peligro && si === 'Aceptar') si = (mensaje.match(/\b(borrar|vaciar|quitar|archivar)\b/i) || [, 'eliminar'])[1].replace(/^./, c => c.toUpperCase());
    const esPIN = tipo === 'prompt' && /\bPIN\b/.test(mensaje) && !/recuperaci/i.test(mensaje);
    const esMonto = tipo === 'prompt' && !esPIN && (/^-?[\d.,]+$/.test(String(valor || '')) || /¿cuánto|monto|saldo|cuota/i.test(mensaje));
    // Primera línea como título si el mensaje es largo
    const lineas = mensaje.split('\n');
    const titulo = lineas.length > 2 && lineas[0].length <= 70 ? lineas.shift() : '';
    const cuerpo = lineas.join('\n').replace(/^\n+/, '');

    const capa = document.createElement('div');
    capa.id = 'dialogo-app';
    capa.className = 'dlg-capa';
    capa.setAttribute('role', tipo === 'alert' ? 'alertdialog' : 'dialog');
    capa.setAttribute('aria-modal', 'true');
    capa.innerHTML = `<div class="dlg-caja${peligro ? ' dlg-peligro' : ''}">
      ${titulo ? `<div class="dlg-titulo">${esc(titulo)}</div>` : ''}
      ${cuerpo ? `<div class="dlg-texto">${esc(cuerpo)}</div>` : ''}
      ${tipo === 'prompt' ? `<input class="input-field dlg-input" autocomplete="off" ${esPIN ? 'type="password" inputmode="numeric" maxlength="8"' : esMonto ? 'type="text" inputmode="decimal"' : 'type="text"'}>` : ''}
      <div class="dlg-botones">
        ${tipo === 'alert' ? '' : `<button type="button" class="btn btn-secondary dlg-no">${esc(no)}</button>`}
        <button type="button" class="btn ${peligro ? 'btn-danger' : 'btn-primary'} dlg-si">${esc(si)}</button>
      </div>
    </div>`;
    const input = capa.querySelector('.dlg-input');
    if (input) input.value = valor === undefined || valor === null ? '' : String(valor);
    const antes = document.activeElement;
    const cerrar = r => {
      document.removeEventListener('keydown', tecla, true);
      capa.remove();
      try { if (antes && antes.focus && document.contains(antes)) antes.focus(); } catch (e) {}
      resolver(r);
    };
    const aceptar = () => cerrar(tipo === 'prompt' ? input.value : tipo === 'confirm' ? true : undefined);
    const cancelar = () => cerrar(tipo === 'prompt' ? null : tipo === 'confirm' ? false : undefined);
    const tecla = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelar(); }
      else if (e.key === 'Enter' && (tipo !== 'prompt' || e.target === input)) { e.preventDefault(); e.stopPropagation(); aceptar(); }
    };
    capa.querySelector('.dlg-si').onclick = aceptar;
    const bNo = capa.querySelector('.dlg-no');
    if (bNo) bNo.onclick = cancelar;
    // Tocar afuera solo cierra un aviso (en una pregunta sería fácil perder lo escrito)
    capa.addEventListener('click', e => { if (e.target === capa && tipo === 'alert') cancelar(); });
    document.addEventListener('keydown', tecla, true);
    document.body.appendChild(capa);
    const enfocar = () => { const el = input || capa.querySelector('.dlg-si'); if (document.activeElement !== el) { el.focus(); if (input) input.select(); } };
    enfocar();
    setTimeout(enfocar, 30);
  });
}

function avisar(mensaje) { return _abrirDialogo('alert', mensaje); }
function confirmar(mensaje) { return _abrirDialogo('confirm', mensaje).then(r => r === true); }
function preguntar(mensaje, valor) { return _abrirDialogo('prompt', mensaje, valor).then(r => r === null || r === undefined ? null : String(r)); }

// Todos los alert() viejos pasan a la ventana propia (no bloquea: quien
// necesite esperar a que se cierre usa await avisar()).
window.alert = mensaje => { avisar(mensaje); };
