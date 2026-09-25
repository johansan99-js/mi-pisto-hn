// Mi Pisto HN · 26-analisis.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.

// ═══ ANÁLISIS ═════════════════════════════════════════════════════════════
// Semana, mes o año con ‹ ›, y tres vistas:
//  · Gastos / Ingresos: dona interactiva (toca un pedazo y dice cuánto es) y
//    cada categoría con su barra, su % y cómo va contra el periodo anterior;
//    tocar una categoría muestra sus movimientos.
//  · Por día: la curva del gasto de cada día (o de cada mes, en el año), el
//    promedio, el día más alto y un calendario con lo gastado cada día.
// Todo en lempiras y contando igual que el resto de la app: sin
// transferencias entre tus cuentas ni ajustes, y cada parte de un gasto
// dividido va a su categoría. Las gráficas son SVG propias: funcionan sin
// internet y toman los colores del tema.
const _an = { periodo: 'mes', ref: null, vista: 'gastos', sel: null, abierta: null, punto: null };
const _AN_OTRAS = 'Otras';

function _anRango(periodo, ref) {
  const r = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  if (periodo === 'semana') {
    const ini = new Date(r); ini.setDate(r.getDate() - r.getDay());
    const fin = new Date(ini); fin.setDate(ini.getDate() + 7);
    return { ini, fin };
  }
  if (periodo === 'anio') return { ini: new Date(r.getFullYear(), 0, 1), fin: new Date(r.getFullYear() + 1, 0, 1) };
  return { ini: new Date(r.getFullYear(), r.getMonth(), 1), fin: new Date(r.getFullYear(), r.getMonth() + 1, 1) };
}
function _anMover(periodo, ref, delta) {
  const d = new Date(ref);
  if (periodo === 'semana') d.setDate(d.getDate() + 7 * delta);
  else if (periodo === 'anio') d.setFullYear(d.getFullYear() + delta, 0, 1);
  else d.setMonth(d.getMonth() + delta, 1);
  return d;
}
function _anTitulo(periodo, { ini, fin }) {
  if (periodo === 'anio') return String(ini.getFullYear());
  if (periodo === 'mes') return _MESES_LARGOS[ini.getMonth()].charAt(0).toUpperCase() + _MESES_LARGOS[ini.getMonth()].slice(1) + ' ' + ini.getFullYear();
  const ult = new Date(fin); ult.setDate(ult.getDate() - 1);
  return ini.getMonth() === ult.getMonth()
    ? `${ini.getDate()} – ${ult.getDate()} ${_MESES_CORTOS[ult.getMonth()]}`
    : `${ini.getDate()} ${_MESES_CORTOS[ini.getMonth()]} – ${ult.getDate()} ${_MESES_CORTOS[ult.getMonth()]}`;
}
const _anNombrePrevio = (periodo, rango) => periodo === 'mes' ? _MESES_LARGOS[rango.ini.getMonth()] : periodo === 'anio' ? String(rango.ini.getFullYear()) : 'la semana anterior';

/** Movimientos que cuentan en el rango, con la fecha en que cuentan */
function _anMovimientos({ ini, fin }) {
  return (state.transactions || []).filter(t => !t.deletedAt && !t.esTransferencia && !t.esConciliacion && !t.esSaldoInicial && typeof t.amount === 'number')
    .map(t => ({ t, f: _fechaDeTx(t) })).filter(x => x.f >= ini && x.f < fin);
}
/** Totales por categoría; cada parte de un gasto dividido cuenta en la suya */
function _anPorCategoria(movs, tipo) {
  const tot = {}, txs = {};
  movs.forEach(({ t }) => {
    if (t.type !== tipo) return;
    const partes = tipo === 'expense' && Array.isArray(t.splits) && t.splits.length ? t.splits.map(s => ({ cat: s.cat, monto: s.monto })) : [{ cat: t.cat, monto: t.amount }];
    partes.forEach(p => {
      const c = String(p.cat || 'Sin categoría').trim() || 'Sin categoría';
      tot[c] = (tot[c] || 0) + p.monto;
      (txs[c] = txs[c] || []).push({ t, monto: p.monto });
    });
  });
  Object.keys(tot).forEach(c => { tot[c] = _c2(tot[c]); });
  return { tot, txs };
}

