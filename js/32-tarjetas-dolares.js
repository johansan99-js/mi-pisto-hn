// Mi Pisto HN · 32-tarjetas-dolares.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.

// ═══ TARJETAS CON SALDO EN LEMPIRAS Y DÓLARES ═════════════════════════════
// Muchas tarjetas de Honduras llevan dos saldos: las compras en lempiras van
// a uno y las compras en dólares (Amazon, Netflix, viajes) al otro, y cada
// uno se paga por separado. Una tarjeta así tiene bimoneda: true y, además de
// saldo (lempiras), saldoUSD, que se calcula igual que saldo
// (09-saldos-y-sincronizacion.js): saldoBaseUSD + compras en dólares − pagos
// en dólares (pagoUSD). Solo cuentan los movimientos desde bimonedaDesde, así
// una tarjeta vieja no cambia su saldo en lempiras al activarlo.
// El límite es uno solo, en lempiras: los dólares lo usan a la tasa de venta.
const _usdTxt = v => 'US$ ' + (Number(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esBimoneda = t => !!(t && t.bimoneda);

/** Lo que se debe en la tarjeta, todo en lempiras (el saldo en dólares a la tasa de venta de hoy) */
function deudaTarjetaL(t) {
  if (!t) return 0;
  return _c2((Number(t.saldo) || 0) + (esBimoneda(t) ? (Number(t.saldoUSD) || 0) * tasaUSD('ask') : 0));
}
/** Pago mínimo del saldo en dólares: 5% o US$ 5, lo que sea mayor, sin pasar del saldo */
function pagoMinimoUSD(t) {
  const s = esBimoneda(t) ? Number(t.saldoUSD) || 0 : 0;
  return t && t.calcularMinimo && s > 0 ? _c2(Math.min(s, Math.max(s * 0.05, 5))) : 0;
}
function disponibleTarjeta(t) {
  return _c2((Number(t.limite) || 0) - Math.max(0, Number(t.saldo) || 0) - (esBimoneda(t) ? Math.max(0, Number(t.saldoUSD) || 0) * tasaUSD('ask') : 0) - cupoComprometido(t));
}
/** "L 3,000.00 + US$ 120.00", para listas cortas */
function textoSaldoTarjeta(t) {
  return esBimoneda(t) ? fL(t.saldo || 0) + ' + ' + _usdTxt(t.saldoUSD) : fL(t.saldo || 0);
}
/** Los dos saldos y el total, en la tarjeta de la pantalla Tarjetas */
function htmlSaldoTarjeta(t) {
  if (!esBimoneda(t)) return `<div style="font-weight: 700; color: var(--red);">${fL(t.saldo)}</div>`;
  return `<div class="tc-bimoneda"><div><small>Lempiras</small><b>${fL(t.saldo)}</b></div><div><small>Dólares</small><b>${_usdTxt(t.saldoUSD)}</b></div></div>
    <div class="tc-total">Total ≈ <strong>${fL(deudaTarjetaL(t))}</strong></div>`;
}

// ─── Crear o activar ─────────────────────────────────────────────────────
function toggleTarjetaDolares() {
  const on = document.getElementById('tc-bimoneda')?.checked;
  const w = document.getElementById('tc-dolares-wrap'); if (w) w.style.display = on ? '' : 'none';
}
/** Los campos del formulario de tarjeta nueva, para saveTarjeta() */
function datosDolaresFormTarjeta() {
  if (!document.getElementById('tc-bimoneda')?.checked) return {};
  const usd = leerMonto(document.getElementById('tc-saldo-usd')?.value) || 0;
  return { bimoneda: true, bimonedaDesde: new Date().toISOString(), saldoUSD: _c2(usd), saldoBaseUSD: _c2(usd) };
}
async function activarDolaresTarjeta(id) {
  const t = (state.tarjetas || []).find(x => String(x.id) === String(id));
  if (!t || esBimoneda(t)) return;
  const txt = (await preguntar(`💱 ${t.nombre}: saldo en dólares\n\nSi tu tarjeta lleva un saldo en lempiras y otro en dólares, las compras en dólares se van a sumar aparte y podrás pagar cada uno.\n\n¿Cuánto debes hoy en dólares? (US$)`, '0'));
  if (txt === null) return;
  const usd = leerMonto(txt);
  if (!(usd >= 0)) return alert('Monto inválido');
  Object.assign(t, { bimoneda: true, bimonedaDesde: new Date().toISOString(), saldoUSD: _c2(usd), saldoBaseUSD: _c2(usd) });
  save(); renderAll();
  if (typeof avisoRapido === 'function') avisoRapido(`💱 ${t.nombre}: ahora lleva lempiras y dólares`);
}

// ─── Pagar ───────────────────────────────────────────────────────────────
// Se elige qué saldo se paga. Pagar dólares desde una cuenta en lempiras:
// el banco te vende los dólares, a su tasa de venta (se puede corregir con
// lo que de verdad te cobró).
let _pagoTC = { id: null, moneda: 'HNL' };
function abrirPagoTarjeta(id, moneda) {
  const t = (state.tarjetas || []).find(x => String(x.id) === String(id));
  if (!t) return;
  _pagoTC = { id: t.id, moneda: moneda === 'USD' ? 'USD' : ((Number(t.saldo) || 0) <= 0 && (Number(t.saldoUSD) || 0) > 0 ? 'USD' : 'HNL') };
  document.getElementById('ptc-titulo').textContent = '💳 Pagar ' + t.nombre;
  const sel = document.getElementById('ptc-cuenta');
  sel.innerHTML = listaCuentas().map(c => `<option value="${esc(c.id)}">${esc(c.icono)} ${esc(nombreCompletoCuenta(c))} (${fL(getCuentaBalance(c.id))})</option>`).join('');
  document.getElementById('ptc-cobrado').value = '';
  _pagoTCMoneda(_pagoTC.moneda);
  openModal('modal-pago-tc');
}
function _pagoTCMoneda(m) {
  const t = (state.tarjetas || []).find(x => String(x.id) === String(_pagoTC.id));
  if (!t) return;
  _pagoTC.moneda = m === 'USD' ? 'USD' : 'HNL';
  const usd = _pagoTC.moneda === 'USD';
  document.querySelectorAll('#ptc-moneda .an-seg-btn').forEach(b => b.classList.toggle('activa', b.dataset.m === _pagoTC.moneda));
  const saldo = usd ? Number(t.saldoUSD) || 0 : Number(t.saldo) || 0;
  const min = usd ? pagoMinimoUSD(t) : pagoMinimoTarjeta(t, 'HNL');
  const fmt = v => usd ? _usdTxt(v) : fL(v);
  document.getElementById('ptc-saldo').innerHTML = `Debes <strong>${fmt(saldo)}</strong>${min > 0 ? ` · pago mínimo ${fmt(min)}` : ''}`;
  document.getElementById('ptc-rapidos').innerHTML = [min > 0 && min < saldo ? ['Mínimo', min] : null, saldo > 0 ? ['Todo', saldo] : null].filter(Boolean)
    .map(([n, v]) => `<button type="button" class="rem-chip" onclick="document.getElementById('ptc-monto').value='${v.toFixed(2)}';_renderPagoTC()">${n}: ${fmt(v)}</button>`).join('');
  document.getElementById('ptc-monto').value = saldo > 0 ? (min > 0 ? min : saldo).toFixed(2) : '';
  document.getElementById('ptc-monto').placeholder = usd ? 'US$ 0.00' : 'L 0.00';
  _renderPagoTC();
}
function _pagoTCCuentaUSD() {
  const c = infoCuenta(document.getElementById('ptc-cuenta').value);
  return !!(c && c.moneda === 'USD');
}
function _renderPagoTC() {
  const usd = _pagoTC.moneda === 'USD', monto = leerMonto(document.getElementById('ptc-monto').value) || 0;
  const conv = document.getElementById('ptc-conversion'), cob = document.getElementById('ptc-cobrado-wrap');
  const desdeUSD = _pagoTCCuentaUSD();
  const cruza = usd !== desdeUSD;
  cob.style.display = usd && !desdeUSD ? '' : 'none';
  if (!cruza || !(monto > 0)) { conv.textContent = ''; return; }
  conv.textContent = usd
    ? `De tu cuenta salen ≈ ${fL(_c2(monto * tasaUSD('ask')))} (el banco te vende los dólares a L ${tasaUSD('ask').toFixed(4)}).`
    : `De tu cuenta en dólares salen ≈ ${_usdTxt(_c2(monto / tasaUSD('bid')))} (a L ${tasaUSD('bid').toFixed(4)} por dólar).`;
}
async function guardarPagoTarjeta() {
  const t = (state.tarjetas || []).find(x => String(x.id) === String(_pagoTC.id));
  if (!t) return;
  const usd = _pagoTC.moneda === 'USD';
  const monto = leerMonto(document.getElementById('ptc-monto').value);
  if (!(monto > 0)) return alert('Escribe cuánto pagas.');
  const saldo = usd ? Number(t.saldoUSD) || 0 : Number(t.saldo) || 0;
  const fmt = v => usd ? _usdTxt(v) : fL(v);
  if (monto > saldo + 0.005 && !(await confirmar(`Estás pagando ${fmt(monto)} pero debes ${fmt(saldo)}. ¿Dejar la tarjeta con saldo a favor?`))) return;
  const cuenta = cuentaValida(document.getElementById('ptc-cuenta').value);
  const desdeUSD = _pagoTCCuentaUSD();
  let amount = monto;
  if (usd) {
    const cobradoTxt = document.getElementById('ptc-cobrado').value.trim();
    const cobrado = cobradoTxt ? leerMonto(cobradoTxt) : null;
    if (cobradoTxt && !(cobrado > 0)) return alert('Lo que te cobró el banco no es válido.');
    amount = !desdeUSD && cobrado ? _c2(cobrado) : _c2(monto * tasaUSD('ask'));
  }
  const tx = { id: uid(), type: 'expense', amount, cat: 'Pago Tarjeta', subcat: `Pago a ${t.nombre}${usd ? ' (dólares)' : ''}`, pago: cuenta, cuenta, tipo: 'fijo', esTransferencia: true, tarjetaId: t.id, date: new Date().toISOString(), notas: `Abono a tarjeta ${t.nombre}` };
  if (usd) tx.pagoUSD = _c2(monto);
  // Cuenta en dólares: lo que sale de ella, en dólares (19-cuentas.js)
  if (desdeUSD) tx.montoUSD = usd ? _c2(monto) : _c2(monto / tasaUSD('bid'));
  if (!desdeUSD && usd) tx.conversionRate = _c2(amount / monto * 10000) / 10000;
  state.transactions.push(tx);
  save(); closeModal('modal-pago-tc'); renderAll();
  if (typeof avisoRapido === 'function') avisoRapido(`✅ Pago de ${fmt(monto)} a ${t.nombre}. Debes ${textoSaldoTarjeta(t)}`);
}

// ─── Conciliar el saldo en dólares con el estado de cuenta ──────────────
async function ajustarSaldoTarjetaUSD(id) {
  const t = (state.tarjetas || []).find(x => String(x.id) === String(id));
  if (!t || !esBimoneda(t)) return;
  recalcularSaldosTarjetas();
  const txt = (await preguntar(`Conciliar el saldo en dólares de ${t.nombre}\n\nSaldo en la app: ${_usdTxt(t.saldoUSD)}\n\n¿Qué saldo en dólares dice tu estado de cuenta? (usa - para saldo a favor)`, (t.saldoUSD || 0).toFixed(2)));
  if (txt === null) return;
  const limpio = String(txt).trim(), neg = limpio.startsWith('-'), valor = leerMonto(neg ? limpio.slice(1) : limpio);
  if (isNaN(valor)) return alert('Monto inválido');
  const nuevo = neg ? -valor : valor, dif = _c2(nuevo - (t.saldoUSD || 0));
  t.ultimaConciliacion = new Date().toISOString();
  if (dif === 0) { save(); renderAll(); return alert('✅ El saldo en dólares coincide con tu estado de cuenta.'); }
  const ask = tasaUSD('ask');
  let registrado = false;
  if (dif > 0) {
    if ((await confirmar(`El banco cobra ${_usdTxt(dif)} más de lo que registraste.\n\n¿Registrarlo como gasto en "Cargos bancarios" (membresía, comisiones, compras sin anotar…)?\n\n[Cancelar] = solo corregir el saldo`))) {
      state.transactions.push({ id: uid(), type: 'expense', amount: _c2(dif * ask), cat: 'Cargos Bancarios', subcat: `Conciliación ${t.nombre} (dólares)`, pago: 'credito', cuenta: null, tipo: 'fijo', tarjetaId: t.id, tarjetaNombre: t.nombre, originalAmount: dif, originalCurrency: 'USD', conversionRate: ask, conversionSide: 'ask', date: new Date().toISOString() });
      registrado = true;
    }
  } else if ((await confirmar(`El estado de cuenta dice ${_usdTxt(-dif)} menos que la app.\n\n¿Es un pago a la tarjeta que no registraste?\n\n[Cancelar] = solo corregir el saldo (reembolso o error)`))) {
    const cuenta = (await pedirCuenta(`¿De dónde salió ese pago de ${_usdTxt(-dif)}?`));
    if (!cuenta) return;
    const tx = { id: uid(), type: 'expense', amount: _c2(-dif * ask), cat: 'Pago Tarjeta', subcat: `Pago a ${t.nombre} (dólares, conciliación)`, pago: cuenta, cuenta, tipo: 'fijo', esTransferencia: true, tarjetaId: t.id, pagoUSD: -dif, date: new Date().toISOString() };
    if ((infoCuenta(cuenta) || {}).moneda === 'USD') tx.montoUSD = -dif;
    state.transactions.push(tx);
    registrado = true;
  }
  if (!registrado) t.saldoBaseUSD = _c2((t.saldoBaseUSD || 0) + dif);
  save(); renderAll(); alert(`✅ Saldo en dólares conciliado: ${_usdTxt(nuevo)}`);
}

// ─── En el teclado de registrar: un gasto en dólares con esa tarjeta ────
// Con una tarjeta en lempiras y dólares, tocar la "L" del monto la cambia a
// "US$": el gasto se guarda en dólares y va al saldo en dólares.
function _regTarjetaBimoneda() {
  if (_reg.tipo !== 'gasto' || !_reg.tarjeta) return null;
  const t = (state.tarjetas || []).find(x => String(x.id) === String(_reg.tarjeta));
  return esBimoneda(t) ? t : null;
}
function gastoEnDolares() { return !!(_regTarjetaBimoneda() && _reg.moneda === 'USD'); }
function cambiarMonedaRegistro() {
  if (!_regTarjetaBimoneda()) return;
  _reg.moneda = _reg.moneda === 'USD' ? 'HNL' : 'USD';
  renderMontoRegistro();
  if (typeof avisoRapido === 'function') avisoRapido(_reg.moneda === 'USD' ? '💱 En dólares: va al saldo en dólares de la tarjeta' : '💱 En lempiras');
}
