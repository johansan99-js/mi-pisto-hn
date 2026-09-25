// Mi Pisto HN · 15-plan-deudas.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.

// ═══ PLAN PARA SALIR DE DEUDAS ════════════════════════════════════════════
// Junta las deudas que ya conoce la app (tarjetas, compras Tasa Cero,
// préstamos y deudas con personas) y simula mes a mes con un presupuesto
// fijo: se paga el mínimo de todas y lo que sobra va a una sola deuda.
// Al liquidar una, su mínimo se suma al extra (efecto bola de nieve).
//   · Avalancha: primero la tasa más alta → paga menos intereses.
//   · Bola de nieve: primero el saldo más chico → victorias rápidas.
// Supone que no hay compras nuevas; el mínimo de tarjeta es la regla de la
// app (5% del saldo, mínimo L 100).
const PLAN_MAX_MESES = 600;
const PLAN_KEY = 'mph_plan_deudas';

function deudasParaPlan() {
  const d = [];
  (state.tarjetas || []).forEach(t => {
    const saldoTc = (typeof deudaTarjetaL==='function'?deudaTarjetaL(t):t.saldo);
    if (saldoTc > 0.5) d.push({ id: 'tc:' + t.id, nombre: t.nombre, tipo: 'tarjeta', saldo: saldoTc, tasa: Number(t.tasaInteres) || 0 });
    (t.cuotas || []).filter(planActivo).forEach(c => d.push({ id: 'cuotas:' + c.id, nombre: (c.descripcion || 'Compra a cuotas') + ' · ' + t.nombre, tipo: 'cuotas', saldo: pendientePlan(c), tasa: 0, minimo: montoCuota(c) }));
  });
  (state.prestamos || []).forEach(p => {
    const saldo = saldoPrestamo(p);
    if (saldo > 0.5) d.push({ id: 'prest:' + p.id, nombre: p.entidad, tipo: 'prestamo', saldo, minimo: p.cuota || 0,
      tasa: Math.round(tasaMensualImplicita(p.monto, p.cuota, p.cuotasTotal) * 1200 * 100) / 100 });
  });
  (state.payables || []).forEach(p => {
    const saldo = (p.monto || 0) - (p.pagado || 0);
    if (saldo > 0.5 && !p.liquidadaEn) d.push({ id: 'pers:' + p.id, nombre: p.creditor, tipo: p.tipo === 'banco' ? 'banco' : 'persona', saldo, tasa: 0, minimo: 0 });
  });
  return d.map(x => Object.assign(x, { saldo: Math.round(x.saldo * 100) / 100 }));
}
const _minimoPlan = (d, saldo) => d.tipo === 'tarjeta' ? Math.max(saldo * 0.05, 100) : d.minimo;
function minimosDelMes(deudas) {
  return Math.round(deudas.reduce((a, d) => a + Math.min(d.saldo, _minimoPlan(d, d.saldo)), 0) * 100) / 100;
}

/** Simula el plan. soloMinimos: sin extra ni bola de nieve (para comparar). */
function simularPlanDeudas(deudas, presupuesto, estrategia, soloMinimos) {
  const ds = deudas.map(x => Object.assign({}, x, { bal: x.saldo, pagadaEn: null }));
  const prioridad = ds.slice().sort(estrategia === 'avalancha'
    ? (a, b) => (b.tasa - a.tasa) || (a.saldo - b.saldo)
    : (a, b) => (a.saldo - b.saldo) || (b.tasa - a.tasa));
  let mes = 0, interes = 0, primerMes = null;
  const vivas = () => ds.some(d => d.bal > 0.005 && !(soloMinimos && !(d.minimo > 0) && (d.tipo === 'persona' || d.tipo === 'banco')));
  while (vivas() && mes < PLAN_MAX_MESES) {
    mes++;
    const pagos = {};
    let disponible = soloMinimos ? Infinity : presupuesto;
    ds.forEach(d => { if (d.bal > 0.005) { const i = d.bal * d.tasa / 1200; d.bal += i; interes += i; } });
    ds.forEach(d => {
      if (d.bal <= 0.005) return;
      const p = Math.min(_minimoPlan(d, d.bal), d.bal, disponible);
      d.bal -= p; disponible -= p; pagos[d.id] = (pagos[d.id] || 0) + p;
    });
    if (!soloMinimos) for (const d of prioridad) {
      if (disponible <= 0.005) break;
      if (d.bal <= 0.005) continue;
      const p = Math.min(d.bal, disponible);
      d.bal -= p; disponible -= p; pagos[d.id] = (pagos[d.id] || 0) + p;
    }
    if (mes === 1) primerMes = pagos;
    ds.forEach(d => { if (d.bal <= 0.005 && d.pagadaEn === null) { d.bal = 0; d.pagadaEn = mes; } });
  }
  const libre = !vivas();
  return { libre, meses: libre ? mes : Infinity, interes: libre ? Math.round(interes * 100) / 100 : Infinity,
    orden: prioridad.map(d => d.id), deudas: ds, primerMes: primerMes || {} };
}

