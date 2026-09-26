// Mi Pisto HN · 39-importar-banco.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.
// ========== IMPORTAR EL ESTADO DE CUENTA DEL BANCO ==========
// Para quien no anota nada durante el mes: sube el Excel o CSV que da la banca
// en línea (BAC, Atlántida, Ficohsa, Banpaís…) y la app anota los movimientos,
// les pone categoría y se salta los que ya estaban. Cada banco usa otras
// columnas, así que se buscan por su nombre (fecha, descripción, débito,
// crédito, monto) y, si no se reconocen, se eligen a mano. Todo se lee en el
// teléfono: el archivo no se sube a ningún lado.

const _IMP_MAX_FILAS = 2000;
let _imp = null; // { filas, cols, encabezado, movimientos }

// ─── Leer el archivo ───────────────────────────────────────────────────
function _csvAFilas(texto) {
  const lineas = String(texto).replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim()).slice(0, _IMP_MAX_FILAS + 40);
  const muestra = lineas.slice(0, 10).join('\n');
  const sep = [';', '\t', ','].sort((a, b) => (muestra.split(b).length) - (muestra.split(a).length))[0];
  return lineas.map(l => {
    const celdas = []; let cur = '', comillas = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (ch === '"') { if (comillas && l[i + 1] === '"') { cur += '"'; i++; } else comillas = !comillas; }
      else if (ch === sep && !comillas) { celdas.push(cur); cur = ''; }
      else cur += ch;
    }
    celdas.push(cur);
    return celdas.map(c => c.trim());
  });
}
async function _leerArchivoBanco(file) {
  if (file.size > 8 * 1024 * 1024) throw new Error('El archivo es muy grande (más de 8 MB).');
  const nombre = (file.name || '').toLowerCase();
  if (/\.(csv|txt)$/.test(nombre) || file.type === 'text/csv') return _csvAFilas(await file.text());
  if (typeof XLSX === 'undefined') throw new Error('Para leer Excel se necesita internet la primera vez. Prueba de nuevo con conexión, o guarda el archivo como CSV.');
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellDates: true });
  const hoja = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(hoja, { header: 1, raw: true, defval: '' }).slice(0, _IMP_MAX_FILAS + 40);
}

// ─── Entender las columnas ─────────────────────────────────────────────
const _IMP_PATRONES = {
  fecha: /^(fecha|date|dia)|fecha (de )?(transacci|operaci|movimiento)/,
  desc: /descrip|concepto|detalle|referencia|comercio|movimiento|transacci|narrat|establecimiento/,
  debito: /debito|cargo|retiro|egreso|salida|^debe$|consumo/,
  credito: /credito|abono|deposito|ingreso|entrada|^haber$|pago recibido/,
  monto: /^(monto|importe|valor|cantidad|amount|total)/,
};
function _detectarColumnas(filas) {
  for (let r = 0; r < Math.min(40, filas.length); r++) {
    const fila = filas[r].map(c => _normCat(c));
    const col = {};
    fila.forEach((c, i) => {
      if (!c || /saldo|balance|disponible/.test(c)) return;
      for (const k of Object.keys(_IMP_PATRONES)) if (col[k] === undefined && _IMP_PATRONES[k].test(c)) { col[k] = i; break; }
    });
    if (col.fecha !== undefined && col.desc !== undefined && (col.monto !== undefined || col.debito !== undefined || col.credito !== undefined)) return { encabezado: r, col };
  }
  return null;
}
const _IMP_MESES = { ene: 0, jan: 0, feb: 1, mar: 2, abr: 3, apr: 3, may: 4, jun: 5, jul: 6, ago: 7, aug: 7, sep: 8, set: 8, oct: 9, nov: 10, dic: 11, dec: 11 };
function _fechaBanco(v) {
  if (v instanceof Date) return isNaN(v) ? null : new Date(v.getFullYear(), v.getMonth(), v.getDate(), 12);
  if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 864e5)); return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12); }
  const s = _normCat(v);
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return _fechaValida(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/); // día primero, como en Honduras
  if (m) return _fechaValida(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1]);
  m = s.match(/^(\d{1,2})[-/. ]([a-z]{3})[a-z]*[-/. ](\d{2,4})/);
  if (m && _IMP_MESES[m[2]] !== undefined) return _fechaValida(m[3].length === 2 ? 2000 + +m[3] : +m[3], _IMP_MESES[m[2]], +m[1]);
  return null;
}
function _fechaValida(y, mes, d) {
  const f = new Date(y, mes, d, 12);
  return f.getFullYear() === y && f.getMonth() === mes && f.getDate() === d && y > 2000 && y < 2100 ? f : null;
}
function _montoBanco(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  let s = String(v || '').trim();
  if (!s) return null;
  const negativo = /^-|^\(.*\)$|-$|\bdb\b|\bcargo\b/i.test(s);
  s = s.replace(/[()\s]/g, '').replace(/^-|-$/g, '').replace(/^(l|lps|hnl|usd|us\$|\$)\.?/i, '').replace(/(l|lps|hnl|usd)$/i, '');
  const n = parseMonto(s);
  return n === null ? null : (negativo ? -n : n);
}

