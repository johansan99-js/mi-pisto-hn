// Mi Pisto HN · 17-compartidos.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.

// ═══ GASTOS COMPARTIDOS ═══════════════════════════════════════════════════
// Grupos (casa, pareja, un viaje) donde cada gasto lo paga alguien y se
// divide entre varios. La app lleva quién le debe a quién y propone la
// menor cantidad de pagos para quedar a mano.
//
// En tus cuentas y reportes solo cuenta TU parte:
//   · Pagaste tú: tu parte es un gasto; lo que adelantaste por los demás
//     sale de la cuenta como movimiento interno (te lo deben, no es gasto).
//   · Pagó otro: tu parte es un gasto sin cuenta (todavía no sale dinero).
//   · Saldar: pagar o cobrar lo pendiente es un movimiento interno.
// "Tú" es el miembro con id 'yo'; los demás son solo nombres.
const YO = 'yo';
const CATS_COMPARTIDO = ['Comida', 'Supermercado', 'Casa', 'Servicios', 'Transporte', 'Salidas', 'Viaje', 'Otros'];
const _c2 = n => Math.round(n * 100) / 100;
const grupoPorId = id => (state.grupos || []).find(g => g.id === id);
const nombreMiembro = (g, id) => id === YO ? 'Tú' : ((g.miembros || []).find(m => m.id === id) || {}).nombre || '¿?';
const idsMiembros = g => [YO].concat((g.miembros || []).map(m => m.id));

/** Saldo de cada miembro: positivo = le deben, negativo = debe */
function saldosGrupo(g) {
  const s = {};
  idsMiembros(g).forEach(id => { s[id] = 0; });
  (g.gastos || []).forEach(e => {
    if (s[e.pagadoPor] !== undefined) s[e.pagadoPor] += e.monto;
    Object.entries(e.partes || {}).forEach(([id, m]) => { if (s[id] !== undefined) s[id] -= m; });
  });
  (g.pagos || []).forEach(p => {
    if (s[p.de] !== undefined) s[p.de] += p.monto;
    if (s[p.a] !== undefined) s[p.a] -= p.monto;
  });
  Object.keys(s).forEach(k => { s[k] = _c2(s[k]); });
  return s;
}

/** Menor cantidad de pagos para quedar a mano: el que más debe le paga al que más le deben */
function pagosParaSaldar(saldos) {
  const deben = [], reciben = [];
  Object.entries(saldos).forEach(([id, v]) => {
    if (v < -0.005) deben.push({ id, v: -v });
    else if (v > 0.005) reciben.push({ id, v });
  });
  deben.sort((a, b) => b.v - a.v); reciben.sort((a, b) => b.v - a.v);
  const out = [];
  let i = 0, j = 0;
  while (i < deben.length && j < reciben.length) {
    const m = _c2(Math.min(deben[i].v, reciben[j].v));
    if (m > 0.005) out.push({ de: deben[i].id, a: reciben[j].id, monto: m });
    deben[i].v = _c2(deben[i].v - m); reciben[j].v = _c2(reciben[j].v - m);
    if (deben[i].v <= 0.005) i++;
    if (reciben[j].v <= 0.005) j++;
  }
  return out;
}

/** Partes iguales en centavos: los centavos que sobran van a los primeros */
function partesIguales(monto, ids) {
  const cent = Math.round(monto * 100), base = Math.floor(cent / ids.length), resto = cent - base * ids.length;
  const p = {};
  ids.forEach((id, k) => { p[id] = (base + (k < resto ? 1 : 0)) / 100; });
  return p;
}

