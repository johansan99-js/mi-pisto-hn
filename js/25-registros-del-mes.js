// Mi Pisto HN · 25-registros-del-mes.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.

// ═══ INICIO: LOS MOVIMIENTOS DEL MES, POR DÍA ═════════════════════════════
// Arriba "‹ Septiembre 2026 ›" con Gastos, Ingresos y Saldo del mes; abajo
// cada día con sus movimientos: ícono de la categoría, la cuenta y el monto.
// Tocar uno lo abre para editarlo. Los totales cuentan igual que el resto de
// la app: sin transferencias entre tus cuentas ni ajustes de conciliación, y
// las compras con tarjeta caen en el mes de pago si así lo elegiste.
const _MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const _MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const _DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const REGISTROS_VISIBLES = 30;

const _mesVista = { y: null, m: null, todo: false };
function _mesActualVista() {
  const hoy = new Date();
  if (_mesVista.y === null) { _mesVista.y = hoy.getFullYear(); _mesVista.m = hoy.getMonth(); }
  return _mesVista;
}
function cambiarMesVista(delta) {
  const v = _mesActualVista(), hoy = new Date();
  const d = new Date(v.y, v.m + delta, 1);
  // No hay meses futuros que ver
  if (d.getFullYear() > hoy.getFullYear() || (d.getFullYear() === hoy.getFullYear() && d.getMonth() > hoy.getMonth())) return;
  v.y = d.getFullYear(); v.m = d.getMonth(); v.todo = false;
  renderRegistrosMes();
}
function verTodoMesVista() { _mesActualVista().todo = true; renderRegistrosMes(); }

const _fechaDeTx = t => (typeof fechaContable === 'function' ? fechaContable(t) : new Date(t.date));
const _cuentaTx = t => t.tarjetaId ? '💳 ' + (t.tarjetaNombre || ((state.tarjetas || []).find(x => String(x.id) === String(t.tarjetaId)) || {}).nombre || 'Tarjeta')
  : t.cuenta ? etiquetaCuenta(t.cuenta) : '';

/** Movimientos del mes (sin borrados ni saldos iniciales) con sus totales */
function movimientosDelMes(y, m) {
  const txs = (state.transactions || []).filter(t => {
    if (t.deletedAt || t.esSaldoInicial || typeof t.amount !== 'number') return false;
    const d = _fechaDeTx(t);
    return d.getFullYear() === y && d.getMonth() === m;
  });
  const cuentan = txs.filter(t => !t.esTransferencia && !t.esConciliacion);
  const gastos = _c2(cuentan.filter(t => t.type === 'expense').reduce((a, t) => a + t.amount, 0));
  const ingresos = _c2(cuentan.filter(t => t.type === 'income').reduce((a, t) => a + t.amount, 0));
  return { txs, gastos, ingresos, saldo: _c2(ingresos - gastos) };
}

// Una transferencia entre tus cuentas se guarda como dos movimientos (sale y
// entra): en la lista se muestra como uno solo.
function _filasDelDia(txs) {
  const usados = new Set(), filas = [];
  txs.forEach(t => {
    if (usados.has(t.id)) return;
    if (t.esTransferencia && t.type === 'expense') {
      const par = txs.find(o => !usados.has(o.id) && o.id !== t.id && o.esTransferencia && o.type === 'income'
        && Math.abs(o.amount - t.amount) < 0.005 && Math.abs(new Date(o.date) - new Date(t.date)) < 5000);
      if (par) { usados.add(t.id); usados.add(par.id); filas.push({ transf: true, sale: t, entra: par }); return; }
    }
    usados.add(t.id);
    filas.push({ t });
  });
  return filas;
}

function _htmlFilaRegistro(f) {
  if (f.transf) {
    const { sale, entra } = f;
    return `<button type="button" class="rm-fila" onclick="abrirEdicionTx('${esc(sale.id)}')">
      ${circuloCategoria('Transferencia')}
      <span class="rm-info"><span class="rm-cat">Transferencia</span><small>${esc(_cuentaTx(sale))} → ${esc(_cuentaTx(entra))}</small></span>
      <span class="rm-monto neutro">${fL(sale.amount)}</span></button>`;
  }
  const t = f.t, gasto = t.type === 'expense';
  const clase = t.esTransferencia || t.esConciliacion ? 'neutro' : gasto ? 'rojo' : 'verde';
  const cat = t.esConciliacion ? 'Ajuste de saldo' : (t.cat || (gasto ? 'Gasto' : 'Ingreso'));
  const icono = t.esConciliacion ? '<span class="cat-circulo" style="background:#607D8B" aria-hidden="true">⚖️</span>' : circuloCategoria(t.cat || '', t.type);
  const rem = t.remesa ? [t.remesa.de ? 'De ' + t.remesa.de : '', t.remesa.via, t.originalCurrency === 'USD' && t.originalAmount ? 'US$ ' + t.originalAmount.toFixed(2) : ''] : [];
  const detalle = [_cuentaTx(t), ...rem, t.subcat && !/^(salario|extra|freelance|negocio)$/.test(t.subcat) ? t.subcat : '', t.nota || ''].filter(Boolean).join(' · ');
  // Compra con tarjeta que cuenta en el mes de pago: se dice de cuándo es
  const real = new Date(t.date), cuenta = _fechaDeTx(t);
  const otraFecha = fechaLocal(real) !== fechaLocal(cuenta) ? ` <span class="rm-nota-fecha">compra del ${real.getDate()} ${_MESES_CORTOS[real.getMonth()]}</span>` : '';
  return `<button type="button" class="rm-fila" onclick="abrirEdicionTx('${esc(t.id)}')">
    ${icono}
    <span class="rm-info"><span class="rm-cat">${esc(cat)}${t.facturaImagenId || t.facturaImagen ? ' 🧾' : ''}</span><small>${esc(detalle)}${otraFecha}</small></span>
    <span class="rm-monto ${clase}">${gasto ? '−' : '+'}${fL(t.amount)}</span></button>`;
}

