// Mi Pisto HN · 24-registro-rapido.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.

// ═══ CATEGORÍAS CON ÍCONO Y COLOR ═════════════════════════════════════════
// Las categorías siguen siendo texto libre (así estaban guardadas siempre):
// estas listas solo dan el ícono y el color, y las propias de cada quien
// aparecen junto a las de fábrica. `k` son palabras que la reconocen aunque
// se haya escrito distinto ("almuerzo" → Comida) y `f` marca las que son
// gasto fijo (necesario para vivir).
const CATS_GASTO = [
  { n: 'Comida', i: '🍽️', c: '#E53935', f: true, k: ['comida', 'almuerzo', 'desayuno', 'cena', 'restaurante', 'baleada', 'pollo', 'pizza', 'cafe', 'antojo', 'snack'] },
  { n: 'Supermercado', i: '🛒', c: '#1E88E5', f: true, k: ['super', 'despensa', 'pricesmart', 'walmart', 'paiz', 'colonia', 'mercado', 'pulperia'] },
  { n: 'Transporte', i: '🚌', c: '#8E24AA', f: true, k: ['transporte', 'bus', 'taxi', 'uber', 'indrive', 'rapidito', 'pasaje'] },
  { n: 'Gasolina', i: '⛽', c: '#F4511E', f: true, k: ['gasolina', 'combustible', 'diesel'] },
  { n: 'Luz', i: '💡', c: '#F9A825', f: true, k: ['luz', 'enee', 'energia', 'electricidad'] },
  { n: 'Agua', i: '🚰', c: '#039BE5', f: true, k: ['agua', 'sanaa'] },
  { n: 'Internet y teléfono', i: '📱', c: '#00897B', f: true, k: ['internet', 'telefono', 'celular', 'tigo', 'claro', 'recarga', 'cable'] },
  { n: 'Alquiler', i: '🏠', c: '#6D4C41', f: true, k: ['alquiler', 'renta', 'vivienda', 'cuarto'] },
  { n: 'Salud', i: '💊', c: '#D81B60', f: true, k: ['salud', 'farmacia', 'medicina', 'doctor', 'medico', 'hospital', 'clinica', 'dentista'] },
  { n: 'Educación', i: '🎓', c: '#3949AB', f: true, k: ['educacion', 'colegio', 'escuela', 'universidad', 'curso', 'libro', 'matricula'] },
  { n: 'Deudas', i: '💳', c: '#546E7A', f: true, k: ['deuda', 'prestamo', 'cuota', 'abono'] },
  { n: 'Hogar', i: '🛋️', c: '#7CB342', f: false, k: ['hogar', 'limpieza', 'mueble', 'ferreteria'] },
  { n: 'Ropa', i: '👕', c: '#FB8C00', f: false, k: ['ropa', 'zapato', 'calzado', 'vestido'] },
  { n: 'Salidas', i: '🎉', c: '#C0CA33', f: false, k: ['salida', 'fiesta', 'bar', 'cine', 'paseo', 'diversion', 'ocio', 'entretenimiento'] },
  { n: 'Suscripciones', i: '📺', c: '#5E35B1', f: false, k: ['netflix', 'spotify', 'suscripcion', 'disney', 'hbo', 'youtube'] },
  { n: 'Mascotas', i: '🐶', c: '#8D6E63', f: false, k: ['mascota', 'perro', 'gato', 'veterinari'] },
  { n: 'Regalos', i: '🎁', c: '#EC407A', f: false, k: ['regalo', 'cumpleanos'] },
  { n: 'Otros', i: '📦', c: '#78909C', f: false, k: ['otro', 'general', 'varios'] },
];
// `tipo` es el que ya usaba el formulario de ingresos
const CATS_INGRESO = [
  { n: 'Salario', i: '💼', c: '#43A047', tipo: 'salario', k: ['salario', 'quincena', 'sueldo', 'nomina'] },
  { n: 'Extra', i: '✨', c: '#F9A825', tipo: 'extra', k: ['extra', 'bono', 'aguinaldo', 'decimo', 'catorceavo'] },
  { n: 'Freelance', i: '💻', c: '#1E88E5', tipo: 'freelance', k: ['freelance', 'independiente', 'proyecto'] },
  { n: 'Negocio', i: '🏪', c: '#FB8C00', tipo: 'negocio', k: ['negocio', 'venta'] },
  { n: 'Remesa', i: '🌎', c: '#00ACC1', tipo: 'extra', k: ['remesa', 'envio'] },
  { n: 'Regalo', i: '🎁', c: '#EC407A', tipo: 'extra', k: ['regalo'] },
  { n: 'Otros', i: '📦', c: '#78909C', tipo: 'extra', k: [] },
];
const _COLORES_CAT = ['#E53935', '#1E88E5', '#8E24AA', '#00897B', '#F4511E', '#3949AB', '#6D4C41', '#D81B60', '#7CB342', '#546E7A'];
const _normCat = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** Ícono y color de una categoría (de fábrica, reconocida por palabra o por su inicial) */
function iconoCategoria(cat, tipo) {
  const n = _normCat(cat);
  if (n === 'transferencia') return { i: '⇄', c: '#607D8B' };
  if (n.startsWith('varios (')) return { i: '🧾', c: '#78909C' };
  // Una categoría propia o una de fábrica con otro ícono o color (28-categorias.js)
  const propia = typeof _catGuardada === 'function' ? (_catGuardada(cat, tipo === 'income' ? 'ingreso' : tipo === 'expense' ? 'gasto' : undefined)) : null;
  if (propia && propia.icono) {
    const base = (tipo === 'income' ? CATS_INGRESO : CATS_GASTO).find(c => _normCat(c.n) === n);
    return { n: propia.nombre, i: propia.icono, c: propia.color, f: typeof propia.fijo === 'boolean' ? propia.fijo : !!(base && base.f), tipo: base && base.tipo, propia: true };
  }
  const listas = tipo === 'income' ? [CATS_INGRESO, CATS_GASTO] : [CATS_GASTO, CATS_INGRESO];
  for (const l of listas) { const x = l.find(c => _normCat(c.n) === n); if (x) return x; }
  for (const l of listas) { const x = l.find(c => c.k.some(p => n.includes(p))); if (x) return x; }
  let h = 0; for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { i: (String(cat || '?').trim()[0] || '?').toUpperCase(), c: _COLORES_CAT[h % _COLORES_CAT.length], letra: true };
}
const circuloCategoria = (cat, tipo, extra) => {
  const x = iconoCategoria(cat, tipo);
  return `<span class="cat-circulo${x.letra ? ' letra' : ''}${extra ? ' ' + extra : ''}" style="background:${x.c}" aria-hidden="true">${esc(x.i)}</span>`;
};

