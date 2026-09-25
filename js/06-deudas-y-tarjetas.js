// Mi Pisto HN · 06-deudas-y-tarjetas.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.
// ========== COBRAR Y PAGAR (MEJORADO CON FLUJO DE CAJA) ==========
function saveCobrar(){const persona=document.getElementById('cobrar-persona').value.trim(),monto=leerMonto(document.getElementById('cobrar-monto').value),pagado=leerMonto(document.getElementById('cobrar-pagado').value)||0;if(!persona||!monto)return;state.receivables.push({id:uid(),persona,monto,pagado,fecha:document.getElementById('cobrar-fecha').value});save();closeModal('modal-cobrar');renderAll();}
function renderCobrar(){const c=document.getElementById('cobrar-list');if(!c)return;const tot=document.getElementById('total-cobrar');if(tot)tot.textContent=fL(state.receivables.reduce((a,r)=>a+Math.max(0,r.monto-(r.pagado||0)),0));if(state.receivables.length===0){c.innerHTML=`<div class="empty-state-simple"><div class="es-icon">🤝</div><div class="es-title">Nadie te debe dinero</div><div class="es-sub">Registra aquí los préstamos que has hecho a otras personas para llevar el control.</div><button class="btn-empty-secondary" onclick="openModal('modal-cobrar')">➕ Registrar cobro pendiente</button></div>`;return;}c.innerHTML=state.receivables.map(r=>{
  const pendiente=r.monto-(r.pagado||0);
  return `<div class="card card-receivable">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div>
        <div style="font-weight:700;font-size:15px">${esc(r.persona)}</div>
        <div style="font-size:12px;color:var(--text2)">Total: ${fL(r.monto)} · Pagado: ${fL(r.pagado||0)}</div>
      </div>
      <div style="font-weight:800;font-size:16px;color:var(--amber)">${fL(pendiente)}</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center">
      <button class="btn btn-primary" onclick=\"abonarCobrar('${esc(r.id)}')\"" style="min-height:40px;font-size:13px">Abonar</button>
      <button onclick=\"editarCobrar('${esc(r.id)}')\"" style="width:40px;height:40px;border-radius:10px;border:1.5px solid rgba(245,200,0,.4);background:rgba(245,200,0,.1);cursor:pointer;display:flex;align-items:center;justify-content:center">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F5C800" stroke-width="2.2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button onclick=\"eliminarCobrar('${esc(r.id)}')\"" style="width:40px;height:40px;border-radius:10px;border:1.5px solid rgba(255,68,68,.4);background:rgba(255,68,68,.1);cursor:pointer;display:flex;align-items:center;justify-content:center">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FF4444" stroke-width="2.2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      </button>
    </div>
  </div>`;}).join('')}
function abonarCobrar(id){
  const r=state.receivables.find(x=>x.id===id);
  if(!r)return;
  const pendiente=r.monto-(r.pagado||0);
  if(pendiente<=0)return alert('Este cobro ya está saldado ✅');
  // prompt y confirm muestran texto plano: esc() dejaba "&amp;" a la vista y guardado
  const m=leerMonto(prompt(`¿Cuánto te pagó ${r.persona}?\nPendiente: ${fL(pendiente)}`));
  if(!m||m<=0)return;
  const abono=Math.min(m,pendiente);
  const cuenta=pedirCuenta(`¿Dónde recibiste los ${fL(abono)}?`,'[Aceptar] = Cuenta de Ahorro (transferencia)\n[Cancelar] = Efectivo');
  if(!cuenta)return;
  r.pagado=(r.pagado||0)+abono;
  state.transactions.push({id:uid(),type:'income',amount:abono,cat:'Cobro Deuda',subcat:`Cobro a ${r.persona}`,cuenta,date:new Date().toISOString()});
  if(r.pagado>=r.monto){if(confirm(`✅ Cobro saldado. ¿Eliminar el registro de "${r.persona}"?`)){state.receivables=state.receivables.filter(x=>x.id!==id);}}
  save();renderAll();
}