// ─── Vista ──────────────────────────────────────────────────────────────
let _grupoAbierto = null;
function renderGrupos() {
  const c = document.getElementById('grupos-contenido');
  if (!c) return;
  const g = _grupoAbierto && grupoPorId(_grupoAbierto);
  if (g) return _renderDetalleGrupo(c, g);
  _grupoAbierto = null;
  const grupos = state.grupos || [];
  if (!grupos.length) {
    c.innerHTML = `<div class="empty-state-simple"><div class="es-icon">👨‍👩‍👧</div><div class="es-title">Divide gastos con otros</div>
      <div class="es-sub">Crea un grupo para la casa, tu pareja o un viaje. Anota quién pagó y la app calcula quién le debe a quién. En tus reportes solo cuenta tu parte.</div>
      <button class="btn-empty-secondary" onclick="abrirModalGrupo()">➕ Crear grupo</button></div>`;
    return;
  }
  let meDeben = 0, debo = 0;
  const filas = grupos.map(gr => {
    const yo = saldosGrupo(gr)[YO];
    if (yo > 0) meDeben += yo; else debo -= yo;
    const estado = yo > 0.005 ? `<span style="color:var(--green)">Te deben ${fL(yo)}</span>`
      : yo < -0.005 ? `<span style="color:var(--red)">Debes ${fL(-yo)}</span>` : '<span style="color:var(--text2)">Están a mano ✅</span>';
    return `<button class="card grupo-fila" onclick="abrirGrupo('${esc(gr.id)}')">
      <div style="min-width:0"><div style="font-weight:700;font-size:15px;overflow:hidden;text-overflow:ellipsis">${esc(gr.nombre)}</div>
      <div style="font-size:11px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Tú, ${(gr.miembros || []).map(m => esc(m.nombre)).join(', ')}</div></div>
      <div style="font-size:13px;font-weight:700;text-align:right;white-space:nowrap">${estado}</div></button>`;
  }).join('');
  c.innerHTML = `<div class="card" style="background:linear-gradient(135deg,var(--bg2),var(--bg3));display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:14px">
      <div><div style="font-size:11px;color:var(--text2)">TE DEBEN</div><div style="font-size:17px;font-weight:800;color:var(--green);white-space:nowrap">${fL(meDeben)}</div></div>
      <div><div style="font-size:11px;color:var(--text2)">DEBES</div><div style="font-size:17px;font-weight:800;color:var(--red);white-space:nowrap">${fL(debo)}</div></div>
      <button class="btn btn-primary" style="width:auto;padding:10px 14px;margin:0" onclick="abrirModalGrupo()">➕ Grupo</button>
    </div>` + filas;
}
function abrirGrupo(id) { _grupoAbierto = id; renderGrupos(); }
function cerrarGrupo() { _grupoAbierto = null; renderGrupos(); }

