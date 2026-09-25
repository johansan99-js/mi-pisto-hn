// Mi Pisto HN · 19-cuentas.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.

// ═══ MIS CUENTAS ═══════════════════════════════════════════════════════════
// Además de Efectivo y la Cuenta de Ahorro (ids 'efectivo' y 'ahorro', que
// siguen igual para no tocar los datos viejos), se pueden agregar todas las
// cuentas que tengas: bancos, billeteras (Tigo Money), plazos fijos o
// inversiones, agrupadas por banco y con su color e ícono.
// El saldo de cada cuenta sale de sus movimientos, igual que antes. El saldo
// con que se crea es un ajuste (esConciliacion + esSaldoInicial): cuenta en
// el patrimonio pero no como ingreso. Con una tasa anual, la app estima lo
// que gana al mes y permite anotarlo como ingreso.
const TIPOS_CUENTA = {
  ahorro: { icono: '🏦', nombre: 'Cuenta de ahorro' },
  cheques: { icono: '💳', nombre: 'Cuenta de cheques' },
  billetera: { icono: '📱', nombre: 'Billetera (Tigo Money, etc.)' },
  efectivo: { icono: '💵', nombre: 'Efectivo' },
  plazo: { icono: '📈', nombre: 'Plazo fijo' },
  inversion: { icono: '📊', nombre: 'Inversión' },
  otra: { icono: '💼', nombre: 'Otra' },
};
const COLORES_CUENTA = ['#4285F4', '#F5C800', '#34A853', '#EA4335', '#A142F4', '#FF8A00', '#00ACC1', '#E91E63'];
const CUENTAS_BASE = [
  { id: 'efectivo', nombre: 'Efectivo', tipo: 'efectivo', icono: '💵', color: '#F5C800', base: true },
  { id: 'ahorro', nombre: 'Cuenta de Ahorro', tipo: 'ahorro', icono: '🏦', color: '#4285F4', base: true },
];

/** Todas las cuentas donde hay dinero; con todas=true incluye las archivadas */
function listaCuentas(todas) {
  return CUENTAS_BASE.concat((state.misCuentas || []).filter(c => todas || !c.archivada));
}
const infoCuenta = id => listaCuentas(true).find(c => c.id === id) || null;
const esCuentaLiquida = id => !!infoCuenta(id);
const cuentaValida = (v, def) => esCuentaLiquida(v) ? v : (def || 'efectivo');
function nombreCompletoCuenta(c) { return c ? (c.grupo && !_mismaCat(c.grupo, c.nombre) ? c.grupo + ' · ' + c.nombre : c.nombre) : ''; }
const iconoCuenta = id => (infoCuenta(id) || {}).icono || '🏦';
const etiquetaCuenta = id => { const c = infoCuenta(id); return c ? c.icono + ' ' + nombreCompletoCuenta(c) : '🏦 Cuenta'; };
/** Para frases: "tu efectivo", "tu cuenta de ahorro", "tu BAC · Nómina" */
const nombreCuentaTexto = id => id === 'efectivo' ? 'efectivo' : id === 'ahorro' ? 'cuenta de ahorro' : nombreCompletoCuenta(infoCuenta(id)) || 'cuenta';

// ─── Selectores: cada <select> que ofrece Efectivo y Ahorro recibe las demás cuentas ──
function sincronizarSelectsCuentas() {
  const extra = listaCuentas().filter(c => !c.base);
  document.querySelectorAll('select').forEach(sel => {
    if (!sel.querySelector('option[value="efectivo"]') || !sel.querySelector('option[value="ahorro"]') || sel.dataset.sinCuentasExtra) return;
    const actual = sel.value;
    sel.querySelectorAll('option[data-cuenta-extra]').forEach(o => o.remove());
    const ahorro = sel.querySelector('option[value="ahorro"]');
    let ancla = ahorro;
    extra.forEach(c => {
      const o = document.createElement('option');
      o.value = c.id; o.dataset.cuentaExtra = '1';
      o.textContent = c.icono + ' ' + nombreCompletoCuenta(c);
      ancla.after(o); ancla = o;
    });
    if ([...sel.options].some(o => o.value === actual)) sel.value = actual;
  });
}
/** Para los flujos que preguntaban "[Aceptar] = Ahorro / [Cancelar] = Efectivo":
    sin cuentas extra pregunta igual que antes; con cuentas extra, por número */
