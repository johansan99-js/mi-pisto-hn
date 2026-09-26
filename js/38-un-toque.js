// Mi Pisto HN · 38-un-toque.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.
// ========== PARA QUIEN NO QUIERE PERDER TIEMPO ==========
//  • Gastos de un toque: lo que repites (café, bus, gasolina) queda como botón.
//  • Categoría que aprende: "PriceSmart" ya viene como Supermercado si así lo anotaste.
//  • Presupuestos en un toque: topes por categoría según tus últimos 3 meses.

// ─── Categoría que aprende de lo que ya anotaste ───────────────────────
/** La categoría que usaste antes con ese comercio o nota (o null) */
function categoriaAprendida(texto, tipo) {
  const n = _normCat(texto);
  if (n.length < 3) return null;
  const tt = tipo === 'ingreso' || tipo === 'income' ? 'income' : 'expense';
  const exacta = {}, parecida = {};
  const palabra = n.split(/\s+/)[0];
  (state.transactions || []).forEach(t => {
    if (t.deletedAt || t.type !== tt || t.esTransferencia || t.esConciliacion || !t.cat) return;
    const k = _normCat(t.subcat || t.nota || '');
    if (!k || _normCat(t.cat).startsWith('varios (')) return;
    if (k === n) exacta[t.cat] = (exacta[t.cat] || 0) + 1;
    else if ((k.length >= 4 && n.startsWith(k)) || (n.length >= 4 && k.startsWith(n)) || (palabra.length >= 4 && k.split(/\s+/)[0] === palabra)) parecida[t.cat] = (parecida[t.cat] || 0) + 1;
  });
  const mejor = o => Object.keys(o).sort((a, b) => o[b] - o[a])[0] || null;
  return mejor(exacta) || mejor(parecida);
}

// En el registro: al escribir la nota se elige la categoría sola (si no elegiste una)
document.addEventListener('input', e => {
  if (!e.target || e.target.id !== 'reg-nota' || _reg.tipo === 'transferencia') return;
  if (_reg.cat && !_reg.catAprendida) return;
  const cat = categoriaAprendida(e.target.value, _reg.tipo);
  if (cat === (_reg.cat || null)) return;
  _reg.cat = cat;
  _reg.catAprendida = !!cat;
  renderRegistro();
});
const _elegirCatRegistroBase = elegirCatRegistro;
elegirCatRegistro = function (nm) { _reg.catAprendida = false; return _elegirCatRegistroBase(nm); };
const _abrirRegistroBase = abrirRegistro;
abrirRegistro = function (tipo) { _reg.catAprendida = false; return _abrirRegistroBase(tipo); };

// Al guardar (por ejemplo, después de dictar) sin categoría: la de siempre para esa nota
const _guardarRegistroBase = guardarRegistro;
guardarRegistro = function () {
  if (_reg.tipo !== 'transferencia' && !_reg.cat) {
    const cat = categoriaAprendida(document.getElementById('reg-nota')?.value, _reg.tipo);
    if (cat) { _reg.cat = cat; _reg.catAprendida = true; }
  }
  return _guardarRegistroBase.apply(this, arguments);
};

// Los SMS del banco también usan lo aprendido
const _interpretarMensajeBancoBase = interpretarMensajeBanco;
interpretarMensajeBanco = function (texto) {
  const r = _interpretarMensajeBancoBase.apply(this, arguments);
  if (r && r.tipo === 'gasto' && r.comercio) {
    const cat = categoriaAprendida(r.comercio, 'gasto');
    if (cat) { r.categoria = cat; r.tipoGasto = _tipoGastoDeCat(cat); }
  }
  return r;
};