function _renderDetalleGrupo(c, g) {
  const saldos = saldosGrupo(g), sugeridos = pagosParaSaldar(saldos), id = esc(g.id);
  const total = (g.gastos || []).reduce((a, e) => a + e.monto, 0);
  const miParte = (g.gastos || []).reduce((a, e) => a + ((e.partes || {})[YO] || 0), 0);
  const saldoHtml = idsMiembros(g).map(m => {
    const v = saldos[m];
    return `<div class="grupo-saldo"><span>${m === YO ? '🙋 ' : '👤 '}${esc(nombreMiembro(g, m))}</span><strong style="color:${v > 0.005 ? 'var(--green)' : v < -0.005 ? 'var(--red)' : 'var(--text2)'}">${v > 0.005 ? 'le deben ' + fL(v) : v < -0.005 ? 'debe ' + fL(-v) : 'a mano'}</strong></div>`;
  }).join('');
  const saldarHtml = sugeridos.length ? sugeridos.map((p, k) =>
    `<div class="grupo-pago"><span><strong>${esc(nombreMiembro(g, p.de))}</strong> ${p.de === YO ? 'le pagas' : 'le paga'} <strong>${fL(p.monto)}</strong> a <strong>${esc(p.a === YO ? 'ti' : nombreMiembro(g, p.a))}</strong></span>
      <button class="btn btn-secondary" style="width:auto;padding:6px 12px;margin:0;font-size:12px" onclick="abrirPagoGrupo('${id}',${k})">Registrar</button></div>`).join('')
    : '<p style="font-size:13px;color:var(--text2);text-align:center;margin:6px 0">✅ Todos están a mano.</p>';
  const movs = [].concat(
    (g.gastos || []).map(e => ({ tipo: 'gasto', f: e.fecha, e })),
    (g.pagos || []).map(p => ({ tipo: 'pago', f: p.fecha, p }))
  ).sort((a, b) => new Date(b.f) - new Date(a.f));
  const fecha = f => new Date(f).toLocaleDateString('es-HN', { day: 'numeric', month: 'short' });
  const movsHtml = movs.length ? movs.map(m => m.tipo === 'gasto'
    ? `<div class="grupo-mov"><div style="min-width:0"><div style="font-weight:600;overflow:hidden;text-overflow:ellipsis">${esc(m.e.desc)}</div>
        <div style="font-size:11px;color:var(--text2)">${fecha(m.f)} · pagó ${esc(nombreMiembro(g, m.e.pagadoPor))} · tu parte ${fL((m.e.partes || {})[YO] || 0)}</div></div>
        <div style="display:flex;align-items:center;gap:6px;white-space:nowrap"><strong>${fL(m.e.monto)}</strong><button class="grupo-borrar" aria-label="Eliminar" onclick="eliminarMovGrupo('${id}','${esc(m.e.id)}')">🗑️</button></div></div>`
    : `<div class="grupo-mov"><div style="min-width:0"><div style="font-weight:600">🤝 ${esc(nombreMiembro(g, m.p.de))} → ${esc(nombreMiembro(g, m.p.a))}</div>
        <div style="font-size:11px;color:var(--text2)">${fecha(m.f)} · pago para quedar a mano</div></div>
        <div style="display:flex;align-items:center;gap:6px;white-space:nowrap"><strong style="color:var(--green)">${fL(m.p.monto)}</strong><button class="grupo-borrar" aria-label="Eliminar" onclick="eliminarMovGrupo('${id}','${esc(m.p.id)}')">🗑️</button></div></div>`).join('')
    : '<p style="font-size:13px;color:var(--text2);text-align:center">Todavía no hay gastos. Agrega el primero.</p>';
  c.innerHTML = `<button class="grupo-volver" onclick="cerrarGrupo()">‹ Grupos</button>
    <div class="card" style="background:linear-gradient(135deg,var(--bg2),var(--bg3))">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
        <div style="min-width:0"><div style="font-size:19px;font-weight:800;overflow:hidden;text-overflow:ellipsis">${esc(g.nombre)}</div>
        <div style="font-size:12px;color:var(--text2)">Gastado: ${fL(total)} · Tu parte: ${fL(miParte)}</div></div>
        <button class="grupo-borrar" style="font-size:12px;color:var(--text2)" onclick="abrirModalGrupo('${id}')">✏️ Editar</button>
      </div>
      <button class="btn btn-primary" style="margin-top:12px" onclick="abrirGastoGrupo('${id}')">➕ Agregar gasto</button>
    </div>
    <h3 class="grupo-titulo">Saldos</h3><div class="card">${saldoHtml}</div>
    <h3 class="grupo-titulo">Para quedar a mano</h3><div class="card">${saldarHtml}
      ${sugeridos.length ? `<button class="btn btn-secondary" style="margin-top:10px" onclick="compartirGrupoWhatsApp('${id}')">📲 Enviar resumen por WhatsApp</button>` : ''}</div>
    <h3 class="grupo-titulo">Movimientos</h3><div class="card">${movsHtml}</div>
    <button class="btn btn-secondary" style="color:var(--red)" onclick="eliminarGrupo('${id}')">🗑️ Eliminar grupo</button>`;
}

