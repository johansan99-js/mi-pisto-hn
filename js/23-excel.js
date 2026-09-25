// Mi Pisto HN · 23-excel.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.

// ═══ REPORTE EN EXCEL ═════════════════════════════════════════════════════
// hojasReporteExcel() arma el contenido (sin tocar el estado) y
// exportToExcelPro() lo escribe con SheetJS. Las fechas son fechas reales
// y los montos son números con formato de lempiras, así que en Excel se
// pueden ordenar, filtrar y sumar. SheetJS gratuito no escribe colores: el
// orden lo dan los títulos, los anchos y los filtros.
const FMT_L = '"L "#,##0.00;[Red]-"L "#,##0.00';
const FMT_USD = '"$ "#,##0.00;[Red]-"$ "#,##0.00';
const FMT_FECHA = 'dd/mm/yyyy';
const FMT_PCT = '0%';

function _tipoMovimiento(t) {
  if (t.esSaldoInicial) return 'Saldo inicial';
  if (t.esConciliacion) return 'Ajuste de saldo';
  if (t.esTransferencia) return t.metaId ? 'Abono a meta' : t.tarjetaId ? 'Pago de tarjeta' : t.deudaId ? 'Deuda (capital)' : t.grupoId ? 'Gasto compartido' : 'Transferencia';
  return t.type === 'income' ? 'Ingreso' : 'Gasto';
}
function hojasReporteExcel(ahora) {
  const hoy = ahora || new Date();
  const txs = (state.transactions || []).filter(t => !t.deletedAt && typeof t.amount === 'number').slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  const cuentaNombre = id => id ? nombreCompletoCuenta(infoCuenta(id)) || id : '';
  const tarjetaNombre = id => ((state.tarjetas || []).find(x => String(x.id) === String(id)) || {}).nombre || '';
  const hojas = [];

  // ── Resumen ──
  const debesDeudas = (state.payables || []).filter(deudaActiva).reduce((a, p) => a + pendienteDeuda(p), 0);
  const debesTarjetas = (state.tarjetas || []).reduce((a, t) => a + Math.max(0, deudaTarjetaL(t)), 0);
  const debesPrestamos = (state.prestamos || []).reduce((a, p) => a + saldoPrestamo(p), 0);
  const teDeben = (state.receivables || []).reduce((a, r) => a + Math.max(0, r.monto - (r.pagado || 0)), 0);
  const mes = calcularResumenMes(hoy.getFullYear(), hoy.getMonth());
  const anio = [...Array(hoy.getMonth() + 1).keys()].map(m => calcularResumenMes(hoy.getFullYear(), m));
  const sumaAnio = k => anio.reduce((a, r) => a + r[k], 0);
  hojas.push({
    nombre: 'Resumen', anchos: [34, 18, 44],
    filas: [
      ['Mi Pisto HN · Reporte financiero'],
      ['Nombre', state.nombre || ''],
      ['Generado', hoy],
      [],
      ['LO QUE TIENES', 'Monto', 'Detalle'],
      ['Dinero en tus cuentas', _c2(totalEnCuentas()), listaCuentas().length + ' cuentas (ver hoja Cuentas)'],
      ['Te deben', _c2(teDeben), 'Dinero que prestaste'],
      ['LO QUE DEBES', null, null],
      ['Tarjetas de crédito', _c2(debesTarjetas), (state.tarjetas || []).length + ' tarjetas'],
      ['Préstamos', _c2(debesPrestamos), 'Saldo aproximado, con intereses'],
      ['Otras deudas', _c2(debesDeudas), 'Bancos y personas (ver hoja Deudas)'],
      ['Patrimonio neto', _c2(totalEnCuentas() + teDeben - debesTarjetas - debesPrestamos - debesDeudas), 'Lo que tienes menos lo que debes'],
      [],
      ['ESTE MES (' + _MESES[hoy.getMonth()] + ')', 'Monto', ''],
      ['Ingresos', _c2(mes.ingresos), ''],
      ['Gastos', _c2(mes.gastos), ''],
      ['Te sobró', _c2(mes.sobrante), mes.ingresos > 0 ? Math.round(mes.sobrante / mes.ingresos * 100) + '% de lo que ganaste' : ''],
      [],
      ['ESTE AÑO (' + hoy.getFullYear() + ')', 'Monto', ''],
      ['Ingresos', _c2(sumaAnio('ingresos')), ''],
      ['Gastos', _c2(sumaAnio('gastos')), ''],
      ['Te sobró', _c2(sumaAnio('sobrante')), ''],
      [],
      ['Las transferencias entre tus cuentas, los abonos a metas y los ajustes de saldo no se cuentan como ingresos ni gastos.'],
    ],
    formatos: { 1: FMT_L }, fechas: [[2, 1]],
  });

  // ── Movimientos ──
  hojas.push({
    nombre: 'Movimientos', filtro: true, anchos: [12, 16, 18, 30, 24, 18, 14, 10, 12, 30],
    filas: [['Fecha', 'Tipo', 'Categoría', 'Detalle', 'Cuenta', 'Tarjeta', 'Monto (L)', 'Moneda', 'Monto original', 'Nota']].concat(txs.map(t => [
      new Date(t.date), _tipoMovimiento(t),
      Array.isArray(t.splits) && t.splits.length ? t.splits.map(s => s.cat).join(' + ') : (t.cat || ''),
      t.subcat || '', cuentaNombre(t.cuenta), t.tarjetaId ? tarjetaNombre(t.tarjetaId) : '',
      _c2(t.type === 'income' ? t.amount : -t.amount),
      t.originalCurrency && t.originalCurrency !== 'HNL' ? t.originalCurrency : 'HNL',
      t.originalCurrency && t.originalCurrency !== 'HNL' ? t.originalAmount : null,
      t.nota || t.notas || '',
    ])),
    formatos: { 6: FMT_L, 8: '#,##0.00' }, colFecha: 0,
  });

  // ── Por mes (los últimos 12 con movimientos) ──
  const meses = [];
  for (let i = 0; i < 24 && meses.length < 12; i++) {
    const f = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1), r = calcularResumenMes(f.getFullYear(), f.getMonth());
    if (r.movimientos) meses.push([_MESES[f.getMonth()] + ' ' + f.getFullYear(), _c2(r.ingresos), _c2(r.gastos), _c2(r.sobrante), r.ingresos > 0 ? r.sobrante / r.ingresos : null, r.movimientos]);
  }
  hojas.push({ nombre: 'Por mes', anchos: [18, 16, 16, 16, 12, 14], filas: [['Mes', 'Ingresos', 'Gastos', 'Sobrante', '% ahorrado', 'Movimientos']].concat(meses),
    formatos: { 1: FMT_L, 2: FMT_L, 3: FMT_L, 4: FMT_PCT } });

  // ── Categorías del año, mes por mes ──
  const mesesAnio = [...Array(hoy.getMonth() + 1).keys()];
  const porMes = mesesAnio.map(m => getCategoryTotalsForMonth(hoy.getFullYear(), m));
  const cats = [...new Set(porMes.flatMap(o => Object.keys(o)))];
  const totalCat = c => porMes.reduce((a, o) => a + (o[c] || 0), 0);
  cats.sort((a, b) => totalCat(b) - totalCat(a));
  hojas.push({ nombre: 'Categorías ' + hoy.getFullYear(), anchos: [22].concat(mesesAnio.map(() => 12), [14]),
    filas: [['Categoría'].concat(mesesAnio.map(m => _MESES[m].slice(0, 3)), ['Total'])]
      .concat(cats.map(c => [c].concat(porMes.map(o => o[c] ? _c2(o[c]) : null), [_c2(totalCat(c))])))
      .concat(cats.length ? [['Total'].concat(porMes.map(o => _c2(Object.values(o).reduce((a, v) => a + v, 0))), [_c2(cats.reduce((a, c) => a + totalCat(c), 0))])] : []),
    formatosDesde: 1, formatoDesde: FMT_L });

  // ── Cuentas ──
  hojas.push({ nombre: 'Cuentas', anchos: [30, 22, 10, 16, 14, 12],
    filas: [['Cuenta', 'Tipo', 'Moneda', 'Saldo (L)', 'Saldo (USD)', 'Interés anual']].concat(listaCuentas().map(c => [
      nombreCompletoCuenta(c), (TIPOS_CUENTA[c.tipo] || TIPOS_CUENTA.otra).nombre, c.moneda === 'USD' ? 'USD' : 'HNL',
      _c2(getCuentaBalance(c.id)), c.moneda === 'USD' ? saldoUSDCuenta(c.id) : null, c.tasaAnual > 0 ? c.tasaAnual / 100 : null,
    ])).concat([['Total', '', '', _c2(totalEnCuentas()), null, null]]),
    formatos: { 3: FMT_L, 4: FMT_USD, 5: '0.0%' } });

  // ── Deudas y tarjetas ──
  const filasDeudas = []
    .concat((state.tarjetas || []).map(t => ['Tarjeta', t.nombre + (t.ultimos4 ? ' •••• ' + t.ultimos4 : ''), t.limite || null, null, _c2(Math.max(0, deudaTarjetaL(t))), (t.tasaInteres || 0) / 100, 'Corte día ' + t.corte + ', pago día ' + t.pago + (esBimoneda(t) ? ' · ' + textoSaldoTarjeta(t) : '')]))
    .concat((state.prestamos || []).map(p => ['Préstamo', p.entidad, p.monto, null, _c2(saldoPrestamo(p)), (p.tasaInteres || 0) / 100, (p.cuotasPagadas || 0) + ' de ' + p.cuotasTotal + ' cuotas de L ' + (p.cuota || 0).toFixed(2)]))
    .concat((state.payables || []).map(p => [p.tipo === 'banco' ? 'Debo (banco)' : 'Debo (persona)', p.creditor, p.monto, p.pagado || 0, pendienteDeuda(p), null, p.liquidadaEn ? 'Liquidada el ' + p.liquidadaEn : p.vence ? 'Vence ' + p.vence : '']))
    .concat((state.receivables || []).map(r => ['Me deben', r.persona, r.monto, r.pagado || 0, _c2(Math.max(0, r.monto - (r.pagado || 0))), null, '']));
  if (filasDeudas.length) hojas.push({ nombre: 'Deudas', anchos: [16, 30, 14, 14, 14, 12, 34],
    filas: [['Tipo', 'Con quién', 'Total / límite', 'Pagado', 'Pendiente', 'Interés anual', 'Nota']].concat(filasDeudas),
    formatos: { 2: FMT_L, 3: FMT_L, 4: FMT_L, 5: '0.0%' } });

  // ── Presupuestos ──
  if ((state.presupuestos || []).length) hojas.push({ nombre: 'Presupuestos', anchos: [22, 12, 24, 14, 14, 14, 10],
    filas: [['Categoría', 'Período', 'Del … al …', 'Tope', 'Gastado', 'Queda', '% usado']].concat(state.presupuestos.map(p => {
      const e = estadoPresupuesto(p, hoy);
      return [nombreCatPresupuesto(p.cat), PERIODOS[p.periodo] || p.periodo, textoRango(p.periodo, e.r), p.monto, e.gastado, e.queda, e.pct / 100];
    })), formatos: { 3: FMT_L, 4: FMT_L, 5: FMT_L, 6: FMT_PCT } });

  // ── Metas ──
  if ((state.goals || []).length) hojas.push({ nombre: 'Metas', anchos: [28, 14, 14, 10],
    filas: [['Meta', 'Objetivo', 'Ahorrado', 'Avance']].concat(state.goals.map(g => [g.nombre, g.objetivo, g.actual || 0, g.objetivo > 0 ? (g.actual || 0) / g.objetivo : null])),
    formatos: { 1: FMT_L, 2: FMT_L, 3: FMT_PCT } });
  return hojas;
}

