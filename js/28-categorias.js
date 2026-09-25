// Mi Pisto HN · 28-categorias.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.

// ═══ CATEGORÍAS PROPIAS ═══════════════════════════════════════════════════
// state.categorias guarda { id, nombre, tipo: 'gasto'|'ingreso', icono, color,
// fijo?, oculta? }. Sirve para tres cosas:
//  · crear categorías nuevas con su ícono y su color;
//  · cambiarle el ícono o el color a una de fábrica (misma entrada por nombre);
//  · ocultar las de fábrica que no usas (oculta: true).
// Los movimientos siguen guardando la categoría como texto: al renombrar una
// categoría se ofrece cambiarla también en los movimientos y presupuestos.
const ICONOS_CAT = ['🍽️', '🛒', '🚌', '⛽', '💡', '🚰', '📱', '🏠', '💊', '🎓', '💳', '🛋️', '👕', '🎉', '📺', '🐶', '🎁', '📦',
  '☕', '🍔', '🍕', '🥦', '🍺', '🧃', '🚗', '🏍️', '🚕', '✈️', '🧾', '💼', '💻', '🏪', '🌎', '✨', '💰', '🏦', '📈', '🎮',
  '⚽', '💇', '💅', '🧴', '👶', '👵', '⛪', '🛠️', '🧹', '📚', '🎵', '🎬', '🦷', '👓', '🏋️', '🎂', '💍', '🌱', '🐟', '🧺', '🔌', '📮'];
const COLORES_CAT = ['#E53935', '#D81B60', '#8E24AA', '#5E35B1', '#3949AB', '#1E88E5', '#039BE5', '#00897B', '#43A047', '#7CB342', '#C0CA33', '#F9A825', '#FB8C00', '#F4511E', '#6D4C41', '#546E7A'];
const _tipoCat = t => t === 'ingreso' || t === 'income' ? 'ingreso' : 'gasto';
const _baseCats = tipo => _tipoCat(tipo) === 'ingreso' ? CATS_INGRESO : CATS_GASTO;

/** La entrada guardada para ese nombre (primero la del mismo tipo) */
function _catGuardada(nombre, tipo) {
  const n = _normCat(nombre);
  if (!n) return null;
  const lista = (state.categorias || []).filter(c => _normCat(c.nombre) === n);
  return lista.find(c => c.tipo === _tipoCat(tipo)) || (tipo ? null : lista[0]) || null;
}
const _esDeFabrica = (nombre, tipo) => _baseCats(tipo).some(c => _normCat(c.n) === _normCat(nombre));
const categoriaOculta = (nombre, tipo) => !!(_catGuardada(nombre, tipo) || {}).oculta;

/** Cuántos movimientos usan esa categoría (contando las partes de un gasto dividido) */
function usosCategoria(nombre, tipo) {
  const n = _normCat(nombre), tt = _tipoCat(tipo) === 'ingreso' ? 'income' : 'expense';
  return (state.transactions || []).filter(t => !t.deletedAt && t.type === tt && !t.esTransferencia && (_normCat(t.cat) === n || (Array.isArray(t.splits) && t.splits.some(s => _normCat(s.cat) === n)))).length;
}

// ─── Pantalla ───────────────────────────────────────────────────────────
let _catsVista = 'gasto';
function vistaCategorias(t) { _catsVista = _tipoCat(t); renderCategorias(); }
function _listaCategoriasPantalla(tipo) {
  const vistos = new Set(), filas = [];
  const agregar = (nombre, deFabrica) => {
    const k = _normCat(nombre);
    if (!k || vistos.has(k)) return;
    vistos.add(k);
    filas.push({ nombre, deFabrica, oculta: categoriaOculta(nombre, tipo), usos: usosCategoria(nombre, tipo), propia: !deFabrica && !!_catGuardada(nombre, tipo) });
  };
  (state.categorias || []).filter(c => c.tipo === tipo && !_esDeFabrica(c.nombre, tipo)).forEach(c => agregar(c.nombre, false));
  _baseCats(tipo).forEach(c => agregar(c.n, true));
  // Las que solo existen en tus movimientos (escritas a mano antes)
  categoriasParaElegir(tipo === 'ingreso' ? 'ingreso' : 'gasto', true).forEach(nm => agregar(nm, false));
  return filas;
}
function renderCategorias() {
  const el = document.getElementById('categorias-contenido');
  if (!el) return;
  const tipo = _catsVista, tt = tipo === 'ingreso' ? 'income' : 'expense';
  const filas = _listaCategoriasPantalla(tipo);
  const seg = (v, txt) => `<button type="button" role="tab" class="an-seg-btn${tipo === v ? ' activa' : ''}" aria-selected="${tipo === v}" onclick="vistaCategorias('${v}')">${txt}</button>`;
  const fila = f => `<button type="button" class="cat-fila${f.oculta ? ' oculta' : ''}" data-cat="${esc(f.nombre)}" onclick="abrirEditorCategoria(this.dataset.cat)">
      ${circuloCategoria(f.nombre, tt)}
      <span class="cat-fila-info"><strong>${esc(f.nombre)}</strong><small>${[f.deFabrica ? 'De fábrica' : f.propia ? 'Tuya' : 'De tus movimientos', f.usos ? f.usos + (f.usos === 1 ? ' movimiento' : ' movimientos') : '', f.oculta ? 'Oculta' : ''].filter(Boolean).join(' · ')}</small></span>
      <span class="cat-fila-ir" aria-hidden="true">›</span></button>`;
  const visibles = filas.filter(f => !f.oculta), ocultas = filas.filter(f => f.oculta);
  el.innerHTML = `<div class="an-segmentos" role="tablist">${seg('gasto', '💸 Gastos')}${seg('ingreso', '💰 Ingresos')}</div>
    <button type="button" class="btn btn-primary" onclick="abrirEditorCategoria(null, '${tipo}')">＋ Nueva categoría de ${tipo === 'ingreso' ? 'ingreso' : 'gasto'}</button>
    <div class="cat-lista">${visibles.map(fila).join('')}</div>
    ${ocultas.length ? `<h4 class="pv-titulo">Ocultas (${ocultas.length})</h4><div class="cat-lista">${ocultas.map(fila).join('')}</div>` : ''}
    <p class="pv-vacio">Toca una categoría para cambiarle el ícono, el color o el nombre. Las ocultas no salen al registrar, pero tus movimientos no se tocan.</p>`;
}

