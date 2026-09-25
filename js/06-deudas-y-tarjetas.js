// Mi Pisto HN · 06-deudas-y-tarjetas.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.
// ========== COBRAR Y PAGAR (MEJORADO CON FLUJO DE CAJA) ==========
function saveCobrar(){const persona=document.getElementById('cobrar-persona').value.trim(),monto=leerMonto(document.getElementById('cobrar-monto').value),pagado=leerMonto(document.getElementById('cobrar-pagado').value)||0;if(!persona||!monto)return;state.receivables.push({id:uid(),persona,monto,pagado,fecha:document.getElementById('cobrar-fecha').value});save();closeModal('modal-cobrar');renderAll();}
function renderCobrar(){const c=document.getElementById('cobrar-list');if(!c)return;if(state.receivables.length===0){c.innerHTML=`<div class="empty-state-simple"><div class="es-icon">🤝</div><div class="es-title">Nadie te debe dinero</div><div class="es-sub">Registra aquí los préstamos que has hecho a otras personas para llevar el control.</div><button class="btn-empty-secondary" onclick="openModal('modal-cobrar')">➕ Registrar cobro pendiente</button></div>`;return;}c.innerHTML=state.receivables.map(r=>{
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
function renderPagar(){const c=document.getElementById('pagar-list');if(!c)return;if(state.payables.length===0){c.innerHTML=`<div class="empty-state-simple"><div class="es-icon">✅</div><div class="es-title">Sin deudas personales</div><div class="es-sub">Cuando debas dinero a alguien (no a un banco), regístralo aquí para no olvidarlo.</div><button class="btn-empty-secondary" onclick="openModal('modal-pagar')">➕ Registrar deuda personal</button></div>`;return;}c.innerHTML=state.payables.map(p=>{
  const pendiente=p.monto-(p.pagado||0);
  return `<div class="card card-debt">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div>
        <div style="font-weight:700;font-size:15px">${esc(p.creditor)}</div>
        <div style="font-size:12px;color:var(--text2)">Total: ${fL(p.monto)} · Pagado: ${fL(p.pagado||0)}</div>
      </div>
      <div style="font-weight:800;font-size:16px;color:var(--red)">${fL(pendiente)}</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center">
      <button class="btn btn-secondary" onclick=\"abonarPagar('${esc(p.id)}')\"" style="min-height:40px;font-size:13px">Abonar</button>
      <button onclick=\"editarPagar('${esc(p.id)}')\"" style="width:40px;height:40px;border-radius:10px;border:1.5px solid rgba(245,200,0,.4);background:rgba(245,200,0,.1);cursor:pointer;display:flex;align-items:center;justify-content:center">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F5C800" stroke-width="2.2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button onclick=\"eliminarPagar('${esc(p.id)}')\"" style="width:40px;height:40px;border-radius:10px;border:1.5px solid rgba(255,68,68,.4);background:rgba(255,68,68,.1);cursor:pointer;display:flex;align-items:center;justify-content:center">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FF4444" stroke-width="2.2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      </button>
    </div>
  </div>`;}).join('')}
function abonarCobrar(id){
  const r=state.receivables.find(x=>x.id===id);
  if(!r)return;
  const pendiente=r.monto-(r.pagado||0);
  if(pendiente<=0)return alert('Este cobro ya está saldado ✅');
  const m=leerMonto(prompt(`¿Cuánto te pagó ${esc(r.persona)}?\nPendiente: ${fL(pendiente)}`));
  if(!m||m<=0)return;
  const abono=Math.min(m,pendiente);
  r.pagado=(r.pagado||0)+abono;
  state.transactions.push({id:uid(),type:'income',amount:abono,cat:'Cobro Deuda',subcat:`Cobro a ${esc(r.persona)}`,cuenta:'efectivo',date:new Date().toISOString()});
  if(r.pagado>=r.monto){if(confirm(`✅ Cobro saldado. ¿Eliminar el registro de "${esc(r.persona)}"?`)){state.receivables=state.receivables.filter(x=>x.id!==id);}}
  save();renderAll();
}

function savePagar(){const creditor=document.getElementById('pagar-creditor').value.trim(),monto=leerMonto(document.getElementById('pagar-monto').value),pagado=leerMonto(document.getElementById('pagar-pagado').value)||0;if(!creditor||!monto)return;state.payables.push({id:uid(),creditor,monto,pagado,fecha:document.getElementById('pagar-fecha').value});save();closeModal('modal-pagar');renderAll();}
function abonarPagar(id){
  const p=state.payables.find(x=>x.id===id);
  if(!p)return;
  const pendiente=p.monto-(p.pagado||0);
  if(pendiente<=0)return alert('Esta deuda ya está saldada ✅');
  const m=leerMonto(prompt(`¿Cuánto le pagas a ${esc(p.creditor)}?\nPendiente: ${fL(pendiente)}`));
  if(!m||m<=0)return;
  const abono=Math.min(m,pendiente);
  p.pagado=(p.pagado||0)+abono;
  state.transactions.push({id:uid(),type:'expense',amount:abono,cat:'Pago Deuda',subcat:`Pago a ${esc(p.creditor)}`,cuenta:'efectivo',tipo:'fijo',date:new Date().toISOString()});
  if(p.pagado>=p.monto){if(confirm(`✅ Deuda con "${esc(p.creditor)}" saldada. ¿Eliminar el registro?`)){state.payables=state.payables.filter(x=>x.id!==id);}}
  save();renderAll();
}

// ========== PRÉSTAMOS ==========
function savePrestamo(){
  const entidad=document.getElementById('prest-entidad').value.trim(),monto=leerMonto(document.getElementById('prest-monto').value);
  const cuotasTotal=parseInt(document.getElementById('prest-cuotas').value),tasa=leerMonto(document.getElementById('prest-tasa').value)||0;
  if(!entidad)return alert('Escribe la entidad del préstamo.');
  if(!(monto>0))return alert('Escribe un monto válido.');
  if(!(cuotasTotal>=1))return alert('Escribe el número de cuotas (1 o más).');
  state.prestamos.push({id:uid(),entidad,monto,tasaInteres:tasa,cuota:calculateLoan(),cuotasPagadas:0,cuotasTotal});save();closeModal('modal-prestamo');renderAll();
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
  const cuentaOpc=confirm(`¿Pagar cuota de ${fL(prestamo.cuota)}?\n\n[Aceptar] = desde Cuenta de Ahorro\n[Cancelar] = desde Efectivo`);
  const cuenta=cuentaOpc?'ahorro':'efectivo';
  prestamo.cuotasPagadas=(prestamo.cuotasPagadas||0)+1;
  state.transactions.push({id:uid(),type:'expense',amount:prestamo.cuota,cat:'Préstamo',subcat:`Cuota ${prestamo.entidad}`,cuenta,tipo:'fijo',date:new Date().toISOString()});
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
        return `<div class="card card-credit"><div style="display: flex; justify-content: space-between; align-items: start;"><div><div style="font-weight:700; font-size:16px;">${esc(t.nombre)}${t.ultimos4?` <span style="font-size:12px;color:var(--text2);font-weight:400">•••• ${esc(t.ultimos4)}</span>`:''}</div><div style="font-size:11px; color: var(--text2);">📅 Corte: día ${t.corte} | 📅 Pago: día ${t.pago} <span style="color: ${estadoCorte.startsWith('🔴')?'var(--red)':'var(--green)'}">${estadoCorte}</span></div>${t.ultimaConciliacion?`<div style="font-size:10px;color:var(--text2)">🧾 Conciliada el ${new Date(t.ultimaConciliacion).toLocaleDateString('es-HN')}</div>`:''}</div><div style="text-align: right;"><div style="font-weight: 700; color: var(--red);">${fL(t.saldo)}</div><div style="font-size: 10px;">Límite: ${fL(t.limite)}</div>${t.limite>0&&comprometido>0?`<div style="font-size:10px;color:var(--text2)">Disponible: ${fL(t.limite-Math.max(0,t.saldo)-comprometido)}</div>`:''}</div></div><div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 15px 0; background: var(--bg3); padding: 10px; border-radius: 8px;"><div><span style="font-size: 10px; color: var(--text2);">💸 Interés Est. (${t.tasaInteres}%):</span><span style="display: block; font-weight: 600; color: var(--red);">${fL(interesMensual)} / mes</span></div><div><span style="font-size: 10px; color: var(--text2);">⚠️ ${cuotasMes>0?'Pago del mes':'Pago Mínimo'}:</span><span style="display: block; font-weight: 600;">${fL(pagoMinimo+cuotasMes)}</span>${cuotasMes>0?`<span style="display:block;font-size:10px;color:var(--text2)">mín. ${fL(pagoMinimo)} + cuotas ${fL(cuotasMes)}</span>`:''}</div></div>${avisoCostoReal(t)}${htmlCuotasTarjeta(t)}<div class="debt-actions"><button class="btn btn-primary" style="padding: 8px;" onclick=\"pagarTarjeta('${esc(t.id)}')\"">💳 Registrar Pago</button><button class="btn btn-secondary" style="padding: 8px;" onclick=\"ajustarSaldoTarjeta('${esc(t.id)}')\"">🧾 Conciliar</button><button class="btn btn-danger" style="padding: 8px;" onclick=\"deleteTarjeta('${esc(t.id)}')\"">🗑️</button></div></div>`;
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
  const cuenta = confirm(`¿De dónde sale la cuota ${c.cuotasPagadas + 1}/${c.meses} de ${fL(monto)}?\n\n[Aceptar] = Cuenta de Ahorro\n[Cancelar] = Efectivo`) ? 'ahorro' : 'efectivo';
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
    const cuenta=confirm(`¿De dónde sale el pago de ${fL(monto)}?\n\n[Aceptar] = Cuenta de Ahorro\n[Cancelar] = Efectivo`)?'ahorro':'efectivo';
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
    const cuenta=confirm(`¿De dónde salió ese pago de ${fL(-dif)}?\n\n[Aceptar] = Cuenta de Ahorro\n[Cancelar] = Efectivo`)?'ahorro':'efectivo';
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
  const nuevo=prompt(`Editar acreedor "${esc(p.creditor)}":`,p.creditor);
  if(nuevo===null)return;
  const monto=leerMonto(prompt('Monto total:',p.monto));
  if(isNaN(monto)||monto<=0)return;
  p.creditor=nuevo.trim()||p.creditor;
  p.monto=monto;
  save();renderAll();
}
function eliminarPagar(id){
  const p=state.payables.find(x=>x.id===id);if(!p)return;
  if(!confirm(`¿Eliminar deuda con "${esc(p.creditor)}"?`))return;
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
