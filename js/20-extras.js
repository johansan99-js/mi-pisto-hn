// Mi Pisto HN · 20-extras.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.

// ═══ TEMAS ════════════════════════════════════════════════════════════════
// Dos temas con un switch: Claro (blanco con letras verdes) y Oscuro (negro
// puro OLED). Mientras no toques el switch, sigue el tema del teléfono. Es una
// preferencia del teléfono, no de los datos: va en localStorage y 00-config.js
// la aplica antes de pintar para que no parpadee. Los colores: css/app.css.
const TEMAS = [
  { id: 'claro', nombre: 'Claro', color: '#FFFFFF' },
  { id: 'oscuro', nombre: 'Oscuro', color: '#000000' }
];
const _temaInfo = t => TEMAS.find(x => x.id === t) || TEMAS[1];
function _temaGuardado() {
  try {
    const g = localStorage.getItem('mph_tema');
    // Nombres de versiones anteriores: blanco → claro; oled, negro, turquesa → oscuro
    if (g === 'claro' || g === 'blanco') return 'claro';
    if (['oscuro', 'oled', 'negro', 'turquesa'].includes(g)) return 'oscuro';
  } catch (e) {}
  return null;
}
function temaActual() {
  const g = _temaGuardado();
  if (g) return g;
  try { return window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 'claro' : 'oscuro'; } catch (e) { return 'oscuro'; }
}
function aplicarTema(t) {
  const info = _temaInfo(t);
  document.documentElement.dataset.tema = info.id;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', info.color);
}
function elegirTema(t) {
  const id = t === 'claro' ? 'claro' : 'oscuro';
  try { localStorage.setItem('mph_tema', id); } catch (e) {}
  aplicarTema(id);
  renderConfigTema();
  // La gráfica de dona lee los colores al dibujarse
  if (typeof renderDoughnutChart === 'function' && state.setup) { try { renderDoughnutChart(); } catch (e) {} }
}
function renderConfigTema() {
  const oscuro = temaActual() === 'oscuro';
  document.querySelectorAll('.sw-tema').forEach(el => { el.checked = oscuro; el.setAttribute('aria-checked', String(oscuro)); });
}
// Si el teléfono cambia de tema y no has elegido uno, la app lo sigue
try {
  window.matchMedia && matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (!_temaGuardado()) { aplicarTema(temaActual()); renderConfigTema(); } });
} catch (e) {}
// Color de un token del tema para lo que no entiende var() (gráficas en canvas)
function colorTema(nombre, respaldo) {
  try { return getComputedStyle(document.documentElement).getPropertyValue('--' + nombre).trim() || respaldo; } catch (e) { return respaldo; }
}