// ─── Crear / editar grupo ──────────────────────────────────────────────
let _grupoEditando = null;
function abrirModalGrupo(id) {
  const g = id && grupoPorId(id);
  _grupoEditando = g ? g.id : null;
  document.getElementById('grupo-titulo').textContent = g ? '✏️ Editar grupo' : '👨‍👩‍👧 Nuevo grupo';
  document.getElementById('grupo-nombre').value = g ? g.nombre : '';
  document.getElementById('grupo-miembros').value = g ? g.miembros.map(m => m.nombre).join(', ') : '';
  openModal('modal-grupo');
}
function _limpiarNombre(s) { return String(s).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40); }
function guardarGrupo() {
  const nombre = _limpiarNombre(document.getElementById('grupo-nombre').value);
  const nombres = document.getElementById('grupo-miembros').value.split(/[,\n]/).map(_limpiarNombre).filter(Boolean)
    .filter(n => !/^(t[uú]|yo)$/i.test(n));
  const unicos = nombres.filter((n, i) => nombres.findIndex(x => x.toLowerCase() === n.toLowerCase()) === i).slice(0, 20);
  if (!nombre) return alert('Ponle nombre al grupo (ej. Casa, Viaje a Roatán).');
  if (!unicos.length) return alert('Escribe al menos una persona además de ti, separadas por coma.');
  if (!state.grupos) state.grupos = [];
  let g = _grupoEditando && grupoPorId(_grupoEditando);
  if (g) {
    // Se conservan los ids de quienes siguen; no se puede quitar a alguien con movimientos
    const usados = new Set();
    (g.gastos || []).forEach(e => { usados.add(e.pagadoPor); Object.keys(e.partes || {}).forEach(k => usados.add(k)); });
    (g.pagos || []).forEach(p => { usados.add(p.de); usados.add(p.a); });
    const quitados = g.miembros.filter(m => usados.has(m.id) && !unicos.some(n => n.toLowerCase() === m.nombre.toLowerCase()));
    if (quitados.length) return alert(quitados.map(m => m.nombre).join(', ') + ' ya tiene movimientos en el grupo: no se puede quitar.');
    g.nombre = nombre;
    g.miembros = unicos.map(n => g.miembros.find(m => m.nombre.toLowerCase() === n.toLowerCase()) || { id: uid(), nombre: n });
  } else {
    g = { id: uid(), nombre, miembros: unicos.map(n => ({ id: uid(), nombre: n })), gastos: [], pagos: [], creado: new Date().toISOString() };
    state.grupos.push(g);
  }
  _grupoAbierto = g.id;
  save(); closeModal('modal-grupo'); renderAll(); renderGrupos();
}
function eliminarGrupo(id) {
  const g = grupoPorId(id);
  if (!g) return;
  const pendiente = pagosParaSaldar(saldosGrupo(g)).length > 0;
  if (!confirm('¿Eliminar el grupo "' + g.nombre + '"?' + (pendiente ? '\n\nTodavía hay cuentas pendientes.' : '') + '\n\nTus gastos ya anotados se quedan en tu historial.')) return;
  state.grupos = state.grupos.filter(x => x.id !== id);
  _grupoAbierto = null;
  save(); renderAll(); renderGrupos();
}