// ========== LO QUE DEBO: bancos y personas, como cuentas en rojo ==========
// Si el dinero de la deuda entró a una de tus cuentas (te prestaron), esa
// entrada y los abonos al capital son movimientos internos (esTransferencia +
// deudaId): pedir prestado no es un ingreso ni pagar el capital es un gasto,
// y el patrimonio no se mueve. Si la deuda es de antes (el dinero no se
// anotó), cada abono sí es un gasto, como siempre. Los intereses y cargos se
// anotan aparte como gasto. Al liquidarla se guarda en "Liquidadas".
// Las deudas de versiones anteriores no tienen tipo: eran con personas.
const BANCOS_HN = ['BAC Credomatic', 'Banco Atlántida', 'Ficohsa', 'Banpaís', 'Promerica', 'Davivienda', 'Banco de Occidente', 'LAFISE', 'Banrural', 'Banco Azteca', 'Cuscatlán', 'Ficensa', 'Banco Popular', 'Cooperativa'];
const pendienteDeuda = p => Math.max(0, Math.round(((p.monto || 0) - (p.pagado || 0)) * 100) / 100);
const deudaActiva = p => !p.liquidadaEn && pendienteDeuda(p) > 0.005;
const _nombreCuentaDeuda = c => nombreCuentaTexto(c);
const _fechaDeInput = f => f && f !== new Date().toISOString().slice(0, 10) ? new Date(f + 'T12:00:00').toISOString() : new Date().toISOString();
let _tipoDeuda = 'banco';
function elegirTipoDeuda(t) {
  _tipoDeuda = t === 'persona' ? 'persona' : 'banco';
  document.querySelectorAll('#modal-pagar [data-tipo]').forEach(b => b.classList.toggle('activa', b.dataset.tipo === _tipoDeuda));
  const inp = document.getElementById('pagar-creditor');
  inp.placeholder = _tipoDeuda === 'banco' ? 'Banco o financiera (ej. BAC, Ficohsa)' : '¿A quién le debes?';
  if (_tipoDeuda === 'banco') inp.setAttribute('list', 'lista-bancos'); else inp.removeAttribute('list');
}
function _renderEntradaDeuda() {
  const e = document.getElementById('pagar-entrada').value;
  document.getElementById('pagar-pagado-wrap').style.display = e ? 'none' : '';
  document.getElementById('pagar-entrada-info').textContent = e
    ? 'El dinero se suma a tu ' + _nombreCuentaDeuda(e) + ' sin contar como ingreso, y los abonos no cuentan como gasto: solo los intereses.'
    : 'Cada abono se anotará como gasto.';
}
function abrirNuevaDeuda(tipo) {
  ['pagar-creditor', 'pagar-monto', 'pagar-vence'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('pagar-pagado').value = '0';
  document.getElementById('pagar-entrada').value = '';
  document.getElementById('pagar-fecha').value = new Date().toISOString().slice(0, 10);
  const dl = document.getElementById('lista-bancos');
  if (dl && !dl.options.length) dl.innerHTML = BANCOS_HN.map(b => '<option value="' + esc(b) + '">').join('');
  elegirTipoDeuda(tipo || 'banco');
  _renderEntradaDeuda();
  openModal('modal-pagar');
}
function savePagar() {
  const creditor = document.getElementById('pagar-creditor').value.trim();
  const monto = leerMonto(document.getElementById('pagar-monto').value);
  const entrada = document.getElementById('pagar-entrada').value || null;
  const pagado = entrada ? 0 : (leerMonto(document.getElementById('pagar-pagado').value) || 0);
  const fecha = document.getElementById('pagar-fecha').value || new Date().toISOString().slice(0, 10);
  const vence = document.getElementById('pagar-vence').value || null;
  if (!creditor) return alert(_tipoDeuda === 'banco' ? 'Escribe el banco o la financiera.' : 'Escribe a quién le debes.');
  if (!(monto > 0)) return alert('Escribe cuánto debes.');
  if (pagado < 0 || pagado >= monto) return alert('Lo que ya pagaste tiene que ser menor que la deuda.');
  const d = { id: uid(), creditor, monto, pagado, fecha, tipo: _tipoDeuda, vence, entrada };
  state.payables.push(d);
  if (entrada) state.transactions.push({ id: uid(), type: 'income', amount: monto, cat: 'Préstamo recibido', subcat: 'Préstamo de ' + creditor, cuenta: entrada, esTransferencia: true, deudaId: d.id, date: _fechaDeInput(fecha) });
  save(); closeModal('modal-pagar'); renderAll();
}

// Abonar o liquidar
function abonarPagar(id, liquidar) {
  const p = state.payables.find(x => x.id === id);
  if (!p) return;
  const pendiente = pendienteDeuda(p);
  if (pendiente <= 0.005) return alert('Esta deuda ya está liquidada ✅');
  document.getElementById('abono-deuda-id').value = p.id;
  document.getElementById('abono-deuda-titulo').textContent = (liquidar ? '✅ Liquidar deuda con ' : '💸 Abonar a ') + p.creditor;
  document.getElementById('abono-deuda-pendiente').textContent = 'Te falta pagar ' + fL(pendiente) + '.';
  document.getElementById('abono-deuda-todo').textContent = 'Todo';
  document.getElementById('abono-deuda-monto').value = liquidar ? pendiente.toFixed(2) : '';
  document.getElementById('abono-deuda-interes').value = '';
  const cuenta = document.getElementById('abono-deuda-cuenta');
  cuenta.value = p.entrada || (getCuentaBalance('ahorro') >= pendiente || getCuentaBalance('ahorro') >= getCuentaBalance('efectivo') ? 'ahorro' : 'efectivo');
  _renderAbonoDeuda();
  openModal('modal-abono-deuda');
}
function liquidarDeuda(id) { abonarPagar(id, true); }
function abonoDeudaTodo() {
  const p = state.payables.find(x => x.id === document.getElementById('abono-deuda-id').value);
  if (!p) return;
  document.getElementById('abono-deuda-monto').value = pendienteDeuda(p).toFixed(2);
  _renderAbonoDeuda();
}
function _renderAbonoDeuda() {
  const p = state.payables.find(x => x.id === document.getElementById('abono-deuda-id').value);
  if (!p) return;
  const cuenta = document.getElementById('abono-deuda-cuenta').value;
  const abono = leerMonto(document.getElementById('abono-deuda-monto').value) || 0;
  const interes = leerMonto(document.getElementById('abono-deuda-interes').value) || 0;
  const saldo = getCuentaBalance(cuenta), total = abono + interes, pendiente = pendienteDeuda(p);
  const liquida = abono >= pendiente - 0.005;
  document.getElementById('abono-deuda-btn').textContent = liquida ? '✅ Liquidar deuda' : '💸 Abonar';
  document.getElementById('abono-deuda-resumen').innerHTML =
    'Tu ' + _nombreCuentaDeuda(cuenta) + ' tiene <strong>' + fL(saldo) + '</strong>' +
    (total > 0 ? '; después del pago quedaría en <strong style="color:' + (saldo - total < 0 ? 'var(--red)' : 'var(--text)') + '">' + fL(saldo - total) + '</strong>.' : '.') +
    (abono > 0 ? '<br>' + (liquida ? '🎉 Con esto quedas libre de esta deuda.' : 'Después te faltará ' + fL(pendiente - abono) + '.') : '');
}
function guardarAbonoDeuda() {
  const p = state.payables.find(x => x.id === document.getElementById('abono-deuda-id').value);
  if (!p) return;
  const cuenta = cuentaValida(document.getElementById('abono-deuda-cuenta').value, 'ahorro');
  const pendiente = pendienteDeuda(p);
  let abono = leerMonto(document.getElementById('abono-deuda-monto').value) || 0;
  const interes = leerMonto(document.getElementById('abono-deuda-interes').value) || 0;
  if (!(abono > 0) && !(interes > 0)) return alert('Escribe cuánto vas a abonar.');
  if (abono < 0 || interes < 0) return alert('Los montos no pueden ser negativos.');
  if (abono > pendiente + 0.005 && !confirm('Solo debes ' + fL(pendiente) + '. ¿Abonar solo eso?')) return;
  abono = Math.min(abono, pendiente);
  const total = abono + interes, saldo = getCuentaBalance(cuenta);
  if (total > saldo + 0.005 && !confirm('Tu ' + _nombreCuentaDeuda(cuenta) + ' tiene ' + fL(saldo) + ': con este pago quedaría en ' + fL(saldo - total) + '.\n\n¿Te faltó anotar un ingreso o una transferencia?\n\n[Aceptar] = pagar de todos modos')) return;
  const ahora = new Date().toISOString();
  if (abono > 0) {
    const tx = { id: uid(), type: 'expense', amount: Math.round(abono * 100) / 100, cat: 'Pago Deuda', subcat: 'Pago a ' + p.creditor, cuenta, tipo: 'fijo', deudaId: p.id, date: ahora };
    if (p.entrada) tx.esTransferencia = true;
    state.transactions.push(tx);
    p.pagado = Math.round(((p.pagado || 0) + abono) * 100) / 100;
  }
  if (interes > 0) state.transactions.push({ id: uid(), type: 'expense', amount: Math.round(interes * 100) / 100, cat: 'Intereses', subcat: 'Intereses y cargos · ' + p.creditor, cuenta, tipo: 'fijo', deudaId: p.id, date: ahora });
  const liquidada = pendienteDeuda(p) <= 0.005;
  if (liquidada) p.liquidadaEn = ahora.slice(0, 10);
  save(); closeModal('modal-abono-deuda'); renderAll();
  if (liquidada) alert('🎉 ¡Liquidaste tu deuda con ' + p.creditor + '! Queda guardada en "Liquidadas".');
}

// Vista: dos grupos (bancos y personas) y las liquidadas al final
const _ICONO_EDITAR = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F5C800" stroke-width="2.2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
const _ICONO_BORRAR = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FF4444" stroke-width="2.2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';
function _textoVence(p) {
  if (!p.vence) return '';
  const dias = Math.round((new Date(p.vence + 'T12:00:00') - new Date(new Date().toISOString().slice(0, 10) + 'T12:00:00')) / 864e5);
  if (dias < 0) return '<span style="color:var(--red);font-weight:700">⚠️ Venció hace ' + (-dias) + (dias === -1 ? ' día' : ' días') + '</span>';
  if (dias === 0) return '<span style="color:var(--amber);font-weight:700">⏰ Vence hoy</span>';
  return '<span style="color:' + (dias <= 7 ? 'var(--amber)' : 'var(--text2)') + '">Vence en ' + dias + (dias === 1 ? ' día' : ' días') + '</span>';
}
function _movimientosDeuda(p) {
  return (state.transactions || []).filter(t => !t.deletedAt && t.deudaId === p.id).sort((a, b) => new Date(b.date) - new Date(a.date));
}
function _htmlDeuda(p) {
  const pendiente = pendienteDeuda(p), pct = p.monto > 0 ? Math.min(100, (p.pagado || 0) / p.monto * 100) : 0;
  const movs = _movimientosDeuda(p), id = esc(p.id), vence = _textoVence(p);
  return `<div class="card card-debt deuda-cuenta">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:6px">
      <div style="min-width:0">
        <div style="font-weight:700;font-size:15px;overflow:hidden;text-overflow:ellipsis">${p.tipo === 'banco' ? '🏦' : '👤'} ${esc(p.creditor)}</div>
        <div style="font-size:12px;color:var(--text2)">Debías ${fL(p.monto)} · Pagado ${fL(p.pagado || 0)}</div>
        ${vence ? `<div style="font-size:11px;margin-top:2px">${vence}</div>` : ''}
      </div>
      <div style="font-weight:800;font-size:17px;color:var(--red);white-space:nowrap">-${fL(pendiente)}</div>
    </div>
    <div class="debt-progress"><div class="debt-progress-bar" style="width:${pct}%;background:var(--green)"></div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr auto auto;gap:8px;align-items:center;margin-top:10px">
      <button class="btn btn-secondary" onclick="abonarPagar('${id}')" style="min-height:40px;font-size:13px;margin:0">💸 Abonar</button>
      <button class="btn btn-primary" onclick="liquidarDeuda('${id}')" style="min-height:40px;font-size:13px;margin:0">✅ Liquidar</button>
      <button onclick="editarPagar('${id}')" aria-label="Editar" style="width:40px;height:40px;border-radius:10px;border:1.5px solid rgba(245,200,0,.4);background:rgba(245,200,0,.1);cursor:pointer;display:flex;align-items:center;justify-content:center">${_ICONO_EDITAR}</button>
      <button onclick="eliminarPagar('${id}')" aria-label="Eliminar" style="width:40px;height:40px;border-radius:10px;border:1.5px solid rgba(255,68,68,.4);background:rgba(255,68,68,.1);cursor:pointer;display:flex;align-items:center;justify-content:center">${_ICONO_BORRAR}</button>
    </div>
    ${movs.length ? `<details class="deuda-movs"><summary>Movimientos (${movs.length})</summary>${movs.map(t => `<div class="deuda-mov"><span>${new Date(t.date).toLocaleDateString('es-HN', { day: 'numeric', month: 'short' })} · ${esc(t.cat === 'Préstamo recibido' ? 'Te prestaron' : t.cat === 'Intereses' ? 'Intereses y cargos' : 'Abono')} · ${iconoCuenta(t.cuenta)}</span><strong style="color:${t.type === 'income' ? 'var(--green)' : 'var(--text)'}">${t.type === 'income' ? '+' : '-'}${fL(t.amount)}</strong></div>`).join('')}</details>` : ''}
  </div>`;
}
function renderPagar() {
  const c = document.getElementById('pagar-list');
  if (!c) return;
  const activas = state.payables.filter(deudaActiva), liquidadas = state.payables.filter(p => !deudaActiva(p));
  const tot = document.getElementById('total-pagar');
  if (tot) tot.textContent = fL(activas.reduce((a, p) => a + pendienteDeuda(p), 0));
  if (!state.payables.length) {
    c.innerHTML = `<div class="empty-state-simple"><div class="es-icon">✅</div><div class="es-title">Sin deudas registradas</div><div class="es-sub">Anota lo que le debes a un banco, una financiera o una persona. Verás cuánto te falta y podrás abonar o liquidar desde tus cuentas.</div><button class="btn-empty-secondary" onclick="abrirNuevaDeuda('banco')">🏦 Deuda con un banco</button> <button class="btn-empty-secondary" onclick="abrirNuevaDeuda('persona')">👤 Deuda con una persona</button></div>`;
    return;
  }
  const grupo = (titulo, lista) => {
    if (!lista.length) return '';
    const suma = lista.reduce((a, p) => a + pendienteDeuda(p), 0);
    return `<div class="deuda-grupo"><span>${titulo}</span><strong>-${fL(suma)}</strong></div>` + lista.map(_htmlDeuda).join('');
  };
  c.innerHTML = grupo('🏦 Bancos y financieras', activas.filter(p => p.tipo === 'banco')) +
    grupo('👤 Personas', activas.filter(p => p.tipo !== 'banco')) +
    (activas.length ? '' : '<p style="text-align:center;color:var(--text2);font-size:13px;padding:10px">🎉 No debes nada. ¡Bien hecho!</p>') +
    (liquidadas.length ? `<details class="deuda-liquidadas"><summary>✅ Liquidadas (${liquidadas.length})</summary>${liquidadas.map(p => `<div class="deuda-mov"><span>${p.tipo === 'banco' ? '🏦' : '👤'} ${esc(p.creditor)} · ${fL(p.monto)}${p.liquidadaEn ? ' · ' + new Date(p.liquidadaEn + 'T12:00:00').toLocaleDateString('es-HN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</span><button onclick="eliminarPagar('${esc(p.id)}')" aria-label="Eliminar" style="background:none;border:none;cursor:pointer;padding:4px">${_ICONO_BORRAR}</button></div>`).join('')}</details>` : '');
}
// Casilla roja junto a Efectivo y Ahorro en el Inicio
function renderTileDeudas() {
  const tile = document.getElementById('cuenta-deudas-tile');
  if (!tile) return;
  const total = (state.payables || []).filter(deudaActiva).reduce((a, p) => a + pendienteDeuda(p), 0);
  tile.style.display = total > 0.005 ? '' : 'none';
  document.getElementById('cuenta-deudas-val').textContent = '-' + fL(total);
}

// ========== PRÉSTAMOS ==========
function savePrestamo(){
  const entidad=document.getElementById('prest-entidad').value.trim(),monto=leerMonto(document.getElementById('prest-monto').value);
  const cuotasTotal=parseInt(document.getElementById('prest-cuotas').value),tasa=leerMonto(document.getElementById('prest-tasa').value)||0;
  if(!entidad)return alert('Escribe la entidad del préstamo.');
  if(!(monto>0))return alert('Escribe un monto válido.');
  if(!(cuotasTotal>=1))return alert('Escribe el número de cuotas (1 o más).');
  state.prestamos.push({id:uid(),entidad,monto,tasaInteres:tasa,cuota:Math.round(calculateLoan()*100)/100,cuotasPagadas:0,cuotasTotal});save();closeModal('modal-prestamo');renderAll();
}
// Tasa mensual implícita en (monto, cuota, n): la cuota puede haberse editado
// a mano, así que se deduce de ella en vez de usar la tasa guardada.
function tasaMensualImplicita(monto, cuota, n) {
  if (!(monto > 0) || !(cuota > 0) || !(n >= 1) || cuota * n <= monto + 0.01) return 0;
  const cuotaCon = r => monto * r / (1 - Math.pow(1 + r, -n));
  let lo = 0, hi = 1;
  for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (cuotaCon(mid) > cuota) hi = mid; else lo = mid; }
  return (lo + hi) / 2;
}
function saldoPrestamo(p) {
  const k = p.cuotasPagadas || 0, n = p.cuotasTotal || 0;
  if (n && k >= n) return 0;
  const r = tasaMensualImplicita(p.monto, p.cuota, n);
  const saldo = r === 0 ? p.monto - p.cuota * k
    : p.monto * Math.pow(1 + r, k) - p.cuota * (Math.pow(1 + r, k) - 1) / r;
  return Math.max(0, saldo);
}
function renderPrestamos(){
    const c=document.getElementById('prestamos-list');if(!c)return;
    if(state.prestamos.length===0){c.innerHTML=`<div class="empty-state-simple"><div class="es-icon">🏦</div><div class="es-title">Sin préstamos registrados</div><div class="es-sub">Agrega tus préstamos bancarios para llevar control de cuotas, intereses y saldo.</div><button class="btn-empty-secondary" onclick="openModal('modal-prestamo')">➕ Agregar préstamo</button></div>`;return;}
    let totalPrestado=0;
    c.innerHTML=state.prestamos.map(p=>{
        totalPrestado+=p.monto;
        const cuotasPagadas=p.cuotasPagadas||0,progreso=p.cuotasTotal?(cuotasPagadas/p.cuotasTotal)*100:0,restante=saldoPrestamo(p);
        return `<div class="card card-debt"><div class="debt-header"><div><div class="debt-title">${esc(p.entidad)}</div><div class="debt-meta">Cuota mensual: ${fL(p.cuota)}</div></div><div class="interest-badge">${p.cuotasPagadas||0}/${p.cuotasTotal} pagadas</div></div><div class="debt-progress"><div class="debt-progress-bar" style="width: ${progreso}%; background: var(--blue);"></div></div><div class="debt-stats"><div class="debt-stat"><span>Total Préstamo</span><strong>${fL(p.monto)}</strong></div><div class="debt-stat"><span>Saldo Aprox.</span><strong>${fL(restante)}</strong></div></div><div style="display:grid;grid-template-columns:1fr auto auto;gap:8px;margin-top:10px">
  <button class="btn btn-secondary" onclick=\"pagarCuotaPrestamo('${esc(p.id)}')\"" style="font-size:13px">Registrar Pago (${fL(p.cuota)})</button>
  <button onclick=\"editarPrestamo('${esc(p.id)}')\"" style="width:40px;height:40px;border-radius:10px;border:1.5px solid rgba(245,200,0,.4);background:rgba(245,200,0,.1);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F5C800" stroke-width="2.2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
  </button>
  <button onclick=\"eliminarPrestamo('${esc(p.id)}')\"" style="width:40px;height:40px;border-radius:10px;border:1.5px solid rgba(255,68,68,.4);background:rgba(255,68,68,.1);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FF4444" stroke-width="2.2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
  </button>
</div></div>`;
    }).join('');
    document.getElementById('total-prestamos').textContent=fL(totalPrestado);
}
function pagarCuotaPrestamo(id){
  const prestamo=state.prestamos.find(p=>p.id===id);
  if(!prestamo)return;
  if((prestamo.cuotasPagadas||0)>=(prestamo.cuotasTotal||99))return alert('🎉 ¡Felicidades! Ya terminaste de pagar este préstamo.');
  const cuenta=pedirCuenta(`¿Pagar cuota de ${fL(prestamo.cuota)}?`,'[Aceptar] = desde Cuenta de Ahorro\n[Cancelar] = desde Efectivo');
  if(!cuenta)return;
  prestamo.cuotasPagadas=(prestamo.cuotasPagadas||0)+1;
  state.transactions.push({id:uid(),type:'expense',amount:Math.round(prestamo.cuota*100)/100,cat:'Préstamo',subcat:`Cuota ${prestamo.entidad}`,cuenta,tipo:'fijo',date:new Date().toISOString()});
  const restantes=(prestamo.cuotasTotal||0)-(prestamo.cuotasPagadas||0);
  const msg=restantes<=0?`🎉 ¡Préstamo con ${prestamo.entidad} pagado completamente!`:`✅ Cuota registrada. Quedan ${restantes} cuotas.`;
  save();renderAll();alert(msg);
}

// ========== TARJETAS (MEJORADO) ==========
function saveTarjeta(){
    const nombre=document.getElementById('tc-nombre').value.trim(),corte=parseInt(document.getElementById('tc-corte').value)||1,pago=parseInt(document.getElementById('tc-pago').value)||15,limite=leerMonto(document.getElementById('tc-limite').value)||0,saldo=leerMonto(document.getElementById('tc-saldo').value)||0,tasa=leerMonto(document.getElementById('tc-tasa').value)||48,calcMinimo=document.getElementById('tc-calcular-minimo').checked;
    if(!nombre)return alert('Nombre requerido');
    const ultimos4=(document.getElementById('tc-ultimos4')?.value||'').trim();
    if(ultimos4&&!/^\d{4}$/.test(ultimos4))return alert('Los últimos dígitos deben ser 4 números.');
    state.tarjetas.push({id:uid(),nombre,corte,pago,limite,saldo,saldoBase:saldo,tasaInteres:tasa,calcularMinimo:calcMinimo,historialPagos:[],...(ultimos4?{ultimos4}:{})});
    save();closeModal('modal-tarjeta');renderAll();limpiarFormTarjeta();
}
function limpiarFormTarjeta(){['tc-nombre','tc-ultimos4','tc-corte','tc-pago','tc-limite','tc-saldo','tc-tasa'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});document.getElementById('tc-calcular-minimo').checked=true;}
function renderTarjetas(){
    const container=document.getElementById('tarjetas-list'),resumenContainer=document.getElementById('resumen-pagos-minimos');if(!container)return;
    if(state.tarjetas.length===0){container.innerHTML=`<div class="empty-state-simple"><div class="es-icon">💳</div><div class="es-title">Sin tarjetas registradas</div><div class="es-sub">Agrega tus tarjetas de crédito para monitorear saldos, fechas de corte y pagos mínimos.</div><button class="btn-empty-secondary" onclick="openModal('modal-tarjeta')">➕ Agregar tarjeta</button></div>`;return;}
    let totalDeuda=0,totalPagoMinimo=0,totalCuotasMes=0;
    container.innerHTML=state.tarjetas.map(t=>{
        const comprometido=cupoComprometido(t),cuotasMes=cuotasDelMes(t);
        totalDeuda+=t.saldo+comprometido;
        const pagoMinimo=pagoMinimoTarjeta(t),interesMensual=t.saldo*(t.tasaInteres/100/12);totalPagoMinimo+=pagoMinimo+cuotasMes;totalCuotasMes+=cuotasMes;
        const hoy=new Date().getDate(),estadoCorte=estadoCicloTarjeta(t,hoy);
        return `<div class="card card-credit"><div style="display: flex; justify-content: space-between; align-items: start;"><div><div style="font-weight:700; font-size:16px;">${esc(t.nombre)}${t.ultimos4?` <span style="font-size:12px;color:var(--text2);font-weight:400">•••• ${esc(t.ultimos4)}</span>`:''}</div><div style="font-size:11px; color: var(--text2);">📅 Corte: día ${t.corte} | 📅 Pago: día ${t.pago} <span style="color: ${estadoCorte.startsWith('🔴')?'var(--red)':'var(--green)'}">${estadoCorte}</span></div>${t.ultimaConciliacion?`<div style="font-size:10px;color:var(--text2)">🧾 Conciliada el ${new Date(t.ultimaConciliacion).toLocaleDateString('es-HN')}</div>`:''}</div><div style="text-align: right;"><div style="font-weight: 700; color: var(--red);">${fL(t.saldo)}</div><div style="font-size: 10px;">Límite: ${fL(t.limite)}</div>${t.limite>0&&comprometido>0?`<div style="font-size:10px;color:var(--text2)">Disponible: ${fL(t.limite-Math.max(0,t.saldo)-comprometido)}</div>`:''}</div></div><div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 15px 0; background: var(--bg3); padding: 10px; border-radius: 8px;"><div><span style="font-size: 10px; color: var(--text2);">💸 Interés Est. (${t.tasaInteres}%):</span><span style="display: block; font-weight: 600; color: var(--red);">${fL(interesMensual)} / mes</span></div><div><span style="font-size: 10px; color: var(--text2);">⚠️ ${cuotasMes>0?'Pago del mes':'Pago Mínimo'}:</span><span style="display: block; font-weight: 600;">${fL(pagoMinimo+cuotasMes)}</span>${cuotasMes>0?`<span style="display:block;font-size:10px;color:var(--text2)">mín. ${fL(pagoMinimo)} + cuotas ${fL(cuotasMes)}</span>`:''}</div></div>${avisoCostoReal(t)}${htmlBeneficiosTarjeta(t)}${htmlCuotasTarjeta(t)}<div class="debt-actions"><button class="btn btn-primary" style="padding: 8px;" onclick=\"pagarTarjeta('${esc(t.id)}')\"">💳 Registrar Pago</button><button class="btn btn-secondary" style="padding: 8px;" onclick=\"ajustarSaldoTarjeta('${esc(t.id)}')\"">🧾 Conciliar</button><button class="btn btn-danger" style="padding: 8px;" onclick=\"deleteTarjeta('${esc(t.id)}')\"">🗑️</button></div></div>`;
    }).join('');
    document.getElementById('total-deuda-tc').textContent=fL(totalDeuda);
    if(resumenContainer){
        if(totalPagoMinimo>0){resumenContainer.innerHTML=`<div class="alert-card" style="border-left-color: var(--amber);"><div class="alert-icon">💳</div><div class="alert-content"><div class="alert-title">Pago Mínimo Total Recomendado</div><div class="alert-detail">Para mantener tus tarjetas al día, considera pagar al menos <strong>${fL(totalPagoMinimo)}</strong> este mes${totalCuotasMes>0?` (incluye ${fL(totalCuotasMes)} de cuotas Tasa Cero)`:''}.</div></div></div>`;}
        else{resumenContainer.innerHTML='<p style="font-size:12px; color:var(--text2); text-align:center;">Sin saldos en tarjetas de crédito.</p>';}
    }
}
// ═══ SIMULADOR "EL VERDADERO COSTO" ═══════════════════════════════════
// Mes a mes: se suma el interés y luego se paga. Sin pagoFijo usa la
// regla de pago mínimo de la app (5% del saldo, mínimo L.100).
const SIM_MAX_MESES = 600;
function simularPagoTarjeta(saldo, tasaAnual, pagoFijo) {
  const r = (tasaAnual || 0) / 100 / 12;
  let meses = 0, interes = 0;
  while (saldo > 0.005 && meses < SIM_MAX_MESES) {
    const i = saldo * r;
    const pago = pagoFijo ? pagoFijo : Math.max(saldo * 0.05, 100);
    if (pago <= i) return { meses: Infinity, interes: Infinity, nunca: true };
    interes += i;
    saldo += i - Math.min(pago, saldo + i);
    meses++;
  }
  if (saldo > 0.005) return { meses: Infinity, interes: Infinity, nunca: true };
  return { meses, interes, nunca: false };
}
function cuotaParaSaldarEn(saldo, tasaAnual, meses) {
  const r = (tasaAnual || 0) / 100 / 12;
  return r === 0 ? saldo / meses : saldo * r / (1 - Math.pow(1 + r, -meses));
}
function fmtDuracion(meses) {
  if (meses < 12) return `${meses} ${meses === 1 ? 'mes' : 'meses'}`;
  const a = Math.floor(meses / 12), m = meses % 12;
  return `${a} ${a === 1 ? 'año' : 'años'}` + (m ? ` y ${m} ${m === 1 ? 'mes' : 'meses'}` : '');
}
function avisoCostoReal(t) {
  if (!(t.saldo > 0) || !(t.tasaInteres > 0)) return '';
  const min = simularPagoTarjeta(t.saldo, t.tasaInteres);
  const texto = min.nunca
    ? 'Pagando solo el mínimo <strong>nunca terminas</strong> de pagar esta tarjeta'
    : `Pagando solo el mínimo: <strong>${fmtDuracion(min.meses)}</strong> y <strong>${fL(min.interes)}</strong> en intereses`;
  return `<div style="margin:-5px 0 12px;padding:9px 10px;border-radius:8px;background:rgba(255,68,68,.08);border:1px solid rgba(255,68,68,.3);font-size:12px;display:flex;gap:8px;align-items:center;justify-content:space-between"><span>⚠️ ${texto}</span><button class="btn btn-secondary" style="padding:6px 10px;font-size:11px;width:auto;flex-shrink:0;margin:0" onclick="abrirSimuladorTarjeta('${esc(t.id)}')">🔍 Costo real</button></div>`;
}
let _simTarjetaId = null;
function abrirSimuladorTarjeta(id) {
  const t = state.tarjetas.find(x => x.id === id);
  if (!t) return;
  _simTarjetaId = id;
  document.getElementById('sim-nombre').textContent = `${t.nombre} · Saldo ${fL(t.saldo)} · Tasa ${t.tasaInteres}% anual`;
  const min = simularPagoTarjeta(t.saldo, t.tasaInteres);
  document.getElementById('sim-minimo').innerHTML = min.nunca
    ? 'El pago mínimo no alcanza a bajar la deuda: <strong>nunca terminas de pagar</strong> (más de 50 años).'
    : `Terminas en <strong>${fmtDuracion(min.meses)}</strong> y pagas <strong>${fL(min.interes)}</strong> en intereses.`;
  document.getElementById('sim-pago').value = Math.ceil(cuotaParaSaldarEn(t.saldo, t.tasaInteres, 12)).toFixed(2);
  actualizarSimulador();
  openModal('modal-simulador');
}
function actualizarSimulador() {
  const t = state.tarjetas.find(x => x.id === _simTarjetaId);
  const out = document.getElementById('sim-resultado');
  if (!t || !out) return;
  const pago = leerMonto(document.getElementById('sim-pago').value);
  if (!(pago > 0)) { out.innerHTML = '<span style="color:var(--text2)">Escribe un pago mensual.</span>'; return; }
  const fijo = simularPagoTarjeta(t.saldo, t.tasaInteres, pago);
  if (fijo.nunca) {
    out.innerHTML = `Con ${fL(pago)}/mes <strong style="color:var(--red)">nunca terminas</strong>: el interés del primer mes (${fL(t.saldo * t.tasaInteres / 100 / 12)}) es igual o mayor que tu pago.`;
    return;
  }
  const min = simularPagoTarjeta(t.saldo, t.tasaInteres);
  let ahorro = '';
  if (min.nunca) ahorro = '<br>✅ En vez de no terminar nunca con el mínimo.';
  else if (min.interes - fijo.interes >= 1) ahorro = `<br>✅ Te ahorras <strong style="color:var(--green)">${fL(min.interes - fijo.interes)}</strong> en intereses` + (min.meses > fijo.meses ? ` y ${fmtDuracion(min.meses - fijo.meses)}.` : '.');
  out.innerHTML = `Terminas en <strong>${fmtDuracion(fijo.meses)}</strong> y pagas <strong>${fL(fijo.interes)}</strong> en intereses.${ahorro}`;
}

// ═══ COMPRAS A CUOTAS TASA CERO ═══════════════════════════════════════
function nuevoPlanCuotas(descripcion, total, meses, cuotasPagadas) {
  return { id: uid(), descripcion, total, meses, cuota: Math.round(total / meses * 100) / 100,
           cuotasPagadas: cuotasPagadas || 0, fecha: new Date().toISOString(), ultimoPago: null };
}
const pendientePlan = c => Math.max(0, Math.round((c.total - c.cuota * c.cuotasPagadas) * 100) / 100);
const planActivo = c => c.cuotasPagadas < c.meses && pendientePlan(c) > 0;
// Monto de la próxima cuota (la última ajusta el redondeo)
const montoCuota = c => c.cuotasPagadas >= c.meses - 1 ? pendientePlan(c) : Math.min(c.cuota, pendientePlan(c));
function _mismoMes(iso) {
  if (!iso) return false;
  const d = new Date(iso), h = new Date();
  return d.getFullYear() === h.getFullYear() && d.getMonth() === h.getMonth();
}
function cupoComprometido(t) {
  return (t.cuotas || []).filter(planActivo).reduce((a, c) => a + pendientePlan(c), 0);
}
// Cuotas que faltan por pagar este mes (una por plan, si no se pagó ya)
function cuotasDelMes(t) {
  return (t.cuotas || []).filter(c => planActivo(c) && !_mismoMes(c.ultimoPago)).reduce((a, c) => a + montoCuota(c), 0);
}
// Si el día de pago es menor que el de corte, el pago cae el mes siguiente
// (corte 25, pago 10): el periodo de pago va del 25 al 10, cruzando el mes.
function estadoCicloTarjeta(t, hoy) {
  const cruza = t.pago < t.corte;
  const enPeriodo = cruza ? (hoy >= t.corte || hoy <= t.pago) : (hoy >= t.corte && hoy <= t.pago);
  if (enPeriodo) return '🟡 En periodo de pago';
  const trasPago = cruza ? (hoy > t.pago && hoy < t.corte) : hoy > t.pago;
  return trasPago && t.saldo > 0 ? '🔴 Pago vencido' : '';
}
function pagoMinimoTarjeta(t) {
  return t.calcularMinimo && t.saldo > 0 ? Math.min(t.saldo, Math.max(t.saldo * 0.05, 100)) : 0;
}
// ═══ BENEFICIOS DE TARJETAS: ¿CON CUÁL ME CONVIENE PAGAR? ═══════════════
// Cada tarjeta guarda reglas { id, porcentaje, categoria | comercio, tope }.
// Para una compra aplica la regla más específica (comercio > categoría >
// todas) y, si tiene tope mensual, solo lo que queda del tope de ese mes.
// Los puntos y millas se anotan como su equivalente en %. Las compras a
// cuotas Tasa Cero no cuentan: casi ningún banco da beneficios en ellas.
const _norm = x => _sinAcentos(String(x || '')).trim();
function _prioridadRegla(b, cat, subcat) {
  if (b.comercio) return _norm(subcat).includes(_norm(b.comercio)) || _norm(cat) === _norm(b.comercio) ? 3 : 0;
  if (b.categoria) return _norm(cat) === _norm(b.categoria) ? 2 : 0;
  return 1;
}
function _reglaPara(tc, cat, subcat) {
  let mejor = null, pri = 0;
  (tc.beneficios || []).forEach(b => {
    const p = _prioridadRegla(b, cat, subcat);
    if (p > pri || (p === pri && p > 0 && b.porcentaje > mejor.porcentaje)) { mejor = b; pri = p; }
  });
  return mejor;
}
function textoRegla(b) {
  return b.porcentaje + '% ' + (b.comercio ? 'en ' + b.comercio : b.categoria ? 'en ' + b.categoria : 'en todo') + (b.tope ? ' (tope ' + fL(b.tope) + '/mes)' : '');
}
const _cuentaParaBeneficio = t => t && !t.deletedAt && t.type === 'expense' && !t.esTransferencia && !t.planCuotasId && typeof t.amount === 'number';
// Lo ya ganado en el mes por regla, recorriendo las compras en orden
function _usadoDelMes(tc, fecha, excluirId) {
  const f = new Date(fecha), usado = {};
  state.transactions.filter(t => _cuentaParaBeneficio(t) && String(t.tarjetaId) === String(tc.id) && t.id !== excluirId)
    .filter(t => { const d = new Date(t.date); return d.getFullYear() === f.getFullYear() && d.getMonth() === f.getMonth(); })
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .forEach(t => { const r = beneficioDeCompra(tc, t, usado); if (r.regla) usado[r.regla.id] = (usado[r.regla.id] || 0) + r.ganancia; });
  return usado;
}
/** Lo que devuelve la tarjeta por una compra { cat, subcat, amount }. */
function beneficioDeCompra(tc, compra, usado) {
  const regla = _reglaPara(tc, compra.cat, compra.subcat);
  if (!regla || !(compra.amount > 0)) return { ganancia: 0, regla: null };
  let g = compra.amount * regla.porcentaje / 100;
  if (regla.tope) g = Math.min(g, Math.max(0, regla.tope - ((usado || {})[regla.id] || 0)));
  return { ganancia: Math.round(g * 100) / 100, regla };
}
/** Tarjetas con beneficios, de la que más devuelve a la que menos. */
function recomendarTarjeta(compra, fecha, excluirId) {
  return (state.tarjetas || []).filter(tc => (tc.beneficios || []).length)
    .map(tc => Object.assign({ tarjeta: tc }, beneficioDeCompra(tc, compra, _usadoDelMes(tc, fecha || new Date(), excluirId))))
    .sort((a, b) => b.ganancia - a.ganancia);
}

// Vista previa en el formulario de gasto
function _montoGastoHNL() {
  const monto = parseMonto(document.getElementById('gasto-monto')?.value);
  const moneda = document.getElementById('gasto-moneda')?.value || 'HNL';
  if (!(monto > 0)) return 0;
  if (moneda === 'HNL') return monto;
  const cobrado = parseMonto(document.getElementById('gasto-cobrado')?.value);
  if (cobrado > 0) return cobrado;
  const rate = window.currencyManager && window.currencyManager.getRate(moneda);
  return rate ? monto * rate.ask : 0;
}
function actualizarSugerenciaTarjeta() {
  const el = document.getElementById('gasto-sugerencia-tc');
  if (!el) return;
  const ocultar = () => { el.style.display = 'none'; el.innerHTML = ''; el.dataset.html = ''; };
  const amount = _montoGastoHNL(), cat = document.getElementById('gasto-cat').value, subcat = document.getElementById('gasto-subcat').value;
  if (!amount || document.getElementById('gasto-es-cuotas')?.checked) return ocultar();
  const recs = recomendarTarjeta({ cat, subcat, amount });
  const mejor = recs[0];
  if (!mejor || mejor.ganancia <= 0) return ocultar();
  const cuenta = document.getElementById('gasto-cuenta').value, sel = document.getElementById('gasto-tarjeta').value;
  const nombre = '<strong>' + esc(mejor.tarjeta.nombre) + '</strong>', gana = '~' + fL(mejor.ganancia) + ' (' + esc(textoRegla(mejor.regla)) + ')';
  const boton = '<button type="button" class="btn btn-secondary" onclick="usarTarjetaSugerida(\'' + esc(mejor.tarjeta.id) + '\')">💳 Pagar con ' + esc(mejor.tarjeta.nombre) + '</button>';
  let html;
  if (cuenta === 'credito' && sel === String(mejor.tarjeta.id)) html = '🎁 Buena elección: con ' + nombre + ' te devuelven ' + gana + '.';
  else if (cuenta === 'credito' && sel) {
    const actual = recs.find(r => String(r.tarjeta.id) === sel);
    const dif = mejor.ganancia - (actual ? actual.ganancia : 0);
    if (dif < 0.01) return ocultar();
    html = '💡 Con ' + nombre + ' te devuelven ' + gana + ': ' + fL(dif) + ' más que con la tarjeta elegida.' + boton;
  } else html = '💡 Si pagas con ' + nombre + ' te devuelven ' + gana + '.' + boton;
  // Solo se redibuja si cambió: al tocar el botón, el campo que pierde el foco
  // dispara "change" y reemplazar el botón a mitad del toque lo anularía
  if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
  el.style.display = 'block';
}
function usarTarjetaSugerida(id) {
  document.getElementById('gasto-cuenta').value = 'credito';
  checkCreditCard();
  document.getElementById('gasto-tarjeta').value = id;
  actualizarSugerenciaTarjeta();
}
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('modal-gasto');
  if (!modal) return;
  // Un solo escucha para todos los campos que cambian la recomendación
  ['input', 'change'].forEach(ev => modal.addEventListener(ev, e => {
    if (e.target && ['gasto-monto', 'gasto-moneda', 'gasto-cobrado', 'gasto-cat', 'gasto-subcat', 'gasto-cuenta', 'gasto-tarjeta', 'gasto-es-cuotas'].includes(e.target.id)) actualizarSugerenciaTarjeta();
  }));
});