function leerPlanDeudas() {
  try { return Object.assign({ presupuesto: null, estrategia: 'avalancha' }, JSON.parse(localStorage.getItem(PLAN_KEY) || '{}')); }
  catch (e) { return { presupuesto: null, estrategia: 'avalancha' }; }
}
function _guardarPlanDeudas(cambios) {
  const p = Object.assign(leerPlanDeudas(), cambios);
  try { localStorage.setItem(PLAN_KEY, JSON.stringify(p)); } catch (e) {}
  return p;
}
const _mesDelPlan = n => { const h = new Date(), f = new Date(h.getFullYear(), h.getMonth() + n - 1, 1); return _MESES[f.getMonth()] + ' ' + f.getFullYear(); };
const _ICONO_DEUDA = { tarjeta: '💳', cuotas: '🛍️', prestamo: '🏦', banco: '🏦', persona: '🤝' };

function abrirPlanDeudas() {
  const deudas = deudasParaPlan();
  const plan = leerPlanDeudas();
  const input = document.getElementById('plan-presupuesto');
  input.value = plan.presupuesto ? plan.presupuesto.toFixed(2) : (deudas.length ? Math.ceil(minimosDelMes(deudas) * 1.2) : '');
  _pintarEstrategia(plan.estrategia);
  renderPlanDeudas();
  openModal('modal-plan-deudas');
}
function _pintarEstrategia(e) {
  document.querySelectorAll('#modal-plan-deudas [data-estrategia]').forEach(b => b.classList.toggle('activa', b.dataset.estrategia === e));
}
function elegirEstrategia(e) { _guardarPlanDeudas({ estrategia: e }); _pintarEstrategia(e); renderPlanDeudas(); }
function sumarAlPresupuesto(n) {
  const input = document.getElementById('plan-presupuesto');
  const base = n === 'minimos' ? minimosDelMes(deudasParaPlan()) : (parseMonto(input.value) || 0) + n;
  input.value = base.toFixed(2);
  renderPlanDeudas();
}