// ─── Editor ─────────────────────────────────────────────────────────────
const _ed = { original: null, tipo: 'gasto', icono: '📦', color: COLORES_CAT[0], alGuardar: null };
/** Abre el editor: nombre = null para una nueva; alGuardar(nombre) se llama al guardar */
function abrirEditorCategoria(nombre, tipo, alGuardar) {
  _ed.tipo = _tipoCat(tipo || _catsVista);
  _ed.original = nombre || null;
  _ed.alGuardar = typeof alGuardar === 'function' ? alGuardar : null;
  const x = nombre ? iconoCategoria(nombre, _ed.tipo === 'ingreso' ? 'income' : 'expense') : null;
  _ed.icono = x && !x.letra ? x.i : ICONOS_CAT[17];
  _ed.color = x ? x.c : COLORES_CAT[(state.categorias || []).length % COLORES_CAT.length];
  const deFabrica = nombre && _esDeFabrica(nombre, _ed.tipo);
  const guardada = nombre && _catGuardada(nombre, _ed.tipo);
  const base = deFabrica && _baseCats(_ed.tipo).find(c => _normCat(c.n) === _normCat(nombre));
  const inp = document.getElementById('ce-nombre');
  inp.value = nombre || '';
  inp.disabled = !!deFabrica;
  document.getElementById('ce-titulo').textContent = nombre ? 'Editar categoría' : 'Nueva categoría de ' + (_ed.tipo === 'ingreso' ? 'ingreso' : 'gasto');
  document.getElementById('ce-nota-fabrica').style.display = deFabrica ? '' : 'none';
  const fijo = document.getElementById('ce-fijo');
  document.getElementById('ce-fijo-fila').style.display = _ed.tipo === 'gasto' ? '' : 'none';
  fijo.checked = guardada && typeof guardada.fijo === 'boolean' ? guardada.fijo : base ? !!base.f : nombre ? _tipoGastoDeCat(nombre) === 'fijo' : false;
  const usos = nombre ? usosCategoria(nombre, _ed.tipo) : 0;
  document.getElementById('ce-renombrar-fila').style.display = 'none';
  document.getElementById('ce-renombrar').checked = true;
  document.getElementById('ce-renombrar-txt').textContent = `Cambiar también en ${usos} ${usos === 1 ? 'movimiento' : 'movimientos'} y sus presupuestos`;
  document.getElementById('ce-renombrar-fila').dataset.usos = String(usos);
  const oc = document.getElementById('ce-ocultar');
  oc.style.display = nombre ? '' : 'none';
  oc.textContent = guardada && guardada.oculta ? '👁️ Mostrar otra vez al registrar' : '🙈 Ocultar al registrar';
  document.getElementById('ce-borrar').style.display = nombre && !deFabrica && guardada ? '' : 'none';
  _renderEditorCategoria();
  openModal('modal-categoria');
}
function _renderEditorCategoria() {
  const nombre = document.getElementById('ce-nombre').value.trim() || 'Nueva';
  document.getElementById('ce-vista').innerHTML = `<span class="cat-circulo grande" style="background:${_ed.color}" aria-hidden="true">${esc(_ed.icono)}</span><strong>${esc(nombre)}</strong>`;
  document.getElementById('ce-iconos').innerHTML = ICONOS_CAT.map(i => `<button type="button" class="ce-icono${i === _ed.icono ? ' activo' : ''}" data-i="${esc(i)}" onclick="elegirIconoCategoria(this.dataset.i)" aria-label="Ícono ${esc(i)}">${esc(i)}</button>`).join('');
  document.getElementById('ce-colores').innerHTML = COLORES_CAT.map(c => `<button type="button" class="ce-color${c === _ed.color ? ' activo' : ''}" data-c="${c}" style="background:${c}" onclick="elegirColorCategoria(this.dataset.c)" aria-label="Color ${c}"></button>`).join('');
  // Renombrar una categoría con movimientos: ofrecer cambiarlos también
  const fila = document.getElementById('ce-renombrar-fila');
  const cambia = _ed.original && _normCat(document.getElementById('ce-nombre').value) !== _normCat(_ed.original);
  fila.style.display = cambia && Number(fila.dataset.usos) > 0 ? '' : 'none';
}
function elegirIconoCategoria(i) { if (ICONOS_CAT.includes(i)) { _ed.icono = i; _renderEditorCategoria(); } }
function elegirColorCategoria(c) { if (COLORES_CAT.includes(c)) { _ed.color = c; _renderEditorCategoria(); } }