/** Las categorías para elegir: las que creaste, las de fábrica (sin las ocultas) y
    las que solo existen en tus movimientos, de la más usada a la menos.
    Con soloDeMovimientos, solo estas últimas (todas). */
function categoriasParaElegir(tipo, soloDeMovimientos) {
  const t = tipo === 'ingreso' ? 'ingreso' : 'gasto';
  const base = t === 'ingreso' ? CATS_INGRESO : CATS_GASTO;
  const tt = t === 'ingreso' ? 'income' : 'expense';
  const creadas = (state.categorias || []).filter(c => c.tipo === t);
  const usos = {};
  (state.transactions || []).forEach(x => {
    if (x.deletedAt || x.type !== tt || x.esTransferencia || x.esConciliacion || x.esSaldoInicial || !x.cat) return;
    if (_normCat(x.cat).startsWith('varios (')) return;
    const nombre = String(x.cat).trim();
    usos[nombre] = (usos[nombre] || 0) + 1;
  });
  const conocida = nm => base.some(c => _normCat(c.n) === _normCat(nm)) || creadas.some(c => _normCat(c.nombre) === _normCat(nm));
  const deMovimientos = Object.keys(usos).filter(nm => !conocida(nm)).sort((a, b) => usos[b] - usos[a]);
  if (soloDeMovimientos) return deMovimientos;
  const oculta = nm => creadas.some(c => c.oculta && _normCat(c.nombre) === _normCat(nm));
  return creadas.filter(c => !c.oculta && !base.some(b => _normCat(b.n) === _normCat(c.nombre))).map(c => c.nombre)
    .concat(base.map(c => c.n).filter(nm => !oculta(nm)), deMovimientos.slice(0, 12));
}