function analisisDe(periodo, ref) {
  const rango = _anRango(periodo, ref);
  const movs = _anMovimientos(rango);
  const suma = tipo => _c2(movs.filter(x => x.t.type === tipo).reduce((a, x) => a + x.t.amount, 0));
  const prevRango = _anRango(periodo, _anMover(periodo, rango.ini, -1));
  return { rango, prevRango, movs, gastos: suma('expense'), ingresos: suma('income'), prevMovs: _anMovimientos(prevRango) };
}

// ─── Acciones ───────────────────────────────────────────────────────────
function _anRef() { if (!_an.ref) _an.ref = new Date(); return _an.ref; }
function periodoAnalisis(p) { _an.periodo = p; _an.ref = new Date(); _an.sel = null; _an.abierta = null; _an.punto = null; renderAnalisis(); }
function vistaAnalisis(v) { _an.vista = v; _an.sel = null; _an.abierta = null; _an.punto = null; renderAnalisis(); }
function moverAnalisis(delta) {
  const nueva = _anMover(_an.periodo, _anRef(), delta);
  if (_anRango(_an.periodo, nueva).ini > new Date()) return;
  _an.ref = nueva; _an.sel = null; _an.abierta = null; _an.punto = null;
  renderAnalisis();
}
function elegirSegmentoAnalisis(cat) { _an.sel = _an.sel === cat ? null : cat; renderAnalisis(); }
function abrirCategoriaAnalisis(cat) { _an.abierta = _an.abierta === cat ? null : cat; _an.sel = cat === _AN_OTRAS ? null : (_an.abierta ? cat : null); renderAnalisis(); }
function elegirPuntoAnalisis(i) { _an.punto = _an.punto === i ? null : i; renderAnalisis(); }

