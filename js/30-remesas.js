// Mi Pisto HN · 30-remesas.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.

// ═══ REMESAS ══════════════════════════════════════════════════════════════
// Una remesa es un ingreso con la categoría "Remesa" y, además, quién la
// manda, por dónde llega y cuánto se pagó de comisión:
//   t.remesa = { de, via, moneda: 'USD'|'HNL', comision, comisionL }
// (la comisión va en la moneda del envío; comisionL es en lempiras con la
// tasa del día). La pantalla Remesas junta cuánto te mandaron en el mes y
// en el año, de quién, y qué servicio te sale más barato.
const SERVICIOS_REMESA = ['Western Union', 'Remitly', 'Ria', 'MoneyGram', 'Viamericas', 'Pronto Envíos', 'BAC', 'Banco Atlántida', 'Banpaís', 'Ficohsa'];
const esCatRemesa = cat => /^remesas?$/.test(_normCat(cat));
const _limpioRem = (v, n) => String(v || '').replace(/[<>"']/g, '').replace(/\s+/g, ' ').trim().slice(0, n);

/** Las remesas guardadas (no borradas), de la más nueva a la más vieja */
function remesasGuardadas() {
  return (state.transactions || []).filter(t => !t.deletedAt && t.type === 'income' && !t.esTransferencia && typeof t.amount === 'number' && (t.remesa || esCatRemesa(t.cat)))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}
const _usdRemesa = t => t.originalCurrency === 'USD' && t.originalAmount > 0 ? t.originalAmount : null;
const _comisionL = t => t.remesa && t.remesa.comisionL > 0 ? t.remesa.comisionL : 0;

// ─── En el teclado de registrar ─────────────────────────────────────────
const _remReg = { de: '', via: '', moneda: 'HNL', comision: '' };
function reiniciarRemesaRegistro() {
  // Se llena con la última remesa: casi siempre la manda la misma persona, por el mismo lado.
  // La primera va en lempiras: así un monto en lempiras nunca se multiplica por la tasa sin querer.
  const u = remesasGuardadas().find(t => t.remesa);
  Object.assign(_remReg, { de: u ? u.remesa.de || '' : '', via: u ? u.remesa.via || '' : '', moneda: u && u.remesa.moneda === 'USD' ? 'USD' : 'HNL', comision: '' });
}
const _esRemesaRegistro = () => _reg.tipo === 'ingreso' && esCatRemesa(_reg.cat);
function remesaEnDolares() { return _esRemesaRegistro() && _remReg.moneda === 'USD'; }

function renderRemesaRegistro() {
  const el = document.getElementById('reg-remesa');
  if (!el) return;
  if (!_esRemesaRegistro()) { el.style.display = 'none'; return; }
  el.style.display = '';
  const partes = [_remReg.de ? 'De ' + esc(_remReg.de) : 'Quién la manda', _remReg.via ? esc(_remReg.via) : 'por dónde'];
  if (_remReg.comision) partes.push('comisión ' + (_remReg.moneda === 'USD' ? 'US$ ' : 'L ') + esc(_remReg.comision));
  el.innerHTML = `<button type="button" class="reg-remesa-btn" onclick="abrirDetalleRemesa()"><span>🌎</span><span class="reg-remesa-txt">${partes.join(' · ')}</span><b>${_remReg.moneda === 'USD' ? 'US$' : 'L'}</b></button>`;
}

function abrirDetalleRemesa() {
  const hoja = document.getElementById('reg-selector');
  if (!hoja) return;
  const previos = [...new Set(remesasGuardadas().map(t => t.remesa && t.remesa.de).filter(Boolean))].slice(0, 8);
  const usados = remesasGuardadas().map(t => t.remesa && t.remesa.via).filter(Boolean);
  const servicios = [...new Set(usados.concat(SERVICIOS_REMESA))].slice(0, 12);
  const chip = (v, activo, fn) => `<button type="button" class="rem-chip${activo ? ' activa' : ''}" data-v="${esc(v)}" onclick="${fn}(this.dataset.v)">${esc(v)}</button>`;
  hoja.innerHTML = `<div class="reg-sel-head"><strong>🌎 Detalles de la remesa</strong><button type="button" onclick="cerrarDetalleRemesa()" aria-label="Cerrar">✕</button></div>
    <div class="rem-form">
      <label>¿Quién te la manda?</label>
      <input type="text" id="rem-de" class="input-field" maxlength="40" placeholder="Ej. Mamá, mi hermano Carlos" value="${esc(_remReg.de)}" autocomplete="off">
      ${previos.length ? `<div class="rem-chips">${previos.map(p => chip(p, p === _remReg.de, '_remElegirDe')).join('')}</div>` : ''}
      <label>¿Por dónde te llegó?</label>
      <div class="rem-chips">${servicios.map(s => chip(s, s === _remReg.via, '_remElegirVia')).join('')}</div>
      <input type="text" id="rem-via" class="input-field" maxlength="40" placeholder="Otro (ej. Tigo Money)" value="${esc(servicios.includes(_remReg.via) ? '' : _remReg.via)}" autocomplete="off">
      <label>¿En qué moneda la recibiste?</label>
      <div class="an-segmentos rem-moneda" role="tablist">
        <button type="button" class="an-seg-btn${_remReg.moneda === 'USD' ? ' activa' : ''}" onclick="_remMoneda('USD')">Dólares (US$)</button>
        <button type="button" class="an-seg-btn${_remReg.moneda === 'HNL' ? ' activa' : ''}" onclick="_remMoneda('HNL')">Lempiras (L)</button>
      </div>
      <small class="rem-ayuda" id="rem-ayuda-moneda">${_remReg.moneda === 'USD' ? `Se pasa a lempiras con la tasa de compra de hoy: L ${tasaUSD('bid').toFixed(4)} por dólar.` : 'Escribe cuánto te pagaron en lempiras.'}</small>
      <label>Comisión que se pagó <span>(opcional)</span></label>
      <input type="text" id="rem-comision" class="input-field" inputmode="decimal" maxlength="10" placeholder="${_remReg.moneda === 'USD' ? 'US$' : 'L'} 0.00" value="${esc(_remReg.comision)}" autocomplete="off">
      <small class="rem-ayuda">Lo que cobró el servicio por el envío. Así ves cuál te sale más barato.</small>
      <button type="button" class="btn btn-primary" onclick="cerrarDetalleRemesa()">Listo</button>
    </div>`;
  hoja.classList.add('abierto');
}
function _remLeerCampos() {
  const de = document.getElementById('rem-de'), via = document.getElementById('rem-via'), com = document.getElementById('rem-comision');
  if (de) _remReg.de = _limpioRem(de.value, 40);
  if (via && via.value.trim()) _remReg.via = _limpioRem(via.value, 40);
  if (com) { const v = parseMonto(com.value); _remReg.comision = v > 0 ? _regNumTxt(v) : ''; }
}
function _remElegirDe(v) { const de = document.getElementById('rem-de'); if (de) de.value = v; _remLeerCampos(); abrirDetalleRemesa(); }
function _remElegirVia(v) { _remLeerCampos(); _remReg.via = v; const via = document.getElementById('rem-via'); if (via) via.value = ''; abrirDetalleRemesa(); }
function _remMoneda(m) { _remLeerCampos(); _remReg.moneda = m === 'HNL' ? 'HNL' : 'USD'; abrirDetalleRemesa(); renderMontoRegistro(); }
function cerrarDetalleRemesa() {
  _remLeerCampos();
  cerrarSelectorRegistro();
  renderRegistro();
}

/** Lo que se guarda en el movimiento (null si no es una remesa) */
function datosRemesaRegistro() {
  if (!_esRemesaRegistro()) return null;
  if (document.getElementById('rem-de')) _remLeerCampos();
  const com = Number(_remReg.comision) || 0;
  const r = { de: _remReg.de, via: _remReg.via, moneda: _remReg.moneda };
  if (com > 0) { r.comision = _c2(com); r.comisionL = _c2(_remReg.moneda === 'USD' ? com * tasaUSD('bid') : com); }
  return { remesa: r };
}

function registrarRemesa() {
  abrirRegistro('ingreso');
  elegirCatRegistro('Remesa');
}

// ─── Pantalla Remesas ───────────────────────────────────────────────────
let _remAnio = null;
function cambiarAnioRemesas(d) {
  const hoy = new Date().getFullYear();
  _remAnio = Math.min(hoy, (_remAnio || hoy) + d);
  renderRemesas();
}

/** Totales de un grupo de remesas */
function resumenRemesas(txs) {
  const total = _c2(txs.reduce((a, t) => a + t.amount, 0));
  const usd = _c2(txs.reduce((a, t) => a + (_usdRemesa(t) || 0), 0));
  const comision = _c2(txs.reduce((a, t) => a + _comisionL(t), 0));
  // El % de comisión solo se calcula con las que dicen cuánto se pagó
  const conCom = txs.filter(t => _comisionL(t) > 0);
  const base = conCom.reduce((a, t) => a + t.amount, 0);
  return { n: txs.length, total, usd, comision, base: _c2(base), pct: base > 0 ? Math.round(conCom.reduce((a, t) => a + _comisionL(t), 0) / base * 1000) / 10 : null };
}

function _agruparRemesas(txs, clave, sinNombre) {
  const g = {};
  txs.forEach(t => { const k = (t.remesa && t.remesa[clave]) || sinNombre; (g[k] = g[k] || []).push(t); });
  return Object.entries(g).map(([nombre, xs]) => Object.assign({ nombre, sin: nombre === sinNombre }, resumenRemesas(xs))).sort((a, b) => b.total - a.total);
}

function renderRemesas() {
  const el = document.getElementById('remesas-contenido');
  if (!el) return;
  const hoy = new Date();
  const anio = _remAnio || hoy.getFullYear();
  const todas = remesasGuardadas();
  if (!todas.length) {
    el.innerHTML = `<div class="rm-vacio"><div class="rm-vacio-ico">🌎</div>
      <p><strong>Lleva la cuenta de lo que te mandan.</strong><br>Anota cada remesa con quién te la manda, por dónde te llegó y la comisión. Aquí vas a ver cuánto recibes al mes y al año, y qué servicio te cobra menos.</p>
      <button type="button" class="btn btn-primary" onclick="registrarRemesa()">🌎 Registrar una remesa</button></div>`;
    return;
  }
  const delAnio = todas.filter(t => new Date(t.date).getFullYear() === anio);
  const delMes = todas.filter(t => { const d = new Date(t.date); return d.getFullYear() === hoy.getFullYear() && d.getMonth() === hoy.getMonth(); });
  const ra = resumenRemesas(delAnio), rm = resumenRemesas(delMes);
  const usd = v => v > 0 ? `<small>US$ ${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</small>` : '';

  // Barras por mes del año elegido
  const porMes = Array.from({ length: 12 }, (_, m) => _c2(delAnio.filter(t => new Date(t.date).getMonth() === m).reduce((a, t) => a + t.amount, 0)));
  const max = Math.max(...porMes, 1);
  const hasta = anio === hoy.getFullYear() ? hoy.getMonth() : 11;
  const meses = porMes.slice(0, hasta + 1).map((v, m) => `<div class="rem-barra" title="${_MESES_LARGOS[m]}: ${fL(v)}"><span style="height:${Math.max(v ? 4 : 0, Math.round(v / max * 100))}%"></span><small>${_MESES_CORTOS[m].charAt(0).toUpperCase()}</small></div>`).join('');
  const conMonto = porMes.slice(0, hasta + 1).filter(v => v > 0);
  const promedio = conMonto.length ? _c2(conMonto.reduce((a, v) => a + v, 0) / conMonto.length) : 0;

  const quienes = _agruparRemesas(delAnio, 'de', 'Sin decir quién');
  const vias = _agruparRemesas(delAnio, 'via', 'Sin decir por dónde');
  const conPct = vias.filter(v => !v.sin && v.pct !== null);
  const barata = conPct.length > 1 ? conPct.slice().sort((a, b) => a.pct - b.pct)[0] : null;
  const cara = conPct.length > 1 ? conPct.slice().sort((a, b) => b.pct - a.pct)[0] : null;
  const fila = (x, extra) => `<div class="rem-fila"><div><strong>${esc(x.nombre)}</strong><small>${x.n} ${x.n === 1 ? 'envío' : 'envíos'}${extra ? ' · ' + extra : ''}</small></div><b class="verde">${fL(x.total)}</b></div>`;

  el.innerHTML = `
    <div class="rm-nav"><button type="button" onclick="cambiarAnioRemesas(-1)" aria-label="Año anterior">‹</button><strong>${anio}</strong><button type="button" onclick="cambiarAnioRemesas(1)" aria-label="Año siguiente"${anio >= hoy.getFullYear() ? ' disabled' : ''}>›</button></div>
    <div class="rm-totales rem-totales">
      <div><small>${anio === hoy.getFullYear() ? 'Este mes' : 'Promedio al mes'}</small><b class="verde">${fL(anio === hoy.getFullYear() ? rm.total : promedio)}</b>${anio === hoy.getFullYear() ? usd(rm.usd) : ''}</div>
      <div><small>En ${anio}</small><b class="verde">${fL(ra.total)}</b>${usd(ra.usd)}</div>
      <div><small>Comisiones</small><b class="rojo">${fL(ra.comision)}</b>${ra.pct !== null ? `<small>${ra.pct}% de lo recibido</small>` : ''}</div>
    </div>
    ${delAnio.length ? `
    <div class="rem-seccion"><h4>Mes por mes</h4><div class="rem-barras">${meses}</div>
      ${promedio ? `<p class="rem-nota">En promedio recibes <strong>${fL(promedio)}</strong> en los meses que te mandan.</p>` : ''}</div>
    ${barata && cara && barata.nombre !== cara.nombre ? `<div class="rem-consejo">💡 <span><strong>${esc(barata.nombre)}</strong> te cobra menos: ${barata.pct}% de comisión, contra ${cara.pct}% de ${esc(cara.nombre)}.${cara.comision - cara.base * barata.pct / 100 >= 1 ? ` Lo que te llegó por ${esc(cara.nombre)}, por ${esc(barata.nombre)} te habría costado unos <strong>${fL(_c2(cara.comision - cara.base * barata.pct / 100))}</strong> menos.` : ''}</span></div>` : ''}
    <div class="rem-seccion"><h4>¿Quién te manda?</h4>${quienes.map(q => fila(q)).join('')}</div>
    <div class="rem-seccion"><h4>¿Por dónde te llega?</h4>${vias.map(v => fila(v, v.pct !== null ? 'comisión ' + v.pct + '%' : v.sin ? '' : 'sin comisión anotada')).join('')}</div>
    <div class="rem-seccion"><h4>Últimas remesas</h4>${delAnio.slice(0, 15).map(t => _htmlFilaRegistro({ t })).join('')}</div>`
    : `<div class="rm-vacio"><p>No anotaste remesas en ${anio}.</p></div>`}
    <button type="button" class="btn btn-primary" onclick="registrarRemesa()">🌎 Registrar una remesa</button>`;
}