// ─── Convertir filas en movimientos ────────────────────────────────────
const _IMP_INTERNO = /pago (a |de )?(su )?tarjeta|su pago|pago recibido|gracias por su pago|transferencia|traslado|retiro (en )?(cajero|atm)|\batm\b|cajero/i;
function _categoriaDeTexto(desc, tipo) {
  const aprendida = categoriaAprendida(desc, tipo);
  if (aprendida) return aprendida;
  const tt = tipo === 'gasto' ? 'expense' : 'income';
  const deApp = txt => { const x = txt && iconoCategoria(txt, tt); return x && x.n && !x.letra && !x.propia ? x.n : null; };
  const porPalabra = deApp(desc);
  if (porPalabra) return porPalabra;
  // Reglas de comercios del lector de SMS, traducidas a las categorías de la app
  const sms = tipo === 'gasto' && typeof COMERCIOS_SMS !== 'undefined' && COMERCIOS_SMS.find(([re]) => re.test(desc));
  if (sms) return deApp(sms[2]) || deApp(sms[1]) || (sms[1] === 'Alimentación' ? 'Supermercado' : 'Otros');
  return 'Otros';
}
function _movimientosDe(filas, cfg) {
  const { col, encabezado, positivosSon } = cfg, lista = [];
  for (let r = encabezado + 1; r < filas.length && lista.length < _IMP_MAX_FILAS; r++) {
    const f = filas[r] || [];
    const fecha = _fechaBanco(f[col.fecha]);
    const desc = String(f[col.desc] || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!fecha || !desc) continue;
    let tipo = null, monto = null;
    if (col.monto !== undefined && (col.debito === undefined && col.credito === undefined)) {
      const v = _montoBanco(f[col.monto]);
      if (v === null || v === 0) continue;
      tipo = v < 0 ? (positivosSon === 'gastos' ? 'ingreso' : 'gasto') : (positivosSon === 'gastos' ? 'gasto' : 'ingreso');
      monto = Math.abs(v);
    } else {
      const d = col.debito !== undefined ? _montoBanco(f[col.debito]) : null, c = col.credito !== undefined ? _montoBanco(f[col.credito]) : null;
      if (d && Math.abs(d) > 0) { tipo = 'gasto'; monto = Math.abs(d); } else if (c && Math.abs(c) > 0) { tipo = 'ingreso'; monto = Math.abs(c); } else continue;
    }
    monto = Math.round(monto * 100) / 100;
    if (!(monto > 0) || monto > 1e8) continue;
    lista.push({ fecha, desc, tipo, monto, cat: _categoriaDeTexto(desc, tipo), interno: _IMP_INTERNO.test(desc) });
  }
  return lista;
}
/** ¿Ya está anotado? Mismo tipo y monto, en la misma cuenta o tarjeta, con 2 días de diferencia o menos */
function _yaAnotado(m, destino) {
  const tt = m.tipo === 'gasto' ? 'expense' : 'income';
  return (state.transactions || []).some(t => !t.deletedAt && t.type === tt && Math.abs(t.amount - m.monto) < 0.01 &&
    (destino.tarjeta ? String(t.tarjetaId) === String(destino.tarjeta) : t.cuenta === destino.cuenta && !t.tarjetaId) &&
    Math.abs(new Date(t.date) - m.fecha) <= 2.5 * 864e5);
}

