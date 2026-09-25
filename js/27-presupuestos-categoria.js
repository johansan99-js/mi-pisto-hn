// Mi Pisto HN · 27-presupuestos-categoria.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.

// ═══ PANTALLA DE PRESUPUESTOS POR CATEGORÍA ═══════════════════════════════
// Usa los mismos presupuestos de 18-presupuestos.js (state.presupuestos:
// { id, cat, monto, periodo }) y los muestra como tarjetas: límite, gastado,
// restante y una barra que se pone roja con "Límite excedido". Abajo, las
// categorías sin presupuesto en ese período con "Poner presupuesto", que
// sugiere un monto según lo que gastaste en los últimos períodos. Con ‹ › se
// ven períodos anteriores (con los topes de hoy).
const PERIODOS_PRESU = ['semana', 'quincena', 'mes'];
const _pv = { periodo: null, ref: null };

function _pvPeriodo() {
  if (_pv.periodo) return _pv.periodo;
  let v = null;
  try { v = localStorage.getItem('mph_periodo_presu'); } catch (e) {}
  if (!PERIODOS_PRESU.includes(v)) {
    // El del primer presupuesto que tengas; si no, el mes
    const p = (state.presupuestos || []).find(x => PERIODOS_PRESU.includes(x.periodo));
    v = p ? p.periodo : 'mes';
  }
  return (_pv.periodo = v);
}
function periodoPresupuestos(p) {
  if (!PERIODOS_PRESU.includes(p)) return;
  _pv.periodo = p; _pv.ref = null;
  try { localStorage.setItem('mph_periodo_presu', p); } catch (e) {}
  renderVistaPresupuestos();
}
function moverPresupuestos(delta) {
  const periodo = _pvPeriodo();
  const r = rangoPeriodo(periodo, _pv.ref || new Date());
  const nueva = delta < 0 ? new Date(r.inicio.getFullYear(), r.inicio.getMonth(), r.inicio.getDate() - 1) : new Date(r.fin);
  if (nueva > new Date()) return;
  _pv.ref = nueva;
  renderVistaPresupuestos();
}
function _tituloRangoPresu(periodo, r) {
  if (periodo === 'mes') return _MESES_LARGOS[r.inicio.getMonth()].charAt(0).toUpperCase() + _MESES_LARGOS[r.inicio.getMonth()].slice(1) + ' ' + r.inicio.getFullYear();
  const ult = new Date(r.fin.getFullYear(), r.fin.getMonth(), r.fin.getDate() - 1);
  return r.inicio.getMonth() === ult.getMonth()
    ? `${r.inicio.getDate()} – ${ult.getDate()} ${_MESES_CORTOS[ult.getMonth()]}`
    : `${r.inicio.getDate()} ${_MESES_CORTOS[r.inicio.getMonth()]} – ${ult.getDate()} ${_MESES_CORTOS[ult.getMonth()]}`;
}

/** Estado de un presupuesto en un rango cualquiera (el de hoy o uno pasado) */
function estadoPresupuestoEn(p, r) {
  const gastado = gastadoEn(p.cat, r), queda = _c2(p.monto - gastado);
  const pct = p.monto > 0 ? gastado / p.monto * 100 : 0;
  const hoy = new Date(), dHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const actual = r.inicio <= hoy && hoy < r.fin;
  const dias = actual ? Math.max(1, Math.round((r.fin - dHoy) / 864e5)) : 0;
  return { gastado, queda, pct, actual, dias, porDia: actual && queda > 0 ? _c2(queda / dias) : 0, nivel: pct > 100 ? 'pasado' : pct >= 80 ? 'aviso' : 'bien' };
}