// ─── Gastos de un toque ────────────────────────────────────────────────
/** Lo que más repites en los últimos 90 días: misma categoría, nota, monto y cuenta, 3 veces o más */
function gastosDeSiempre(max) {
  const desde = Date.now() - 90 * 864e5, grupos = {};
  (state.transactions || []).forEach(t => {
    if (t.deletedAt || t.type !== 'expense' || t.esTransferencia || t.esConciliacion || t.planCuotasId || t.originalCurrency || !t.cat) return;
    if (/^pf/.test(String(t.id)) || !(t.amount > 0) || new Date(t.date).getTime() < desde) return;
    const nota = String(t.subcat || '').trim();
    const k = [_normCat(t.cat), _normCat(nota), t.amount.toFixed(2), t.tarjetaId ? 'tc:' + t.tarjetaId : (t.cuenta || 'efectivo')].join('|');
    const g = grupos[k] || (grupos[k] = { cat: t.cat, nota, monto: t.amount, cuenta: t.cuenta || 'efectivo', tarjeta: t.tarjetaId || null, veces: 0, ultima: 0 });
    g.veces++;
    g.ultima = Math.max(g.ultima, new Date(t.date).getTime());
  });
  const validos = Object.values(grupos).filter(g => g.veces >= 3 && (!g.tarjeta || (state.tarjetas || []).some(x => String(x.id) === String(g.tarjeta))) && (g.tarjeta || listaCuentas().some(c => c.id === g.cuenta)));
  return validos.sort((a, b) => b.veces - a.veces || b.ultima - a.ultima).slice(0, max || 6);
}
const _textoFavorito = g => `${iconoCategoria(g.cat, 'expense').i} ${g.nota || g.cat} ${fL(g.monto).replace(/\.00$/, '')}`;

function _ponerFavoritoEnRegistro(g) {
  _reg.tipo = 'gasto';
  _reg.cat = g.cat;
  _reg.catAprendida = false;
  _reg.expr = _regNumTxt(g.monto);
  _reg.tarjeta = g.tarjeta;
  if (!g.tarjeta) _reg.cuenta = g.cuenta;
  const nota = document.getElementById('reg-nota'); if (nota) nota.value = g.nota;
}
/** Desde el Inicio: un toque y queda anotado (con "Deshacer") */
async function usarGastoDeSiempre(i) {
  const g = gastosDeSiempre()[i];
  if (!g) return;
  const antes = state.transactions.length;
  abrirRegistro('gasto');
  _ponerFavoritoEnRegistro(g);
  renderRegistro();
  await guardarRegistro();
  if (state.transactions.length === antes) return;
  const nuevo = state.transactions[state.transactions.length - 1];
  _avisoDeshacer(`${_textoFavorito(g)} anotado`, nuevo.id);
}
/** Dentro del registro: llena todo para revisarlo antes de guardar */
function rellenarGastoDeSiempre(i) {
  const g = gastosDeSiempre()[i];
  if (!g) return;
  _ponerFavoritoEnRegistro(g);
  renderRegistro();
}

