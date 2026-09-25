// Mi Pisto HN · 18-presupuestos.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.

// ═══ PRESUPUESTOS POR QUINCENA, SEMANA O MES ══════════════════════════════
// Cada presupuesto es un tope para una categoría (o para todos los gastos)
// en un período: la quincena (de un día de pago al siguiente), la semana
// (de lunes a domingo) o el mes. Avisa al llegar al 80% y al pasarse, y
// dice cuánto queda por día. La tarjeta del Inicio también muestra
// ingresos y gastos de Hoy, la Semana, la Quincena o el Mes.
const PERIODOS = { dia: 'Hoy', semana: 'Semana', quincena: 'Quincena', mes: 'Mes' };
const PERIODO_TXT = { semana: 'a la semana', quincena: 'por quincena', mes: 'al mes' };
const TODOS_LOS_GASTOS = '*';
const _diaFin = (y, m, d) => Math.min(d, new Date(y, m + 1, 0).getDate());

/** Días de pago de la quincena, ordenados (por defecto el 15 y el 30; el 30 es el último día en febrero) */
function diasDePago() {
  const d = Array.isArray(state.diasPago) ? state.diasPago.map(Number).filter(n => n >= 1 && n <= 31) : [];
  return d.length === 2 && d[0] !== d[1] ? d.slice().sort((a, b) => a - b) : [15, 30];
}

/** Rango [inicio, fin) del período que contiene la fecha */
function rangoPeriodo(periodo, fecha) {
  const f = fecha ? new Date(fecha) : new Date(), y = f.getFullYear(), m = f.getMonth(), d = f.getDate();
  if (periodo === 'dia') return { inicio: new Date(y, m, d), fin: new Date(y, m, d + 1) };
  if (periodo === 'semana') {
    const lunes = d - ((f.getDay() + 6) % 7);
    return { inicio: new Date(y, m, lunes), fin: new Date(y, m, lunes + 7) };
  }
  if (periodo === 'quincena') {
    const [a, b] = diasDePago();
    // Días de pago de este mes y de los vecinos, ya ajustados al fin de mes
    const pagos = [-1, 0, 1].flatMap(k => [new Date(y, m + k, _diaFin(y, m + k, a)), new Date(y, m + k, _diaFin(y, m + k, b))]);
    const hoy = new Date(y, m, d);
    const inicio = pagos.filter(p => p <= hoy).pop();
    return { inicio, fin: pagos.find(p => p > inicio) };
  }
  return { inicio: new Date(y, m, 1), fin: new Date(y, m + 1, 1) };
}
const _fechaCorta = f => f.toLocaleDateString('es-HN', { day: 'numeric', month: 'short' });
function textoRango(periodo, r) {
  if (periodo === 'dia') return 'hoy';
  if (periodo === 'mes') return r.inicio.toLocaleDateString('es-HN', { month: 'long' });
  const ult = new Date(r.fin.getFullYear(), r.fin.getMonth(), r.fin.getDate() - 1);
  return _fechaCorta(r.inicio) + ' al ' + _fechaCorta(ult);
}

// Gastos reales (sin movimientos internos ni conciliaciones); los divididos cuentan por categoría
const _esGastoReal = t => !t.deletedAt && t.type === 'expense' && !t.esTransferencia && !t.esConciliacion && typeof t.amount === 'number';
const _mismaCat = (a, b) => _sinAcentos(a || '').trim() === _sinAcentos(b || '').trim();
function gastadoEn(cat, r) {
  return _c2((state.transactions || []).filter(t => { if (!_esGastoReal(t)) return false; const f = fechaContable(t); return f >= r.inicio && f < r.fin; }).reduce((a, t) => {
    if (cat === TODOS_LOS_GASTOS) return a + t.amount;
    if (Array.isArray(t.splits) && t.splits.length) return a + t.splits.filter(s => _mismaCat(s.cat, cat)).reduce((x, s) => x + (Number(s.monto) || 0), 0);
    return a + (_mismaCat(t.cat, cat) ? t.amount : 0);
  }, 0));
}
function totalesPeriodo(r) {
  const tx = (state.transactions || []).filter(t => !t.deletedAt && !t.esTransferencia && !t.esConciliacion && typeof t.amount === 'number' && fechaContable(t) >= r.inicio && fechaContable(t) < r.fin);
  const suma = tipo => _c2(tx.filter(t => t.type === tipo).reduce((a, t) => a + t.amount, 0));
  return { ingresos: suma('income'), gastos: suma('expense') };
}

/** Estado de un presupuesto hoy: lo gastado, lo que queda y cuánto se puede por día */
function estadoPresupuesto(p, hoy) {
  const r = rangoPeriodo(p.periodo, hoy), gastado = gastadoEn(p.cat, r), queda = _c2(p.monto - gastado);
  const ahora = hoy ? new Date(hoy) : new Date();
  const dias = Math.max(1, Math.round((r.fin - new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate())) / 864e5));
  const pct = p.monto > 0 ? gastado / p.monto * 100 : 0;
  return { r, gastado, queda, pct, dias, porDia: queda > 0 ? _c2(queda / dias) : 0, nivel: pct >= 100 ? 'pasado' : pct >= 80 ? 'aviso' : 'bien' };
}
const nombreCatPresupuesto = cat => cat === TODOS_LOS_GASTOS ? 'Todos mis gastos' : cat;