function _tituloDia(clave) {
  const d = new Date(clave + 'T12:00:00');
  const hoy = fechaLocal(), ayer = fechaLocal(new Date(Date.now() - 864e5));
  const base = `${d.getDate()} ${_MESES_CORTOS[d.getMonth()]}, ${_DIAS_SEMANA[d.getDay()]}`;
  return clave === hoy ? 'Hoy · ' + base : clave === ayer ? 'Ayer · ' + base : base.charAt(0).toUpperCase() + base.slice(1);
}

function renderRegistrosMes() {
  const el = document.getElementById('registros-mes');
  if (!el) return;
  if (!state.setup) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  // Con algo escrito en el buscador, la tarjeta muestra los resultados (29-busqueda-y-recurrentes.js)
  if (typeof renderBusquedaMovimientos === 'function' && renderBusquedaMovimientos()) return;
  const cuerpo = document.getElementById('registros-mes-cuerpo') || el;
  const v = _mesActualVista(), hoy = new Date();
  const esMesActual = v.y === hoy.getFullYear() && v.m === hoy.getMonth();
  const r = movimientosDelMes(v.y, v.m);
  const nombreMes = _MESES_LARGOS[v.m].charAt(0).toUpperCase() + _MESES_LARGOS[v.m].slice(1) + ' ' + v.y;
  const cabeza = `<div class="rm-nav">
      <button type="button" onclick="cambiarMesVista(-1)" aria-label="Mes anterior">‹</button>
      <strong>${nombreMes}</strong>
      <button type="button" onclick="cambiarMesVista(1)" aria-label="Mes siguiente"${esMesActual ? ' disabled' : ''}>›</button>
    </div>
    <div class="rm-totales">
      <div><small>Gastos</small><b class="rojo">${fL(r.gastos)}</b></div>
      <div><small>Ingresos</small><b class="verde">${fL(r.ingresos)}</b></div>
      <div><small>Saldo</small><b class="${r.saldo < 0 ? 'rojo' : 'verde'}">${fL(r.saldo)}</b></div>
    </div>`;

  if (!r.txs.length) {
    const nuevo = !(state.transactions || []).some(t => !t.deletedAt && !t.esSaldoInicial);
    cuerpo.innerHTML = cabeza + `<div class="rm-vacio">
      <div class="rm-vacio-ico">📝</div>
      <p>${nuevo ? '¡Bienvenido! Anota tu primer gasto o ingreso: toca el botón y escribe el monto.' : esMesActual ? 'Todavía no hay movimientos este mes.' : 'No hubo movimientos en ' + _MESES_LARGOS[v.m] + '.'}</p>
      ${esMesActual ? '<button type="button" class="btn btn-primary" onclick="abrirRegistro(\'gasto\')">➕ Registrar movimiento</button>' : ''}
    </div>`;
    return;
  }

  // Por día, del más reciente al más viejo; dentro del día, lo último primero
  const porDia = {};
  r.txs.forEach(t => { const k = fechaLocal(_fechaDeTx(t)); (porDia[k] = porDia[k] || []).push(t); });
  const dias = Object.keys(porDia).sort().reverse();
  let mostradas = 0, ocultas = 0, html = '';
  dias.forEach(k => {
    const txs = porDia[k].slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    const filas = _filasDelDia(txs);
    if (!v.todo && mostradas >= REGISTROS_VISIBLES) { ocultas += filas.length; return; }
    const neto = _c2(txs.filter(t => !t.esTransferencia && !t.esConciliacion).reduce((a, t) => a + (t.type === 'income' ? t.amount : -t.amount), 0));
    html += `<div class="rm-dia"><div class="rm-dia-head"><span>${_tituloDia(k)}</span><span class="${neto < 0 ? 'rojo' : neto > 0 ? 'verde' : ''}">${neto ? (neto < 0 ? '−' : '+') + fL(Math.abs(neto)) : ''}</span></div>`
      + filas.map(_htmlFilaRegistro).join('') + '</div>';
    mostradas += filas.length;
  });
  if (ocultas) html += `<button type="button" class="btn btn-secondary rm-ver-todo" onclick="verTodoMesVista()">Ver todo el mes (${ocultas} más)</button>`;
  cuerpo.innerHTML = cabeza + html;
}