// ─── Agregar gasto ─────────────────────────────────────────────────────
let _gastoGrupoId = null, _modoDivision = 'iguales';
function abrirGastoGrupo(id) {
  const g = grupoPorId(id);
  if (!g) return;
  _gastoGrupoId = g.id;
  _modoDivision = 'iguales';
  ['gg-desc', 'gg-monto'].forEach(k => { document.getElementById(k).value = ''; });
  const cat = document.getElementById('gg-cat');
  cat.innerHTML = CATS_COMPARTIDO.map(c => '<option>' + c + '</option>').join('');
  document.getElementById('gg-pago').innerHTML = idsMiembros(g).map(m => '<option value="' + esc(m) + '">' + esc(m === YO ? 'Tú' : nombreMiembro(g, m)) + '</option>').join('');
  document.getElementById('gg-cuenta').value = 'efectivo';
  document.getElementById('gg-partes').innerHTML = idsMiembros(g).map(m =>
    `<div class="gg-parte" data-miembro="${esc(m)}"><label><input type="checkbox" checked onchange="_renderGastoGrupo()"> ${esc(m === YO ? 'Tú' : nombreMiembro(g, m))}</label>
      <input type="text" inputmode="decimal" class="input-field gg-monto-parte" placeholder="L 0.00" oninput="_renderGastoGrupo()"><span class="gg-igual"></span></div>`).join('');
  elegirDivision('iguales');
  openModal('modal-gasto-grupo');
}
function elegirDivision(modo) {
  _modoDivision = modo === 'exactos' ? 'exactos' : 'iguales';
  document.querySelectorAll('#modal-gasto-grupo [data-division]').forEach(b => b.classList.toggle('activa', b.dataset.division === _modoDivision));
  document.getElementById('gg-partes').classList.toggle('exactos', _modoDivision === 'exactos');
  _renderGastoGrupo();
}
function _partesDelForm() {
  const monto = leerMonto(document.getElementById('gg-monto').value) || 0;
  const filas = [...document.querySelectorAll('#gg-partes .gg-parte')];
  if (_modoDivision === 'iguales') {
    const ids = filas.filter(f => f.querySelector('input[type=checkbox]').checked).map(f => f.dataset.miembro);
    return { monto, partes: ids.length && monto > 0 ? partesIguales(monto, ids) : {}, n: ids.length };
  }
  const partes = {};
  filas.forEach(f => { const v = leerMonto(f.querySelector('.gg-monto-parte').value) || 0; if (v > 0) partes[f.dataset.miembro] = _c2(v); });
  return { monto, partes, n: Object.keys(partes).length };
}
function _renderGastoGrupo() {
  const pagaYo = document.getElementById('gg-pago').value === YO;
  document.getElementById('gg-cuenta-wrap').style.display = pagaYo ? '' : 'none';
  const { monto, partes } = _partesDelForm();
  document.querySelectorAll('#gg-partes .gg-parte').forEach(f => { f.querySelector('.gg-igual').textContent = _modoDivision === 'iguales' && partes[f.dataset.miembro] ? fL(partes[f.dataset.miembro]) : ''; });
  const suma = _c2(Object.values(partes).reduce((a, b) => a + b, 0)), mia = partes[YO] || 0;
  const el = document.getElementById('gg-resumen');
  if (!(monto > 0)) { el.innerHTML = 'Escribe el monto del gasto.'; return; }
  const falta = _c2(monto - suma);
  el.innerHTML = (_modoDivision === 'exactos' && Math.abs(falta) > 0.005
    ? `<span style="color:var(--amber)">⚠️ Las partes suman ${fL(suma)}: ${falta > 0 ? 'faltan ' + fL(falta) : 'sobran ' + fL(-falta)}.</span><br>` : '') +
    `Tu parte: <strong>${fL(mia)}</strong>` + (pagaYo && monto - mia > 0.005 ? ` · adelantas <strong>${fL(monto - mia)}</strong> que te deben` : '') +
    (!pagaYo && mia > 0 ? ` · se lo quedas debiendo a ${esc(nombreMiembro(grupoPorId(_gastoGrupoId), document.getElementById('gg-pago').value))}` : '');
}
function guardarGastoGrupo() {
  const g = grupoPorId(_gastoGrupoId);
  if (!g) return;
  const desc = _limpiarNombre(document.getElementById('gg-desc').value) || document.getElementById('gg-cat').value;
  const cat = CATS_COMPARTIDO.includes(document.getElementById('gg-cat').value) ? document.getElementById('gg-cat').value : 'Otros';
  const pagadoPor = document.getElementById('gg-pago').value;
  const cuenta = document.getElementById('gg-cuenta').value === 'ahorro' ? 'ahorro' : 'efectivo';
  const { monto, partes, n } = _partesDelForm();
  if (!(monto > 0)) return alert('Escribe cuánto fue el gasto.');
  if (!idsMiembros(g).includes(pagadoPor)) return alert('Elige quién pagó.');
  if (!n) return alert(_modoDivision === 'iguales' ? 'Marca entre quiénes se divide.' : 'Escribe cuánto le toca a cada uno.');
  const suma = _c2(Object.values(partes).reduce((a, b) => a + b, 0));
  if (Math.abs(suma - monto) > 0.005) return alert('Las partes suman ' + fL(suma) + ' y el gasto es ' + fL(monto) + '. Ajusta los montos.');
  const mia = partes[YO] || 0, ahora = new Date().toISOString(), e = { id: uid(), desc, cat, monto: _c2(monto), pagadoPor, partes, fecha: ahora, txIds: [] };
  if (pagadoPor === YO) {
    const saldo = getCuentaBalance(cuenta);
    if (monto > saldo + 0.005 && !confirm('Tu ' + (cuenta === 'efectivo' ? 'efectivo' : 'cuenta de ahorro') + ' tiene ' + fL(saldo) + ': con este gasto quedaría en ' + fL(saldo - monto) + '.\n\n[Aceptar] = guardar de todos modos')) return;
    if (mia > 0) { const t = { id: uid(), type: 'expense', amount: mia, cat, subcat: desc + ' · ' + g.nombre, cuenta, pago: cuenta, tipo: 'extra', grupoId: g.id, date: ahora }; state.transactions.push(t); e.txIds.push(t.id); }
    const adelanto = _c2(monto - mia);
    if (adelanto > 0) { const t = { id: uid(), type: 'expense', amount: adelanto, cat: 'Gasto compartido', subcat: 'Adelantaste en ' + g.nombre + ': ' + desc, cuenta, pago: cuenta, tipo: 'extra', esTransferencia: true, grupoId: g.id, date: ahora }; state.transactions.push(t); e.txIds.push(t.id); }
  } else if (mia > 0) {
    // Pagó otro: tu parte es gasto, pero todavía no sale de ninguna cuenta
    const t = { id: uid(), type: 'expense', amount: mia, cat, subcat: desc + ' · pagó ' + nombreMiembro(g, pagadoPor), cuenta: null, pago: 'grupo', tipo: 'extra', grupoId: g.id, date: ahora };
    state.transactions.push(t); e.txIds.push(t.id);
  }
  g.gastos.push(e);
  save(); closeModal('modal-gasto-grupo'); renderAll(); renderGrupos();
}