// ─── Formatos ───────────────────────────────────────────────────────────
const _anPct = (x, total) => total > 0 ? x / total * 100 : 0;
const _anPctTxt = p => (p >= 10 || p === 0 ? p.toFixed(0) : p.toFixed(1)) + '%';
function fCorto(n) {
  if (document.body && document.body.classList.contains('modo-discreto')) return '•••';
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (a >= 1e3) return (n / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'k';
  return String(Math.round(n));
}

// ─── Dona ───────────────────────────────────────────────────────────────
function _anDona(items, total, titulo) {
  const R = 70, C = 2 * Math.PI * R;
  let off = 0;
  const segs = items.map(it => {
    const len = total > 0 ? it.monto / total * C : 0;
    const activo = _an.sel === it.cat;
    const s = `<circle class="an-seg${_an.sel && !activo ? ' apagado' : ''}${activo ? ' activo' : ''}" data-cat="${esc(it.cat)}" cx="100" cy="100" r="${R}" fill="none" stroke-width="${activo ? 34 : 28}" style="stroke:${it.color}" stroke-dasharray="${Math.max(len - (items.length > 1 ? 1.5 : 0), 0.01)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 100 100)" onclick="elegirSegmentoAnalisis(this.dataset.cat)"><title>${esc(it.cat)}: ${_anPctTxt(_anPct(it.monto, total))}</title></circle>`;
    off += len;
    return s;
  }).join('');
  const sel = items.find(it => it.cat === _an.sel);
  const centro = sel
    ? `<text x="100" y="92" class="an-dona-cat">${esc(sel.cat.length > 14 ? sel.cat.slice(0, 13) + '…' : sel.cat)}</text><text x="100" y="116" class="an-dona-pct">${_anPctTxt(_anPct(sel.monto, total))}</text>`
    : `<text x="100" y="94" class="an-dona-cat">${esc(titulo)}</text><text x="100" y="116" class="an-dona-tot">${esc(fL(total))}</text>`;
  return `<svg class="an-dona" viewBox="0 0 200 200" role="img" aria-label="${esc(titulo)} por categoría"><circle cx="100" cy="100" r="${R}" fill="none" stroke-width="28" style="stroke:var(--bg3)"/>${segs}${centro}</svg>`;
}

function _anHtmlCategorias(r, tipo) {
  const { tot, txs } = _anPorCategoria(r.movs, tipo);
  const total = tipo === 'expense' ? r.gastos : r.ingresos;
  const cats = Object.keys(tot).sort((a, b) => tot[b] - tot[a]);
  const titulo = tipo === 'expense' ? 'Gastos' : 'Ingresos';
  if (!cats.length) {
    return `<div class="rm-vacio"><div class="rm-vacio-ico">${tipo === 'expense' ? '🧾' : '💼'}</div><p>No hay ${titulo.toLowerCase()} en este periodo.</p></div>`;
  }
  // La dona junta las más pequeñas en "Otras" para que se lea bien
  const MAX = 7;
  const items = cats.slice(0, MAX).map(c => ({ cat: c, monto: tot[c], color: iconoCategoria(c, tipo).c }));
  if (cats.length > MAX) items.push({ cat: _AN_OTRAS, monto: _c2(cats.slice(MAX).reduce((a, c) => a + tot[c], 0)), color: '#90A4AE' });
  const leyenda = items.map(it => `<button type="button" class="an-ley${_an.sel === it.cat ? ' activa' : ''}" data-cat="${esc(it.cat)}" onclick="elegirSegmentoAnalisis(this.dataset.cat)"><i style="background:${it.color}"></i><span>${esc(it.cat)}</span><b>${_anPctTxt(_anPct(it.monto, total))}</b></button>`).join('');
  const prev = _anPorCategoria(r.prevMovs, tipo).tot;
  const nombrePrev = _anNombrePrevio(_an.periodo, r.prevRango);
  const filas = cats.map(c => {
    const monto = tot[c], pct = _anPct(monto, total);
    let tend = '';
    if (prev[c] > 0) {
      const v = (monto - prev[c]) / prev[c] * 100;
      const sube = v > 0.5, baja = v < -0.5;
      // En gastos subir es malo; en ingresos, bueno
      const clase = !sube && !baja ? 'neutro' : (sube === (tipo === 'expense')) ? 'rojo' : 'verde';
      tend = `<small class="${clase}">${sube ? '▲' : baja ? '▼' : '▬'} ${Math.abs(v).toFixed(0)}% vs. ${esc(nombrePrev)}</small>`;
    } else if (Object.keys(prev).length) tend = `<small class="neutro">Nuevo</small>`;
    const abierta = _an.abierta === c;
    const detalle = abierta ? `<div class="an-detalle">${txs[c].slice().sort((a, b) => new Date(b.t.date) - new Date(a.t.date)).map(({ t, monto: m }) => {
      const d = new Date(t.date);
      const info = [_cuentaTx(t), t.subcat && !/^(salario|extra|freelance|negocio)$/.test(t.subcat) ? t.subcat : '', t.nota || ''].filter(Boolean).join(' · ');
      return `<button type="button" class="an-det-fila" onclick="abrirEdicionTx('${esc(t.id)}')"><span class="an-det-fecha">${d.getDate()} ${_MESES_CORTOS[d.getMonth()]}</span><span class="an-det-info">${esc(info) || '—'}</span><b>${fL(m)}</b></button>`;
    }).join('')}</div>` : '';
    return `<div class="an-cat${abierta ? ' abierta' : ''}${_an.sel === c ? ' marcada' : ''}">
      <button type="button" class="an-cat-fila" data-cat="${esc(c)}" onclick="abrirCategoriaAnalisis(this.dataset.cat)" aria-expanded="${abierta}">
        ${circuloCategoria(c, tipo)}
        <span class="an-cat-info">
          <span class="an-cat-top"><span class="an-cat-nom">${esc(c)}</span><b class="${tipo === 'expense' ? 'rojo' : 'verde'}">${fL(monto)}</b></span>
          <span class="an-barra"><span style="width:${Math.max(pct, 1.5).toFixed(1)}%;background:${iconoCategoria(c, tipo).c}"></span></span>
          <span class="an-cat-bot"><small>${txs[c].length} ${txs[c].length === 1 ? 'movimiento' : 'movimientos'}</small>${tend}</span>
        </span>
        <span class="an-cat-pct">${_anPctTxt(pct)}</span>
      </button>${detalle}</div>`;
  }).join('');
  return `<div class="an-dona-wrap">${_anDona(items, total, titulo)}<div class="an-leyenda">${leyenda}</div></div><div class="an-cats">${filas}</div>`;
}

// ─── Por día ────────────────────────────────────────────────────────────
function _anSerie(r) {
  const { ini, fin } = r.rango;
  const puntos = [];
  if (_an.periodo === 'anio') {
    for (let m = 0; m < 12; m++) puntos.push({ ini: new Date(ini.getFullYear(), m, 1), fin: new Date(ini.getFullYear(), m + 1, 1), etiqueta: _MESES_CORTOS[m] });
  } else {
    for (let d = new Date(ini); d < fin; d.setDate(d.getDate() + 1)) {
      const a = new Date(d), b = new Date(d); b.setDate(b.getDate() + 1);
      puntos.push({ ini: a, fin: b, etiqueta: String(a.getDate()) });
    }
  }
  const hoy = new Date();
  puntos.forEach(p => {
    p.monto = _c2(r.movs.filter(x => x.t.type === 'expense' && x.f >= p.ini && x.f < p.fin).reduce((a, x) => a + x.t.amount, 0));
    p.futuro = p.ini > hoy;
  });
  return puntos;
}
function _anCurva(puntos) {
  const W = 320, H = 150, PL = 34, PR = 8, PT = 12, PB = 22;
  const max = Math.max(...puntos.map(p => p.monto), 1);
  // Tope "redondo" para las líneas guía
  const paso = Math.pow(10, Math.floor(Math.log10(max)));
  const tope = Math.ceil(max / paso) * paso;
  const n = puntos.length;
  const x = i => PL + (n === 1 ? (W - PL - PR) / 2 : i * (W - PL - PR) / (n - 1));
  const y = v => PT + (H - PT - PB) * (1 - v / tope);
  const reales = puntos.map((p, i) => ({ p, i })).filter(o => !o.p.futuro);
  const linea = reales.map(({ p, i }, k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.monto).toFixed(1)}`).join('');
  const area = reales.length ? `${linea}L${x(reales[reales.length - 1].i).toFixed(1)},${y(0)}L${x(reales[0].i).toFixed(1)},${y(0)}Z` : '';
  const guias = [0, 0.5, 1].map(f => `<line x1="${PL}" x2="${W - PR}" y1="${y(tope * f)}" y2="${y(tope * f)}" class="an-guia"/><text x="${PL - 4}" y="${y(tope * f) + 3}" class="an-eje" text-anchor="end">${esc(fCorto(tope * f))}</text>`).join('');
  const cadaEtiqueta = n > 16 ? Math.ceil(n / 6) : 1;
  const etiquetas = puntos.map((p, i) => (i % cadaEtiqueta === 0 || i === n - 1) ? `<text x="${x(i)}" y="${H - 6}" class="an-eje" text-anchor="middle">${esc(p.etiqueta)}</text>` : '').join('');
  const sel = _an.punto;
  const marcas = reales.map(({ p, i }) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.monto).toFixed(1)}" r="${sel === i ? 5 : (n > 16 ? 2.2 : 3.2)}" class="an-pt${sel === i ? ' activo' : ''}"/>`).join('');
  // Zonas para tocar cada punto (más anchas que el punto)
  const ancho = (W - PL - PR) / Math.max(n - 1, 1);
  const zonas = puntos.map((p, i) => p.futuro ? '' : `<rect x="${(x(i) - ancho / 2).toFixed(1)}" y="0" width="${ancho.toFixed(1)}" height="${H}" class="an-zona" data-i="${i}" onclick="elegirPuntoAnalisis(${i})"/>`).join('');
  const vline = sel !== null && puntos[sel] ? `<line x1="${x(sel)}" x2="${x(sel)}" y1="${PT}" y2="${y(0)}" class="an-vline"/>` : '';
  return `<svg class="an-curva" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gasto por ${_an.periodo === 'anio' ? 'mes' : 'día'}">${guias}<path d="${area}" class="an-area"/><path d="${linea}" class="an-linea"/>${vline}${marcas}${etiquetas}${zonas}</svg>`;
}
function _anHtmlPorDia(r) {
  const puntos = _anSerie(r);
  const reales = puntos.filter(p => !p.futuro);
  const unidad = _an.periodo === 'anio' ? 'mes' : 'día';
  if (!r.gastos) return `<div class="rm-vacio"><div class="rm-vacio-ico">📉</div><p>No hay gastos en este periodo.</p></div>`;
  const alto = reales.reduce((a, p) => p.monto > a.monto ? p : a, reales[0]);
  const promedio = _c2(r.gastos / Math.max(reales.length, 1));
  const sinGasto = reales.filter(p => !p.monto).length;
  const nomPunto = p => { const t = _an.periodo === 'anio' ? _MESES_LARGOS[p.ini.getMonth()] + ' ' + p.ini.getFullYear() : `${_DIAS_SEMANA[p.ini.getDay()]} ${p.ini.getDate()} ${_MESES_CORTOS[p.ini.getMonth()]}`; return t.charAt(0).toUpperCase() + t.slice(1); };
  const sel = _an.punto !== null ? puntos[_an.punto] : null;
  const info = sel
    ? `<div class="an-punto"><strong>${esc(nomPunto(sel))}</strong><b class="rojo">${fL(sel.monto)}</b></div>`
    : `<div class="an-punto vacio">Toca la gráfica para ver cada ${unidad}</div>`;
  const stats = `<div class="an-stats">
      <div><small>${unidad === 'mes' ? 'Promedio mensual' : 'Promedio diario'}</small><b>${fL(promedio)}</b></div>
      <div><small>${unidad === 'mes' ? 'Mes' : 'Día'} más alto</small><b>${fL(alto.monto)}</b><small>${esc(nomPunto(alto))}</small></div>
      <div><small>${unidad === 'mes' ? 'Meses' : 'Días'} sin gastar</small><b>${sinGasto}</b></div>
    </div>`;
  // Calendario (semana y mes) o los 12 meses (año)
  const maxM = Math.max(...reales.map(p => p.monto), 1);
  const celda = (p, i, texto) => `<button type="button" class="an-dia${p.futuro ? ' futuro' : ''}${_an.punto === i ? ' activo' : ''}" style="--nivel:${p.futuro ? 0 : (p.monto / maxM).toFixed(2)}" onclick="${p.futuro ? '' : `elegirPuntoAnalisis(${i})`}"${p.futuro ? ' disabled' : ''}><span>${texto}</span><b>${p.monto ? esc(fCorto(p.monto)) : p.futuro ? '' : '–'}</b></button>`;
  let cal;
  if (_an.periodo === 'anio') cal = `<div class="an-cal an-cal-anio">${puntos.map((p, i) => celda(p, i, _MESES_CORTOS[i])).join('')}</div>`;
  else {
    const vacias = Array.from({ length: puntos[0].ini.getDay() }, () => '<span></span>').join('');
    cal = `<div class="an-cal"><div class="an-cal-sem">${['D', 'L', 'M', 'M', 'J', 'V', 'S'].map(d => `<span>${d}</span>`).join('')}</div><div class="an-cal-dias">${vacias}${puntos.map((p, i) => celda(p, i, String(p.ini.getDate()))).join('')}</div></div>`;
  }
  return `<div class="an-curva-wrap">${_anCurva(puntos)}</div>${info}${stats}${cal}`;
}