/** Lo que se gastó en promedio en esa categoría en los 3 períodos anteriores (para sugerir) */
function promedioGastoCategoria(cat, periodo) {
  let r = rangoPeriodo(periodo, new Date()), suma = 0, conGasto = 0;
  for (let i = 0; i < 3; i++) {
    r = rangoPeriodo(periodo, new Date(r.inicio.getFullYear(), r.inicio.getMonth(), r.inicio.getDate() - 1));
    const g = gastadoEn(cat, r);
    if (g > 0) { suma += g; conGasto++; }
  }
  return conGasto ? _c2(suma / conGasto) : 0;
}

// Categorías que se pueden presupuestar: las que tienen gastos y las de fábrica
function _catsPresupuestables() {
  const usadas = typeof _categoriasUsadas === 'function' ? _categoriasUsadas() : [];
  const lista = usadas.filter(c => !_normCat(c).startsWith('varios (') && _normCat(c) !== 'transferencia');
  CATS_GASTO.forEach(c => { if (!lista.some(x => _mismaCat(x, c.n))) lista.push(c.n); });
  return lista;
}

function _barraPresu(e) {
  const clase = e.nivel === 'pasado' ? 'pasado' : e.nivel === 'aviso' ? 'aviso' : 'bien';
  return `<div class="pv-barra ${clase}"><div style="width:${Math.min(100, e.pct).toFixed(1)}%"></div></div>`;
}
function _tarjetaPresu(p, r) {
  const e = estadoPresupuestoEn(p, r);
  const todos = p.cat === TODOS_LOS_GASTOS;
  const icono = todos ? '<span class="cat-circulo" style="background:var(--amber);color:var(--acento-txt)" aria-hidden="true">Σ</span>' : circuloCategoria(p.cat, 'expense');
  const pie = e.nivel === 'pasado'
    ? `<div class="pv-pie pasado">🚨 Límite excedido por ${fL(-e.queda)}</div>`
    : e.actual && e.queda > 0 && e.dias > 1
      ? `<div class="pv-pie ${e.nivel}">${e.nivel === 'aviso' ? '⚠️ ' : ''}Puedes gastar ${fL(e.porDia)} por día (${e.dias} días)</div>`
      : e.nivel === 'aviso' ? `<div class="pv-pie aviso">⚠️ Vas en el ${Math.round(e.pct)}%</div>` : '';
  return `<button type="button" class="pv-tarjeta${todos ? ' todos' : ''}" data-id="${esc(p.id)}" onclick="editarPresupuestoCat(this.dataset.id)">
    <div class="pv-cab">${icono}<strong>${esc(nombreCatPresupuesto(p.cat))}</strong><span class="pv-tope">${fL(p.monto)}</span></div>
    <div class="pv-nums">
      <div><small>Límite</small><b>${fL(p.monto)}</b></div>
      <div><small>Gastado</small><b class="${e.nivel === 'pasado' ? 'rojo' : ''}">${fL(e.gastado)}</b></div>
      <div><small>Restante</small><b class="${e.queda > 0 ? 'verde' : 'rojo'}">${fL(Math.max(0, e.queda))}</b></div>
    </div>
    ${_barraPresu(e)}${pie}</button>`;
}