function pedirCuenta(pregunta, opciones) {
  const extra = listaCuentas().filter(c => !c.base);
  if (!extra.length) return confirm(pregunta + '\n\n' + (opciones || '[Aceptar] = Cuenta de Ahorro\n[Cancelar] = Efectivo')) ? 'ahorro' : 'efectivo';
  const todas = listaCuentas();
  const r = prompt(pregunta + '\n\n' + todas.map((c, i) => (i + 1) + '. ' + nombreCompletoCuenta(c) + ' (' + fL(getCuentaBalance(c.id)) + ')').join('\n') + '\n\nEscribe el número:', '1');
  if (r === null) return null;
  const c = todas[parseInt(r, 10) - 1];
  return c ? c.id : null;
}

// ─── Cuentas en dólares ────────────────────────────────────────────────
// Una cuenta con moneda 'USD' lleva su saldo en dólares: cada movimiento
// guarda montoUSD (se sella al guardar). Un gasto o ingreso en dólares usa
// su monto original; uno en lempiras se convierte como lo hace el banco:
// cuando sale dinero de la cuenta el banco te compra dólares (tasa de
// compra) y cuando entra te los vende (tasa de venta). El equivalente en
// lempiras de la cuenta usa la tasa de compra de hoy.
const esCuentaUSD = id => { const c = infoCuenta(id); return !!(c && c.moneda === 'USD'); };
function tasaUSD(lado) {
  const r = window.currencyManager && currencyManager.getRate('USD');
  return (r && (lado === 'ask' ? r.ask : r.bid)) || 26.9;
}
function usdDeTx(t) {
  if (typeof t.montoUSD === 'number') return t.montoUSD;
  if (t.originalCurrency === 'USD' && t.originalAmount > 0) return t.originalAmount;
  return _c2(t.amount / tasaUSD(t.type === 'income' ? 'ask' : 'bid'));
}
function saldoUSDCuenta(id) {
  return _c2((state.transactions || []).filter(t => !t.deletedAt && t.cuenta === id && typeof t.amount === 'number')
    .reduce((a, t) => a + (t.type === 'income' ? 1 : -1) * usdDeTx(t), 0));
}
function sellarMontosUSD() {
  (state.transactions || []).forEach(t => { if (t.cuenta && typeof t.montoUSD !== 'number' && esCuentaUSD(t.cuenta) && typeof t.amount === 'number') t.montoUSD = usdDeTx(t); });
}
const fUSD = n => document.body && document.body.classList.contains('modo-discreto') ? '$ ••••' : (n < 0 ? '-$ ' : '$ ') + Math.abs(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Totales y rendimiento ─────────────────────────────────────────────
const totalEnCuentas = () => _c2(listaCuentas().reduce((a, c) => a + getCuentaBalance(c.id), 0));
function rendimientoMensual(c) {
  const saldo = getCuentaBalance(c.id);
  return c.tasaAnual > 0 && saldo > 0 ? _c2(saldo * c.tasaAnual / 100 / 12) : 0;
}

// ─── Vista Mis cuentas ────────────────────────────────────────────────
function _filaCuenta(c) {
  const saldo = getCuentaBalance(c.id), rend = rendimientoMensual(c), id = esc(c.id);
  return `<div class="cuenta-fila" style="border-left-color:${esc(c.color || '#4285F4')}">
    <div class="cuenta-icono" style="background:${esc(c.color || '#4285F4')}22">${esc(c.icono)}</div>
    <div style="flex:1;min-width:0">
      <div style="font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.nombre)}</div>
      <div style="font-size:11px;color:var(--text2)">${esc((TIPOS_CUENTA[c.tipo] || TIPOS_CUENTA.otra).nombre)}${c.tasaAnual > 0 ? ' · ' + c.tasaAnual + '% anual' : ''}</div>
      ${rend > 0 ? `<div style="font-size:11px;color:var(--green)">Gana ~${fL(rend)} al mes · <a href="#" onclick="registrarRendimiento('${id}');return false" style="color:var(--blue)">Anotar intereses</a></div>` : ''}
    </div>
    <div style="text-align:right">
      <div style="font-weight:800;white-space:nowrap;color:${saldo < 0 ? 'var(--red)' : 'var(--text)'}">${c.moneda === 'USD' ? fUSD(saldoUSDCuenta(c.id)) : fL(saldo)}</div>
      ${c.moneda === 'USD' ? `<div style="font-size:10px;color:var(--text2);white-space:nowrap">≈ ${fL(saldo)}</div>` : ''}
      <div class="cuenta-acciones">
        <button onclick="ajustarSaldoCuenta('${id}')" aria-label="Ajustar saldo" title="Ajustar saldo">⚖️</button>
        ${c.base ? '' : `<button onclick="abrirModalCuenta('${id}')" aria-label="Editar" title="Editar">✏️</button>`}
      </div>
    </div></div>`;
}
function renderMisCuentas() {
  const cont = document.getElementById('cuentas-contenido');
  if (!cont) return;
  const activas = listaCuentas(), archivadas = (state.misCuentas || []).filter(c => c.archivada);
  const grupos = new Map();
  activas.forEach(c => {
    const g = c.base ? (c.id === 'efectivo' ? 'Efectivo' : 'Cuenta principal') : (c.grupo || 'Otras cuentas');
    const k = _sinAcentos(g).trim();
    if (!grupos.has(k)) grupos.set(k, { nombre: g, cuentas: [] });
    grupos.get(k).cuentas.push(c);
  });
  const rendTotal = activas.reduce((a, c) => a + rendimientoMensual(c), 0);
  cont.innerHTML = `<div class="card" style="background:linear-gradient(135deg,var(--bg2),var(--bg3));display:flex;justify-content:space-between;align-items:center;gap:10px">
      <div><div style="font-size:11px;color:var(--text2)">TIENES EN TUS CUENTAS</div><div style="font-size:22px;font-weight:800">${fL(totalEnCuentas())}</div>
      ${rendTotal > 0 ? `<div style="font-size:11px;color:var(--green)">Tus intereses: ~${fL(rendTotal)} al mes</div>` : ''}</div>
      <button class="btn btn-primary" style="width:auto;padding:10px 14px;margin:0" onclick="abrirModalCuenta()">➕ Cuenta</button></div>` +
    [...grupos.values()].map(g => {
      const suma = g.cuentas.reduce((a, c) => a + getCuentaBalance(c.id), 0);
      return `<div class="deuda-grupo"><span>${esc(g.nombre)}</span><strong style="color:var(--text)">${fL(suma)}</strong></div><div class="card" style="padding:4px 12px">${g.cuentas.map(_filaCuenta).join('')}</div>`;
    }).join('') +
    `<button class="btn btn-secondary" onclick="openTransferirCuentas()">🔁 Transferir entre cuentas</button>` +
    _htmlTarjetasYDeudas() +
    (archivadas.length ? `<details class="deuda-liquidadas"><summary>🗄️ Archivadas (${archivadas.length})</summary>${archivadas.map(c => `<div class="deuda-mov"><span>${esc(c.icono)} ${esc(nombreCompletoCuenta(c))}</span><button onclick="desarchivarCuenta('${esc(c.id)}')" style="background:none;border:none;color:var(--blue);cursor:pointer;font-size:12px">Restaurar</button></div>`).join('')}</details>` : '');
}

// Tarjetas de crédito, lo que debes y préstamos: desde la pestaña Cuentas de la barra de abajo
function _htmlTarjetasYDeudas() {
  const tcs = state.tarjetas || [];
  const deuda = _c2(tcs.reduce((a, t) => a + (Number(t.saldo) || 0), 0));
  const filasTc = tcs.map(t => {
    const saldo = Number(t.saldo) || 0, limite = Number(t.limite) || 0;
    const uso = limite > 0 ? Math.min(100, saldo / limite * 100) : 0;
    return `<button type="button" class="cuenta-fila cuenta-tc" onclick="switchView('tarjetas')" style="border-left-color:var(--red)">
      <div class="cuenta-icono" style="background:rgba(var(--red-rgb),.14)">💳</div>
      <div style="flex:1;min-width:0;text-align:left">
        <div style="font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.nombre)}</div>
        <div style="font-size:11px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${limite > 0 ? 'Disponible ' + fL(Math.max(0, limite - saldo)) : 'Tarjeta de crédito'}</div>
        ${limite > 0 ? `<div class="cuenta-tc-uso"><span style="width:${uso.toFixed(1)}%;background:${uso >= 80 ? 'var(--red)' : uso >= 50 ? 'var(--purple)' : 'var(--green)'}"></span></div>` : ''}
      </div>
      <div style="font-weight:800;font-size:14px;color:${saldo > 0 ? 'var(--red)' : 'var(--text2)'};white-space:nowrap">${saldo > 0 ? '-' : ''}${fL(saldo)}</div></button>`;
  }).join('');
  const porPagar = (state.payables || []).filter(deudaActiva).reduce((a, p) => a + pendienteDeuda(p), 0);
  const prest = (state.prestamos || []).filter(p => !p.deletedAt && (Number(p.cuotasPagadas) || 0) < (Number(p.cuotasTotal) || 0));
  const atajo = (vista, icono, nombre, detalle) => `<button type="button" class="cuenta-atajo" onclick="switchView('${vista}')"><span class="cuenta-icono" style="background:var(--bg3)">${icono}</span><span style="flex:1;min-width:0;text-align:left"><strong>${nombre}</strong><small>${detalle}</small></span><span aria-hidden="true">›</span></button>`;
  return `<div class="deuda-grupo"><span>💳 Tarjetas de crédito</span>${tcs.length ? `<strong>${deuda > 0 ? '-' : ''}${fL(deuda)}</strong>` : ''}</div>
    <div class="card" style="padding:4px 12px">${filasTc || `<p style="font-size:12px;color:var(--text2);margin:10px 0">No tienes tarjetas registradas.</p>`}
      <button type="button" class="btn btn-secondary" style="margin:6px 0 8px" onclick="switchView('tarjetas')">${tcs.length ? 'Ver mis tarjetas ›' : '➕ Agregar una tarjeta'}</button></div>
    <div class="deuda-grupo"><span>Deudas</span></div>
    <div class="card" style="padding:4px 12px">
      ${atajo('pagar', '💸', 'Lo que debo', porPagar > 0.005 ? 'Pendiente ' + fL(porPagar) : 'Sin deudas pendientes')}
      ${atajo('prestamos', '🏦', 'Préstamos', prest.length ? prest.length + (prest.length === 1 ? ' préstamo activo' : ' préstamos activos') : 'Sin préstamos')}
      ${atajo('cobrar', '💰', 'Me deben', 'Dinero por cobrar')}
    </div>`;
}

// Casillas del Inicio junto a Efectivo y Ahorro
function renderTilesCuentas() {
  const cont = document.getElementById('cuentas-extra-tiles');
  if (!cont) return;
  const extra = listaCuentas().filter(c => !c.base);
  cont.innerHTML = extra.map(c => `<div class="cuenta-tile" onclick="switchView('cuentas')" role="button" style="border-color:${esc(c.color)}55">
      <div class="cuenta-tile-nombre">${esc(c.icono)} ${esc(c.grupo || c.nombre).toUpperCase()}</div>${c.grupo ? `<div class="cuenta-tile-sub">${esc(c.nombre)}</div>` : ''}
      <div class="cuenta-tile-saldo" style="color:${esc(c.color)}">${c.moneda === 'USD' ? fUSD(saldoUSDCuenta(c.id)) : fL(getCuentaBalance(c.id))}</div>${c.moneda === 'USD' ? `<div class="cuenta-tile-sub">≈ ${fL(getCuentaBalance(c.id))}</div>` : ''}</div>`).join('') +
    `<button class="cuenta-tile cuenta-tile-nueva" onclick="${extra.length ? "switchView('cuentas')" : 'abrirModalCuenta()'}">${extra.length ? '🏦 Ver mis cuentas' : '➕ Agregar cuenta (BAC, Tigo Money…)'}</button>`;
  sincronizarSelectsCuentas();
}

// ─── Crear / editar ────────────────────────────────────────────────────
let _cuentaEditando = null, _colorCuenta = COLORES_CUENTA[0];
function abrirModalCuenta(id) {
  const c = id && (state.misCuentas || []).find(x => x.id === id);
  if (!c && typeof puedeUsarPremium === 'function' && !puedeUsarPremium('cuentas')) return;
  _cuentaEditando = c ? c.id : null;
  _colorCuenta = c ? c.color : COLORES_CUENTA[(state.misCuentas || []).length % COLORES_CUENTA.length];
  document.getElementById('cuenta-titulo').textContent = c ? '✏️ Editar cuenta' : '🏦 Nueva cuenta';
  document.getElementById('cuenta-nombre').value = c ? c.nombre : '';
  document.getElementById('cuenta-grupo').value = c ? (c.grupo || '') : '';
  document.getElementById('cuenta-tipo').innerHTML = Object.entries(TIPOS_CUENTA).map(([k, t]) => '<option value="' + k + '">' + t.icono + ' ' + t.nombre + '</option>').join('');
  document.getElementById('cuenta-tipo').value = c ? c.tipo : 'ahorro';
  document.getElementById('cuenta-saldo-wrap').style.display = c ? 'none' : '';
  document.getElementById('cuenta-moneda').value = c && c.moneda === 'USD' ? 'USD' : 'HNL';
  document.getElementById('cuenta-moneda').disabled = !!c;   // cambiarla después descuadraría el saldo
  document.getElementById('cuenta-saldo').value = '';
  document.getElementById('cuenta-tasa').value = c && c.tasaAnual ? c.tasaAnual : '';
  document.getElementById('cuenta-archivar').style.display = c ? '' : 'none';
  const dl = document.getElementById('lista-bancos-cuenta');
  if (dl && !dl.options.length) dl.innerHTML = BANCOS_HN.concat(['Tigo Money']).map(b => '<option value="' + esc(b) + '">').join('');
  document.getElementById('cuenta-colores').innerHTML = COLORES_CUENTA.map(col => `<button type="button" data-color="${col}" onclick="elegirColorCuenta('${col}')" style="background:${col}" aria-label="Color"></button>`).join('');
  elegirColorCuenta(_colorCuenta);
  openModal('modal-cuenta');
}
function elegirColorCuenta(col) {
  _colorCuenta = COLORES_CUENTA.includes(col) ? col : COLORES_CUENTA[0];
  document.querySelectorAll('#cuenta-colores button').forEach(b => b.classList.toggle('activa', b.dataset.color === _colorCuenta));
}
function guardarCuenta() {
  const limpio = v => String(v).replace(/[<>"']/g, '').replace(/\s+/g, ' ').trim().slice(0, 30);
  const nombre = limpio(document.getElementById('cuenta-nombre').value);
  const grupo = limpio(document.getElementById('cuenta-grupo').value);
  const tipo = TIPOS_CUENTA[document.getElementById('cuenta-tipo').value] ? document.getElementById('cuenta-tipo').value : 'otra';
  const tasaTxt = document.getElementById('cuenta-tasa').value;
  const tasa = tasaTxt === '' ? 0 : Number(String(tasaTxt).replace(',', '.'));
  if (!nombre) return alert('Ponle nombre a la cuenta (ej. Nómina, Ahorro, Tigo Money).');
  if (!(tasa >= 0 && tasa <= 100)) return alert('La tasa anual debe estar entre 0 y 100%.');
  if (listaCuentas(true).some(c => c.id !== _cuentaEditando && _mismaCat(nombreCompletoCuenta(c), nombreCompletoCuenta({ nombre, grupo })))) return alert('Ya tienes una cuenta con ese nombre.');
  if (!state.misCuentas) state.misCuentas = [];
  let c = _cuentaEditando && state.misCuentas.find(x => x.id === _cuentaEditando);
  if (c) Object.assign(c, { nombre, grupo, tipo, icono: TIPOS_CUENTA[tipo].icono, color: _colorCuenta, tasaAnual: _c2(tasa) });
  else {
    if (typeof puedeUsarPremium === 'function' && !puedeUsarPremium('cuentas')) return;
    const saldo = leerMonto(document.getElementById('cuenta-saldo').value) || 0;
    const usd = document.getElementById('cuenta-moneda').value === 'USD';
    c = { id: uid(), nombre, grupo, tipo, icono: TIPOS_CUENTA[tipo].icono, color: _colorCuenta, tasaAnual: _c2(tasa), creada: new Date().toISOString() };
    if (usd) c.moneda = 'USD';
    state.misCuentas.push(c);
    if (saldo) {
      const t = { id: uid(), type: saldo > 0 ? 'income' : 'expense', amount: _c2(Math.abs(saldo) * (usd ? tasaUSD('bid') : 1)), cat: 'Saldo inicial', subcat: 'Saldo inicial de ' + nombreCompletoCuenta(c), cuenta: c.id, tipo: 'fijo', esConciliacion: true, esSaldoInicial: true, date: new Date().toISOString() };
      if (usd) t.montoUSD = _c2(Math.abs(saldo));
      state.transactions.push(t);
    }
  }
  save(); closeModal('modal-cuenta'); renderAll(); renderMisCuentas();
}
function archivarCuenta() {
  const c = (state.misCuentas || []).find(x => x.id === _cuentaEditando);
  if (!c) return;
  const saldo = getCuentaBalance(c.id);
  if (Math.abs(saldo) > 0.005) return alert('Esta cuenta tiene ' + fL(saldo) + '. Transfiere el dinero a otra cuenta (o ajusta el saldo a cero) antes de archivarla.');
  if (!confirm('¿Archivar "' + nombreCompletoCuenta(c) + '"? Sus movimientos se quedan en tu historial y la puedes restaurar.')) return;
  c.archivada = true;
  save(); closeModal('modal-cuenta'); renderAll(); renderMisCuentas();
}
function desarchivarCuenta(id) {
  const c = (state.misCuentas || []).find(x => x.id === id);
  if (!c) return;
  if (typeof puedeUsarPremium === 'function' && !puedeUsarPremium('cuentas')) return;
  c.archivada = false;
  save(); renderAll(); renderMisCuentas();
}

// Ajustar el saldo al real (como la conciliación) y anotar intereses
function ajustarSaldoCuenta(id) {
  const c = infoCuenta(id);
  if (!c) return;
  const usd = c.moneda === 'USD', actual = usd ? saldoUSDCuenta(id) : getCuentaBalance(id);
  const real = leerMonto(prompt('¿Cuánto tienes de verdad en ' + nombreCompletoCuenta(c) + (usd ? ' (en dólares)' : '') + '?\nLa app registra ' + (usd ? fUSD(actual) : fL(actual)) + '.', actual.toFixed(2)));
  if (real === null || isNaN(real)) return;
  const dif = _c2(real - actual);
  if (Math.abs(dif) < 0.01) return alert('✅ El saldo ya está correcto.');
  const t = { id: uid(), type: dif > 0 ? 'income' : 'expense', amount: _c2(Math.abs(dif) * (usd ? tasaUSD('bid') : 1)), cat: 'Conciliación', subcat: 'Ajuste ' + nombreCompletoCuenta(c), cuenta: id, tipo: 'fijo', esConciliacion: true, date: new Date().toISOString() };
  if (usd) t.montoUSD = Math.abs(dif);
  state.transactions.push(t);
  save(); renderAll(); renderMisCuentas();
}
function registrarRendimiento(id) {
  const c = infoCuenta(id);
  if (!c) return;
  const usd = c.moneda === 'USD';
  const m = leerMonto(prompt('¿Cuánto te pagaron de intereses en ' + nombreCompletoCuenta(c) + (usd ? ' (en dólares)' : '') + '?', (usd ? rendimientoMensual(c) / tasaUSD('bid') : rendimientoMensual(c)).toFixed(2)));
  if (!(m > 0)) return;
  const t = { id: uid(), type: 'income', amount: _c2(m * (usd ? tasaUSD('bid') : 1)), cat: 'Intereses ganados', subcat: nombreCompletoCuenta(c), cuenta: id, tipo: 'extra', date: new Date().toISOString() };
  if (usd) Object.assign(t, { montoUSD: _c2(m), originalCurrency: 'USD', originalAmount: _c2(m), conversionRate: tasaUSD('bid') });
  state.transactions.push(t);
  save(); renderAll(); renderMisCuentas();
}