// ─── Saldar ────────────────────────────────────────────────────────────
let _pagoGrupo = null;
function abrirPagoGrupo(id, k) {
  const g = grupoPorId(id);
  const p = g && pagosParaSaldar(saldosGrupo(g))[k];
  if (!p) return;
  _pagoGrupo = { grupoId: g.id, de: p.de, a: p.a, max: p.monto };
  const conmigo = p.de === YO || p.a === YO;
  document.getElementById('pg-texto').innerHTML = p.de === YO ? 'Le pagas a <strong>' + esc(nombreMiembro(g, p.a)) + '</strong>'
    : p.a === YO ? '<strong>' + esc(nombreMiembro(g, p.de)) + '</strong> te paga' : '<strong>' + esc(nombreMiembro(g, p.de)) + '</strong> le paga a <strong>' + esc(nombreMiembro(g, p.a)) + '</strong>';
  document.getElementById('pg-monto').value = p.monto.toFixed(2);
  document.getElementById('pg-cuenta-wrap').style.display = conmigo ? '' : 'none';
  document.getElementById('pg-cuenta-label').textContent = p.de === YO ? '¿De qué cuenta sale?' : '¿A qué cuenta entra?';
  document.getElementById('pg-cuenta').value = 'efectivo';
  openModal('modal-pago-grupo');
}
function guardarPagoGrupo() {
  const x = _pagoGrupo, g = x && grupoPorId(x.grupoId);
  if (!g) return;
  const monto = _c2(leerMonto(document.getElementById('pg-monto').value) || 0);
  if (!(monto > 0)) return alert('Escribe el monto del pago.');
  if (monto > x.max + 0.005) return alert('Para quedar a mano el pago es de ' + fL(x.max) + '.');
  const cuenta = document.getElementById('pg-cuenta').value === 'ahorro' ? 'ahorro' : 'efectivo', ahora = new Date().toISOString();
  const p = { id: uid(), de: x.de, a: x.a, monto, fecha: ahora, txIds: [] };
  if (x.de === YO) {
    const saldo = getCuentaBalance(cuenta);
    if (monto > saldo + 0.005 && !confirm('Tu ' + (cuenta === 'efectivo' ? 'efectivo' : 'cuenta de ahorro') + ' tiene ' + fL(saldo) + ': con este pago quedaría en ' + fL(saldo - monto) + '.\n\n[Aceptar] = pagar de todos modos')) return;
    const t = { id: uid(), type: 'expense', amount: monto, cat: 'Gasto compartido', subcat: 'Pago a ' + nombreMiembro(g, x.a) + ' (' + g.nombre + ')', cuenta, pago: cuenta, tipo: 'extra', esTransferencia: true, grupoId: g.id, date: ahora };
    state.transactions.push(t); p.txIds.push(t.id);
  } else if (x.a === YO) {
    const t = { id: uid(), type: 'income', amount: monto, cat: 'Gasto compartido', subcat: 'Cobro a ' + nombreMiembro(g, x.de) + ' (' + g.nombre + ')', cuenta, esTransferencia: true, grupoId: g.id, date: ahora };
    state.transactions.push(t); p.txIds.push(t.id);
  }
  g.pagos.push(p);
  save(); closeModal('modal-pago-grupo'); renderAll(); renderGrupos();
  if (!pagosParaSaldar(saldosGrupo(g)).length) alert('🎉 ¡El grupo "' + g.nombre + '" quedó a mano!');
}