// ─── Tarjeta del Inicio ────────────────────────────────────────────────
function _periodoVista() {
  try { const v = localStorage.getItem('mph_periodo_inicio'); if (PERIODOS[v]) return v; } catch (e) {}
  return 'quincena';
}
function elegirPeriodoInicio(v) {
  try { localStorage.setItem('mph_periodo_inicio', PERIODOS[v] ? v : 'quincena'); } catch (e) {}
  renderPresupuestos();
}
function renderPresupuestos() {
  const card = document.getElementById('presupuestos-card');
  if (!card) return;
  if (!state.setup) { card.style.display = 'none'; return; }
  card.style.display = 'block';
  const vista = _periodoVista(), r = rangoPeriodo(vista), tot = totalesPeriodo(r);
  const lista = (state.presupuestos || []).filter(p => vista === 'dia' || p.periodo === vista);
  const barras = lista.map(p => {
    const e = estadoPresupuesto(p);
    const color = e.nivel === 'pasado' ? 'var(--red)' : e.nivel === 'aviso' ? 'var(--aviso)' : 'var(--green)';
    const detalle = e.queda >= 0
      ? 'Quedan ' + fL(e.queda) + (e.dias > 1 && e.queda > 0 ? ' · ' + fL(e.porDia) + ' por día' : '')
      : 'Te pasaste ' + fL(-e.queda);
    return `<div class="presu-fila"><div class="presu-top"><span>${esc(nombreCatPresupuesto(p.cat))}${vista === 'dia' ? ' <small>(' + PERIODOS[p.periodo].toLowerCase() + ')</small>' : ''}</span><span style="color:${color};font-weight:700">${fL(e.gastado)} de ${fL(p.monto)}</span></div>
      <div class="presu-barra"><div style="width:${Math.min(100, e.pct)}%;background:${color}"></div></div>
      <div class="presu-detalle" style="color:${e.nivel === 'bien' ? 'var(--text2)' : color}">${e.nivel === 'pasado' ? '🚨 ' : e.nivel === 'aviso' ? '⚠️ ' : ''}${detalle}</div></div>`;
  }).join('');
  const vacio = !(state.presupuestos || []).length;
  card.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px">
      <strong style="font-size:14px">📅 Mi presupuesto</strong>
      <button onclick="switchView('presupuestos')" style="background:none;border:none;color:var(--text2);font-size:12px;cursor:pointer">${vacio ? '' : 'Ver todos ›'}</button></div>
    <div class="presu-chips" role="tablist">${Object.keys(PERIODOS).map(k => `<button role="tab" data-periodo="${k}" class="${k === vista ? 'activa' : ''}" onclick="elegirPeriodoInicio('${k}')">${PERIODOS[k]}</button>`).join('')}</div>
    <div class="presu-rango">${esc(textoRango(vista, r))}</div>
    <div class="presu-totales"><div><small>Entró</small><strong style="color:var(--green)">${fL(tot.ingresos)}</strong></div><div><small>Gastaste</small><strong style="color:var(--red)">${fL(tot.gastos)}</strong></div><div><small>Te queda</small><strong style="color:${tot.ingresos - tot.gastos >= 0 ? 'var(--text)' : 'var(--red)'}">${fL(tot.ingresos - tot.gastos)}</strong></div></div>
    ${barras || (vacio
      ? `<p style="font-size:12px;color:var(--text2);line-height:1.5;margin:10px 0">Ponle un tope a lo que gastas: por ejemplo, <strong>Comida ${fL(3000)} por quincena</strong>. Te avisamos al 80% y te decimos cuánto puedes gastar por día.</p><button class="btn btn-primary" onclick="switchView('presupuestos')">➕ Crear mi presupuesto</button>`
      : `<p style="font-size:12px;color:var(--text2);margin:10px 0 0">No tienes presupuestos ${PERIODO_TXT[vista] || ''}. <a href="#" onclick="switchView('presupuestos');return false" style="color:var(--blue)">Agregar</a></p>`)}`;
  avisarPresupuestos();
  // La pantalla de Presupuestos (27-presupuestos-categoria.js) se mantiene al día
  if (typeof renderVistaPresupuestos === 'function') renderVistaPresupuestos();
}

// Una notificación por presupuesto, período y nivel
function avisarPresupuestos() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  let enviadas = {};
  try { enviadas = JSON.parse(localStorage.getItem('mph_presu_avisos') || '{}'); } catch (e) {}
  let cambio = false;
  (state.presupuestos || []).forEach(p => {
    const e = estadoPresupuesto(p);
    if (e.nivel === 'bien') return;
    const clave = p.id + '_' + e.r.inicio.toISOString().slice(0, 10) + '_' + e.nivel;
    if (enviadas[clave]) return;
    enviarNotificacion(e.nivel === 'pasado' ? '🚨 Te pasaste en ' + nombreCatPresupuesto(p.cat) : '⚠️ ' + nombreCatPresupuesto(p.cat) + ' al ' + Math.round(e.pct) + '%',
      e.nivel === 'pasado' ? 'Llevas ' + fL(e.gastado) + ' de ' + fL(p.monto) + ' ' + (PERIODO_TXT[p.periodo] || '') : 'Te quedan ' + fL(e.queda) + ' (' + fL(e.porDia) + ' por día)', null);
    enviadas[clave] = true; cambio = true;
  });
  if (cambio) try { localStorage.setItem('mph_presu_avisos', JSON.stringify(enviadas)); } catch (e) {}
}

// ─── Modal para crear y ajustar ────────────────────────────────────────
function _categoriasUsadas() {
  const vistas = new Map();
  (state.transactions || []).filter(_esGastoReal).forEach(t => {
    [t.cat].concat(Array.isArray(t.splits) ? t.splits.map(s => s.cat) : []).forEach(c => {
      if (c && !vistas.has(_sinAcentos(c).trim())) vistas.set(_sinAcentos(c).trim(), c.trim());
    });
  });
  return [...vistas.values()].filter(c => c !== 'Gasto compartido').sort((a, b) => a.localeCompare(b, 'es'));
}
function abrirPresupuestos() {
  const [a, b] = diasDePago();
  document.getElementById('presu-dia1').value = a;
  document.getElementById('presu-dia2').value = b;
  document.getElementById('presu-cat').value = '';
  document.getElementById('presu-monto').value = '';
  document.getElementById('presu-periodo').value = _periodoVista() === 'dia' ? 'quincena' : _periodoVista();
  const cats = _categoriasUsadas();
  document.getElementById('lista-cats-presu').innerHTML = ['Todos mis gastos'].concat(cats.length ? cats : ['Comida', 'Supermercado', 'Transporte', 'Salidas', 'Servicios']).map(c => '<option value="' + esc(c) + '">').join('');
  _renderListaPresupuestos();
  openModal('modal-presupuestos');
}
function _renderListaPresupuestos() {
  const el = document.getElementById('presu-lista');
  const ps = state.presupuestos || [];
  el.innerHTML = ps.length ? ps.map(p => {
    const e = estadoPresupuesto(p);
    return `<div class="presu-item"><div style="min-width:0"><strong>${esc(nombreCatPresupuesto(p.cat))}</strong><small>${fL(p.monto)} ${PERIODO_TXT[p.periodo]} · llevas ${fL(e.gastado)}</small></div>
      <button onclick="eliminarPresupuesto('${esc(p.id)}')" aria-label="Eliminar" style="background:none;border:none;cursor:pointer;font-size:15px">🗑️</button></div>`;
  }).join('') : '<p style="font-size:12px;color:var(--text2);text-align:center;margin:6px 0">Todavía no tienes presupuestos.</p>';
}
function guardarPresupuesto() {
  const texto = String(document.getElementById('presu-cat').value).replace(/[<>]/g, '').trim().slice(0, 40);
  const cat = !texto || _mismaCat(texto, 'Todos mis gastos') ? TODOS_LOS_GASTOS : (_categoriasUsadas().find(c => _mismaCat(c, texto)) || texto);
  const monto = leerMonto(document.getElementById('presu-monto').value);
  const periodo = ['semana', 'quincena', 'mes'].includes(document.getElementById('presu-periodo').value) ? document.getElementById('presu-periodo').value : 'quincena';
  if (!(monto > 0)) return alert('Escribe cuánto quieres gastar como máximo.');
  if (!state.presupuestos) state.presupuestos = [];
  const previo = state.presupuestos.find(p => p.periodo === periodo && _mismaCat(p.cat, cat));
  if (previo) previo.monto = _c2(monto);
  else state.presupuestos.push({ id: uid(), cat, monto: _c2(monto), periodo });
  document.getElementById('presu-cat').value = '';
  document.getElementById('presu-monto').value = '';
  save(); _renderListaPresupuestos(); renderPresupuestos();
}
function eliminarPresupuesto(id) {
  const p = (state.presupuestos || []).find(x => x.id === id);
  if (!p || !confirm('¿Quitar el presupuesto de ' + nombreCatPresupuesto(p.cat) + '?')) return;
  state.presupuestos = state.presupuestos.filter(x => x.id !== id);
  save(); _renderListaPresupuestos(); renderPresupuestos();
}
function guardarDiasPago() {
  const a = parseInt(document.getElementById('presu-dia1').value, 10), b = parseInt(document.getElementById('presu-dia2').value, 10);
  if (!(a >= 1 && a <= 31 && b >= 1 && b <= 31) || a === b) return alert('Escribe dos días distintos entre 1 y 31 (por ejemplo 15 y 30).');
  state.diasPago = [a, b].sort((x, y) => x - y);
  save(); _renderListaPresupuestos(); renderPresupuestos();
}
