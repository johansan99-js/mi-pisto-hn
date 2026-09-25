// Mi Pisto HN · 33-sin-esfuerzo.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.

// ═══ PAGOS FIJOS QUE SE ANOTAN SOLOS ══════════════════════════════════════
// Mucha gente deja estas apps porque cansa anotar todo. Lo que se repite cada
// mes (salario, alquiler, Netflix, la luz, la cuota) se anota solo: al abrir
// la app, lo que ya tocaba se registra con su fecha y un aviso en el Inicio
// dice qué se anotó, para corregir el monto si cambió (la luz nunca es igual).
// Un pago recurrente puede ser:
//   { id, servicio, monto, dia, dias?: [15, 30], tipo: 'gasto'|'ingreso',
//     cat, cuenta | tarjetaId, auto, autoDesde, anotados: { 'año-mes-día': txId } }
// Solo se anota desde que se activó (autoDesde) y solo el mes en curso: si la
// app pasó meses cerrada, no llena de golpe meses viejos.
const diasPagoFijo = p => (Array.isArray(p.dias) && p.dias.length ? p.dias : [p.dia]).map(Number).filter(d => d >= 1 && d <= 31);
const _diasDelMes = (y, m) => new Date(y, m + 1, 0).getDate();
const _claveAnotado = (y, m, d) => `${y}-${m}-${d}`;

function verificarPagosAutomaticos(ahora) {
  if (!state.setup) return [];
  const hoy = ahora ? new Date(ahora) : new Date();
  const y = hoy.getFullYear(), m = hoy.getMonth();
  const anotados = [];
  (state.pagosRecurrentes || []).forEach(p => {
    if (!p.auto || !(p.monto > 0)) return;
    const desde = p.autoDesde ? new Date(p.autoDesde) : null;
    if (desde) desde.setHours(0, 0, 0, 0);
    const dias = diasPagoFijo(p);
    dias.forEach(d => {
      const dd = Math.min(d, _diasDelMes(y, m));
      const fecha = new Date(y, m, dd, 9, 0);
      if (fecha > hoy || (desde && fecha < desde)) return;
      const clave = _claveAnotado(y, m, d);
      p.anotados = p.anotados || {};
      if (p.anotados[clave]) return;
      // Si ya se marcó pagado a mano este mes (un pago de un solo día), no se repite
      if (dias.length === 1 && typeof _pagadoEsteMes === 'function' && _pagadoEsteMes(p)) { p.anotados[clave] = 'manual'; return; }
      const tx = _txDePagoFijo(p, fecha);
      if (!tx) return;
      state.transactions.push(tx);
      p.anotados[clave] = tx.id;
      p.ultimoPago = fecha.toISOString();
      if (p.tipo !== 'ingreso') p.pagado = _c2((p.pagado || 0) + tx.amount);
      anotados.push(tx);
    });
    // Solo se guardan los últimos meses
    Object.keys(p.anotados || {}).forEach(k => { const [ay, am] = k.split('-').map(Number); if ((y * 12 + m) - (ay * 12 + am) > 3) delete p.anotados[k]; });
  });
  if (anotados.length) {
    save();
    if (typeof recalcularSaldosTarjetas === 'function') recalcularSaldosTarjetas();
    renderAll();
    if (typeof avisoRapido === 'function') avisoRapido(anotados.length === 1 ? `🔁 Se anotó solo: ${anotados[0].subcat || anotados[0].nota || anotados[0].cat} ${fL(anotados[0].amount)}` : `🔁 Se anotaron solos ${anotados.length} pagos fijos`, 4000);
  }
  return anotados;
}

function _txDePagoFijo(p, fecha) {
  const base = { id: uid(), amount: _c2(p.monto), pagoRecurrenteId: p.id, autoRegistrado: true, date: fecha.toISOString() };
  if (p.tipo === 'ingreso') {
    const cat = p.cat || 'Salario';
    const def = CATS_INGRESO.find(c => _normCat(c.n) === _normCat(cat));
    return Object.assign(base, { type: 'income', cat, subcat: def ? def.tipo : 'extra', cuenta: cuentaValida(p.cuenta), nota: p.servicio });
  }
  const tc = p.tarjetaId && (state.tarjetas || []).find(t => String(t.id) === String(p.tarjetaId));
  const cat = p.cat || 'Servicios';
  const tx = Object.assign(base, { type: 'expense', cat, subcat: p.servicio, tipo: 'fijo' });
  if (tc) Object.assign(tx, { pago: 'credito', cuenta: null, tarjetaId: tc.id, tarjetaNombre: tc.nombre });
  else { const c = cuentaValida(p.cuenta); Object.assign(tx, { pago: c, cuenta: c }); }
  return tx;
}