// Configuración de los beneficios de una tarjeta
let _benefTarjetaId = null;
function abrirBeneficios(id) {
  const tc = state.tarjetas.find(x => x.id === id);
  if (!tc) return;
  _benefTarjetaId = id;
  document.getElementById('benef-tarjeta-nombre').textContent = tc.nombre;
  const nombres = new Set();
  state.transactions.forEach(t => { if (t.type === 'expense' && !t.esTransferencia) { if (t.cat) nombres.add(t.cat); if (t.subcat) nombres.add(t.subcat); } });
  ['Alimentación', 'Transporte', 'Combustible', 'Salud', 'Ocio', 'Compras', 'Vivienda', 'Educación'].forEach(n => nombres.add(n));
  document.getElementById('benef-sugerencias').innerHTML = [...nombres].slice(0, 60).map(n => '<option value="' + esc(n) + '">').join('');
  _renderListaBeneficios();
  openModal('modal-beneficios');
}
function _renderListaBeneficios() {
  const tc = state.tarjetas.find(x => x.id === _benefTarjetaId), el = document.getElementById('benef-lista');
  if (!tc || !el) return;
  const reglas = tc.beneficios || [];
  el.innerHTML = reglas.length ? reglas.map(b => '<div class="benef-regla"><span>🎁 ' + esc(textoRegla(b)) + '</span><button onclick="eliminarBeneficio(\'' + esc(b.id) + '\')" aria-label="Eliminar">✕</button></div>').join('')
    : '<p style="font-size:12px;color:var(--text2)">Todavía no tiene beneficios anotados.</p>';
}
function guardarBeneficio() {
  const tc = state.tarjetas.find(x => x.id === _benefTarjetaId);
  if (!tc) return;
  const porcentaje = parseMonto(document.getElementById('benef-porcentaje').value);
  if (!(porcentaje > 0) || porcentaje > 30) return alert('Escribe el porcentaje que te devuelve, entre 0.1 y 30.');
  const aplica = document.getElementById('benef-aplica').value, valor = document.getElementById('benef-valor').value.trim();
  if (aplica !== 'todo' && !valor) return alert(aplica === 'comercio' ? 'Escribe el comercio.' : 'Escribe la categoría.');
  if (/[<>]/.test(valor)) return alert('El nombre no puede contener < o >.');
  const topeTxt = document.getElementById('benef-tope').value.trim(), tope = topeTxt ? parseMonto(topeTxt) : null;
  if (topeTxt && !(tope > 0)) return alert('El tope debe ser un monto mayor que 0.');
  const b = { id: uid(), porcentaje: Math.round(porcentaje * 100) / 100 };
  if (aplica === 'categoria') b.categoria = valor;
  if (aplica === 'comercio') b.comercio = valor;
  if (tope) b.tope = tope;
  (tc.beneficios = tc.beneficios || []).push(b);
  ['benef-porcentaje', 'benef-valor', 'benef-tope'].forEach(i => document.getElementById(i).value = '');
  save(); renderAll(); _renderListaBeneficios();
}
function eliminarBeneficio(id) {
  const tc = state.tarjetas.find(x => x.id === _benefTarjetaId);
  if (!tc) return;
  tc.beneficios = (tc.beneficios || []).filter(b => b.id !== id);
  save(); renderAll(); _renderListaBeneficios();
}
function htmlBeneficiosTarjeta(t) {
  const reglas = t.beneficios || [];
  return '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin:0 0 12px;font-size:11px;color:var(--text2)">' +
    '<span>' + (reglas.length ? '🎁 ' + reglas.map(b => esc(textoRegla(b))).join(' · ') : '🎁 Sin beneficios anotados') + '</span>' +
    '<button class="btn btn-secondary" style="padding:6px 10px;font-size:11px;width:auto;margin:0;flex-shrink:0" onclick="abrirBeneficios(\'' + esc(t.id) + '\')">' + (reglas.length ? 'Editar' : '➕ Beneficios') + '</button></div>';
}