function _entradaCategoria(nombre, tipo) {
  if (!state.categorias) state.categorias = [];
  let c = _catGuardada(nombre, tipo);
  if (!c) { c = { id: uid(), nombre, tipo: _tipoCat(tipo) }; state.categorias.push(c); }
  return c;
}
/** Cambia el nombre en los movimientos (y sus partes) y en los presupuestos */
function _renombrarEnMovimientos(viejo, nuevo, tipo) {
  const n = _normCat(viejo), tt = _tipoCat(tipo) === 'ingreso' ? 'income' : 'expense';
  (state.transactions || []).forEach(t => {
    if (t.type !== tt) return;
    if (_normCat(t.cat) === n) t.cat = nuevo;
    if (Array.isArray(t.splits)) t.splits.forEach(s => { if (_normCat(s.cat) === n) s.cat = nuevo; });
  });
  if (tt === 'expense') (state.presupuestos || []).forEach(p => { if (p.cat !== TODOS_LOS_GASTOS && _normCat(p.cat) === n) p.cat = nuevo; });
}
function guardarCategoria() {
  const tipo = _ed.tipo, original = _ed.original;
  const nombre = original && _esDeFabrica(original, tipo) ? original : document.getElementById('ce-nombre').value.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 30);
  if (!nombre) return alert('Escribe el nombre de la categoría.');
  if (_normCat(nombre) === 'transferencia' || _normCat(nombre).startsWith('varios (')) return alert('Ese nombre lo usa la app. Elige otro.');
  // No repetir el nombre de otra categoría del mismo tipo
  // (una que solo existía en tus movimientos no cuenta: se le pone ícono y color)
  const repetida = _normCat(nombre) !== _normCat(original || '') && (_esDeFabrica(nombre, tipo) || !!_catGuardada(nombre, tipo));
  if (repetida) return alert('Ya tienes una categoría llamada "' + nombre + '".');
  const renombrar = original && _normCat(nombre) !== _normCat(original);
  let c;
  if (renombrar) {
    c = _entradaCategoria(original, tipo);
    c.nombre = nombre;
    if (document.getElementById('ce-renombrar').checked) _renombrarEnMovimientos(original, nombre, tipo);
  } else c = _entradaCategoria(original || nombre, tipo);
  c.icono = _ed.icono;
  c.color = _ed.color;
  if (tipo === 'gasto') c.fijo = !!document.getElementById('ce-fijo').checked; else delete c.fijo;
  if (!original) c.oculta = false;
  save();
  closeModal('modal-categoria');
  const cb = _ed.alGuardar; _ed.alGuardar = null;
  renderAll();
  renderCategorias();
  if (typeof avisoRapido === 'function') avisoRapido('✅ Categoría guardada: ' + nombre);
  if (cb) cb(nombre);
}
function ocultarCategoria() {
  const nombre = _ed.original;
  if (!nombre) return;
  const c = _entradaCategoria(nombre, _ed.tipo);
  if (!c.icono) { const x = iconoCategoria(nombre, _ed.tipo === 'ingreso' ? 'income' : 'expense'); c.icono = x.letra ? '📦' : x.i; c.color = x.c; }
  c.oculta = !c.oculta;
  save();
  closeModal('modal-categoria');
  renderCategorias();
  if (typeof avisoRapido === 'function') avisoRapido(c.oculta ? '🙈 ' + nombre + ' ya no sale al registrar' : '👁️ ' + nombre + ' vuelve a salir al registrar');
}
function borrarCategoria() {
  const c = _ed.original && _catGuardada(_ed.original, _ed.tipo);
  if (!c || _esDeFabrica(c.nombre, _ed.tipo)) return;
  const usos = usosCategoria(c.nombre, _ed.tipo);
  if (!confirm('¿Borrar la categoría ' + c.nombre + '?' + (usos ? '\n\nTus ' + usos + ' movimientos la conservan: solo pierde su ícono y su color.' : ''))) return;
  state.categorias = state.categorias.filter(x => x !== c);
  save();
  closeModal('modal-categoria');
  renderAll();
  renderCategorias();
}
