// Mi Pisto HN · 29-busqueda-y-recurrentes.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.

// ═══ BUSCAR MOVIMIENTOS ═══════════════════════════════════════════════════
// El buscador de la tarjeta del Inicio busca en todos los meses: categoría,
// comercio o nota, cuenta, tarjeta, etiqueta y monto ("350", "1,250").
// Cada palabra tiene que aparecer. Con algo escrito, la tarjeta muestra los
// resultados por día en vez del mes (25-registros-del-mes.js).
const _busq = { q: '', tipo: 'todos', todo: false };
const BUSQUEDA_VISIBLES = 60;

function buscarMovimientos(q) {
  _busq.q = String(q || '').slice(0, 60);
  _busq.todo = false;
  renderRegistrosMes();
}
function filtroBusqueda(tipo) { _busq.tipo = tipo; renderRegistrosMes(); }
function limpiarBusqueda() {
  const inp = document.getElementById('rm-q'); if (inp) inp.value = '';
  buscarMovimientos('');
}
function verTodoBusqueda() { _busq.todo = true; renderRegistrosMes(); }

// Texto en el que se busca cada movimiento
function _textoBuscable(t) {
  const monto = Number(t.amount) || 0;
  const partes = [t.cat, t.subcat, t.nota, t.etiqueta, t.banco, t.tarjetaNombre, _cuentaTx(t),
    t.type === 'income' ? 'ingreso' : 'gasto',
    monto.toFixed(2), monto.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), String(Math.round(monto))];
  if (Array.isArray(t.splits)) t.splits.forEach(s => partes.push(s.cat));
  return _normCat(partes.filter(Boolean).join(' '));
}
function resultadosBusqueda(q, tipo) {
  const palabras = _normCat(q).split(/\s+/).filter(Boolean);
  if (!palabras.length) return [];
  return (state.transactions || []).filter(t => {
    if (t.deletedAt || t.esSaldoInicial || typeof t.amount !== 'number') return false;
    if (tipo === 'gastos' && t.type !== 'expense') return false;
    if (tipo === 'ingresos' && t.type !== 'income') return false;
    const txt = _textoBuscable(t);
    return palabras.every(p => txt.includes(p));
  }).sort((a, b) => new Date(b.date) - new Date(a.date));
}

/** Pinta los resultados en la tarjeta del Inicio; false si no hay búsqueda */
function renderBusquedaMovimientos() {
  const filtros = document.getElementById('rm-filtros');
  const cuerpo = document.getElementById('registros-mes-cuerpo');
  const q = _busq.q.trim();
  if (!q || !cuerpo) { if (filtros) filtros.style.display = 'none'; return false; }
  const chip = (v, txt) => `<button type="button" role="tab" class="an-seg-btn${_busq.tipo === v ? ' activa' : ''}" aria-selected="${_busq.tipo === v}" onclick="filtroBusqueda('${v}')">${txt}</button>`;
  filtros.innerHTML = chip('todos', 'Todos') + chip('gastos', 'Gastos') + chip('ingresos', 'Ingresos') + '<button type="button" class="rm-limpiar" onclick="limpiarBusqueda()" aria-label="Limpiar búsqueda">✕</button>';
  filtros.style.display = '';
  const res = resultadosBusqueda(q, _busq.tipo);
  const cuentan = res.filter(t => !t.esTransferencia && !t.esConciliacion);
  const gastos = _c2(cuentan.filter(t => t.type === 'expense').reduce((a, t) => a + t.amount, 0));
  const ingresos = _c2(cuentan.filter(t => t.type === 'income').reduce((a, t) => a + t.amount, 0));
  if (!res.length) {
    cuerpo.innerHTML = `<div class="rm-vacio"><div class="rm-vacio-ico">🔍</div><p>No encontramos movimientos con "${esc(q)}".</p></div>`;
    return true;
  }
  const resumen = `<div class="rm-busq-resumen"><strong>${res.length} ${res.length === 1 ? 'resultado' : 'resultados'}</strong>${gastos ? ` · Gastos <b class="rojo">${fL(gastos)}</b>` : ''}${ingresos ? ` · Ingresos <b class="verde">${fL(ingresos)}</b>` : ''}</div>`;
  const visibles = _busq.todo ? res : res.slice(0, BUSQUEDA_VISIBLES);
  const porDia = {};
  visibles.forEach(t => { const k = fechaLocal(new Date(t.date)); (porDia[k] = porDia[k] || []).push(t); });
  const anioActual = new Date().getFullYear();
  const html = Object.keys(porDia).sort().reverse().map(k => {
    const d = new Date(k + 'T12:00:00');
    const titulo = _tituloDia(k) + (d.getFullYear() !== anioActual ? ' ' + d.getFullYear() : '');
    return `<div class="rm-dia"><div class="rm-dia-head"><span>${titulo}</span></div>${_filasDelDia(porDia[k]).map(_htmlFilaRegistro).join('')}</div>`;
  }).join('');
  const mas = res.length > visibles.length ? `<button type="button" class="btn btn-secondary rm-ver-todo" onclick="verTodoBusqueda()">Ver todos (${res.length - visibles.length} más)</button>` : '';
  cuerpo.innerHTML = resumen + html + mas;
  return true;
}