// Resumen del mes: lo que devolvieron las tarjetas y lo que se dejó de ganar
function resumenBeneficiosMes(year, month) {
  const conBenef = (state.tarjetas || []).filter(tc => (tc.beneficios || []).length);
  const r = { ganado: 0, perdido: 0, mayorPerdida: null, hayBeneficios: conBenef.length > 0 };
  if (!conBenef.length) return r;
  const compras = state.transactions.filter(t => _cuentaParaBeneficio(t) && t.tarjetaId).filter(t => { const d = new Date(t.date); return d.getFullYear() === year && d.getMonth() === month; })
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const usado = {};
  compras.forEach(t => {
    const propia = state.tarjetas.find(tc => String(tc.id) === String(t.tarjetaId));
    const u = usado[t.tarjetaId] = usado[t.tarjetaId] || {};
    const real = propia ? beneficioDeCompra(propia, t, u) : { ganancia: 0 };
    if (real.regla) u[real.regla.id] = (u[real.regla.id] || 0) + real.ganancia;
    r.ganado += real.ganancia;
    // La alternativa se estima con los topes que esa tarjeta ya usó en el mes
    const alt = conBenef.filter(tc => String(tc.id) !== String(t.tarjetaId))
      .map(tc => Object.assign({ tarjeta: tc }, beneficioDeCompra(tc, t, usado[tc.id] || {}))).sort((a, b) => b.ganancia - a.ganancia)[0];
    const dif = alt ? alt.ganancia - real.ganancia : 0;
    if (dif > 0.009) {
      r.perdido += dif;
      if (!r.mayorPerdida || dif > r.mayorPerdida.dif) r.mayorPerdida = { dif, tarjeta: alt.tarjeta.nombre, compra: t.subcat || t.cat };
    }
  });
  r.ganado = Math.round(r.ganado * 100) / 100; r.perdido = Math.round(r.perdido * 100) / 100;
  return r;
}
function renderBeneficiosMes() {
  const card = document.getElementById('beneficios-mes');
  if (!card) return;
  if (!(state.tarjetas || []).length) { card.style.display = 'none'; return; }
  const h = new Date(), r = resumenBeneficiosMes(h.getFullYear(), h.getMonth());
  card.style.display = 'block';
  if (!r.hayBeneficios) {
    card.innerHTML = '<h4 style="margin-bottom:6px">🎁 ¿Con qué tarjeta te conviene pagar?</h4><p style="font-size:12px;color:var(--text2);line-height:1.5">Anota el cashback o los puntos de cada tarjeta con el botón <strong>➕ Beneficios</strong>. Al registrar un gasto, la app te dirá con cuál ganas más.</p>';
    return;
  }
  card.innerHTML = '<h4 style="margin-bottom:6px">🎁 Beneficios de este mes</h4>' +
    '<div style="font-size:13px;line-height:1.6">Tus tarjetas te devuelven <strong style="color:var(--green)">~' + fL(r.ganado) + '</strong>.</div>' +
    (r.perdido > 0 ? '<div style="font-size:12px;color:var(--amber);margin-top:4px;line-height:1.5">Dejaste de ganar ~' + fL(r.perdido) + ' pagando con otra tarjeta' +
      (r.mayorPerdida ? ': en ' + esc(r.mayorPerdida.compra || 'una compra') + ', ' + esc(r.mayorPerdida.tarjeta) + ' te daba ' + fL(r.mayorPerdida.dif) + ' más.' : '.') + '</div>' : '') +
    '<p style="font-size:10px;color:var(--text2);margin-top:6px">Estimado con los beneficios que anotaste; tu banco puede redondear distinto.</p>';
}