function renderVistaPresupuestos() {
  const el = document.getElementById('presupuestos-vista');
  if (!el) return;
  if (!state.setup) { el.innerHTML = ''; return; }
  const periodo = _pvPeriodo();
  const r = rangoPeriodo(periodo, _pv.ref || new Date());
  const hayMas = r.fin <= new Date();
  const ps = (state.presupuestos || []).filter(p => p.periodo === periodo);
  const deCat = ps.filter(p => p.cat !== TODOS_LOS_GASTOS);
  const todos = ps.find(p => p.cat === TODOS_LOS_GASTOS);
  const totalTope = _c2(deCat.reduce((a, p) => a + p.monto, 0));
  const totalGastado = _c2(deCat.reduce((a, p) => a + gastadoEn(p.cat, r), 0));
  const chips = PERIODOS_PRESU.map(k => `<button type="button" role="tab" class="an-seg-btn${k === periodo ? ' activa' : ''}" aria-selected="${k === periodo}" onclick="periodoPresupuestos('${k}')">${PERIODOS[k]}</button>`).join('');
  // Las demás categorías, primero las que tuvieron gastos en este período
  const sinPresu = _catsPresupuestables().filter(c => !deCat.some(p => _mismaCat(p.cat, c)))
    .map(c => ({ c, g: gastadoEn(c, r), otro: (state.presupuestos || []).find(p => p.periodo !== periodo && _mismaCat(p.cat, c)) }))
    .sort((a, b) => b.g - a.g);
  const filaSin = ({ c, g, otro }) => `<div class="pv-sin">${circuloCategoria(c, 'expense')}<span class="pv-sin-info"><strong>${esc(c)}</strong><small>${g > 0 ? 'Gastaste ' + fL(g) : 'Sin gastos'}${otro ? ' · tiene tope ' + PERIODO_TXT[otro.periodo] : ''}</small></span><button type="button" class="pv-poner" data-cat="${esc(c)}" onclick="ponerPresupuestoCat(this.dataset.cat)" aria-label="Poner presupuesto a ${esc(c)}">＋ Presupuesto</button></div>`;
  el.innerHTML = `<div class="an-segmentos" role="tablist" aria-label="Período">${chips}</div>
    <div class="rm-nav">
      <button type="button" onclick="moverPresupuestos(-1)" aria-label="Período anterior">‹</button>
      <strong>${esc(_tituloRangoPresu(periodo, r))}</strong>
      <button type="button" onclick="moverPresupuestos(1)" aria-label="Período siguiente"${hayMas ? '' : ' disabled'}>›</button>
    </div>
    <div class="rm-totales pv-totales">
      <div><small>Presupuesto</small><b>${fL(totalTope)}</b></div>
      <div><small>Gastado</small><b class="${totalGastado > totalTope && totalTope > 0 ? 'rojo' : ''}">${fL(totalGastado)}</b></div>
      <div><small>Restante</small><b class="${totalTope - totalGastado >= 0 ? 'verde' : 'rojo'}">${fL(Math.max(0, totalTope - totalGastado))}</b></div>
    </div>
    ${todos ? _tarjetaPresu(todos, r) : ''}
    <h4 class="pv-titulo">Con presupuesto ${PERIODO_TXT[periodo]}</h4>
    ${deCat.length ? deCat.slice().sort((a, b) => estadoPresupuestoEn(b, r).pct - estadoPresupuestoEn(a, r).pct).map(p => _tarjetaPresu(p, r)).join('')
      : `<p class="pv-vacio">Todavía no tienes categorías con presupuesto ${PERIODO_TXT[periodo]}. Elige una abajo y toca <strong>Poner presupuesto</strong>: te avisamos al 80% y te decimos cuánto puedes gastar por día.</p>`}
    <h4 class="pv-titulo">Sin presupuesto</h4>
    ${todos ? '' : `<div class="pv-sin">${'<span class="cat-circulo" style="background:var(--bg4);color:var(--text)" aria-hidden="true">Σ</span>'}<span class="pv-sin-info"><strong>Todos mis gastos</strong><small>Un tope para todo lo que gastas</small></span><button type="button" class="pv-poner" onclick="ponerPresupuestoCat('${TODOS_LOS_GASTOS}')" aria-label="Poner presupuesto a todos mis gastos">＋ Presupuesto</button></div>`}
    ${sinPresu.map(filaSin).join('')}
    <button type="button" class="btn btn-secondary pv-dias" onclick="abrirPresupuestos()">💵 ¿Qué días te pagan? (${diasDePago().join(' y ')})</button>`;
}

