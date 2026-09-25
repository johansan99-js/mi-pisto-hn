// Mi Pisto HN · 34-informe-mes.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.

// ═══ TU MES, EN HISTORIAS ═════════════════════════════════════════════════
// El resumen del mes (07-notificaciones-y-reportes.js, calcularResumenMes)
// contado en pantallas que se pasan tocando, como las historias:
//   cómo te fue · en qué se fue tu pisto · presupuestos · ahorro y metas ·
//   tu constancia · remesas (si hubo) · un consejo para el mes que viene.
// Al final se puede compartir como imagen SIN MONTOS (solo porcentajes).
// Los primeros días del mes el Inicio avisa que está listo (y una
// notificación, si las activaste).

/** Todo lo del mes en un objeto: lo del resumen más presupuestos, constancia, remesas y metas */
function informeDelMes(y, m) {
  const r = calcularResumenMes(y, m);
  const ini = new Date(y, m, 1), fin = new Date(y, m + 1, 1);
  const diasMes = new Date(y, m + 1, 0).getDate();
  const nombre = _MESES_LARGOS[m], nombrePrev = _MESES_LARGOS[(m + 11) % 12];

  // Lo que te sobró, en % de lo que ganaste, este mes y el anterior
  const prev = calcularResumenMes(new Date(y, m - 1, 1).getFullYear(), new Date(y, m - 1, 1).getMonth());
  const pctAhorro = r.ingresos > 0 ? Math.round(r.sobrante / r.ingresos * 100) : null;
  const pctAhorroPrev = prev.ingresos > 0 ? Math.round(prev.sobrante / prev.ingresos * 100) : null;
  const cambioGasto = r.hayMesAnterior && r.gastosPrev > 0 ? Math.round((r.gastos - r.gastosPrev) / r.gastosPrev * 100) : null;

  // Presupuestos: cumplido si en todos sus períodos del mes quedó en 100% o menos
  const presus = (state.presupuestos || []).map(p => {
    let rango = rangoPeriodo(p.periodo, ini), pasado = 0, periodos = 0, gastado = 0, guard = 0;
    while (rango.inicio < fin && guard++ < 40) {
      if (rango.inicio >= ini || p.periodo === 'mes') {
        const e = estadoPresupuestoEn(p, rango);
        periodos++; gastado += e.gastado;
        if (e.pct > 100) pasado = _c2(pasado + (e.gastado - p.monto));
      }
      rango = rangoPeriodo(p.periodo, rango.fin);
    }
    return { cat: nombreCatPresupuesto(p.cat), periodo: p.periodo, periodos, cumplido: periodos > 0 && pasado <= 0, pasado, gastado: _c2(gastado) };
  }).filter(x => x.periodos > 0);

  // Constancia: días del mes con algo anotado, y el día que más gastaste
  const dias = typeof diasConRegistro === 'function' ? [...diasConRegistro()].filter(d => { const f = new Date(d + 'T12:00:00'); return f >= ini && f < fin; }).length : 0;
  const porDia = {};
  (state.transactions || []).forEach(t => {
    if (t.deletedAt || t.type !== 'expense' || t.esTransferencia || t.esConciliacion || typeof t.amount !== 'number') return;
    const f = fechaContable(t);
    if (f >= ini && f < fin) { const k = fechaLocal(f); porDia[k] = (porDia[k] || 0) + t.amount; }
  });
  const diaMax = Object.entries(porDia).sort((a, b) => b[1] - a[1])[0] || null;

  // Remesas del mes (30-remesas.js)
  const rem = typeof remesasGuardadas === 'function' ? remesasGuardadas().filter(t => { const f = new Date(t.date); return f >= ini && f < fin; }) : [];
  const remTotal = _c2(rem.reduce((a, t) => a + t.amount, 0));
  const remDe = [...new Set(rem.map(t => t.remesa && t.remesa.de).filter(Boolean))];

  // Metas
  const metas = (state.goals || []).filter(g => g.objetivo > 0).map(g => ({ nombre: g.nombre, pct: Math.min(100, Math.round((Number(g.actual) || 0) / g.objetivo * 100)) }));

  return {
    y, m, nombre, nombrePrev, r, pctAhorro, pctAhorroPrev, cambioGasto,
    top: r.top.slice(0, 3).map(c => ({ cat: c.cat, monto: c.monto, pct: r.gastos > 0 ? Math.round(c.monto / r.gastos * 100) : 0, antes: c.antes })),
    presus, cumplidos: presus.filter(p => p.cumplido).length,
    dias, diasMes, racha: typeof calcularRacha === 'function' ? calcularRacha().mejor : 0,
    diaMax: diaMax ? { fecha: diaMax[0], monto: _c2(diaMax[1]) } : null,
    remesas: rem.length ? { n: rem.length, total: remTotal, de: remDe } : null,
    metas, consejos: ideasDelResumen(r),
  };
}