let _deshacerTimer = null;
function _avisoDeshacer(texto, id) {
  let el = document.getElementById('aviso-deshacer');
  if (!el) {
    el = document.createElement('div');
    el.id = 'aviso-deshacer';
    el.className = 'undo-toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.innerHTML = `<div class="undo-toast-info"><div class="undo-toast-title">✅ ${esc(texto)}</div></div><button type="button" class="btn-undo">Deshacer</button>`;
  el.querySelector('.btn-undo').onclick = () => deshacerGastoRapido(id);
  el.style.display = 'flex';
  clearTimeout(_deshacerTimer);
  _deshacerTimer = setTimeout(() => { el.style.display = 'none'; }, 6000);
}
function deshacerGastoRapido(id) {
  state.transactions = state.transactions.filter(t => t.id !== id);
  save(); renderAll();
  const el = document.getElementById('aviso-deshacer'); if (el) el.style.display = 'none';
  if (typeof avisoRapido === 'function') avisoRapido('Listo, se quitó');
}

function renderGastosDeSiempre() {
  const lista = state.setup ? gastosDeSiempre() : [];
  const botones = (accion) => lista.map((g, i) => `<button type="button" class="fav-chip" onclick="${accion}(${i})">${esc(_textoFavorito(g))}</button>`).join('');
  const card = document.getElementById('favoritos-inicio');
  if (card) {
    card.style.display = lista.length ? 'block' : 'none';
    card.innerHTML = lista.length ? `<div class="fav-cabeza">⭐ Tus gastos de siempre <small>Un toque y queda anotado</small></div><div class="fav-fila">${botones('usarGastoDeSiempre')}</div>` : '';
  }
  const enReg = document.getElementById('reg-favoritos');
  if (enReg) {
    const ver = lista.length && _reg.tipo === 'gasto' && !_reg.expr;
    enReg.style.display = ver ? 'flex' : 'none';
    enReg.innerHTML = ver ? botones('rellenarGastoDeSiempre') : '';
  }
}
const _renderRegistroBase = renderRegistro;
renderRegistro = function () {
  const r = _renderRegistroBase.apply(this, arguments);
  // El registro se abre con los gastos de siempre arriba; al escribir un monto se esconden
  if (!document.getElementById('reg-favoritos')) {
    const tabs = document.querySelector('#modal-registro .reg-tabs');
    if (tabs) { const d = document.createElement('div'); d.id = 'reg-favoritos'; d.className = 'fav-fila reg-favoritos'; tabs.after(d); }
  }
  renderGastosDeSiempre();
  const lbl = document.getElementById('reg-lbl-b');
  if (lbl && _reg.tipo !== 'transferencia') lbl.textContent = _reg.catAprendida ? 'Categoría ✨ (la de siempre)' : 'Categoría';
  return r;
};
const _renderMontoRegistroBase = renderMontoRegistro;
renderMontoRegistro = function () { const r = _renderMontoRegistroBase.apply(this, arguments); renderGastosDeSiempre(); return r; };

// ─── Presupuestos en un toque ──────────────────────────────────────────
/** Topes sugeridos: lo que gastaste en promedio los últimos 3 meses, un 5% menos */
function presupuestosSugeridos(ahora) {
  const hoy = ahora ? new Date(ahora) : new Date(), meses = [];
  for (let i = 1; i <= 3; i++) { const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1); meses.push(getCategoryTotalsForMonth(d.getFullYear(), d.getMonth())); }
  const ya = new Set((state.presupuestos || []).map(p => _normCat(p.cat)));
  const cats = {};
  meses.forEach(m => Object.keys(m).forEach(c => { if (m[c] > 0) (cats[c] = cats[c] || []).push(m[c]); }));
  return Object.keys(cats)
    .filter(c => cats[c].length >= 2 && !ya.has(_normCat(c)) && !/^(transferencia|conciliaci|sin categor|varios \()/.test(_normCat(c)))
    .map(c => { const promedio = cats[c].reduce((a, b) => a + b, 0) / cats[c].length; return { cat: c, promedio, monto: Math.max(50, Math.ceil(promedio * 0.95 / 50) * 50) }; })
    .filter(s => s.promedio >= 300)
    .sort((a, b) => b.promedio - a.promedio).slice(0, 6);
}
async function armarPresupuestosSolo() {
  let lista = presupuestosSugeridos();
  if (!lista.length) return avisar((state.presupuestos || []).length ? 'Tus categorías con más gasto ya tienen presupuesto.' : 'Todavía no hay suficiente historial: con dos meses de gastos anotados te armo los presupuestos solo.');
  if (typeof tienePremium === 'function' && !tienePremium()) {
    const libres = Math.max(0, PREMIUM.limites.presupuestos - (state.presupuestos || []).length);
    if (!libres) return puedeUsarPremium('presupuestos');
    lista = lista.slice(0, libres);
  }
  const ok = await confirmar('✨ Estos son tus presupuestos del mes\nUn 5% menos de lo que sueles gastar, para que te sobre algo:\n\n' +
    lista.map(s => `• ${s.cat}: ${fL(s.monto)} (sueles gastar ${fL(s.promedio)})`).join('\n') +
    '\n\nLos puedes cambiar cuando quieras.\n[Aceptar] = Crearlos\n[Cancelar] = Ahora no');
  if (!ok) return;
  state.presupuestos = state.presupuestos || [];
  lista.forEach(s => state.presupuestos.push({ id: uid(), cat: s.cat, monto: s.monto, periodo: 'mes' }));
  await save(); renderAll();
  if (typeof renderVistaPresupuestos === 'function') renderVistaPresupuestos();
  avisoRapido(`✅ ${lista.length} presupuestos listos: te avisamos al 80%`);
}
// El botón en la pantalla de Presupuestos
const _renderVistaPresupuestosBase = renderVistaPresupuestos;
renderVistaPresupuestos = function () {
  const r = _renderVistaPresupuestosBase.apply(this, arguments);
  const el = document.getElementById('presupuestos-vista');
  if (el && state.setup && presupuestosSugeridos().length && !document.getElementById('btn-armar-presupuestos')) {
    const d = document.createElement('div');
    d.className = 'card armar-presu';
    d.innerHTML = '<div><strong>✨ Arma tus presupuestos en un toque</strong><div style="font-size:12.5px;color:var(--text2);margin-top:3px">Según lo que gastaste los últimos 3 meses. Nada de pensar números.</div></div><button type="button" id="btn-armar-presupuestos" class="btn btn-primary" onclick="armarPresupuestosSolo()">Armarlos</button>';
    el.prepend(d);
  }
  return r;
};

const _renderAllUnToque = renderAll;
renderAll = function () { const r = _renderAllUnToque.apply(this, arguments); renderGastosDeSiempre(); return r; };
