// Mi Pisto HN · 16-fondo-emergencia.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.

// ═══ FONDO DE EMERGENCIA GUIADO ═══════════════════════════════════════════
// Es una meta más (esFondoEmergencia: true), así que usa los mismos abonos:
// el dinero sale de la cuenta como movimiento interno y el patrimonio no baja.
// La meta es N meses (3 por defecto) de gastos esenciales: el promedio de
// los gastos fijos de los últimos 3 meses completos con movimientos. Si casi
// nada está marcado como fijo, se usa el total de gastos; sin historial, los
// compromisos que la app ya conoce (pagos recurrentes y cuotas de préstamo).
const fondoEmergencia = () => (state.goals || []).find(g => g.esFondoEmergencia);
const _r100 = n => Math.ceil(n / 100) * 100;

function gastoMensualEsencial() {
  const h = new Date();
  const esGasto = t => !t.deletedAt && t.type === 'expense' && !t.esTransferencia && !t.esConciliacion;
  const meses = [1, 2, 3].map(i => new Date(h.getFullYear(), h.getMonth() - i, 1)).map(f => {
    const tx = state.transactions.filter(t => { const d = new Date(t.date); return esGasto(t) && d.getFullYear() === f.getFullYear() && d.getMonth() === f.getMonth(); });
    return { total: tx.reduce((a, t) => a + t.amount, 0), fijo: tx.filter(t => t.tipo === 'fijo').reduce((a, t) => a + t.amount, 0) };
  }).filter(m => m.total > 0);
  if (meses.length) {
    const prom = k => meses.reduce((a, m) => a + m[k], 0) / meses.length;
    const fijo = prom('fijo'), total = prom('total');
    // Si los fijos son muy pocos, seguramente no se marcaron: mejor el total
    return fijo >= total * 0.3
      ? { monto: Math.round(fijo * 100) / 100, fuente: 'fijos', meses: meses.length }
      : { monto: Math.round(total * 100) / 100, fuente: 'todos', meses: meses.length };
  }
  const compromisos = (state.pagosRecurrentes || []).reduce((a, p) => a + (p.monto || 0), 0) +
    (state.prestamos || []).filter(p => saldoPrestamo(p) > 0).reduce((a, p) => a + (p.cuota || 0), 0);
  return { monto: Math.round(compromisos * 100) / 100, fuente: compromisos > 0 ? 'compromisos' : 'ninguna', meses: 0 };
}
function _textoFuente(e) {
  if (e.fuente === 'fijos') return 'Promedio de tus gastos fijos ' + (e.meses === 1 ? 'del mes pasado' : 'de los últimos ' + e.meses + ' meses') + '.';
  if (e.fuente === 'todos') return 'Promedio de todos tus gastos ' + (e.meses === 1 ? 'del mes pasado' : 'de los últimos ' + e.meses + ' meses') + ' (casi ninguno está marcado como fijo).';
  if (e.fuente === 'compromisos') return 'Tus pagos recurrentes y cuotas de préstamo. Con un mes de gastos anotados, el cálculo será más preciso.';
  return 'Todavía no hay gastos para calcularlo: escribe cuánto necesitas al mes para lo básico (casa, comida, servicios, transporte).';
}
function mesesCubiertos(g) { return g && g.baseMensual > 0 ? g.actual / g.baseMensual : 0; }

// Modal para crear o ajustar el fondo
let _fondoMeses = 3;
function abrirFondoEmergencia() {
  const g = fondoEmergencia(), e = gastoMensualEsencial();
  _fondoMeses = g ? (g.meses || 3) : 3;
  document.getElementById('fondo-base').value = (g ? g.baseMensual : e.monto) ? (g ? g.baseMensual : e.monto).toFixed(2) : '';
  document.getElementById('fondo-fuente').textContent = _textoFuente(e) + (g && Math.abs(e.monto - g.baseMensual) > 0.01 && e.monto > 0 ? ' Hoy el cálculo da ' + fL(e.monto) + '.' : '');
  document.getElementById('fondo-btn-guardar').textContent = g ? '💾 Guardar cambios' : '🛟 Crear mi fondo';
  _renderFondoModal();
  openModal('modal-fondo');
}
function elegirMesesFondo(n) { _fondoMeses = n; _renderFondoModal(); }
function _renderFondoModal() {
  document.querySelectorAll('#modal-fondo [data-meses]').forEach(b => b.classList.toggle('activa', +b.dataset.meses === _fondoMeses));
  const base = parseMonto(document.getElementById('fondo-base').value);
  const el = document.getElementById('fondo-objetivo');
  el.innerHTML = base > 0 ? 'Tu meta: <strong>' + fL(_r100(base * _fondoMeses)) + '</strong> (' + _fondoMeses + ' meses de ' + fL(base) + ')' : '';
}
function guardarFondoEmergencia() {
  const base = parseMonto(document.getElementById('fondo-base').value);
  if (!(base > 0)) return alert('Escribe cuánto necesitas al mes para lo básico.');
  const objetivo = _r100(base * _fondoMeses);
  let g = fondoEmergencia();
  if (g) Object.assign(g, { objetivo, baseMensual: base, meses: _fondoMeses });
  else {
    g = { id: uid(), nombre: 'Fondo de emergencia', objetivo, actual: 0, esFondoEmergencia: true, baseMensual: base, meses: _fondoMeses };
    state.goals.unshift(g);
  }
  save(); closeModal('modal-fondo'); renderAll();
}