// ═══ REGISTRO RÁPIDO CON TECLADO ══════════════════════════════════════════
// Una sola pantalla para Gasto, Ingreso y Transferencia: cuenta y categoría
// con un toque, el monto con un teclado-calculadora propio (150+200 → 350)
// y la fecha abajo. Guarda con las mismas funciones del formulario completo
// (saveGasto, saveIngreso, ejecutarTransferencia), así respeta tarjetas,
// cuentas en dólares, avisos de saldo, etc. "Más opciones" pasa lo escrito
// al formulario completo (moneda extranjera, dividir, cuotas, factura…).
const _reg = { tipo: 'gasto', expr: '', cuenta: 'efectivo', tarjeta: null, cat: null, hacia: 'ahorro', moneda: 'HNL' };
const _REG_ULTIMA = 'mph_registro_ultima';

function _regRecordar() {
  try { localStorage.setItem(_REG_ULTIMA, JSON.stringify({ cuenta: _reg.cuenta, tarjeta: _reg.tarjeta, hacia: _reg.hacia })); } catch (e) {}
}
function _regUltima() {
  try { return JSON.parse(localStorage.getItem(_REG_ULTIMA) || '{}') || {}; } catch (e) { return {}; }
}

function abrirRegistro(tipo) {
  if (typeof closeFabMenu === 'function') closeFabMenu();
  const u = _regUltima();
  _reg.tipo = ['gasto', 'ingreso', 'transferencia'].includes(tipo) ? tipo : 'gasto';
  _reg.expr = '';
  _reg.cat = null;
  _reg.moneda = 'HNL';
  _reg.cuenta = cuentaValida(u.cuenta, 'efectivo');
  _reg.tarjeta = u.tarjeta && (state.tarjetas || []).some(t => String(t.id) === String(u.tarjeta)) ? u.tarjeta : null;
  _reg.hacia = cuentaValida(u.hacia, 'ahorro');
  const nota = document.getElementById('reg-nota'); if (nota) nota.value = '';
  const hoy = fechaLocal();
  const f = document.getElementById('reg-fecha'); if (f) { f.value = hoy; f.max = hoy; }
  const h = document.getElementById('reg-hora'); if (h) { const d = new Date(); h.value = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); h.dataset.tocada = ''; }
  if (typeof reiniciarRemesaRegistro === 'function') reiniciarRemesaRegistro();
  cerrarSelectorRegistro();
  renderRegistro();
  openModal('modal-registro');
}
function cerrarRegistro() {
  cerrarSelectorRegistro();
  closeModal('modal-registro');
}
function cambiarTipoRegistro(tipo) {
  if (tipo === _reg.tipo) return;
  _reg.tipo = tipo;
  _reg.cat = null;
  // Una tarjeta solo sirve para gastos
  if (tipo !== 'gasto') _reg.tarjeta = null;
  cerrarSelectorRegistro();
  renderRegistro();
}