// Borrar un gasto o un pago también quita sus movimientos de tus cuentas
function eliminarMovGrupo(gid, mid) {
  const g = grupoPorId(gid);
  if (!g) return;
  const e = (g.gastos || []).find(x => x.id === mid), p = (g.pagos || []).find(x => x.id === mid), m = e || p;
  if (!m || !confirm(e ? '¿Eliminar el gasto "' + e.desc + '" de ' + fL(e.monto) + '?' : '¿Eliminar este pago de ' + fL(p.monto) + '?')) return;
  const ahora = new Date().toISOString();
  (m.txIds || []).forEach(id => { const t = state.transactions.find(x => x.id === id); if (t && !t.deletedAt) t.deletedAt = ahora; });
  if (e) g.gastos = g.gastos.filter(x => x.id !== mid); else g.pagos = g.pagos.filter(x => x.id !== mid);
  save(); renderAll(); renderGrupos();
}

// Resumen para mandar al grupo
function textoResumenGrupo(g) {
  const total = (g.gastos || []).reduce((a, e) => a + e.monto, 0);
  const pagos = pagosParaSaldar(saldosGrupo(g));
  const quien = id => id === YO ? (state.nombre || 'Yo') : nombreMiembro(g, id);
  const monto = n => 'L ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return '🧾 *' + g.nombre + '*\nGastos: ' + (g.gastos || []).length + ' · Total: ' + monto(total) + '\n\n' +
    (pagos.length ? '*Para quedar a mano:*\n' + pagos.map(p => '• ' + quien(p.de) + ' le paga ' + monto(p.monto) + ' a ' + quien(p.a)).join('\n') : '✅ Estamos a mano') +
    '\n\n_Cuentas claras con Mi Pisto HN_';
}
function compartirGrupoWhatsApp(id) {
  const g = grupoPorId(id);
  if (!g) return;
  window.open('https://wa.me/?text=' + encodeURIComponent(textoResumenGrupo(g)), '_blank', 'noopener');
}