// ─── Pantalla ──────────────────────────────────────────────────────────
function abrirImportarBanco() {
  let modal = document.getElementById('modal-importar-banco');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-importar-banco';
    modal.className = 'modal';
    modal.innerHTML = `<div class="modal-content imp-hoja">
      <h3 style="margin-bottom:6px">🏦 Importar estado de cuenta</h3>
      <p class="imp-ayuda">Descarga de tu banca en línea el estado de cuenta en <strong>Excel o CSV</strong> y súbelo aquí. La app anota los movimientos, les pone categoría y se salta los que ya tenías. El archivo se lee en tu teléfono: no se sube a ningún lado.</p>
      <label class="btn btn-primary imp-subir">📂 Elegir el archivo<input type="file" id="imp-archivo" accept=".csv,.txt,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onchange="leerEstadoDeCuenta(this.files[0])" hidden></label>
      <div id="imp-cuerpo"></div>
      <button type="button" class="btn btn-secondary" onclick="closeModal('modal-importar-banco')">Cerrar</button>
    </div>`;
    document.body.appendChild(modal);
  }
  _imp = null;
  document.getElementById('imp-cuerpo').innerHTML = '';
  document.getElementById('imp-archivo').value = '';
  openModal('modal-importar-banco');
}
async function leerEstadoDeCuenta(file) {
  if (!file) return;
  const cuerpo = document.getElementById('imp-cuerpo');
  cuerpo.innerHTML = '<p class="imp-ayuda">Leyendo…</p>';
  try {
    const filas = await _leerArchivoBanco(file);
    const det = _detectarColumnas(filas);
    _imp = { filas, encabezado: det ? det.encabezado : 0, col: det ? det.col : {}, positivosSon: 'gastos', reconocido: !!det };
    if (!filas.length) throw new Error('El archivo está vacío.');
    renderImportar();
  } catch (e) {
    cuerpo.innerHTML = `<p class="imp-error">❌ ${esc(e.message || 'No se pudo leer el archivo.')}</p>`;
  }
}
function _destinoImportar() {
  const v = document.getElementById('imp-destino')?.value || 'efectivo';
  return v.startsWith('tc:') ? { tarjeta: v.slice(3) } : { cuenta: v };
}
function cambiarColumnaImportar(k, v) {
  if (v === '') delete _imp.col[k]; else _imp.col[k] = +v;
  renderImportar(true);
}
function renderImportar(mantenerDestino) {
  if (!_imp) return;
  const cuerpo = document.getElementById('imp-cuerpo');
  const destinoAntes = mantenerDestino ? document.getElementById('imp-destino')?.value : null;
  const enc = _imp.filas[_imp.encabezado] || [];
  const nombreCol = i => (_imp.reconocido && String(enc[i] || '').trim()) || ('Columna ' + (i + 1));
  const nCols = Math.max(...(_imp.filas.slice(0, 20).map(f => f.length)), 0);
  const selCol = (k, texto) => `<label>${texto}<select class="input-field" onchange="cambiarColumnaImportar('${k}', this.value)"><option value="">—</option>${Array.from({ length: nCols }, (_, i) => `<option value="${i}"${_imp.col[k] === i ? ' selected' : ''}>${esc(nombreCol(i))}</option>`).join('')}</select></label>`;
  const opcionesDestino = listaCuentas().map(c => `<option value="${esc(c.id)}">${esc(nombreCompletoCuenta(c))}</option>`).join('') +
    (state.tarjetas || []).map(t => `<option value="tc:${esc(t.id)}">💳 ${esc(t.nombre)}</option>`).join('');
  const listo = _imp.col.fecha !== undefined && _imp.col.desc !== undefined && (_imp.col.monto !== undefined || _imp.col.debito !== undefined || _imp.col.credito !== undefined);
  cuerpo.innerHTML = `
    <label class="imp-lbl">¿De qué cuenta o tarjeta es este estado de cuenta?<select id="imp-destino" class="input-field" onchange="renderImportar(true)">${opcionesDestino}</select></label>
    <details class="imp-cols"${_imp.reconocido ? '' : ' open'}><summary>${_imp.reconocido ? '✅ Columnas reconocidas (tócalo para cambiarlas)' : '⚠️ No reconocí las columnas: elígelas'}</summary>
      <div class="imp-cols-grid">${selCol('fecha', 'Fecha')}${selCol('desc', 'Descripción')}${selCol('debito', 'Débito / cargo')}${selCol('credito', 'Crédito / abono')}${selCol('monto', 'Monto (una sola columna)')}</div>
    </details>
    ${_imp.col.monto !== undefined && _imp.col.debito === undefined && _imp.col.credito === undefined ? `<label class="imp-lbl">En este archivo, los montos sin signo menos son…<select id="imp-signo" class="input-field" onchange="_imp.positivosSon=this.value;renderImportar(true)"><option value="gastos"${_imp.positivosSon === 'gastos' ? ' selected' : ''}>Gastos o compras</option><option value="ingresos"${_imp.positivosSon === 'ingresos' ? ' selected' : ''}>Ingresos o pagos</option></select></label>` : ''}
    <div id="imp-lista"></div>`;
  if (destinoAntes) document.getElementById('imp-destino').value = destinoAntes;
  if (!listo) { document.getElementById('imp-lista').innerHTML = '<p class="imp-ayuda">Elige al menos la fecha, la descripción y el monto (o débito y crédito).</p>'; return; }
  const destino = _destinoImportar();
  _imp.movimientos = _movimientosDe(_imp.filas, _imp).map(m => {
    // En una tarjeta, los abonos son pagos desde otra cuenta: se anotan con "Pagar" (no como ingreso)
    const saltar = destino.tarjeta && m.tipo === 'ingreso';
    const ya = _yaAnotado(m, destino);
    return Object.assign(m, { ya, saltar, marcado: !ya && !saltar && !m.interno });
  });
  renderListaImportar();
}
function renderListaImportar() {
  const el = document.getElementById('imp-lista');
  const ms = _imp.movimientos || [];
  if (!ms.length) { el.innerHTML = '<p class="imp-error">No encontré movimientos con fecha y monto. Revisa las columnas.</p>'; return; }
  const n = ms.filter(m => m.marcado).length;
  el.innerHTML = `<p class="imp-ayuda">${ms.length} movimientos · <strong>${n} por importar</strong>. Los que ya tenías, las transferencias y los pagos de tarjeta vienen sin marcar.</p>
    <div class="imp-filas">${ms.map((m, i) => `<label class="imp-fila${m.marcado ? '' : ' apagada'}">
      <input type="checkbox" ${m.marcado ? 'checked' : ''} onchange="_imp.movimientos[${i}].marcado=this.checked;renderListaImportar()">
      <span class="imp-f">${m.fecha.getDate()}/${m.fecha.getMonth() + 1}</span>
      <span class="imp-d">${esc(m.desc)}<small>${esc(m.cat)}${m.ya ? ' · ya estaba' : m.saltar ? ' · pago a la tarjeta' : m.interno ? ' · parece transferencia' : ''}</small></span>
      <span class="imp-m ${m.tipo === 'gasto' ? 'rojo' : 'verde'}">${m.tipo === 'gasto' ? '-' : '+'}${fL(m.monto)}</span>
    </label>`).join('')}</div>
    <button type="button" class="btn btn-primary" onclick="importarMovimientosBanco()"${n ? '' : ' disabled'}>✅ Importar ${n} ${n === 1 ? 'movimiento' : 'movimientos'}</button>`;
}
async function importarMovimientosBanco() {
  const destino = _destinoImportar(), marcados = (_imp.movimientos || []).filter(m => m.marcado);
  if (!marcados.length) return;
  const tarjeta = destino.tarjeta && (state.tarjetas || []).find(t => String(t.id) === String(destino.tarjeta));
  marcados.forEach(m => {
    const t = { id: uid(), type: m.tipo === 'gasto' ? 'expense' : 'income', amount: m.monto, cat: m.cat, subcat: m.desc, date: m.fecha.toISOString(), importado: true };
    if (m.tipo === 'gasto') t.tipo = _tipoGastoDeCat(m.cat);
    if (tarjeta) Object.assign(t, { pago: 'credito', cuenta: null, tarjetaId: tarjeta.id, tarjetaNombre: tarjeta.nombre });
    else Object.assign(t, { cuenta: destino.cuenta, pago: destino.cuenta });
    state.transactions.push(t);
  });
  await save();
  renderAll();
  closeModal('modal-importar-banco');
  _imp = null;
  avisar(`✅ Se importaron ${marcados.length} movimientos.\nRevisa las categorías en el Inicio: si corriges una, la app la aprende para la próxima vez.`);
}