// ─── Teclado-calculadora ────────────────────────────────────────────────
const _REG_OPS = ['+', '-', '*', '/'];
function teclaRegistro(k) {
  let e = _reg.expr;
  const ult = e.slice(-1);
  if (k === 'borrar') e = e.slice(0, -1);
  else if (k === '=') { const v = _regValor(); e = v === null ? e : _regNumTxt(v); }
  else if (_REG_OPS.includes(k)) {
    if (!e) return;
    if (_REG_OPS.includes(ult)) e = e.slice(0, -1);
    if (ult === '.') e = e.slice(0, -1);
    e += k;
  } else if (k === '.') {
    const num = e.split(/[+\-*/]/).pop();
    if (num.includes('.')) return;
    e += num ? '.' : '0.';
  } else if (/^\d$/.test(k)) {
    const num = e.split(/[+\-*/]/).pop();
    // Dos decimales como máximo y sin ceros de más a la izquierda
    if (/\.\d{2}$/.test(num)) return;
    if (num === '0') e = e.slice(0, -1);
    if (num.replace('.', '').length >= 10) return;
    e += k;
  }
  if (e.length > 40) return;
  _reg.expr = e;
  renderMontoRegistro();
}
const _regNumTxt = v => (Math.round(v * 100) / 100).toString();
/** El valor del monto (con las operaciones resueltas) o null si no es válido */
function _regValor() {
  let e = _reg.expr;
  while (e && (_REG_OPS.includes(e.slice(-1)) || e.slice(-1) === '.')) e = e.slice(0, -1);
  if (!e) return null;
  const v = parseMonto(e);
  return v === null ? null : v;
}
function _regFormato(e) {
  return e.replace(/\*/g, '×').replace(/\//g, '÷').replace(/-/g, '−').replace(/\d+(\.\d*)?/g, m => {
    const [ent, dec] = m.split('.');
    return Number(ent).toLocaleString('en-US') + (dec !== undefined ? '.' + dec : '');
  });
}
function renderMontoRegistro() {
  const el = document.getElementById('reg-monto');
  if (!el) return;
  const e = _reg.expr;
  el.textContent = e ? _regFormato(e) : '0';
  el.classList.toggle('vacio', !e);
  const res = document.getElementById('reg-resultado');
  const conOp = /\d[+\-*/]\d/.test(e);
  const v = conOp ? _regValor() : null;
  if (res) res.textContent = conOp ? (v !== null ? '= ' + fL(v) : '= ?') : '';
  // Una remesa en dólares (30-remesas.js) o un gasto en dólares con una tarjeta
  // en lempiras y dólares (32-tarjetas-dolares.js): el símbolo y cuánto es en lempiras
  const gUsd = typeof gastoEnDolares === 'function' && gastoEnDolares();
  const usd = gUsd || (typeof remesaEnDolares === 'function' && remesaEnDolares());
  const sim = document.querySelector('#modal-registro .reg-moneda');
  if (sim) {
    sim.textContent = usd ? 'US$' : 'L';
    const cambiable = typeof _regTarjetaBimoneda === 'function' && !!_regTarjetaBimoneda();
    sim.classList.toggle('cambiable', cambiable);
    sim.onclick = cambiable ? cambiarMonedaRegistro : null;
    if (cambiable) sim.title = 'Toca para cambiar entre lempiras y dólares'; else sim.removeAttribute('title');
  }
  if (usd && res) { const val = conOp ? v : _regValor(); if (val > 0) res.textContent = (conOp ? '= US$ ' + _regNumTxt(val) + ' · ' : '') + '≈ ' + fL(_c2(val * tasaUSD(gUsd ? 'ask' : 'bid'))); }
  renderPresuRegistro();
}