// ─── Poner o editar un presupuesto ──────────────────────────────────────
function _abrirHojaPresu(cat, p) {
  const periodo = p ? p.periodo : _pvPeriodo();
  const todos = cat === TODOS_LOS_GASTOS;
  document.getElementById('pc-id').value = p ? p.id : '';
  document.getElementById('pc-cat').value = cat;
  document.getElementById('pc-titulo').innerHTML = (todos ? '<span class="cat-circulo" style="background:var(--amber);color:var(--acento-txt)" aria-hidden="true">Σ</span>' : circuloCategoria(cat, 'expense')) + ' ' + esc(nombreCatPresupuesto(cat));
  document.getElementById('pc-periodo').value = periodo;
  document.getElementById('pc-monto').value = p ? String(p.monto) : '';
  document.getElementById('pc-quitar').style.display = p ? '' : 'none';
  _sugerenciaPresu();
  openModal('modal-presu-cat');
  setTimeout(() => document.getElementById('pc-monto')?.focus(), 50);
}
function _sugerenciaPresu() {
  const cat = document.getElementById('pc-cat').value, periodo = document.getElementById('pc-periodo').value;
  const prom = promedioGastoCategoria(cat, periodo);
  const el = document.getElementById('pc-sugerencia');
  if (!prom) { el.innerHTML = ''; el.style.display = 'none'; return; }
  const sugerido = Math.ceil(prom / 100) * 100;
  el.style.display = 'block';
  el.innerHTML = `En los últimos períodos gastaste en promedio <strong>${fL(prom)}</strong> ${PERIODO_TXT[periodo]}. <button type="button" onclick="document.getElementById('pc-monto').value='${sugerido}'">Usar ${fL(sugerido)}</button>`;
}
function ponerPresupuestoCat(cat) {
  const existente = (state.presupuestos || []).find(p => p.periodo === _pvPeriodo() && _mismaCat(p.cat, cat));
  _abrirHojaPresu(cat, existente || null);
}
function editarPresupuestoCat(id) {
  const p = (state.presupuestos || []).find(x => x.id === id);
  if (p) _abrirHojaPresu(p.cat, p);
}
function guardarPresupuestoCat() {
  const id = document.getElementById('pc-id').value;
  const cat = document.getElementById('pc-cat').value;
  const periodo = PERIODOS_PRESU.includes(document.getElementById('pc-periodo').value) ? document.getElementById('pc-periodo').value : 'mes';
  const monto = leerMonto(document.getElementById('pc-monto').value);
  if (!(monto > 0)) return alert('Escribe cuánto quieres gastar como máximo.');
  if (!state.presupuestos) state.presupuestos = [];
  // Una categoría tiene un solo tope por período: si ya había otro, se reemplaza
  const actual = id ? state.presupuestos.find(p => p.id === id) : null;
  const choque = state.presupuestos.find(p => p !== actual && p.periodo === periodo && _mismaCat(p.cat, cat));
  // Uno nuevo (que no reemplaza a otro) cuenta para el límite de lo gratis
  if (!actual && !choque && typeof puedeUsarPremium === 'function' && !puedeUsarPremium('presupuestos')) return;
  if (choque) state.presupuestos = state.presupuestos.filter(p => p !== choque);
  if (actual) { actual.monto = _c2(monto); actual.periodo = periodo; }
  else state.presupuestos.push({ id: uid(), cat, monto: _c2(monto), periodo });
  save();
  closeModal('modal-presu-cat');
  if (periodo !== _pvPeriodo()) periodoPresupuestos(periodo); else renderVistaPresupuestos();
  renderPresupuestos();
  if (typeof avisoRapido === 'function') avisoRapido(`✅ ${nombreCatPresupuesto(cat)}: ${fL(monto)} ${PERIODO_TXT[periodo]}`);
}
function quitarPresupuestoCat() {
  const id = document.getElementById('pc-id').value;
  const p = (state.presupuestos || []).find(x => x.id === id);
  if (!p || !confirm('¿Quitar el presupuesto de ' + nombreCatPresupuesto(p.cat) + '?')) return;
  state.presupuestos = state.presupuestos.filter(x => x.id !== id);
  save();
  closeModal('modal-presu-cat');
  renderVistaPresupuestos(); renderPresupuestos();
}