// ═══ GASTOS QUE SE REPITEN → PAGO RECURRENTE ══════════════════════════════
// Si un mismo gasto (por su comercio o nota, o su categoría) aparece en al
// menos 2 de los últimos 3 meses, con un monto parecido (±15%) y cerca del
// mismo día (±6), la app propone guardarlo como pago recurrente para
// recordártelo. No propone lo que ya es un pago recurrente ni lo que dijiste
// que no; tampoco categorías de todos los días (más de 2 veces al mes).
const _REC_DESCARTADOS = 'mph_recurrentes_descartados';
function _descartadosRec() {
  try { return JSON.parse(localStorage.getItem(_REC_DESCARTADOS) || '[]') || []; } catch (e) { return []; }
}
const _mediana2 = xs => { const s = xs.slice().sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

function sugerenciasRecurrentes(ahora) {
  const hoy = ahora ? new Date(ahora) : new Date();
  const desde = new Date(hoy.getFullYear(), hoy.getMonth() - 3, 1);
  const grupos = {};
  (state.transactions || []).forEach(t => {
    if (t.deletedAt || t.type !== 'expense' || t.esTransferencia || t.esConciliacion || t.esSaldoInicial || !(t.amount > 0)) return;
    const d = new Date(t.date);
    if (d < desde || d > hoy) return;
    const nombre = String(t.subcat || t.nota || t.cat || '').trim();
    const k = _normCat(nombre);
    if (!k || k.startsWith('varios (') || k === 'transferencia') return;
    (grupos[k] = grupos[k] || { nombre, txs: [] }).txs.push({ t, d });
  });
  const yaRecurrentes = (state.pagosRecurrentes || []).map(p => _normCat(p.servicio));
  const descartados = _descartadosRec();
  const out = [];
  Object.entries(grupos).forEach(([k, g]) => {
    if (descartados.includes(k) || yaRecurrentes.some(r => r && (r === k || r.includes(k) || k.includes(r)))) return;
    const porMes = {};
    g.txs.forEach(x => { const m = x.d.getFullYear() * 12 + x.d.getMonth(); (porMes[m] = porMes[m] || []).push(x); });
    const meses = Object.keys(porMes).map(Number);
    if (meses.length < 2 || Object.values(porMes).some(xs => xs.length > 2)) return;
    // Uno por mes (el más grande) para comparar montos y días
    const uno = meses.map(m => porMes[m].reduce((a, x) => x.t.amount > a.t.amount ? x : a));
    const montos = uno.map(x => x.t.amount), dias = uno.map(x => x.d.getDate());
    const mMonto = _mediana2(montos), mDia = Math.round(_mediana2(dias));
    if (montos.some(v => Math.abs(v - mMonto) > mMonto * 0.15)) return;
    if (dias.some(v => Math.abs(v - mDia) > 6)) return;
    out.push({ clave: k, nombre: g.nombre, monto: _c2(mMonto), dia: Math.min(28, Math.max(1, mDia)), meses: meses.length, cat: uno[uno.length - 1].t.cat });
  });
  return out.sort((a, b) => b.meses - a.meses || b.monto - a.monto);
}

function renderSugerenciaRecurrente() {
  const el = document.getElementById('sugerencia-recurrente');
  if (!el) return;
  const s = state.setup ? sugerenciasRecurrentes()[0] : null;
  if (!s) { el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = 'block';
  el.innerHTML = `<div class="sug-rec-top">${circuloCategoria(s.cat || s.nombre, 'expense')}<div><strong>¿${esc(s.nombre)} es un pago de cada mes?</strong>
      <small>Lo pagaste en ${s.meses} de los últimos meses, unos ${fL(s.monto)} cerca del día ${s.dia}. Guárdalo y te avisamos antes de que venza.</small></div></div>
    <div class="sug-rec-btns"><button type="button" class="btn btn-primary" data-k="${esc(s.clave)}" onclick="aceptarSugerenciaRecurrente(this.dataset.k)">🔁 Sí, guardarlo</button>
      <button type="button" class="btn btn-secondary" data-k="${esc(s.clave)}" onclick="descartarSugerenciaRecurrente(this.dataset.k)">No es fijo</button></div>`;
}
function aceptarSugerenciaRecurrente(clave) {
  const s = sugerenciasRecurrentes().find(x => x.clave === clave);
  if (!s) return;
  if (!state.pagosRecurrentes) state.pagosRecurrentes = [];
  state.pagosRecurrentes.push({ id: uid(), servicio: s.nombre.slice(0, 60), monto: s.monto, dia: s.dia, pagado: 0 });
  save(); renderAll();
  if (typeof avisoRapido === 'function') avisoRapido(`🔁 ${s.nombre}: te recordamos cada día ${s.dia}`);
}
function descartarSugerenciaRecurrente(clave) {
  const d = _descartadosRec();
  if (!d.includes(clave)) d.push(clave);
  try { localStorage.setItem(_REC_DESCARTADOS, JSON.stringify(d.slice(-200))); } catch (e) {}
  renderSugerenciaRecurrente();
}