// ─── El presupuesto de la categoría, antes de gastar ────────────────────
// "Te quedan L 1,900 de L 3,000 esta quincena" y, con el monto escrito,
// si con este gasto te pasas. Usa el tope de la categoría o, si no tiene,
// el de "Todos mis gastos" (18-presupuestos.js).
const _PERIODO_ESTE = { semana: 'esta semana', quincena: 'esta quincena', mes: 'este mes' };
function presupuestoParaRegistro(cat) {
  const ps = state.presupuestos || [];
  const orden = { semana: 0, quincena: 1, mes: 2 };
  const deCat = ps.filter(p => p.cat !== TODOS_LOS_GASTOS && _mismaCat(p.cat, cat)).sort((a, b) => orden[a.periodo] - orden[b.periodo]);
  return deCat[0] || ps.filter(p => p.cat === TODOS_LOS_GASTOS).sort((a, b) => orden[a.periodo] - orden[b.periodo])[0] || null;
}
function renderPresuRegistro() {
  const el = document.getElementById('reg-presu');
  if (!el) return;
  const p = _reg.tipo === 'gasto' && _reg.cat && typeof estadoPresupuestoEn === 'function' ? presupuestoParaRegistro(_reg.cat) : null;
  if (!p) { el.style.display = 'none'; el.innerHTML = ''; return; }
  const e = estadoPresupuestoEn(p, rangoPeriodo(p.periodo, fechaRegistro()));
  const monto = _regValor() || 0;
  const despues = _c2(e.queda - monto);
  const quien = p.cat === TODOS_LOS_GASTOS ? 'Todos tus gastos' : esc(nombreCatPresupuesto(p.cat));
  const en = p.cat === TODOS_LOS_GASTOS ? 'en tus gastos' : 'en ' + esc(nombreCatPresupuesto(p.cat));
  let nivel, txt;
  if (e.queda <= 0) { nivel = 'pasado'; txt = `🚨 Ya te pasaste ${en} por ${fL(-e.queda)} (tope ${fL(p.monto)} ${_PERIODO_ESTE[p.periodo]})`; }
  else if (monto > 0 && despues < 0) { nivel = 'pasado'; txt = `🚨 Con este gasto te pasas ${en} por ${fL(-despues)} (te quedan ${fL(e.queda)} de ${fL(p.monto)} ${_PERIODO_ESTE[p.periodo]})`; }
  else if (monto > 0) { nivel = despues < p.monto * 0.2 ? 'aviso' : 'bien'; txt = `${nivel === 'aviso' ? '⚠️' : '📅'} ${quien}: después de este gasto te quedan ${fL(despues)} de ${fL(p.monto)} ${_PERIODO_ESTE[p.periodo]}`; }
  else { nivel = e.nivel === 'aviso' ? 'aviso' : 'bien'; txt = `${nivel === 'aviso' ? '⚠️' : '📅'} ${quien}: te quedan ${fL(e.queda)} de ${fL(p.monto)} ${_PERIODO_ESTE[p.periodo]}`; }
  el.className = 'reg-presu ' + nivel;
  el.innerHTML = txt;
  el.style.display = '';
}

// ─── Pantalla ───────────────────────────────────────────────────────────
function _regEtiquetaCuenta() {
  if (_reg.tipo === 'gasto' && _reg.tarjeta) {
    const tc = (state.tarjetas || []).find(t => String(t.id) === String(_reg.tarjeta));
    if (tc) return '💳 ' + esc(tc.nombre);
  }
  return esc(etiquetaCuenta(_reg.cuenta));
}
function renderRegistro() {
  const t = _reg.tipo;
  document.querySelectorAll('#modal-registro .reg-tab').forEach(b => {
    const activa = b.dataset.tipo === t;
    b.classList.toggle('activa', activa);
    b.setAttribute('aria-selected', String(activa));
  });
  const m = document.getElementById('modal-registro');
  if (m) m.dataset.tipo = t;
  const a = document.getElementById('reg-btn-a'), b = document.getElementById('reg-btn-b');
  const la = document.getElementById('reg-lbl-a'), lb = document.getElementById('reg-lbl-b');
  if (t === 'transferencia') {
    la.textContent = 'Desde'; lb.textContent = 'Hacia';
    a.innerHTML = esc(etiquetaCuenta(_reg.cuenta));
    b.innerHTML = esc(etiquetaCuenta(_reg.hacia));
    b.classList.remove('falta');
  } else {
    la.textContent = 'Cuenta'; lb.textContent = 'Categoría';
    a.innerHTML = _regEtiquetaCuenta();
    b.innerHTML = _reg.cat ? circuloCategoria(_reg.cat, t === 'ingreso' ? 'income' : 'expense', 'mini') + ' ' + esc(_reg.cat) : 'Elegir categoría';
    b.classList.toggle('falta', !_reg.cat);
  }
  const nota = document.getElementById('reg-nota');
  if (nota) nota.placeholder = t === 'gasto' ? 'Nota o comercio (opcional)' : t === 'ingreso' ? 'Nota (opcional: quincena de enero)' : 'Nota (opcional)';
  if (typeof renderRemesaRegistro === 'function') renderRemesaRegistro();
  renderMontoRegistro();
}

