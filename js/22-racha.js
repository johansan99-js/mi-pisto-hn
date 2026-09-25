// Mi Pisto HN · 22-racha.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.

// ═══ RACHA DE DÍAS ANOTANDO 🔥 ═════════════════════════════════════════════
// Un día cuenta si anotaste algo (gasto, ingreso, transferencia, abono…) o si
// tocaste "Hoy no gasté nada" (state.diasSinGastos). La racha sigue viva
// hasta que termine el día: si hoy todavía no anotas, se cuenta desde ayer y
// la tarjeta te recuerda no perderla. Los hitos se celebran una vez.
const HITOS_RACHA = [3, 7, 14, 30, 60, 100, 200, 365];
const _diaAnterior = f => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() - 1); return fechaLocal(d); };

function diasConRegistro() {
  const s = new Set((state.diasSinGastos || []).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)));
  (state.transactions || []).forEach(t => { if (!t.deletedAt && !t.esSaldoInicial && t.date) s.add(fechaLocal(new Date(t.date))); });
  return s;
}
function calcularRacha(ahora) {
  const dias = diasConRegistro(), hoy = fechaLocal(ahora || new Date()), hoyHecho = dias.has(hoy);
  let actual = 0, d = hoyHecho ? hoy : _diaAnterior(hoy);
  while (dias.has(d)) { actual++; d = _diaAnterior(d); }
  // La mejor racha de la historia (también se guarda, por si se borran movimientos)
  let mejor = 0, corrida = 0, previo = null;
  [...dias].sort().forEach(x => { corrida = previo && _diaAnterior(x) === previo ? corrida + 1 : 1; mejor = Math.max(mejor, corrida); previo = x; });
  mejor = Math.max(mejor, actual, state.mejorRacha || 0);
  const siguiente = HITOS_RACHA.find(h => h > actual) || null;
  return { actual, mejor, hoyHecho, enRiesgo: !hoyHecho && actual > 0, siguiente, dias };
}

function marcarDiaSinGastos() {
  const hoy = fechaLocal();
  if (!state.diasSinGastos) state.diasSinGastos = [];
  if (!state.diasSinGastos.includes(hoy)) state.diasSinGastos.push(hoy);
  // Solo se guardan los últimos 400 días: basta para cualquier racha que se muestre
  state.diasSinGastos = state.diasSinGastos.sort().slice(-400);
  save(); renderAll();
}

function renderRacha() {
  const el = document.getElementById('racha-card');
  if (!el) return;
  if (!state.setup) { el.style.display = 'none'; return; }
  const r = calcularRacha();
  if (r.mejor > (state.mejorRacha || 0)) { state.mejorRacha = r.mejor; save(); }
  // Nada que mostrar hasta el primer registro
  if (!r.actual && !r.mejor) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  // Los últimos 7 días, de izquierda (hace 6 días) a derecha (hoy)
  const LETRAS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  const semana = [];
  let d = fechaLocal();
  for (let i = 0; i < 7; i++) { semana.unshift(d); d = _diaAnterior(d); }
  const hoy = fechaLocal();
  const puntos = semana.map(x => `<div class="racha-dia${r.dias.has(x) ? ' hecho' : ''}${x === hoy ? ' hoy' : ''}"><span>${r.dias.has(x) ? '🔥' : ''}</span><small>${LETRAS[new Date(x + 'T12:00:00').getDay()]}</small></div>`).join('');
  let hito = '';
  try {
    const ultimo = Number(localStorage.getItem('mph_racha_hito') || 0);
    const alcanzado = HITOS_RACHA.filter(h => h <= r.actual).pop();
    if (alcanzado && alcanzado > ultimo) {
      hito = `<div class="racha-hito">🎉 ¡Llegaste a ${alcanzado} días seguidos! ${alcanzado >= 30 ? 'Ya es un hábito: eso es lo que cambia tus finanzas.' : 'Sigue así, cada día cuenta.'}</div>`;
      localStorage.setItem('mph_racha_hito', String(alcanzado));
      localStorage.setItem('mph_racha_hito_dia', hoy);
    } else if (alcanzado && alcanzado === ultimo && localStorage.getItem('mph_racha_hito_dia') === hoy) {
      hito = `<div class="racha-hito">🎉 ¡Llegaste a ${alcanzado} días seguidos!</div>`;
    }
    // Si la racha se cortó, los hitos se vuelven a celebrar en la siguiente
    if (r.actual < ultimo && !r.enRiesgo) localStorage.setItem('mph_racha_hito', String(HITOS_RACHA.filter(h => h <= r.actual).pop() || 0));
  } catch (e) {}
  const nota = r.enRiesgo
    ? `<p class="racha-nota riesgo">Hoy todavía no anotas nada: registra un gasto o márcalo como día sin gastos para no perder tu racha.</p>
       <button class="btn btn-secondary" style="margin:6px 0 0" onclick="marcarDiaSinGastos()">✅ Hoy no gasté nada</button>`
    : !r.hoyHecho
      ? `<p class="racha-nota">Tu mejor racha: ${r.mejor} ${r.mejor === 1 ? 'día' : 'días'}. Anota algo hoy para empezar otra.</p>
         <button class="btn btn-secondary" style="margin:6px 0 0" onclick="marcarDiaSinGastos()">✅ Hoy no gasté nada</button>`
      : `<p class="racha-nota">${r.siguiente ? 'Te faltan ' + (r.siguiente - r.actual) + (r.siguiente - r.actual === 1 ? ' día' : ' días') + ' para llegar a ' + r.siguiente + '.' : '¡Más de un año seguido!'} Mejor racha: ${r.mejor}.</p>`;
  el.innerHTML = `<div class="racha-top"><div class="racha-num">🔥 <strong>${r.actual}</strong> <span>${r.actual === 1 ? 'día seguido' : 'días seguidos'}</span></div></div>
    <div class="racha-semana">${puntos}</div>${hito}${nota}`;
}