// Aporte para completarlo en 6 o 12 meses, redondeado a L 50
const _aporteEn = (g, meses) => Math.ceil(Math.max(0, g.objetivo - g.actual) / meses / 50) * 50;

// Tarjeta del Inicio
function renderFondoEmergencia() {
  const card = document.getElementById('fondo-emergencia-card');
  if (!card) return;
  if (!state.setup) { card.style.display = 'none'; return; }
  const g = fondoEmergencia();
  card.style.display = 'block';
  if (!g) {
    let oculto = false;
    try { oculto = localStorage.getItem('mph_fondo_oculto') === '1'; } catch (e) {}
    const e = gastoMensualEsencial();
    if (oculto || !(e.monto > 0)) { card.style.display = 'none'; return; }
    card.innerHTML = '<div style="display:flex;justify-content:space-between;gap:8px"><strong style="font-size:14px">🛟 Arma tu fondo de emergencia</strong>' +
      '<button onclick="ocultarSugerenciaFondo()" aria-label="Ocultar" style="background:none;border:none;color:var(--text2);font-size:16px;cursor:pointer">✕</button></div>' +
      '<p style="font-size:12px;color:var(--text2);line-height:1.5;margin:6px 0 10px">Un colchón para imprevistos (enfermedad, quedarte sin trabajo, una reparación) sin endeudarte con la tarjeta. Con tus gastos de ' + fL(e.monto) + ' al mes, lo recomendado son <strong>3 meses: ' + fL(_r100(e.monto * 3)) + '</strong>.</p>' +
      '<button class="btn btn-primary" onclick="abrirFondoEmergencia()">🛟 Crear mi fondo</button>';
    return;
  }
  const pct = Math.min(100, g.actual / g.objetivo * 100), cubre = mesesCubiertos(g), completo = g.actual >= g.objetivo;
  card.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><strong style="font-size:14px">🛟 Fondo de emergencia</strong>' +
      '<button onclick="abrirFondoEmergencia()" style="background:none;border:none;color:var(--text2);font-size:12px;cursor:pointer">Ajustar</button></div>' +
    '<div style="font-size:12px;color:var(--text2);margin:4px 0 8px"><strong style="color:var(--text)">' + fL(g.actual) + '</strong> de ' + fL(g.objetivo) + ' · cubre <strong style="color:var(--text)">' + cubre.toFixed(1) + ' de ' + (g.meses || 3) + ' meses</strong></div>' +
    '<div class="fondo-barra"><div style="width:' + pct + '%"></div></div>' +
    (completo
      ? '<p style="font-size:12px;color:var(--green);margin-top:8px">✅ ¡Completo! Ya tienes ' + cubre.toFixed(1) + ' meses de respaldo. Úsalo solo para emergencias y repónlo si lo tocas.</p>'
      : '<p style="font-size:12px;color:var(--text2);margin-top:8px;line-height:1.5">Aportando <strong style="color:var(--text)">' + fL(_aporteEn(g, 12)) + ' al mes</strong> lo completas en un año (o ' + fL(_aporteEn(g, 6)) + ' en 6 meses).</p>' +
        '<button class="btn btn-secondary" onclick="openAbono(\'' + esc(g.id) + '\')" style="margin-top:4px">💰 Abonar al fondo</button>');
}
function ocultarSugerenciaFondo() {
  try { localStorage.setItem('mph_fondo_oculto', '1'); } catch (e) {}
  renderFondoEmergencia();
}
// Línea extra en la lista de metas
function lineaFondoEmergencia(g) {
  if (!g || !g.esFondoEmergencia) return '';
  return '<div class="goal-pro-amounts">🛟 Cubre ' + mesesCubiertos(g).toFixed(1) + ' de ' + (g.meses || 3) + ' meses de tus gastos</div>';
}