// ─── Selector de cuenta y de categoría (hoja dentro de la pantalla) ─────
function abrirSelectorRegistro(cual) {
  const hoja = document.getElementById('reg-selector');
  if (!hoja) return;
  const t = _reg.tipo;
  let titulo, opciones;
  if (cual === 'b' && t !== 'transferencia') {
    titulo = t === 'ingreso' ? '¿De dónde viene?' : '¿En qué gastaste?';
    const tt = t === 'ingreso' ? 'income' : 'expense';
    opciones = categoriasParaElegir(t).map(nm => `<button type="button" class="reg-cat${_reg.cat === nm ? ' activa' : ''}" data-cat="${esc(nm)}" onclick="elegirCatRegistro(this.dataset.cat)">${circuloCategoria(nm, tt)}<span>${esc(nm)}</span></button>`).join('')
      + `<button type="button" class="reg-cat" onclick="nuevaCatRegistro()"><span class="cat-circulo letra" style="background:var(--bg4);color:var(--text)">＋</span><span>Otra</span></button>`;
    hoja.innerHTML = `<div class="reg-sel-head"><strong>${titulo}</strong><span><button type="button" class="reg-sel-editar" onclick="editarCategoriasRegistro()">✏️ Editar</button><button type="button" onclick="cerrarSelectorRegistro()" aria-label="Cerrar">✕</button></span></div><div class="reg-cats">${opciones}</div>`;
  } else {
    const destino = cual === 'b' ? 'hacia' : 'cuenta';
    titulo = t === 'transferencia' ? (cual === 'b' ? '¿A qué cuenta?' : '¿De qué cuenta sale?') : t === 'ingreso' ? '¿A qué cuenta entra?' : '¿Con qué pagaste?';
    const actual = destino === 'hacia' ? _reg.hacia : _reg.cuenta;
    opciones = listaCuentas().map(c => {
      const activa = actual === c.id && !(destino === 'cuenta' && _reg.tarjeta);
      return `<button type="button" class="reg-cuenta${activa ? ' activa' : ''}" data-id="${esc(c.id)}" onclick="elegirCuentaRegistro('${destino}', this.dataset.id)"><span class="reg-cuenta-ico" style="background:${esc(c.color || '#4285F4')}22">${esc(c.icono)}</span><span class="reg-cuenta-nom">${esc(nombreCompletoCuenta(c))}</span><span class="reg-cuenta-sal">${fL(getCuentaBalance(c.id))}</span></button>`;
    }).join('');
    if (t === 'gasto' && (state.tarjetas || []).length) {
      opciones += `<div class="reg-sel-sub">Tarjetas de crédito</div>` + state.tarjetas.map(tc => `<button type="button" class="reg-cuenta${String(_reg.tarjeta) === String(tc.id) ? ' activa' : ''}" data-id="${esc(tc.id)}" onclick="elegirTarjetaRegistro(this.dataset.id)"><span class="reg-cuenta-ico" style="background:rgba(var(--red-rgb),.14)">💳</span><span class="reg-cuenta-nom">${esc(tc.nombre)}</span><span class="reg-cuenta-sal">${esc(textoSaldoTarjeta(tc))}</span></button>`).join('');
    }
    hoja.innerHTML = `<div class="reg-sel-head"><strong>${titulo}</strong><button type="button" onclick="cerrarSelectorRegistro()" aria-label="Cerrar">✕</button></div><div class="reg-cuentas">${opciones}</div>`;
  }
  hoja.classList.add('abierto');
}
function cerrarSelectorRegistro() {
  const hoja = document.getElementById('reg-selector');
  if (hoja) { hoja.classList.remove('abierto'); hoja.innerHTML = ''; }
}
function elegirCatRegistro(nm) {
  _reg.cat = String(nm || '').trim() || null;
  cerrarSelectorRegistro();
  renderRegistro();
}
function nuevaCatRegistro() {
  // El editor de categorías (ícono y color) se abre encima; al guardar queda elegida
  abrirEditorCategoria(null, _reg.tipo === 'ingreso' ? 'ingreso' : 'gasto', nm => elegirCatRegistro(nm));
}
function editarCategoriasRegistro() {
  cerrarRegistro();
  switchView('categorias');
}
function elegirCuentaRegistro(destino, id) {
  if (!esCuentaLiquida(id)) return;
  if (destino === 'hacia') _reg.hacia = id;
  else { _reg.cuenta = id; _reg.tarjeta = null; }
  cerrarSelectorRegistro();
  renderRegistro();
}
function elegirTarjetaRegistro(id) {
  if (!(state.tarjetas || []).some(t => String(t.id) === String(id))) return;
  _reg.tarjeta = id;
  cerrarSelectorRegistro();
  renderRegistro();
}