// ═══ REPORTE DEL MES EN PDF ═══════════════════════════════════════════════
// Sin librerías: se arma una página de reporte y se abre el diálogo de
// impresión del teléfono, que ofrece "Guardar como PDF". Los montos se ven
// completos aunque esté el modo discreto (es un documento que tú pediste).
const _lps = n => 'L ' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function htmlReporteMes(y, m) {
  const r = calcularResumenMes(y, m);
  const tx = state.transactions.filter(t => { if (t.deletedAt || t.esTransferencia || t.esConciliacion) return false; const f = fechaContable(t); return f.getFullYear() === y && f.getMonth() === m; })
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const fila = (a, b, c) => '<tr><td>' + a + '</td><td>' + b + '</td><td class="n">' + c + '</td></tr>';
  const cuentas = listaCuentas().map(c => '<tr><td>' + esc(nombreCompletoCuenta(c)) + '</td><td class="n">' + _lps(getCuentaBalance(c.id)) + '</td></tr>').join('');
  const deudas = (state.payables || []).filter(deudaActiva).map(p => '<tr><td>' + esc(p.creditor) + '</td><td class="n">' + _lps(pendienteDeuda(p)) + '</td></tr>').join('') +
    (state.tarjetas || []).filter(t => t.saldo > 0.005).map(t => '<tr><td>💳 ' + esc(t.nombre) + '</td><td class="n">' + _lps(t.saldo) + '</td></tr>').join('') +
    (state.prestamos || []).filter(p => saldoPrestamo(p) > 0.5).map(p => '<tr><td>🏦 ' + esc(p.entidad) + '</td><td class="n">' + _lps(saldoPrestamo(p)) + '</td></tr>').join('');
  const presus = (state.presupuestos || []).filter(p => p.periodo === 'mes').map(p => {
    const g = gastadoEn(p.cat, { inicio: new Date(y, m, 1), fin: new Date(y, m + 1, 1) });
    return '<tr><td>' + esc(nombreCatPresupuesto(p.cat)) + '</td><td class="n">' + _lps(g) + ' de ' + _lps(p.monto) + '</td></tr>';
  }).join('');
  return `<div class="rep-cabecera"><div><strong>Mi Pisto HN</strong><span>Reporte de ${_MESES[m]} ${y}</span></div><div>${esc(state.nombre || '')}<span>Generado el ${new Date().toLocaleDateString('es-HN')}</span></div></div>
    <div class="rep-cifras"><div><small>Ingresos</small><strong>${_lps(r.ingresos)}</strong></div><div><small>Gastos</small><strong>${_lps(r.gastos)}</strong></div><div><small>${r.sobrante >= 0 ? 'Te sobró' : 'Te faltó'}</small><strong>${_lps(Math.abs(r.sobrante))}</strong></div></div>
    ${r.top.length ? '<h3>En qué se fue tu dinero</h3><table>' + r.top.map(c => fila(esc(c.cat), r.gastos > 0 ? Math.round(c.monto / r.gastos * 100) + '%' : '', _lps(c.monto))).join('') + '</table>' : ''}
    ${presus ? '<h3>Presupuestos del mes</h3><table>' + presus + '</table>' : ''}
    <div class="rep-dos"><div><h3>Tus cuentas hoy</h3><table>${cuentas}</table></div>${deudas ? '<div><h3>Lo que debes hoy</h3><table>' + deudas + '</table></div>' : ''}</div>
    <h3>Movimientos (${tx.length})</h3><table class="rep-movs"><tr><th>Fecha</th><th>Detalle</th><th class="n">Monto</th></tr>${tx.map(t =>
      '<tr><td>' + new Date(t.date).toLocaleDateString('es-HN', { day: '2-digit', month: 'short' }) + '</td><td>' + esc(t.cat || '') + (t.subcat ? ' · ' + esc(t.subcat) : '') + '</td><td class="n ' + (t.type === 'income' ? 'mas' : '') + '">' + (t.type === 'income' ? '+' : '-') + _lps(t.amount) + '</td></tr>').join('')}</table>
    <p class="rep-pie">Transferencias entre tus cuentas y ajustes de saldo no se cuentan como ingresos ni gastos.</p>`;
}
function imprimirReporteMes() {
  const sel = document.getElementById('resumen-mes');
  const [y, m] = sel && sel.value ? sel.value.split('-').map(Number) : [new Date().getFullYear(), new Date().getMonth()];
  let cont = document.getElementById('reporte-imprimible');
  if (!cont) { cont = document.createElement('div'); cont.id = 'reporte-imprimible'; document.body.appendChild(cont); }
  cont.innerHTML = htmlReporteMes(y, m);
  const tituloAntes = document.title;
  document.title = 'Mi Pisto HN - ' + _MESES[m] + ' ' + y;   // nombre del PDF
  document.body.classList.add('imprimiendo');
  const limpiar = () => { document.body.classList.remove('imprimiendo'); document.title = tituloAntes; window.removeEventListener('afterprint', limpiar); };
  window.addEventListener('afterprint', limpiar);
  // En Android print() no espera a que cierres el diálogo: se limpia con afterprint
  // (los estilos de "imprimiendo" solo aplican al imprimir, así que no estorban)
  setTimeout(() => { try { window.print(); } catch (e) { limpiar(); alert('Tu navegador no permite imprimir desde aquí.'); } }, 50);
}

// ═══ ¿CUADRAN TUS CUENTAS? ════════════════════════════════════════════════
// Una vez por semana (y solo si ya hay movimientos), una tarjeta en el Inicio
// invita a comparar el saldo de cada cuenta con el real. Así las diferencias
// no se acumulan ("se me descuadran las cuentas").
const DIAS_ENTRE_CUADRES = 7;
function _ultimoCuadre() {
  // Lo más reciente entre "Ya cuadran" y el último ajuste de saldo
  const fechas = (state.transactions || []).filter(t => !t.deletedAt && t.esConciliacion && !t.esSaldoInicial).map(t => +new Date(t.date));
  try { const v = localStorage.getItem('mph_ultimo_cuadre'); if (v) fechas.push(+new Date(v)); } catch (e) {}
  return fechas.length ? new Date(Math.max(...fechas)) : null;
}
function toca_cuadrar(hoy) {
  const h = hoy || new Date();
  const movs = (state.transactions || []).filter(t => !t.deletedAt && !t.esConciliacion);
  if (movs.length < 5) return false;
  const primero = new Date(Math.min(...movs.map(t => new Date(t.date))));
  const ultimo = _ultimoCuadre() || primero;
  return (h - ultimo) / 864e5 >= DIAS_ENTRE_CUADRES;
}
function renderAvisoCuadre() {
  const el = document.getElementById('aviso-cuadre');
  if (!el) return;
  if (!state.setup || !toca_cuadrar()) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.innerHTML = `<div style="display:flex;gap:10px;align-items:flex-start"><span style="font-size:22px">⚖️</span><div style="flex:1">
      <strong style="font-size:14px">¿Cuadran tus cuentas?</strong>
      <p style="font-size:12px;color:var(--text2);line-height:1.5;margin:4px 0 10px">Compara lo que dice la app con tu banco y tu billetera. Si algo no cuadra, ajústalo: así la diferencia no crece.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="btn btn-primary" style="margin:0" onclick="switchView('cuentas')">Revisar</button><button class="btn btn-secondary" style="margin:0" onclick="marcarCuadre()">✅ Ya cuadran</button></div>
    </div></div>`;
}
function marcarCuadre() {
  try { localStorage.setItem('mph_ultimo_cuadre', new Date().toISOString()); } catch (e) {}
  renderAvisoCuadre();
}