// ─── Pantalla ───────────────────────────────────────────────────────────
function renderAnalisis() {
  const el = document.getElementById('analisis');
  if (!el) return;
  if (!state.setup) { el.innerHTML = ''; return; }
  const r = analisisDe(_an.periodo, _anRef());
  const saldo = _c2(r.ingresos - r.gastos);
  const noHaySiguiente = _anRango(_an.periodo, _anMover(_an.periodo, r.rango.ini, 1)).ini > new Date();
  const seg = (grupo, v, txt, fn) => `<button type="button" role="tab" class="an-seg-btn${_an[grupo] === v ? ' activa' : ''}" aria-selected="${_an[grupo] === v}" onclick="${fn}('${v}')">${txt}</button>`;
  const cuerpo = _an.vista === 'dia' ? _anHtmlPorDia(r) : _anHtmlCategorias(r, _an.vista === 'ingresos' ? 'income' : 'expense');
  el.innerHTML = `<div class="an-segmentos an-periodo" role="tablist" aria-label="Periodo">${seg('periodo', 'semana', 'Semana', 'periodoAnalisis')}${seg('periodo', 'mes', 'Mes', 'periodoAnalisis')}${seg('periodo', 'anio', 'Año', 'periodoAnalisis')}</div>
    <div class="rm-nav">
      <button type="button" onclick="moverAnalisis(-1)" aria-label="Periodo anterior">‹</button>
      <strong>${esc(_anTitulo(_an.periodo, r.rango))}</strong>
      <button type="button" onclick="moverAnalisis(1)" aria-label="Periodo siguiente"${noHaySiguiente ? ' disabled' : ''}>›</button>
    </div>
    <div class="rm-totales">
      <div><small>Gastos</small><b class="rojo">${fL(r.gastos)}</b></div>
      <div><small>Ingresos</small><b class="verde">${fL(r.ingresos)}</b></div>
      <div><small>Saldo</small><b class="${saldo < 0 ? 'rojo' : 'verde'}">${fL(saldo)}</b></div>
    </div>
    <div class="an-segmentos an-vista" role="tablist" aria-label="Vista">${seg('vista', 'gastos', '🍩 Gastos', 'vistaAnalisis')}${seg('vista', 'ingresos', '💰 Ingresos', 'vistaAnalisis')}${seg('vista', 'dia', '📈 Por día', 'vistaAnalisis')}</div>
    <div class="an-cuerpo">${cuerpo}</div>`;
}