// ─── Fecha elegida → fecha del movimiento ───────────────────────────────
// Si es hoy y no tocaste la hora, se guarda la hora exacta de este momento.
function fechaRegistro() {
  const f = document.getElementById('reg-fecha')?.value;
  const h = document.getElementById('reg-hora');
  if (!f || f === fechaLocal()) {
    if (!h || !h.dataset.tocada) return new Date();
  }
  const d = new Date((f || fechaLocal()) + 'T' + ((h && h.value) || '12:00') + ':00');
  return isNaN(d) ? new Date() : d;
}

/** Tipo fijo/extra de un gasto según su categoría (o como la usaste antes) */
function _tipoGastoDeCat(cat) {
  const propia = typeof _catGuardada === 'function' ? _catGuardada(cat, 'gasto') : null;
  if (propia && typeof propia.fijo === 'boolean') return propia.fijo ? 'fijo' : 'extra';
  const base = CATS_GASTO.find(c => _normCat(c.n) === _normCat(cat));
  if (base) return base.f ? 'fijo' : 'extra';
  const previos = (state.transactions || []).filter(t => !t.deletedAt && t.type === 'expense' && _normCat(t.cat) === _normCat(cat));
  const fijos = previos.filter(t => t.tipo === 'fijo').length;
  return previos.length && fijos * 2 >= previos.length ? 'fijo' : 'extra';
}

// Pasa lo escrito al formulario completo correspondiente
function _regLlenarFormulario(monto) {
  const t = _reg.tipo;
  const nota = (document.getElementById('reg-nota')?.value || '').trim();
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  if (t === 'gasto') {
    if (typeof resetGastoSplit === 'function') resetGastoSplit();
    set('gasto-monto', monto ? _regNumTxt(monto) : '');
    set('gasto-moneda', typeof gastoEnDolares === 'function' && gastoEnDolares() ? 'USD' : 'HNL');
    set('gasto-cat', _reg.cat || '');
    set('gasto-subcat', nota);
    if (_reg.cat) set('gasto-tipo', _tipoGastoDeCat(_reg.cat));
    if (typeof sincronizarSelectsCuentas === 'function') sincronizarSelectsCuentas();
    set('gasto-cuenta', _reg.tarjeta ? 'credito' : _reg.cuenta);
    if (typeof checkCreditCard === 'function') checkCreditCard();
    if (_reg.tarjeta) set('gasto-tarjeta', String(_reg.tarjeta));
    const conv = document.getElementById('gasto-conversion-info'); if (conv) conv.style.display = 'none';
  } else if (t === 'ingreso') {
    const cat = CATS_INGRESO.find(c => _normCat(c.n) === _normCat(_reg.cat));
    set('ingreso-monto', monto ? _regNumTxt(monto) : '');
    set('ingreso-moneda', typeof remesaEnDolares === 'function' && remesaEnDolares() ? 'USD' : 'HNL');
    set('ingreso-tipo', cat ? cat.tipo : 'extra');
    if (typeof sincronizarSelectsCuentas === 'function') sincronizarSelectsCuentas();
    set('ingreso-cuenta', _reg.cuenta);
    set('ingreso-nota', nota);
    const conv = document.getElementById('ingreso-conversion-info'); if (conv) conv.style.display = 'none';
  } else {
    if (typeof sincronizarSelectsCuentas === 'function') sincronizarSelectsCuentas();
    set('transfer-from', _reg.cuenta);
    set('transfer-to', _reg.hacia);
    set('transfer-monto', monto ? _regNumTxt(monto) : '');
  }
}