// ─── Las pantallas ───────────────────────────────────────────────────────
const _inf = { y: null, m: null, i: 0, pantallas: [] };
const _mesCap = m => _MESES_LARGOS[m].charAt(0).toUpperCase() + _MESES_LARGOS[m].slice(1);

function _pantallasInforme(d) {
  const P = [], r = d.r;
  const frase = d.pctAhorro === null ? 'Anotaste tus gastos: ese es el primer paso.'
    : d.pctAhorro >= 20 ? '¡Muy bien! Guardaste más de lo recomendado (20%).'
    : d.pctAhorro > 0 ? 'Te sobró algo. La meta es llegar al 20%.'
    : 'Este mes se fue más de lo que entró. El próximo lo cuadramos.';
  P.push({ clase: 'inf-p1', html: `<small class="inf-kicker">Tu mes en Mi Pisto</small><h2>${_mesCap(d.m)} ${d.y}</h2>
    <div class="inf-grande ${r.sobrante >= 0 ? 'verde' : 'rojo'}">${r.sobrante >= 0 ? 'Te sobró' : 'Te faltó'}<b>${fL(Math.abs(r.sobrante))}</b>${d.pctAhorro !== null ? `<span>${Math.abs(d.pctAhorro)}% de lo que ganaste</span>` : ''}</div>
    <div class="inf-dos"><div><small>Ganaste</small><b class="verde">${fL(r.ingresos)}</b></div><div><small>Gastaste</small><b class="rojo">${fL(r.gastos)}</b></div></div>
    ${d.cambioGasto !== null ? `<p class="inf-nota">${Math.abs(d.cambioGasto) < 3 ? '⚖️ Gastaste casi lo mismo que en ' + d.nombrePrev : d.cambioGasto > 0 ? '📈 Gastaste ' + d.cambioGasto + '% más que en ' + d.nombrePrev : '📉 Gastaste ' + (-d.cambioGasto) + '% menos que en ' + d.nombrePrev}</p>` : ''}
    <p class="inf-frase">${frase}</p>` });

  if (d.top.length) {
    const cambio = d.top.filter(c => c.antes > 0).map(c => ({ c, d: Math.round((c.monto - c.antes) / c.antes * 100) })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d))[0];
    P.push({ clase: 'inf-p2', html: `<small class="inf-kicker">En qué se fue tu pisto</small><h2>Tus 3 categorías</h2>
      <div class="inf-cats">${d.top.map((c, i) => `<div class="inf-cat">${circuloCategoria(c.cat, 'expense')}<div><strong>${i + 1}. ${esc(c.cat)}</strong><small>${fL(c.monto)}</small><span class="inf-barra"><i style="width:${c.pct}%"></i></span></div><b>${c.pct}%</b></div>`).join('')}</div>
      ${cambio && Math.abs(cambio.d) >= 10 ? `<p class="inf-nota">${cambio.d > 0 ? '🔎 ' + esc(cambio.c.cat) + ' subió ' + cambio.d + '%' : '👏 ' + esc(cambio.c.cat) + ' bajó ' + (-cambio.d) + '%'} contra ${d.nombrePrev}</p>` : ''}
      ${r.hormiga.cantidad >= 5 ? `<p class="inf-nota">🐜 ${r.hormiga.cantidad} gastos hormiga sumaron ${fL(r.hormiga.total)}</p>` : ''}` });
  }

  if (d.presus.length) {
    const pasados = d.presus.filter(p => !p.cumplido).sort((a, b) => b.pasado - a.pasado);
    P.push({ clase: 'inf-p3', html: `<small class="inf-kicker">Presupuestos</small><h2>Cumpliste ${d.cumplidos} de ${d.presus.length}</h2>
      <div class="inf-anillo" style="--p:${Math.round(d.cumplidos / d.presus.length * 100)}"><b>${Math.round(d.cumplidos / d.presus.length * 100)}%</b></div>
      ${pasados.length ? `<div class="inf-lista">${pasados.slice(0, 3).map(p => `<div>⚠️ <strong>${esc(p.cat)}</strong>: te pasaste ${fL(p.pasado)}</div>`).join('')}</div>` : '<p class="inf-frase">¡No te pasaste en ninguno! 🎉</p>'}` });
  }

  const aMetas = _c2(r.aMetas || 0);
  if (aMetas > 0 || d.metas.length) {
    P.push({ clase: 'inf-p4', html: `<small class="inf-kicker">Ahorro y metas</small><h2>${aMetas > 0 ? 'Guardaste ' + fL(aMetas) : 'Tus metas'}</h2>
      <div class="inf-lista">${d.metas.slice(0, 4).map(g => `<div class="inf-meta"><strong>🎯 ${esc(g.nombre)}</strong><span class="inf-barra"><i style="width:${g.pct}%"></i></span><small>${g.pct}%</small></div>`).join('')}</div>
      ${aMetas > 0 ? '' : '<p class="inf-nota">Este mes no abonaste a tus metas. Aunque sea poquito, suma.</p>'}` });
  }

  const f = d.diaMax ? new Date(d.diaMax.fecha + 'T12:00:00') : null;
  P.push({ clase: 'inf-p5', html: `<small class="inf-kicker">Tu constancia</small><h2>Anotaste ${d.dias} de ${d.diasMes} días</h2>
    <div class="inf-anillo" style="--p:${Math.round(d.dias / d.diasMes * 100)}"><b>🔥 ${d.dias}</b></div>
    ${d.racha ? `<p class="inf-nota">Tu mejor racha: ${d.racha} ${d.racha === 1 ? 'día' : 'días'} seguidos</p>` : ''}
    ${f ? `<p class="inf-nota">💸 El día que más gastaste: ${_DIAS_SEMANA[f.getDay()]} ${f.getDate()}, ${fL(d.diaMax.monto)}</p>` : ''}` });

  if (d.remesas) {
    P.push({ clase: 'inf-p6', html: `<small class="inf-kicker">Remesas</small><h2>Te mandaron ${fL(d.remesas.total)}</h2>
      <p class="inf-frase">${d.remesas.n} ${d.remesas.n === 1 ? 'envío' : 'envíos'}${d.remesas.de.length ? ' de ' + d.remesas.de.slice(0, 3).map(esc).join(', ') : ''} 🌎</p>` });
  }

  const consejo = d.consejos.find(c => /hormiga|fijos|subió|faltó|más de lo que ganaste|tarjeta/.test(c)) || d.consejos[0] || '';
  P.push({ clase: 'inf-p7', html: `<small class="inf-kicker">Para ${_MESES_LARGOS[(d.m + 1) % 12]}</small><h2>Un consejo</h2>
    ${consejo ? `<p class="inf-frase">${esc(consejo)}</p>` : '<p class="inf-frase">Sigue anotando: con dos meses ya se ven tus patrones.</p>'}
    <div class="inf-acciones"><button type="button" class="btn btn-primary" onclick="event.stopPropagation();compartirInformeMes()">📤 Compartir (sin montos)</button>
    <button type="button" class="btn btn-secondary" onclick="event.stopPropagation();cerrarInformeMes()">Listo</button></div>` });
  return P;
}