function _hojaSheetJS(h) {
  const ws = XLSX.utils.aoa_to_sheet(h.filas, { cellDates: true });
  const rango = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let R = 1; R <= rango.e.r; R++) {
    for (let C = 0; C <= rango.e.c; C++) {
      const cel = ws[XLSX.utils.encode_cell({ r: R, c: C })];
      if (!cel) continue;
      if (cel.t === 'd' || cel.v instanceof Date) { cel.z = FMT_FECHA; continue; }
      if (cel.t !== 'n') continue;
      const z = (h.formatos && h.formatos[C]) || (h.formatosDesde !== undefined && C >= h.formatosDesde ? h.formatoDesde : null);
      if (z) cel.z = z;
    }
  }
  (h.fechas || []).forEach(([r, c]) => { const cel = ws[XLSX.utils.encode_cell({ r, c })]; if (cel) cel.z = FMT_FECHA + ' hh:mm'; });
  if (h.anchos) ws['!cols'] = h.anchos.map(w => ({ wch: w }));
  if (h.filtro && rango.e.r > 0) ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rango.e.r, c: rango.e.c } }) };
  return ws;
}
function exportToExcelPro() {
  if (typeof XLSX === 'undefined') return alert('No se pudo cargar la herramienta de Excel. Revisa tu conexión y vuelve a intentar.');
  try {
    const wb = XLSX.utils.book_new();
    wb.Props = { Title: 'Mi Pisto HN · Reporte financiero', Author: 'Mi Pisto HN' };
    hojasReporteExcel().forEach(h => XLSX.utils.book_append_sheet(wb, _hojaSheetJS(h), h.nombre.slice(0, 31)));
    const quien = String(state.nombre || 'reporte').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'reporte';
    XLSX.writeFile(wb, 'MiPisto_' + quien + '_' + todayStr() + '.xlsx', { cellDates: true });
    // Algunos lectores gratis de documentos llenan de anuncios al abrir el archivo
    if (typeof avisoRapido === 'function') avisoRapido('📊 Excel descargado. Ábrelo con Google Sheets o Microsoft Excel: son gratis y sin anuncios.', 6000);
  } catch (e) {
    console.error(e);
    alert('No se pudo generar el Excel: ' + e.message);
  }
}