function guardarRegistro() {
  const t = _reg.tipo;
  const monto = _regValor();
  if (monto === null || monto <= 0) {
    const el = document.getElementById('reg-monto-caja');
    if (el) { el.classList.remove('sacudir'); void el.offsetWidth; el.classList.add('sacudir'); }
    return avisoRapido('Escribe el monto con el teclado');
  }
  if (t !== 'transferencia' && !_reg.cat) { abrirSelectorRegistro('b'); return avisoRapido('Elige la categoría'); }
  if (t === 'transferencia' && _reg.cuenta === _reg.hacia) return avisoRapido('Elige dos cuentas diferentes');
  _regLlenarFormulario(monto);
  const fecha = fechaRegistro();
  const antes = state.transactions.length;
  if (t === 'gasto') saveGasto({ silencioso: true, fecha });
  else if (t === 'ingreso') saveIngreso({ cat: _reg.cat, fecha, extra: typeof datosRemesaRegistro === 'function' ? datosRemesaRegistro() : null });
  else ejecutarTransferencia({ silencioso: true, fecha });
  if (state.transactions.length === antes) return; // la función ya avisó por qué no se guardó
  _regRecordar();
  cerrarRegistro();
  const que = t === 'gasto' ? 'Gasto' : t === 'ingreso' ? 'Ingreso' : 'Transferencia';
  const usd = (t === 'ingreso' && typeof remesaEnDolares === 'function' && remesaEnDolares()) || (t === 'gasto' && typeof gastoEnDolares === 'function' && gastoEnDolares());
  avisoRapido(`✅ ${que} guardado: ${usd ? 'US$ ' + _regNumTxt(monto) : fL(monto)}${_reg.cat && t !== 'transferencia' ? ' · ' + _reg.cat : ''}`);
}

/** Lleva lo escrito al formulario completo (moneda extranjera, dividir, factura…) */
function masOpcionesRegistro(accion) {
  const monto = _regValor();
  _regLlenarFormulario(monto && monto > 0 ? monto : null);
  const t = _reg.tipo;
  cerrarRegistro();
  if (t === 'gasto') {
    openModal('modal-gasto');
    if (accion === 'recibo') document.getElementById('ocr-input')?.click();
    else if (accion === 'sms' && typeof abrirModalSMS === 'function') abrirModalSMS();
  } else if (t === 'ingreso') openModal('modal-ingreso');
  else openTransferirCuentas();
}

// ─── Aviso corto abajo de la pantalla ───────────────────────────────────
let _avisoRapidoTimer = null;
function avisoRapido(txt, ms) {
  let el = document.getElementById('aviso-rapido');
  if (!el) {
    el = document.createElement('div');
    el.id = 'aviso-rapido';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = txt;
  el.classList.add('visible');
  clearTimeout(_avisoRapidoTimer);
  _avisoRapidoTimer = setTimeout(() => el.classList.remove('visible'), ms || 2600);
}

// Teclado físico (computadora): números, operaciones, Enter guarda, Esc cierra
document.addEventListener('keydown', e => {
  const m = document.getElementById('modal-registro');
  if (!m || m.style.display !== 'flex') return;
  const enCampo = e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  if (e.key === 'Escape') { e.preventDefault(); cerrarRegistro(); return; }
  if (e.key === 'Enter' && !enCampo) { e.preventDefault(); guardarRegistro(); return; }
  if (enCampo) return;
  const mapa = { Backspace: 'borrar', ',': '.', x: '*', X: '*' };
  const k = mapa[e.key] || e.key;
  if (/^[\d.+\-*/=]$/.test(k) || k === 'borrar') { e.preventDefault(); teclaRegistro(k); }
});