function abrirInformeMes(y, m) {
  if (y === undefined) { const mp = _mesPasado(); y = mp.y; m = mp.m; }
  const d = informeDelMes(y, m);
  if (!d.r.movimientos) return alert('No hay movimientos en ' + _MESES_LARGOS[m] + '.');
  Object.assign(_inf, { y, m, i: 0, datos: d, pantallas: _pantallasInforme(d) });
  if (typeof cerrarAvisoResumen === 'function' && y === _mesPasado().y && m === _mesPasado().m) cerrarAvisoResumen();
  _renderInforme();
  openModal('modal-informe-mes');
}
function cerrarInformeMes() { closeModal('modal-informe-mes'); }
function pasarInforme(delta) {
  const n = _inf.pantallas.length;
  const i = _inf.i + delta;
  if (i >= n) return cerrarInformeMes();
  _inf.i = Math.max(0, i);
  _renderInforme();
}
function _renderInforme() {
  const el = document.getElementById('informe-mes');
  if (!el) return;
  const p = _inf.pantallas[_inf.i];
  el.className = 'inf-hoja ' + p.clase;
  el.innerHTML = `<div class="inf-puntos">${_inf.pantallas.map((_, k) => `<span class="${k <= _inf.i ? 'lleno' : ''}"></span>`).join('')}</div>
    <button type="button" class="inf-cerrar" onclick="event.stopPropagation();cerrarInformeMes()" aria-label="Cerrar">✕</button>
    <div class="inf-cuerpo">${p.html}</div>
    ${_inf.i < _inf.pantallas.length - 1 ? '<div class="inf-sig">Toca para seguir ›</div>' : ''}`;
}
// Tocar la mitad izquierda regresa; la derecha avanza (como las historias)
function tocarInforme(ev) {
  if (ev.target.closest('button')) return;
  const b = ev.currentTarget.getBoundingClientRect();
  pasarInforme(ev.clientX - b.left < b.width * 0.3 ? -1 : 1);
}