function renderPlanDeudas() {
  const cuerpo = document.getElementById('plan-resultado');
  if (!cuerpo) return;
  const deudas = deudasParaPlan();
  if (!deudas.length) { cuerpo.innerHTML = '<p style="text-align:center;padding:16px 0;font-size:14px">🎉 No tienes deudas registradas. ¡Sigue así!</p>'; return; }
  const minimos = minimosDelMes(deudas), total = deudas.reduce((a, d) => a + d.saldo, 0);
  document.getElementById('plan-total').innerHTML = 'Debes <strong>' + fL(total) + '</strong> en ' + deudas.length + (deudas.length === 1 ? ' deuda' : ' deudas') + ' · mínimos del mes: <strong>' + fL(minimos) + '</strong>';
  document.getElementById('plan-btn-minimos').textContent = 'Solo mínimos (' + fL(minimos) + ')';
  const presupuesto = parseMonto(document.getElementById('plan-presupuesto').value);
  if (!(presupuesto > 0)) { cuerpo.innerHTML = '<p style="font-size:12px;color:var(--text2)">Escribe cuánto puedes pagar al mes a tus deudas.</p>'; return; }
  const plan = _guardarPlanDeudas({ presupuesto });
  if (presupuesto + 0.005 < minimos) {
    cuerpo.innerHTML = '<div class="plan-alerta">⚠️ Con ' + fL(presupuesto) + ' no alcanzas a cubrir los mínimos (' + fL(minimos) + '). Pagar menos del mínimo genera recargos y daña tu historial en la central de riesgos.</div>';
    return;
  }
  const r = simularPlanDeudas(deudas, presupuesto, plan.estrategia);
  const otra = simularPlanDeudas(deudas, presupuesto, plan.estrategia === 'avalancha' ? 'bola' : 'avalancha');
  const base = simularPlanDeudas(deudas, 0, plan.estrategia, true);
  if (!r.libre) { cuerpo.innerHTML = '<div class="plan-alerta">⚠️ Con ' + fL(presupuesto) + ' al mes los intereses crecen más rápido de lo que pagas. Sube el monto para ver tu fecha de salida.</div>'; return; }
  let html = '<div class="plan-libre"><small>QUEDAS LIBRE DE DEUDAS EN</small><strong>' + _mesDelPlan(r.meses) + '</strong><span>' + fmtDuracion(r.meses) + ' · ' + fL(r.interes) + ' en intereses</span></div>';
  // Contra pagar solo el mínimo (las deudas con personas no tienen mínimo: quedan fuera)
  if (base.libre && base.meses > r.meses) {
    html += '<div class="plan-ahorro">💰 Pagando solo los mínimos tardarías <strong>' + fmtDuracion(base.meses) + '</strong> y pagarías ' + fL(base.interes) + ' en intereses. Con este plan te ahorras <strong>' + fL(Math.max(0, base.interes - r.interes)) + '</strong> y ' + fmtDuracion(base.meses - r.meses) + '.</div>';
  } else if (!base.libre) {
    html += '<div class="plan-ahorro">💰 Pagando solo los mínimos no terminarías nunca: los intereses se comen el pago.</div>';
  }
  const difInteres = otra.interes - r.interes;
  if (plan.estrategia === 'avalancha' && difInteres < -0.5) html += '<p class="plan-nota">La bola de nieve te costaría ' + fL(-difInteres) + ' menos… revisa las tasas de tus deudas.</p>';
  else if (plan.estrategia === 'avalancha') html += '<p class="plan-nota">🔥 Avalancha: ' + (difInteres > 0.5 ? 'te ahorra ' + fL(difInteres) + ' frente a la bola de nieve.' : 'en tu caso cuesta lo mismo que la bola de nieve.') + '</p>';
  else html += '<p class="plan-nota">❄️ Bola de nieve: ' + (-difInteres > 0.5 ? 'cuesta ' + fL(-difInteres) + ' más que la avalancha, pero liquidas deudas antes y eso motiva.' : 'en tu caso cuesta lo mismo que la avalancha.') + '</p>';
  // Orden de ataque con lo que toca pagar este mes
  html += '<h4 style="margin:14px 0 6px;font-size:13px">Orden de ataque · este mes</h4>';
  html += r.orden.map((id, i) => {
    const d = r.deudas.find(x => x.id === id), pago = r.primerMes[id] || 0;
    const tasa = d.tasa > 0 ? d.tasa.toFixed(d.tasa % 1 ? 1 : 0) + '% anual' : 'sin intereses';
    return '<div class="plan-deuda' + (i === 0 ? ' objetivo' : '') + '"><div><strong>' + (i + 1) + '. ' + _ICONO_DEUDA[d.tipo] + ' ' + esc(d.nombre) + '</strong>' +
      '<small>' + fL(d.saldo) + ' · ' + tasa + ' · liquidada en ' + _mesDelPlan(d.pagadaEn) + '</small></div>' +
      '<div class="plan-pago">' + fL(pago) + '<small>' + (i === 0 ? 'mínimo + extra' : 'mínimo') + '</small></div></div>';
  }).join('');
  html += '<p class="plan-nota">Estimado sin compras nuevas. El mínimo de tarjeta usa la regla de la app (5% del saldo, mínimo L 100); tu banco puede calcularlo distinto.</p>';
  cuerpo.innerHTML = html;
}

// Tarjeta de acceso en TC y Préstamos
function renderAccesoPlanDeudas() {
  const cont = document.querySelectorAll('.plan-deudas-acceso');
  if (!cont.length) return;
  const deudas = deudasParaPlan(), plan = leerPlanDeudas();
  let html = '';
  if (deudas.length) {
    const r = plan.presupuesto >= minimosDelMes(deudas) ? simularPlanDeudas(deudas, plan.presupuesto, plan.estrategia) : null;
    html = '<div class="card plan-acceso" onclick="abrirPlanDeudas()"><div><strong>🎯 Plan para salir de deudas</strong><small>' +
      (r && r.libre ? 'Con ' + fL(plan.presupuesto) + ' al mes quedas libre en <strong>' + _mesDelPlan(r.meses) + '</strong>' : '¿Cuándo puedes quedar libre? Arma tu plan en un minuto') +
      '</small></div><span>›</span></div>';
  }
  cont.forEach(c => { c.innerHTML = html; });
}