function htmlCuotasTarjeta(t) {
  const planes = t.cuotas || [];
  const activos = planes.filter(planActivo);
  const btnNuevo = `<button class="btn btn-secondary" style="padding:6px 10px;font-size:11px;width:auto;margin:0" onclick="abrirModalCuotas('${esc(t.id)}')">➕ Compra a cuotas</button>`;
  if (!planes.length) return `<div style="margin:-4px 0 12px;text-align:right">${btnNuevo}</div>`;
  const filas = planes.map(c => {
    const act = planActivo(c);
    const pct = Math.min(100, c.cuotasPagadas / c.meses * 100);
    const estado = !act ? '✅ Pagada' : _mismoMes(c.ultimoPago) ? '✅ Cuota del mes pagada' : `Próxima cuota: ${fL(montoCuota(c))}`;
    return `<div style="padding:8px 0;border-top:1px solid rgba(255,255,255,.06)">
      <div style="display:flex;justify-content:space-between;gap:8px;font-size:12px"><strong>${esc(c.descripcion || 'Compra a cuotas')}</strong><span style="color:var(--text2)">${c.cuotasPagadas}/${c.meses} · ${fL(c.cuota)}/mes</span></div>
      <div style="height:5px;background:rgba(255,255,255,.08);border-radius:3px;margin:6px 0"><div style="height:100%;width:${pct}%;background:var(--green);border-radius:3px"></div></div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:11px;color:var(--text2)">
        <span>${act ? 'Quedan ' + fL(pendientePlan(c)) + ' · ' : ''}${estado}</span>
        <span style="display:flex;gap:6px;flex-shrink:0">${act ? `<button class="btn btn-primary" style="padding:5px 9px;font-size:11px;width:auto;margin:0" onclick="pagarCuotaTasaCero('${esc(t.id)}','${esc(c.id)}')">Pagar cuota</button>` : ''}<button class="btn btn-danger" style="padding:5px 9px;font-size:11px;width:auto;margin:0" onclick="eliminarPlanCuotas('${esc(t.id)}','${esc(c.id)}')">🗑️</button></span>
      </div></div>`;
  }).join('');
  return `<div style="margin:-4px 0 12px;padding:10px;border-radius:8px;background:var(--bg3)">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:4px">
      <span style="font-size:12px;font-weight:700">🧾 Compras a cuotas Tasa Cero</span>${btnNuevo}</div>
    ${activos.length ? `<div style="font-size:11px;color:var(--text2);margin-bottom:4px">Cupo comprometido: <strong style="color:var(--amber)">${fL(cupoComprometido(t))}</strong> · Cuotas del mes: <strong>${fL(cuotasDelMes(t))}</strong></div>` : ''}
    ${filas}</div>`;
}
let _cuotasTarjetaId = null;
function abrirModalCuotas(tarjetaId) {
  _cuotasTarjetaId = tarjetaId;
  ['cuotas-desc','cuotas-total','cuotas-pagadas'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('cuotas-meses').value = '12';
  openModal('modal-cuotas');
}
function guardarPlanCuotas() {
  const t = state.tarjetas.find(x => x.id === _cuotasTarjetaId);
  if (!t) return;
  const descripcion = document.getElementById('cuotas-desc').value.trim();
  const total = leerMonto(document.getElementById('cuotas-total').value);
  const meses = parseInt(document.getElementById('cuotas-meses').value);
  const pagadas = parseInt(document.getElementById('cuotas-pagadas').value) || 0;
  if (!descripcion) return alert('Escribe qué compraste.');
  if (!(total > 0)) return alert('Escribe el monto total de la compra.');
  if (pagadas < 0 || pagadas >= meses) return alert(`Las cuotas ya pagadas deben ser entre 0 y ${meses - 1}.`);
  (t.cuotas = t.cuotas || []).push(nuevoPlanCuotas(descripcion, total, meses, pagadas));
  save(); closeModal('modal-cuotas'); renderAll();
}
function pagarCuotaTasaCero(tarjetaId, planId) {
  const t = state.tarjetas.find(x => x.id === tarjetaId);
  const c = t && (t.cuotas || []).find(x => x.id === planId);
  if (!c || !planActivo(c)) return;
  const monto = montoCuota(c);
  if (_mismoMes(c.ultimoPago) && !confirm('Ya pagaste una cuota de esta compra este mes. ¿Registrar otra (adelantar)?')) return;
  const cuenta = pedirCuenta(`¿De dónde sale la cuota ${c.cuotasPagadas + 1}/${c.meses} de ${fL(monto)}?`);
  if (!cuenta) return;
  c.cuotasPagadas++;
  c.ultimoPago = new Date().toISOString();
  // La compra ya se registró como gasto: la cuota solo mueve dinero a la tarjeta
  state.transactions.push({ id: uid(), type: 'expense', amount: monto, cat: 'Pago Tarjeta',
    subcat: `Cuota ${c.cuotasPagadas}/${c.meses} · ${c.descripcion}`, pago: cuenta, cuenta, tipo: 'fijo',
    esTransferencia: true, tarjetaId: t.id, planCuotasId: c.id, date: new Date().toISOString() });
  save(); renderAll();
  alert(planActivo(c) ? `✅ Cuota registrada. Quedan ${fL(pendientePlan(c))}.` : `🎉 ¡Terminaste de pagar "${c.descripcion}"!`);
}
function eliminarPlanCuotas(tarjetaId, planId) {
  const t = state.tarjetas.find(x => x.id === tarjetaId);
  const c = t && (t.cuotas || []).find(x => x.id === planId);
  if (!c) return;
  if (!confirm(`¿Eliminar la compra a cuotas "${c.descripcion}"?\n\nNo se borran los gastos ni los pagos ya registrados.`)) return;
  t.cuotas = t.cuotas.filter(x => x.id !== planId);
  save(); renderAll();
}

function pagarTarjeta(id){
    const tarjeta=state.tarjetas.find(t=>t.id===id);if(!tarjeta)return;
    const pagoMinimo=pagoMinimoTarjeta(tarjeta);
    const montoStr=prompt(`Ingresa el monto a abonar a ${tarjeta.nombre}\nSaldo actual: ${fL(tarjeta.saldo)}\nPago mínimo sugerido: ${fL(pagoMinimo)}`,pagoMinimo.toFixed(2));
    if(!montoStr)return;const monto=leerMonto(montoStr);if(isNaN(monto)||monto<=0)return alert('Monto inválido');
    if(monto>tarjeta.saldo){if(!confirm(`Estás pagando ${fL(monto)} pero solo debes ${fL(tarjeta.saldo)}. ¿Deseas dejar la tarjeta con saldo a favor?`))return;}
    const cuenta=pedirCuenta(`¿De dónde sale el pago de ${fL(monto)}?`);
    if(!cuenta)return;
    // La compra con tarjeta ya se registró como gasto: el pago solo mueve
    // dinero de la cuenta a la tarjeta (baja la cuenta, no es un gasto nuevo).
    state.transactions.push({id:uid(),type:'expense',amount:monto,cat:'Pago Tarjeta',subcat:`Pago a ${tarjeta.nombre}`,pago:cuenta,cuenta,tipo:'fijo',esTransferencia:true,tarjetaId:tarjeta.id,date:new Date().toISOString(),notas:`Abono a tarjeta ${tarjeta.nombre}`});
    save();renderAll();alert(`✅ Pago de ${fL(monto)} registrado.\nNuevo saldo de tarjeta: ${fL(tarjeta.saldo)}${tarjeta.saldo<0?' (saldo a favor)':''}`);
}
// Conciliar contra el estado de cuenta: la diferencia no se pierde. Si el
// banco cobra más (seguro de deuda, membresía, comisiones), se registra como
// gasto; si cobra menos, puede ser un pago que no se anotó.
function ajustarSaldoTarjeta(id){
  const t=state.tarjetas.find(x=>x.id===id);if(!t)return;
  recalcularSaldosTarjetas();
  const cuotas=cupoComprometido(t);
  const txt=prompt(`Conciliar ${t.nombre} con tu estado de cuenta\n\nSaldo en la app: ${fL(t.saldo)}${cuotas>0?`\n(sin contar ${fL(cuotas)} de compras a cuotas Tasa Cero)`:''}\n\n¿Qué saldo dice tu estado de cuenta? (usa - para saldo a favor)`,t.saldo.toFixed(2));
  if(txt===null)return;
  const limpio=String(txt).trim(),neg=limpio.startsWith('-'),valor=leerMonto(neg?limpio.slice(1):limpio);
  if(isNaN(valor))return alert('Monto inválido');
  const nuevo=neg?-valor:valor,dif=Math.round((nuevo-t.saldo)*100)/100;
  t.ultimaConciliacion=new Date().toISOString();
  if(dif===0){save();renderAll();return alert('✅ El saldo coincide con tu estado de cuenta.');}
  let registrado=false;
  if(dif>0){
    if(confirm(`El banco cobra ${fL(dif)} más de lo que registraste.\n\n¿Registrarlo como gasto en "Cargos bancarios" (seguro de deuda, membresía, comisiones…)?\n\n[Cancelar] = solo corregir el saldo`)){
      state.transactions.push({id:uid(),type:'expense',amount:dif,cat:'Cargos Bancarios',subcat:`Conciliación ${t.nombre}`,pago:'credito',cuenta:null,tipo:'fijo',tarjetaId:t.id,tarjetaNombre:t.nombre,date:new Date().toISOString()});
      registrado=true;
    }
  }else if(confirm(`El estado de cuenta dice ${fL(-dif)} menos que la app.\n\n¿Es un pago a la tarjeta que no registraste?\n\n[Cancelar] = solo corregir el saldo (reembolso o error)`)){
    const cuenta=pedirCuenta(`¿De dónde salió ese pago de ${fL(-dif)}?`);
    if(!cuenta)return;
    state.transactions.push({id:uid(),type:'expense',amount:-dif,cat:'Pago Tarjeta',subcat:`Pago a ${t.nombre} (conciliación)`,pago:cuenta,cuenta,tipo:'fijo',esTransferencia:true,tarjetaId:t.id,date:new Date().toISOString()});
    registrado=true;
  }
  // El movimiento registrado ya mueve el saldo; si no, la diferencia va a la base
  if(!registrado)t.saldoBase=Math.round((t.saldoBase+dif)*100)/100;
  save();renderAll();alert(`✅ Tarjeta conciliada. Nuevo saldo: ${fL(nuevo)}`);
}
function deleteTarjeta(id){if(confirm('¿Eliminar esta tarjeta? Se perderá el registro.')){state.tarjetas=state.tarjetas.filter(t=>t.id!==id);save();renderAll();}}

// ========== PAGOS RECURRENTES ==========
function savePagoRecurrente(){const servicio=document.getElementById('pago-servicio').value,monto=leerMonto(document.getElementById('pago-monto').value),dia=parseInt(document.getElementById('pago-dia').value);state.pagosRecurrentes.push({id:uid(),servicio,monto,dia,pagado:0});save();closeModal('modal-pago-recurrente');renderAll();}

// ── EDITAR / ELIMINAR COBRAR (dinero que me deben) ──────────
function editarCobrar(id){
  const r=state.receivables.find(x=>x.id===id);if(!r)return;
  const nuevo=prompt(`Editar nombre de "${esc(r.persona)}":`,r.persona);
  if(nuevo===null)return;
  const monto=leerMonto(prompt('Monto total:',r.monto));
  if(isNaN(monto)||monto<=0)return;
  r.persona=nuevo.trim()||r.persona;
  r.monto=monto;
  save();renderAll();
}
function eliminarCobrar(id){
  const r=state.receivables.find(x=>x.id===id);if(!r)return;
  const pendR=fL(r.monto-(r.pagado||0));if(!confirm(`¿Eliminar cobro de "${esc(r.persona)}"?\nPendiente: ${pendR}`))return;
  state.receivables=state.receivables.filter(x=>x.id!==id);
  save();renderAll();
}

// ── EDITAR / ELIMINAR PAGAR (dinero que debo) ────────────────
function editarPagar(id){
  const p=state.payables.find(x=>x.id===id);if(!p)return;
  const nuevo=prompt(`Editar acreedor "${p.creditor}":`,p.creditor);
  if(nuevo===null)return;
  const monto=leerMonto(prompt('Monto total:',p.monto));
  if(isNaN(monto)||monto<=0)return;
  p.creditor=nuevo.trim()||p.creditor;
  p.monto=monto;
  save();renderAll();
}
function eliminarPagar(id){
  const p=state.payables.find(x=>x.id===id);if(!p)return;
  if(!confirm(`¿Eliminar la deuda con "${p.creditor}"?\n\nLos movimientos que ya anotaste se quedan en tu historial.`))return;
  state.payables=state.payables.filter(x=>x.id!==id);
  save();renderAll();
}

// ── EDITAR / ELIMINAR PRÉSTAMOS ──────────────────────────────
function editarPrestamo(id){
  const p=state.prestamos.find(x=>x.id===id);if(!p)return;
  const entidad=prompt('Entidad bancaria:',p.entidad);
  if(entidad===null)return;
  const cuota=leerMonto(prompt('Cuota mensual (L):',p.cuota));
  if(isNaN(cuota)||cuota<=0)return;
  p.entidad=entidad.trim()||p.entidad;
  p.cuota=cuota;
  save();renderAll();
}
function eliminarPrestamo(id){
  const p=state.prestamos.find(x=>x.id===id);if(!p)return;
  if(!confirm(`¿Eliminar préstamo de "${esc(p.entidad)}"?\n\nSe eliminará el registro pero NO se agregarán transacciones de cancelación.`))return;
  state.prestamos=state.prestamos.filter(x=>x.id!==id);
  save();renderAll();
}

// ── EDITAR / ELIMINAR PAGOS RECURRENTES ──────────────────────
function editarRecurrente(id){
  const p=state.pagosRecurrentes.find(x=>x.id===id);if(!p)return;
  const servicio=prompt('Nombre del servicio:',p.servicio);
  if(servicio===null)return;
  const dia=parseInt(prompt('Día de pago (1-31):',p.dia));
  if(isNaN(dia)||dia<1||dia>31)return;
  const monto=leerMonto(prompt('Monto estimado (L):',p.monto||0));
  p.servicio=servicio.trim()||p.servicio;
  p.dia=dia;
  if(!isNaN(monto))p.monto=monto;
  save();renderAll();
}
function eliminarRecurrente(id){
  const p=state.pagosRecurrentes.find(x=>x.id===id);if(!p)return;
  if(!confirm(`¿Eliminar "${esc(p.servicio)}"?`))return;
  state.pagosRecurrentes=state.pagosRecurrentes.filter(x=>x.id!==id);
  save();renderAll();
}