// ─── Compartir como imagen, sin montos ──────────────────────────────────
function _imagenInforme(d) {
  const W = 1080, H = 1350, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#063B24'); g.addColorStop(1, '#0B0F0C');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  const t = (txt, px, y, color, peso, alinear) => { x.font = `${peso || 700} ${px}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`; x.fillStyle = color || '#fff'; x.textAlign = alinear || 'left'; x.fillText(txt, alinear === 'center' ? W / 2 : 90, y); };
  t('MI PISTO HN', 34, 130, '#22C55E', 800);
  t(`Mi ${d.nombre} ${d.y}`, 84, 230, '#fff', 800);
  let y = 360;
  const linea = (emoji, txt) => { t(emoji + '  ' + txt, 46, y, '#E8F5EC', 600); y += 86; };
  if (d.pctAhorro !== null) linea(d.pctAhorro >= 0 ? '💰' : '⚠️', d.pctAhorro >= 0 ? `Me sobró el ${d.pctAhorro}% de lo que gané` : `Gasté ${-d.pctAhorro}% más de lo que gané`);
  if (d.cambioGasto !== null && Math.abs(d.cambioGasto) >= 3) linea(d.cambioGasto < 0 ? '📉' : '📈', `Gasté ${Math.abs(d.cambioGasto)}% ${d.cambioGasto < 0 ? 'menos' : 'más'} que en ${d.nombrePrev}`);
  if (d.presus.length) linea('✅', `Cumplí ${d.cumplidos} de ${d.presus.length} presupuestos`);
  linea('🔥', `Anoté ${d.dias} de ${d.diasMes} días`);
  y += 30;
  if (d.top.length) {
    t('En qué se fue mi pisto', 40, y, '#9FB8A8', 700); y += 70;
    d.top.forEach(cat => {
      t(cat.cat.slice(0, 22), 42, y, '#fff', 700);
      x.font = '800 42px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'; x.fillStyle = '#22C55E'; x.textAlign = 'right'; x.fillText(cat.pct + '%', W - 90, y);
      x.fillStyle = 'rgba(255,255,255,.12)'; x.fillRect(90, y + 22, W - 180, 18);
      x.fillStyle = '#22C55E'; x.fillRect(90, y + 22, (W - 180) * cat.pct / 100, 18);
      y += 110;
    });
  }
  t('Tus finanzas en orden · Mi Pisto HN', 32, H - 90, '#9FB8A8', 600, 'center');
  return new Promise(res => c.toBlob(res, 'image/png'));
}
async function compartirInformeMes() {
  const d = _inf.datos;
  if (!d) return;
  const blob = await _imagenInforme(d);
  if (!blob) return alert('No se pudo crear la imagen.');
  const nombre = `MiPisto_${d.nombre}_${d.y}.png`;
  try {
    const archivo = new File([blob], nombre, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
      await navigator.share({ files: [archivo], title: `Mi ${d.nombre} en Mi Pisto HN`, text: 'Así me fue este mes 💚' });
      return;
    }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  descargarArchivo(blob, nombre);
  if (typeof avisoRapido === 'function') avisoRapido('🖼️ Imagen guardada: compártela por WhatsApp. No lleva montos, solo porcentajes.', 5000);
}

// Aviso del mes que cerró: notificación una vez, si están activadas
function notificarInformeMes() {
  const mp = _mesPasado();
  if (!state.setup || new Date().getDate() > 7 || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  let ya = '';
  try { ya = localStorage.getItem('mph_informe_notificado') || ''; } catch (e) {}
  if (ya === mp.clave) return;
  const r = calcularResumenMes(mp.y, mp.m);
  if (r.movimientos < 3) return;
  try { localStorage.setItem('mph_informe_notificado', mp.clave); } catch (e) {}
  enviarNotificacion(`🗓️ Tu ${_MESES_LARGOS[mp.m]} en Mi Pisto`, r.ingresos > 0 ? (r.sobrante >= 0 ? `Te sobró el ${Math.round(r.sobrante / r.ingresos * 100)}% de lo que ganaste. Mira en qué se fue tu pisto.` : 'Mira en qué se fue tu pisto y cómo cuadrar el próximo mes.') : 'Mira en qué se fue tu pisto.', null);
}