// ─── El aviso del Inicio: lo que se anotó solo y todavía no revisaste ────
function renderAutoAnotados() {
  const el = document.getElementById('auto-anotados');
  if (!el) return;
  const txs = (state.transactions || []).filter(t => t.autoRegistrado && !t.autoVisto && !t.deletedAt).sort((a, b) => new Date(b.date) - new Date(a.date));
  if (!state.setup || !txs.length) { el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = 'block';
  el.innerHTML = `<div class="auto-head"><strong>🔁 Se ${txs.length === 1 ? 'anotó solo' : 'anotaron solos'}</strong><small>Tócalo si el monto cambió</small></div>
    ${txs.slice(0, 6).map(t => _htmlFilaRegistro({ t })).join('')}
    <button type="button" class="btn btn-secondary auto-ok" onclick="marcarAutoVistos()">✓ Entendido</button>`;
}
function marcarAutoVistos() {
  (state.transactions || []).forEach(t => { if (t.autoRegistrado && !t.autoVisto) t.autoVisto = true; });
  save(); renderAutoAnotados();
}

// ─── Crear y editar un pago fijo ─────────────────────────────────────────
let _pagoFijoEditando = null, _pagoFijoTipo = 'gasto';
function abrirPagoFijo(id, tipo) {
  const p = id ? (state.pagosRecurrentes || []).find(x => x.id === id) : null;
  _pagoFijoEditando = p ? p.id : null;
  _pagoFijoTipo = p ? (p.tipo === 'ingreso' ? 'ingreso' : 'gasto') : (tipo === 'ingreso' ? 'ingreso' : 'gasto');
  document.getElementById('pf-titulo').textContent = p ? '✏️ Editar pago fijo' : '🔁 Nuevo pago fijo';
  document.getElementById('pago-servicio').value = p ? p.servicio : '';
  document.getElementById('pago-monto').value = p && p.monto ? p.monto : '';
  document.getElementById('pago-dia').value = p ? diasPagoFijo(p).join(', ') : '';
  document.getElementById('pf-cat').value = p ? (p.cat || '') : '';
  document.getElementById('pf-auto').checked = p ? !!p.auto : true;
  _renderPagoFijo(p);
  openModal('modal-pago-recurrente');
}
function tipoPagoFijo(t) { _pagoFijoTipo = t === 'ingreso' ? 'ingreso' : 'gasto'; _renderPagoFijo(); }
function _renderPagoFijo(p) {
  const ing = _pagoFijoTipo === 'ingreso';
  document.querySelectorAll('#pf-tipo .an-seg-btn').forEach(b => b.classList.toggle('activa', b.dataset.t === _pagoFijoTipo));
  document.getElementById('pago-servicio').placeholder = ing ? 'Nombre (Ej. Salario, Pensión, Alquiler que cobras)' : 'Servicio (Ej. Luz, Netflix, Alquiler, Cuota)';
  document.getElementById('pf-lbl-cuenta').textContent = ing ? '¿A qué cuenta entra?' : '¿Con qué se paga?';
  const dl = document.getElementById('pf-cats');
  if (dl) dl.innerHTML = categoriasParaElegir(ing ? 'ingreso' : 'gasto').map(c => `<option value="${esc(c)}">`).join('');
  document.getElementById('pf-cat').placeholder = ing ? 'Categoría (Salario)' : 'Categoría (Servicios)';
  const sel = document.getElementById('pf-cuenta');
  const actual = p ? (p.tarjetaId ? 'tc:' + p.tarjetaId : p.cuenta || '') : sel.value;
  sel.innerHTML = '<option value="">Preguntarme cuando lo marque pagado</option>'
    + listaCuentas().map(c => `<option value="${esc(c.id)}">${esc(c.icono)} ${esc(nombreCompletoCuenta(c))}</option>`).join('')
    + (ing ? '' : (state.tarjetas || []).map(t => `<option value="tc:${esc(t.id)}">💳 ${esc(t.nombre)}</option>`).join(''));
  sel.value = [...sel.options].some(o => o.value === actual) ? actual : (p ? '' : 'efectivo');
  _renderAutoPagoFijo();
}
function _renderAutoPagoFijo() {
  const auto = document.getElementById('pf-auto').checked, sinCuenta = !document.getElementById('pf-cuenta').value;
  document.getElementById('pf-auto-nota').textContent = auto
    ? (sinCuenta ? 'Para anotarlo solo, elige con qué se paga.' : 'Se anota solo el día que toca, con este monto. Si cambia, lo corriges desde el aviso del Inicio.')
    : 'Solo te avisamos antes de que venza; lo marcas pagado tú.';
}
function savePagoRecurrente() {
  const servicio = String(document.getElementById('pago-servicio').value).replace(/[<>]/g, '').trim().slice(0, 60);
  const monto = leerMonto(document.getElementById('pago-monto').value) || 0;
  const dias = [...new Set(String(document.getElementById('pago-dia').value).split(/[^\d]+/).map(Number).filter(d => d >= 1 && d <= 31))].sort((a, b) => a - b).slice(0, 4);
  const cat = String(document.getElementById('pf-cat').value).replace(/[<>]/g, '').trim().slice(0, 40);
  const cuentaSel = document.getElementById('pf-cuenta').value;
  const auto = document.getElementById('pf-auto').checked;
  if (!servicio) return alert(_pagoFijoTipo === 'ingreso' ? 'Ponle nombre (ej. Salario).' : 'Escribe qué pagas (ej. Luz, Netflix).');
  if (!dias.length) return alert('Escribe el día del mes (1 a 31). Si son dos, sepáralos con coma: 15, 30.');
  if (auto && !(monto > 0)) return alert('Para anotarlo solo, escribe el monto (aunque sea el aproximado).');
  if (auto && !cuentaSel) return alert('Para anotarlo solo, elige con qué se paga o a qué cuenta entra.');
  if (!state.pagosRecurrentes) state.pagosRecurrentes = [];
  let p = _pagoFijoEditando && state.pagosRecurrentes.find(x => x.id === _pagoFijoEditando);
  if (!p) { p = { id: uid(), pagado: 0 }; state.pagosRecurrentes.push(p); }
  const antesAuto = !!p.auto;
  Object.assign(p, { servicio, monto: _c2(monto), dia: dias[0], tipo: _pagoFijoTipo, cat: cat || null, auto });
  if (dias.length > 1) p.dias = dias; else delete p.dias;
  delete p.cuenta; delete p.tarjetaId;
  if (cuentaSel.startsWith('tc:')) p.tarjetaId = cuentaSel.slice(3); else if (cuentaSel) p.cuenta = cuentaSel;
  // Al activarlo empieza a contar desde hoy
  if (auto && !antesAuto) p.autoDesde = new Date().toISOString();
  save(); closeModal('modal-pago-recurrente'); renderAll();
  if (typeof avisoRapido === 'function') avisoRapido(auto ? `🔁 ${servicio}: se anota solo cada día ${dias.join(' y ')}` : `🔔 ${servicio}: te avisamos antes del día ${dias.join(' y ')}`);
}
function editarRecurrente(id) { abrirPagoFijo(id); }

// ═══ CUADRE DE EFECTIVO ═══════════════════════════════════════════════════
// Para quien no quiere anotar cada gasto en efectivo: una vez por semana la
// app pregunta cuánto efectivo tienes y la diferencia se anota como gasto del
// "Día a día". No hay detalle de en qué se fue, pero las cuentas cuadran.
function cuadrarEfectivo() {
  const inp = document.getElementById('cuadre-efectivo');
  const real = leerMonto(inp ? inp.value : '');
  if (real === null || isNaN(real) || real < 0) return alert('Escribe cuánto efectivo tienes (cuenta billetes y monedas).');
  const app = getCuentaBalance('efectivo');
  const dif = _c2(real - app);
  if (Math.abs(dif) < 0.01) {
    marcarCuadre();
    return avisoRapido('✅ Tu efectivo cuadra');
  }
  if (dif < 0) {
    state.transactions.push({ id: uid(), type: 'expense', amount: -dif, cat: 'Día a día', subcat: 'Cuadre de efectivo', pago: 'efectivo', cuenta: 'efectivo', tipo: 'extra', esCuadre: true, date: new Date().toISOString() });
    save(); marcarCuadre(); renderAll();
    return avisoRapido(`🪙 Se anotaron ${fL(-dif)} como gastos del día a día`, 4000);
  }
  // Hay más de lo que dice la app: casi siempre un ingreso sin anotar
  if (confirm(`Tienes ${fL(dif)} más de lo que dice la app.\n\n¿Te faltó anotar un ingreso? (una venta, un pago, un regalo)\n\n[Aceptar] = anotarlo como ingreso\n[Cancelar] = solo corregir el saldo`)) {
    state.transactions.push({ id: uid(), type: 'income', amount: dif, cat: 'Otros', subcat: 'extra', cuenta: 'efectivo', nota: 'Cuadre de efectivo', esCuadre: true, date: new Date().toISOString() });
  } else {
    state.transactions.push({ id: uid(), type: 'income', amount: dif, cat: 'Ajuste de saldo', subcat: 'Cuadre de efectivo', cuenta: 'efectivo', esConciliacion: true, date: new Date().toISOString() });
  }
  save(); marcarCuadre(); renderAll();
  avisoRapido(`✅ Efectivo al día: ${fL(real)}`);
}

// Al volver a la app otro día (queda abierta en segundo plano), se revisa de nuevo
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state && state.setup) { try { verificarPagosAutomaticos(); } catch (e) { console.error(e); } }
});
