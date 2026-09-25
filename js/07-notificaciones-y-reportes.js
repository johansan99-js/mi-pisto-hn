// Mi Pisto HN · 07-notificaciones-y-reportes.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.
// ══════════════════════════════════════════════════════════════
// SISTEMA DE NOTIFICACIONES — real con Notification API
// ══════════════════════════════════════════════════════════════
async function solicitarPermisosNotificacion(){
  if(!('Notification' in window)){
    alert('Tu navegador no soporta notificaciones. Instala la app en tu pantalla de inicio para activarlas.');
    return false;
  }
  if(Notification.permission==='granted') return true;
  if(Notification.permission==='denied'){
    alert('Las notificaciones están bloqueadas.\nVe a Ajustes del navegador y permite las notificaciones para esta app.');
    return false;
  }
  const perm=await Notification.requestPermission();
  return perm==='granted';
}

function enviarNotificacion(titulo, cuerpo, icono, extra){
  if(Notification.permission!=='granted')return;
  extra=extra||{};
  try{
    // Si hay service worker activo, usar SW notification (funciona en background)
    if('serviceWorker' in navigator && navigator.serviceWorker.controller){
      navigator.serviceWorker.ready.then(reg=>{
        reg.showNotification(titulo,{
          body: cuerpo,
          icon: './icon-192.png',
          badge: './icon-192.png',
          vibrate: [200,100,200],
          tag: extra.tag || 'mipistohn-alerta',
          renotify: true,
          actions: extra.actions || [],
          data:{ url: extra.url || window.location.href }
        });
      }).catch(()=>{
        new Notification(titulo,{body:cuerpo,icon:'./icon-192.png'});
      });
    } else {
      new Notification(titulo,{body:cuerpo,icon:'./icon-192.png'});
    }
  }catch(e){console.warn('Notif error:',e);}
}

function checkNotificacionesPagos(){
  // Solo ejecutar si hay permisos
  if(Notification.permission!=='granted') return;
  
  const hoy=new Date();
  const diaHoy=hoy.getDate();
  const alertasEnviadas=JSON.parse(localStorage.getItem('alertas_enviadas')||'{}');
  const claveHoy=`${hoy.getFullYear()}-${hoy.getMonth()+1}-${diaHoy}`;
  
  // Revisar pagos recurrentes
  (state.pagosRecurrentes||[]).forEach(p=>{
    const diasRestantes=p.dia>=diaHoy?p.dia-diaHoy:31-diaHoy+p.dia;
    const clave=`rec_${p.id}_${claveHoy}`;
    if(!alertasEnviadas[clave]){
      if(diasRestantes===0){
        enviarNotificacion('💳 ¡Pago vence HOY!',`${esc(p.servicio)} - Día ${p.dia}${p.monto?' (L. '+p.monto+')':''}`,null);
        alertasEnviadas[clave]=true;
      } else if(diasRestantes<=3){
        enviarNotificacion(`⏰ Pago en ${diasRestantes} día${diasRestantes>1?'s':''}`,`${esc(p.servicio)} vence el día ${p.dia}${p.monto?' - L. '+p.monto:''}`,null);
        alertasEnviadas[clave]=true;
      }
    }
  });
  
  // Revisar tarjetas de crédito
  (state.tarjetas||[]).forEach(t=>{
    const diasPago=t.pago>=diaHoy?t.pago-diaHoy:31-diaHoy+t.pago;
    const clave=`tc_${t.id}_${claveHoy}`;
    if(!alertasEnviadas[clave]&&diasPago<=3){
      const pagoMin=Math.max(t.saldo*0.05,100);
      enviarNotificacion(`💳 TC ${esc(t.nombre)} — ${diasPago===0?'¡VENCE HOY!':diasPago+'d restantes'}`,`Saldo: L. ${t.saldo.toLocaleString('es-HN',{minimumFractionDigits:2})} · Pago mín: L. ${pagoMin.toFixed(2)}`,null);
      alertasEnviadas[clave]=true;
    }
  });
  
  // Revisar préstamos (cuotas próximas)
  (state.prestamos||[]).forEach(p=>{
    // Asumimos que la cuota se paga el día 1 de cada mes como estándar
    const diasProxCuota=diaHoy<=5?0:31-diaHoy+1;
    const clave=`prest_${p.id}_${claveHoy}`;
    if(!alertasEnviadas[clave]&&diasProxCuota<=3&&(p.cuotasPagadas||0)<(p.cuotasTotal||99)){
      enviarNotificacion(`🏦 Cuota próxima: ${esc(p.entidad)}`,`L. ${p.cuota.toLocaleString('es-HN',{minimumFractionDigits:2})} · ${p.cuotasPagadas||0}/${p.cuotasTotal} pagadas`,null);
      alertasEnviadas[clave]=true;
    }
  });
  
  localStorage.setItem('alertas_enviadas',JSON.stringify(alertasEnviadas));
  verificarRegistroDiario();
}

async function activarNotificacionesPagos(){
  const ok=await solicitarPermisosNotificacion();
  if(ok){
    localStorage.setItem('notif_activas','true');
    checkNotificacionesPagos();
    // Notificación de confirmación
    setTimeout(()=>{
      enviarNotificacion('✅ Mi Pisto HN — Alertas activas','Recibirás notificaciones antes del vencimiento de tus pagos.',null);
    },500);
    return true;
  }
  return false;
}
function renderPagosRecurrentes(){const c=document.getElementById('pagos-list');if(!c)return;if(state.pagosRecurrentes.length===0){c.innerHTML=`<div class="empty-state-simple"><div class="es-icon">🔔</div><div class="es-title">Sin pagos recurrentes</div><div class="es-sub">Registra tus servicios fijos (agua, luz, internet) y recibe alertas antes de su vencimiento.</div><button class="btn-empty-secondary" onclick="openModal('modal-pago-recurrente')">➕ Agregar servicio</button></div>`;return;}c.innerHTML=state.pagosRecurrentes.map(p=>{
  const hoy=new Date().getDate();
  const diasParaPago=p.dia>=hoy?p.dia-hoy:31-hoy+p.dia;
  const urgente=diasParaPago<=3;
  return `<div class="card card-credit" style="border-left:3px solid ${urgente?'var(--red)':'var(--green)'}">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
      <div style="font-weight:700;font-size:15px">${esc(p.servicio)}</div>
      <span style="font-size:11px;font-weight:700;padding:3px 9px;border-radius:20px;background:${urgente?'rgba(255,68,68,.15)':'rgba(76,175,80,.15)'};color:${urgente?'var(--red)':'var(--green)'}">Día ${p.dia}</span>
    </div>
    <div style="font-size:12px;color:var(--text2);margin-bottom:10px">
      ${p.monto?fL(p.monto):'Sin monto'} · 
      ${_pagadoEsteMes(p)?'<span style="color:var(--green);font-weight:700">✅ Pagado este mes</span>':diasParaPago===0?'<span style="color:var(--red);font-weight:700">¡Hoy vence!</span>':diasParaPago===1?'<span style="color:var(--amber);font-weight:700">Vence mañana</span>':`En ${diasParaPago} días`}
    </div>
    <div style="display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center">
      <button class="btn btn-primary" onclick=\"marcarPagoRecurrente('${esc(p.id)}')\"" style="min-height:40px;font-size:13px${_pagadoEsteMes(p)?';opacity:.6':''}">${_pagadoEsteMes(p)?'✓ Pagado':'✓ Marcar pagado'}</button>
      <button onclick=\"editarRecurrente('${esc(p.id)}')\"" style="width:40px;height:40px;border-radius:10px;border:1.5px solid rgba(245,200,0,.4);background:rgba(245,200,0,.1);cursor:pointer;display:flex;align-items:center;justify-content:center">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F5C800" stroke-width="2.2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button onclick=\"eliminarRecurrente('${esc(p.id)}')\"" style="width:40px;height:40px;border-radius:10px;border:1.5px solid rgba(255,68,68,.4);background:rgba(255,68,68,.1);cursor:pointer;display:flex;align-items:center;justify-content:center">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FF4444" stroke-width="2.2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      </button>
    </div>
  </div>`;}).join('')}
const _pagadoEsteMes = p => { if (!p.ultimoPago) return false; const d = new Date(p.ultimoPago), h = new Date(); return d.getFullYear() === h.getFullYear() && d.getMonth() === h.getMonth(); };
// Antes solo sumaba a p.pagado: no quedaba ningún gasto ni se veía que ya se pagó
function marcarPagoRecurrente(id){
  const p=state.pagosRecurrentes.find(x=>x.id===id);if(!p)return;
  if(_pagadoEsteMes(p)&&!confirm(`Ya registraste el pago de "${p.servicio}" este mes. ¿Registrar otro pago?`))return;
  let monto=p.monto;
  if(!(monto>0)){monto=parseMonto(prompt(`¿Cuánto pagaste de "${p.servicio}"?`));if(!(monto>0))return;}
  const cuenta=confirm(`¿De dónde sale el pago de ${fL(monto)} de "${p.servicio}"?\n\n[Aceptar] = Cuenta de Ahorro\n[Cancelar] = Efectivo`)?'ahorro':'efectivo';
  state.transactions.push({id:uid(),type:'expense',amount:monto,cat:'Servicios',subcat:p.servicio,pago:cuenta,cuenta,tipo:'fijo',pagoRecurrenteId:p.id,date:new Date().toISOString()});
  p.pagado=(p.pagado||0)+monto;p.ultimoPago=new Date().toISOString();
  save();renderAll();
}

// ========== CONCILIACIÓN v2 — ASIENTO COMPENSATORIO (Opción 3) ==========
function previewConciliacion(){
  // P0-4: leer saldo derivado en lugar de snapshot estático
  const cuentaSel=document.getElementById('reconcile-cuenta')?.value||'efectivo';
  const saldoActual=getCuentaBalance(cuentaSel);
  const currentEl=document.getElementById('reconcile-current');
  if(currentEl)currentEl.textContent=fL(saldoActual);
  // parseMonto entiende "1,200.50"; parseFloat cortaba en la coma y dejaba el saldo en 1
  const realInput=parseMonto(document.getElementById('reconcile-balance')?.value);
  const preview=document.getElementById('reconcile-diff-preview');
  const notaWrap=document.getElementById('reconcile-nota-wrap');
  if(!preview)return;
  if(realInput===null){preview.innerHTML='';if(notaWrap)notaWrap.style.display='none';return;}
  const diff=realInput-saldoActual;
  if(Math.abs(diff)<0.01){
    preview.innerHTML=`<span style="color:var(--green)">✅ Saldo exacto — no se necesita ajuste</span>`;
    if(notaWrap)notaWrap.style.display='none';
  } else {
    const tipo=diff>0?'Ingreso':'Gasto';
    const color=diff>0?'var(--green)':'var(--red)';
    const etiqueta=diff>0?'↑ Ajuste positivo (ingreso no registrado)':'↓ Ajuste negativo (gasto no registrado)';
    preview.innerHTML=`<div style="color:${color};font-size:12px;font-weight:700">${etiqueta}</div><div style="font-size:13px;margin-top:4px">Diferencia: <strong style="color:${color}">${diff>0?'+':''}${fL(diff)}</strong></div>`;
    if(notaWrap)notaWrap.style.display='block';
  }
}

function reconcileBalance(){
  // P0-4: leer saldo derivado, no mutamos state.cuentas
  const cuentaSel=document.getElementById('reconcile-cuenta')?.value||'efectivo';
  const cuentaNombre=cuentaSel==='ahorro'?'Cuenta de Ahorro':'Efectivo';
  const saldoActual=getCuentaBalance(cuentaSel);
  const saldoReal=parseMonto(document.getElementById('reconcile-balance')?.value);
  if(saldoReal===null)return alert('Ingresa el saldo real de tu '+cuentaNombre);
  const diff=saldoReal-saldoActual;
  if(Math.abs(diff)<0.01)return alert('✅ El saldo ya está correcto. No se necesita ajuste.');
  const nota=document.getElementById('reconcile-nota')?.value||`Conciliación ${cuentaNombre} — ajuste automático`;
  if(!confirm(`¿Confirmar ajuste de ${cuentaNombre}?\n\nSaldo registrado: ${fL(saldoActual)}\nSaldo real: ${fL(saldoReal)}\nDiferencia: ${fL(diff)}\n\nSe creará un asiento de ${diff>0?'ingreso':'gasto'} por esta diferencia.`))return;
  // Crear transacción de conciliación
  state.transactions.push({
    id:uid(),
    type:diff>0?'income':'expense',
    amount:Math.abs(diff),
    cat:'Conciliación',
    subcat:`Ajuste ${cuentaNombre}`,
    cuenta:cuentaSel,
    nota,
    tipo:'fijo',
    date:new Date().toISOString(),
    esConciliacion:true
  });
  // P0-4: ya NO mutamos state.cuentas — el balance se recalcula desde transactions tras añadir el asiento
  save();renderAll();
  document.getElementById('reconcile-balance').value='';
  document.getElementById('reconcile-diff-preview').innerHTML='';
  if(document.getElementById('reconcile-nota'))document.getElementById('reconcile-nota').value='';
  if(document.getElementById('reconcile-nota-wrap'))document.getElementById('reconcile-nota-wrap').style.display='none';
  alert(`✅ Conciliación completada.\n${cuentaNombre}: ${fL(saldoReal)}`);
}

// Búsqueda simple sobre categoría, comercio/subcategoría, etiqueta, banco,
// categorías de un gasto dividido y el monto (como texto).
function _coincideBusquedaTx(t, query){
    if (!query) return true;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const campos = [t.cat, t.subcat, t.etiqueta, t.banco, String(t.amount)];
    if (Array.isArray(t.splits)) t.splits.forEach(s => campos.push(s.cat));
    return campos.some(c => c && String(c).toLowerCase().includes(q));
}

function renderGastos(){
    // P0-2: ocultar transferencias internas y conciliaciones del listado y del KPI
    const gastos = state.transactions.filter(t => t.type === 'expense' && !t.deletedAt && !t.esTransferencia && !t.esConciliacion);
    // "Este mes": antes sumaba todos los gastos de la historia
    const hoy = new Date();
    const total = gastos.filter(t => { const d = new Date(t.date); return d.getFullYear() === hoy.getFullYear() && d.getMonth() === hoy.getMonth(); }).reduce((a,b) => a + b.amount, 0);
    document.getElementById('gastos-mes').textContent = fL(total);
    const container = document.getElementById('gastos-list');
    if (!container) return;
    const query = document.getElementById('buscar-gastos')?.value || '';
    const gastosFiltrados = gastos.filter(t => _coincideBusquedaTx(t, query));
    if (gastos.length === 0) {
        container.innerHTML = `<div class="empty-state-simple">
          <div class="es-icon">📭</div>
          <div class="es-title">Sin gastos registrados</div>
          <div class="es-sub">Registra tu primer gasto tocando el botón ➕ o escaneando un recibo.</div>
          <button class="btn-empty-secondary" onclick="openModal('modal-gasto')">📝 Registrar gasto</button>
        </div>`; return; }
    if (gastosFiltrados.length === 0) {
        container.innerHTML = `<div class="empty-state-simple">
          <div class="es-icon">🔍</div>
          <div class="es-title">Sin resultados</div>
          <div class="es-sub">Ningún gasto coincide con "${esc(query)}".</div>
        </div>`; return; }
    // Con miles de movimientos, dibujarlos todos tardaba más de medio segundo
    const lista = gastosFiltrados.slice().reverse();
    const visibles = lista.slice(0, _gastosVisibles);
    container.innerHTML = visibles.map(t => {
        const tieneFactura = t.facturaImagenId || t.facturaImagen; // P0-2: IDB o legacy
        const etiqPill = t.etiqueta ? `<span class="etiqueta-pill">#${esc(t.etiqueta)}</span>` : '';
        const concBadge = t.esConciliacion ? `<span class="badge-conciliacion">⚖️</span> ` : '';
        const splitsHtml = (Array.isArray(t.splits) && t.splits.length)
            ? `<div style="font-size:11px;color:var(--text2);margin-top:4px;padding:6px 8px;background:var(--bg3);border-radius:6px">
                 ${t.splits.map(s => `<div style="display:flex;justify-content:space-between"><span>${esc(s.cat)}</span><span>${fL(s.monto)}</span></div>`).join('')}
               </div>`
            : '';
        return `<div class="card" style="padding:14px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
                <div style="flex:1;min-width:0">
                    <div style="font-weight:700;font-size:14px">${concBadge}${esc(t.cat)}${tieneFactura?' 🧾':''}</div>
                    <div style="font-size:11px;color:var(--text2);margin-top:2px">${esc(t.subcat||'')} ${t.banco?'· '+esc(t.banco):''}</div>
                    <div style="font-size:11px;color:var(--text2)">${new Date(t.date).toLocaleDateString('es-HN')}</div>
                    ${etiqPill}
                    ${splitsHtml}
                </div>
                ${renderMontoTx(t, '-', 'var(--red)')}
            </div>
            <div class="tx-actions" style="${tieneFactura?'grid-template-columns:1fr 1fr 1fr':'grid-template-columns:1fr 1fr'}">
                <button class="btn-tx-edit" onclick=\"abrirEdicionTx('${esc(t.id)}')\"">✏️ Editar</button>
                ${tieneFactura?`<button class="btn-tx-edit" style="background:rgba(245,200,0,.15);color:var(--amber);border:1px solid rgba(245,200,0,.3)" onclick=\"verFactura('${esc(t.id)}')\"">🧾 Factura</button>`:''}
                <button class="btn-tx-delete" onclick=\"softDeleteTx('${esc(t.id)}')\"">🗑️ Eliminar</button>
            </div>
        </div>`;
    }).join('') + (lista.length > visibles.length
        ? `<button class="btn btn-secondary" id="btn-mas-gastos" onclick="verMasGastos()">Ver ${Math.min(GASTOS_POR_PAGINA, lista.length - visibles.length)} más (${lista.length - visibles.length} restantes)</button>`
        : '');
}
const GASTOS_POR_PAGINA = 50;
let _gastosVisibles = GASTOS_POR_PAGINA;
function verMasGastos() { _gastosVisibles += GASTOS_POR_PAGINA; renderGastos(); }

function renderIngresos(){
    // P0-2: ocultar transferencias internas y conciliaciones
    const ingresos = state.transactions.filter(t => t.type === 'income' && !t.deletedAt && !t.esTransferencia && !t.esConciliacion);
    document.getElementById('ingreso-salario').textContent = fL(ingresos.reduce((a,b)=>a+b.amount,0));
    const container = document.getElementById('ingresos-list');
    if (!container) return;
    const query = document.getElementById('buscar-ingresos')?.value || '';
    const ingresosFiltrados = ingresos.filter(t => _coincideBusquedaTx(t, query));
    if (ingresos.length === 0) {
        container.innerHTML = `<div class="empty-state-simple">
          <div class="es-icon">💵</div>
          <div class="es-title">Sin ingresos registrados</div>
          <div class="es-sub">Registra tu salario u otro ingreso tocando el botón ➕.</div>
          <button class="btn-empty-secondary" onclick="openModal('modal-ingreso')">💰 Registrar ingreso</button>
        </div>`; return; }
    if (ingresosFiltrados.length === 0) {
        container.innerHTML = `<div class="empty-state-simple">
          <div class="es-icon">🔍</div>
          <div class="es-title">Sin resultados</div>
          <div class="es-sub">Ningún ingreso coincide con "${esc(query)}".</div>
        </div>`; return; }
    container.innerHTML = ingresosFiltrados.slice().reverse().map(t => `
        <div class="card" style="padding:14px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
                <div>
                    <div style="font-weight:700;font-size:14px">${esc(t.cat)}</div>
                    <div style="font-size:11px;color:var(--text2)">${new Date(t.date).toLocaleDateString('es-HN')}</div>
                </div>
                ${renderMontoTx(t, '+', 'var(--green)')}
            </div>
            <div class="tx-actions">
                <button class="btn-tx-edit" onclick=\"abrirEdicionTx('${esc(t.id)}')\"">✏️ Editar</button>
                <button class="btn-tx-delete" onclick=\"softDeleteTx('${esc(t.id)}')\"">🗑️ Eliminar</button>
            </div>
        </div>`).join('');
}

function renderDashboard(){
    // P0-2: KPIs reales — excluyen transferencias internas Y conciliaciones (no son ingresos/gastos genuinos del mes)
    const realTx=state.transactions.filter(t=>!t.deletedAt && !t.esTransferencia && !t.esConciliacion);
    const income=realTx.filter(t=>t.type==='income').reduce((a,b)=>a+b.amount,0);
    const expense=realTx.filter(t=>t.type==='expense').reduce((a,b)=>a+b.amount,0);
    const extra=realTx.filter(t=>t.type==='expense'&&t.tipo==='extra').reduce((a,b)=>a+b.amount,0);
    // Balance global SÍ incluye conciliaciones (ajustes legítimos), pero NO transferencias (son neutras)
    const balanceTx=state.transactions.filter(t=>!t.deletedAt && !t.esTransferencia);
    const balanceIncome=balanceTx.filter(t=>t.type==='income').reduce((a,b)=>a+b.amount,0);
    const balanceExpense=balanceTx.filter(t=>t.type==='expense').reduce((a,b)=>a+b.amount,0);
    const balance=state.saldoInicial+balanceIncome-balanceExpense;
    
    document.getElementById('balance-amount').textContent=fL(balance);
    document.getElementById('balance-amount').style.color=balance>=0?'var(--green)':'var(--red)';
    // P0-4: saldos por cuenta DERIVADOS desde transactions (sin snapshot estático)
    const efEl=document.getElementById('cuenta-efectivo-val');
    const ahEl=document.getElementById('cuenta-ahorro-val');
    if(efEl)efEl.textContent=fL(getCuentaBalance('efectivo'));
    if(ahEl)ahEl.textContent=fL(getCuentaBalance('ahorro'));
    if(typeof renderTileDeudas==='function')renderTileDeudas();
    document.getElementById('balance-status').textContent=income>0?'Basado en tus movimientos':'Esperando movimientos';
    document.getElementById('total-income').textContent=fL(income);
    document.getElementById('total-expense').textContent=fL(expense);
    document.getElementById('total-extra').textContent=fL(extra);
    // Hoy según la fecha local del teléfono (no UTC: en Honduras, UTC-6,
    // lo registrado después de las 6 p. m. caería en "mañana")
    const esHoy=d=>{const x=new Date(d),h=new Date();return x.getFullYear()===h.getFullYear()&&x.getMonth()===h.getMonth()&&x.getDate()===h.getDate();};
    const hoyTx=realTx.filter(t=>esHoy(t.date));
    const cobradoEl=document.getElementById('cobrado-hoy'),pagadoEl=document.getElementById('pagado-hoy');
    if(cobradoEl)cobradoEl.textContent=fL(hoyTx.filter(t=>t.type==='income').reduce((a,b)=>a+b.amount,0));
    if(pagadoEl)pagadoEl.textContent=fL(hoyTx.filter(t=>t.type==='expense').reduce((a,b)=>a+b.amount,0));

    // ── EMPTY STATE: sin movimientos ──
    const recent = state.transactions.filter(t => !t.deletedAt).slice().reverse().slice(0,5);
    const recentEl = document.getElementById('recent-history');
    if (recent.length === 0) {
        recentEl.innerHTML = `
        <div class="empty-state-dashboard">
          <h3>👋 ¡Bienvenido a Mi Pisto HN!</h3>
          <p>Aún no tienes movimientos registrados.<br>Empieza en 3 pasos simples:</p>
          <div class="empty-steps">
            <div class="empty-step">
              <div class="empty-step-num">1</div>
              <div>
                <div class="empty-step-text">Registra tu primer ingreso</div>
                <div class="empty-step-sub">Toca ➕ abajo → "Nuevo Ingreso"</div>
              </div>
            </div>
            <div class="empty-step">
              <div class="empty-step-num">2</div>
              <div>
                <div class="empty-step-text">Agrega un gasto de hoy</div>
                <div class="empty-step-sub">Toca ➕ abajo → "Nuevo Gasto" o escanea un recibo</div>
              </div>
            </div>
            <div class="empty-step">
              <div class="empty-step-num">3</div>
              <div>
                <div class="empty-step-text">Mira tu saldo real</div>
                <div class="empty-step-sub">El dashboard se actualiza automáticamente</div>
              </div>
            </div>
          </div>
          <button class="btn-empty-cta" onclick="toggleFabMenu()">
            ➕ Registrar primer movimiento
          </button>
        </div>`;
    } else {
        recentEl.innerHTML = recent.map(t => {
        const tieneFactura = t.facturaImagenId || t.facturaImagen; // P0-2: IDB o legacy
        const etiqPill = t.etiqueta ? `<span class="etiqueta-pill">#${esc(t.etiqueta)}</span>` : '';
        const splitsHtml = (Array.isArray(t.splits) && t.splits.length)
            ? `<div style="font-size:11px;color:var(--text2);margin-top:4px;padding:6px 8px;background:var(--bg3);border-radius:6px">
                 ${t.splits.map(s => `<div style="display:flex;justify-content:space-between"><span>${esc(s.cat)}</span><span>${fL(s.monto)}</span></div>`).join('')}
               </div>`
            : '';
        return `
        <div style="padding:12px 0;border-bottom:1px solid var(--border)">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
                <div style="flex:1;min-width:0">
                    <div style="font-weight:600">${esc(t.cat)} ${tieneFactura?'🧾':''} ${t.esConciliacion?'<span class="badge-conciliacion">⚖️</span>':''}</div>
                    <div style="font-size:11px;color:var(--text2)">${esc(t.subcat||'')} ${t.banco?'('+esc(t.banco)+')':''}</div>
                    ${etiqPill}
                    ${splitsHtml}
                </div>
                ${renderMontoTx(t, t.type==='income'?'+':'-', t.esConciliacion?(t.type==='income'?'var(--blue)':'var(--purple)'):(t.type==='income'?'var(--green)':'var(--red)'))}
            </div>
            <div class="tx-actions" style="${tieneFactura?'grid-template-columns:1fr 1fr 1fr':'grid-template-columns:1fr 1fr'}">
                <button class="btn-tx-edit" onclick=\"abrirEdicionTx('${esc(t.id)}')\"">✏️ Editar</button>
                ${tieneFactura?`<button class="btn-tx-edit" style="background:rgba(245,200,0,.15);color:var(--amber);border:1px solid rgba(245,200,0,.3)" onclick=\"verFactura('${esc(t.id)}')\"">🧾 Factura</button>`:''}
                <button class="btn-tx-delete" onclick=\"softDeleteTx('${esc(t.id)}')\"">🗑️ Eliminar</button>
            </div>
        </div>
        `;
    }).join('');
    }
    
    renderDashboardGoals();
    updateSurvivalIndex(balance);
    renderDoughnutChart();
}

function renderHistorico() {
    const chartContainer = document.getElementById('history-chart');
    if (!chartContainer) return;
    const meses = {};
    const ahora = new Date();
    for (let i = 5; i >= 0; i--) {
        const fecha = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
        const key = fecha.getFullYear() + '-' + String(fecha.getMonth() + 1).padStart(2, '0');
        const nombreMes = fecha.toLocaleDateString('es-HN', { month: 'short', year: '2-digit' });
        meses[key] = { nombre: nombreMes, ingresos: 0, gastos: 0 };
    }
    state.transactions.forEach(t => {
        if (t.deletedAt) return;
        // P0-2: excluir transferencias internas y conciliaciones del gráfico histórico
        if (t.esTransferencia || t.esConciliacion) return;
        const fecha = new Date(t.date);
        const key = fecha.getFullYear() + '-' + String(fecha.getMonth() + 1).padStart(2, '0');
        if (meses[key]) {
            if (t.type === 'income') meses[key].ingresos += t.amount;
            else if (t.type === 'expense') meses[key].gastos += t.amount;
        }
    });
    let maxValor = 0;
    Object.values(meses).forEach(m => {
        if (m.ingresos > maxValor) maxValor = m.ingresos;
        if (m.gastos > maxValor) maxValor = m.gastos;
    });
    if (maxValor === 0) {
        chartContainer.innerHTML = '<p style="text-align:center;color:var(--text2);padding:20px">Sin datos para mostrar</p>';
        return;
    }
    let html = '';
    Object.values(meses).forEach(mes => {
        const altIngresos = (mes.ingresos / maxValor) * 100;
        const altGastos = (mes.gastos / maxValor) * 100;
        html += '<div class="history-bar">';
        html += '<div style="display:flex;gap:3px;align-items:flex-end;height:100px">';
        html += '<div style="width:8px;height:' + altIngresos + 'px;background:var(--green);border-radius:2px 2px 0 0;min-height:2px" title="Ingresos: L.' + mes.ingresos.toFixed(2) + '"></div>';
        html += '<div style="width:8px;height:' + altGastos + 'px;background:var(--red);border-radius:2px 2px 0 0;min-height:2px" title="Gastos: L.' + mes.gastos.toFixed(2) + '"></div>';
        html += '</div>';
        html += '<span style="font-size:10px;color:var(--text2);margin-top:5px">' + mes.nombre + '</span>';
        html += '</div>';
    });
    chartContainer.innerHTML = html;
    renderCategoryStats();
}

// ── ESTADÍSTICAS POR CATEGORÍA (con tendencia vs. mes anterior) ──
// Distribuye el monto de cada gasto en su(s) categoría(s): si la transacción
// está dividida (splits), cada parte cuenta para su propia categoría en vez
// de imputar todo el monto a una sola.
function getCategoryTotalsForMonth(year, month) {
    const totales = {};
    state.transactions.forEach(t => {
        if (t.deletedAt || t.type !== 'expense' || t.esTransferencia || t.esConciliacion) return;
        const fecha = new Date(t.date);
        if (fecha.getFullYear() !== year || fecha.getMonth() !== month) return;
        if (Array.isArray(t.splits) && t.splits.length) {
            t.splits.forEach(s => {
                const cat = s.cat || 'Sin categoría';
                totales[cat] = (totales[cat] || 0) + s.monto;
            });
        } else {
            const cat = t.cat || 'Sin categoría';
            totales[cat] = (totales[cat] || 0) + t.amount;
        }
    });
    return totales;
}

function poblarSelectorMesCategoria() {
    const sel = document.getElementById('catstats-mes');
    if (!sel) return;
    // Solo repoblar si está vacío (para no perder la selección del usuario en cada render)
    if (sel.options.length) return;
    const ahora = new Date();
    for (let i = 0; i < 12; i++) {
        const fecha = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
        const value = fecha.getFullYear() + '-' + fecha.getMonth();
        const label = fecha.toLocaleDateString('es-HN', { month: 'long', year: 'numeric' });
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = label.charAt(0).toUpperCase() + label.slice(1);
        sel.appendChild(opt);
    }
}

// ═══ RESUMEN MENSUAL ══════════════════════════════════════════════════════
// Todo en lempiras (los gastos en dólares ya se guardan convertidos). Se
// excluyen transferencias entre cuentas y ajustes de conciliación.
const _MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const GASTO_HORMIGA = 150;
function calcularResumenMes(year, month) {
  const del = (y, m) => state.transactions.filter(t => {
    if (t.deletedAt || t.esTransferencia || t.esConciliacion) return false;
    const f = new Date(t.date);
    return f.getFullYear() === y && f.getMonth() === m;
  });
  const suma = (lista, tipo) => lista.filter(t => t.type === tipo).reduce((a, t) => a + t.amount, 0);
  const tx = del(year, month), prev = new Date(year, month - 1, 1);
  const txPrev = del(prev.getFullYear(), prev.getMonth());
  const gastos = suma(tx, 'expense'), ingresos = suma(tx, 'income');
  const gastosPrev = suma(txPrev, 'expense');
  const cats = getCategoryTotalsForMonth(year, month), catsPrev = getCategoryTotalsForMonth(prev.getFullYear(), prev.getMonth());
  const top = Object.keys(cats).sort((a, b) => cats[b] - cats[a]).map(cat => ({ cat, monto: cats[cat], antes: catsPrev[cat] || 0 }));
  const hormiga = tx.filter(t => t.type === 'expense' && t.amount < GASTO_HORMIGA);
  const fijo = tx.filter(t => t.type === 'expense' && t.tipo === 'fijo').reduce((a, t) => a + t.amount, 0);
  const hoy = new Date(), enCurso = year === hoy.getFullYear() && month === hoy.getMonth();
  const dias = enCurso ? hoy.getDate() : new Date(year, month + 1, 0).getDate();
  return {
    year, month, enCurso, movimientos: tx.length, gastos, ingresos, sobrante: ingresos - gastos,
    gastosPrev, hayMesAnterior: txPrev.length > 0, top,
    hormiga: { cantidad: hormiga.length, total: hormiga.reduce((a, t) => a + t.amount, 0) },
    fijo, promedioDiario: dias ? gastos / dias : 0,
    aMetas: state.transactions.filter(t => !t.deletedAt && t.metaId && t.esTransferencia && t.type === 'expense' && (d => d.getFullYear() === year && d.getMonth() === month)(new Date(t.date))).reduce((a, t) => a + t.amount, 0),
  };
}

// Frases con lo importante del mes, de la más a la menos útil
function ideasDelResumen(r) {
  const ideas = [], nombrePrev = _MESES[(r.month + 11) % 12];
  if (r.hayMesAnterior && r.gastosPrev > 0 && !r.enCurso) {
    const d = (r.gastos - r.gastosPrev) / r.gastosPrev * 100;
    if (Math.abs(d) < 3) ideas.push('⚖️ Gastaste casi lo mismo que en ' + nombrePrev + '.');
    else ideas.push((d > 0 ? '📈 Gastaste ' + Math.round(d) + '% más' : '📉 Gastaste ' + Math.round(-d) + '% menos') + ' que en ' + nombrePrev + ' (' + fL(Math.abs(r.gastos - r.gastosPrev)) + (d > 0 ? ' más).' : ' menos).'));
  }
  if (r.ingresos > 0) {
    if (r.sobrante >= 0) ideas.push('💰 Te sobró el ' + Math.round(r.sobrante / r.ingresos * 100) + '% de lo que ganaste: ' + fL(r.sobrante) + '.');
    else ideas.push('⚠️ Gastaste ' + fL(-r.sobrante) + ' más de lo que ganaste. Revisa qué gastos puedes recortar el próximo mes.');
  }
  // La categoría que más creció en lempiras (con un mínimo para no hacer ruido)
  const subida = r.top.filter(c => c.antes > 0 && c.monto - c.antes >= 200).sort((a, b) => (b.monto - b.antes) - (a.monto - a.antes))[0];
  if (subida && !r.enCurso) ideas.push('🔎 ' + subida.cat + ' subió ' + Math.round((subida.monto - subida.antes) / subida.antes * 100) + '%: ' + fL(subida.monto) + ' contra ' + fL(subida.antes) + ' en ' + nombrePrev + '.');
  if (r.hormiga.cantidad >= 5) ideas.push('🐜 Gastos hormiga: ' + r.hormiga.cantidad + ' compras de menos de ' + fL(GASTO_HORMIGA) + ' sumaron ' + fL(r.hormiga.total) + '.');
  const reglas = state.budgetRules || { gastos: 65 };
  if (r.ingresos > 0 && r.fijo > 0) {
    const pct = Math.round(r.fijo / r.ingresos * 100);
    ideas.push('🏠 Tus gastos fijos fueron el ' + pct + '% de tus ingresos' + (pct > reglas.gastos ? ', arriba de tu meta de ' + reglas.gastos + '%.' : ' (tu meta: hasta ' + reglas.gastos + '%).'));
  }
  if (r.aMetas > 0) ideas.push('🎯 Guardaste ' + fL(r.aMetas) + ' en tus metas.');
  const fondo = typeof fondoEmergencia === 'function' && fondoEmergencia();
  if (fondo && !r.enCurso) ideas.push('🛟 Tu fondo de emergencia cubre ' + mesesCubiertos(fondo).toFixed(1) + ' de ' + (fondo.meses || 3) + ' meses de gastos.');
  const benef = resumenBeneficiosMes(r.year, r.month);
  if (benef.ganado >= 1) ideas.push('🎁 Tus tarjetas te devolvieron ~' + fL(benef.ganado) + (benef.perdido >= 20 ? '; con la mejor tarjeta en cada compra ganabas ' + fL(benef.perdido) + ' más.' : '.'));
  else if (benef.perdido >= 20) ideas.push('🎁 Pagando con la tarjeta adecuada en cada compra ganabas ~' + fL(benef.perdido) + '.');
  if (r.enCurso && r.gastos > 0) ideas.push('📆 Vas gastando ' + fL(r.promedioDiario) + ' por día este mes.');
  return ideas;
}

function poblarSelectorResumen() {
  const sel = document.getElementById('resumen-mes');
  if (!sel || sel.options.length) return;
  const ahora = new Date();
  for (let i = 0; i < 12; i++) {
    const f = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
    const opt = document.createElement('option');
    opt.value = f.getFullYear() + '-' + f.getMonth();
    const nombre = _MESES[f.getMonth()];
    opt.textContent = nombre.charAt(0).toUpperCase() + nombre.slice(1) + ' ' + f.getFullYear() + (i === 0 ? ' (en curso)' : '');
    sel.appendChild(opt);
  }
  // Los primeros días del mes lo interesante es el mes que acaba de cerrar
  sel.selectedIndex = ahora.getDate() <= 7 ? 1 : 0;
}

function renderResumenMes() {
  const cuerpo = document.getElementById('resumen-mes-cuerpo');
  if (!cuerpo || !state.setup) return;
  poblarSelectorResumen();
  const [y, m] = document.getElementById('resumen-mes').value.split('-').map(Number);
  const r = calcularResumenMes(y, m);
  if (!r.movimientos) { cuerpo.innerHTML = '<p style="text-align:center;color:var(--text2);font-size:12px;padding:16px 0">No hay movimientos en ' + _MESES[m] + '.</p>'; return; }
  const entero = v => fL(Math.round(v)).replace(/\.00$/, '');
  const cifra = (t, v, color) => '<div class="resumen-cifra" title="' + fL(v) + '"><small>' + t + '</small><strong' + (color ? ' style="color:' + color + '"' : '') + '>' + entero(v) + '</strong></div>';
  const max = r.top.length ? r.top[0].monto : 0;
  const barras = r.top.slice(0, 5).map(c => {
    const pct = r.gastos > 0 ? Math.round(c.monto / r.gastos * 100) : 0;
    return '<div class="resumen-barra" title="' + esc(c.cat) + ': ' + fL(c.monto) + ' (' + pct + '% del gasto)">' +
      '<div class="resumen-barra-top"><span>' + esc(c.cat) + '</span><span>' + fL(c.monto) + ' · ' + pct + '%</span></div>' +
      '<div class="resumen-barra-fondo"><div style="width:' + (max ? c.monto / max * 100 : 0) + '%"></div></div></div>';
  }).join('');
  const ideas = ideasDelResumen(r);
  cuerpo.innerHTML = '<div class="resumen-cifras">' + cifra('GASTASTE', r.gastos) + cifra('GANASTE', r.ingresos) +
      cifra(r.sobrante >= 0 ? 'TE SOBRÓ' : 'TE FALTÓ', Math.abs(r.sobrante), r.sobrante >= 0 ? 'var(--green)' : 'var(--red)') + '</div>' +
    (barras ? '<div style="font-size:11px;color:var(--text2);font-weight:600;margin-bottom:8px">EN QUÉ SE FUE TU PISTO</div>' + barras : '') +
    (ideas.length ? '<ul class="resumen-ideas">' + ideas.map(i => '<li>' + esc(i) + '</li>').join('') + '</ul>' : '');
}

// En la primera semana del mes, el inicio avisa que el resumen del mes pasado está listo
function _mesPasado() { const h = new Date(); const f = new Date(h.getFullYear(), h.getMonth() - 1, 1); return { y: f.getFullYear(), m: f.getMonth(), clave: f.getFullYear() + '-' + f.getMonth() }; }
function renderAvisoResumen() {
  const card = document.getElementById('aviso-resumen');
  if (!card) return;
  const mp = _mesPasado();
  let visto = '';
  try { visto = localStorage.getItem('mph_resumen_visto') || ''; } catch (e) {}
  const r = state.setup && new Date().getDate() <= 7 && visto !== mp.clave ? calcularResumenMes(mp.y, mp.m) : null;
  if (!r || r.movimientos < 3) { card.style.display = 'none'; return; }
  card.style.display = 'block';
  card.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">' +
      '<div><strong style="font-size:14px">🗓️ Tu resumen de ' + _MESES[mp.m] + ' está listo</strong>' +
      '<div style="font-size:12px;color:var(--text2);margin-top:4px">Gastaste ' + fL(r.gastos) + (r.ingresos > 0 ? (r.sobrante >= 0 ? ' y te sobraron ' + fL(r.sobrante) : ' y te faltaron ' + fL(-r.sobrante)) : '') + '.</div></div>' +
      '<button onclick="cerrarAvisoResumen()" aria-label="Cerrar" style="background:none;border:none;color:var(--text2);font-size:16px;cursor:pointer">✕</button></div>' +
    '<button class="btn btn-secondary" onclick="verResumenMesPasado()" style="margin-top:10px">Ver en qué se fue mi pisto →</button>';
}
function cerrarAvisoResumen() {
  try { localStorage.setItem('mph_resumen_visto', _mesPasado().clave); } catch (e) {}
  renderAvisoResumen();
}
function verResumenMesPasado() {
  cerrarAvisoResumen();
  switchView('historico');
  poblarSelectorResumen();
  document.getElementById('resumen-mes').value = _mesPasado().clave;
  renderResumenMes();
  document.getElementById('resumen-mes-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderCategoryStats() {
    const container = document.getElementById('catstats-list');
    if (!container) return;
    poblarSelectorMesCategoria();
    const sel = document.getElementById('catstats-mes');
    const [selYear, selMonth] = (sel.value || '').split('-').map(Number);
    const ahora = new Date();
    const year = Number.isFinite(selYear) ? selYear : ahora.getFullYear();
    const month = Number.isFinite(selMonth) ? selMonth : ahora.getMonth();

    const actual = getCategoryTotalsForMonth(year, month);
    const prevFecha = new Date(year, month - 1, 1);
    const anterior = getCategoryTotalsForMonth(prevFecha.getFullYear(), prevFecha.getMonth());

    const categorias = Object.keys(actual).sort((a, b) => actual[b] - actual[a]);
    const totalMes = categorias.reduce((a, c) => a + actual[c], 0);

    if (categorias.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:var(--text2);padding:20px">Sin gastos registrados este mes</p>';
        return;
    }

    const maxValor = Math.max(...categorias.map(c => actual[c]));
    container.innerHTML = categorias.map(cat => {
        const monto = actual[cat];
        const pct = totalMes ? (monto / totalMes * 100) : 0;
        const barPct = maxValor ? (monto / maxValor * 100) : 0;
        const montoAnterior = anterior[cat] || 0;
        let tendenciaHtml = '<span style="font-size:10px;color:var(--text2)">— sin datos del mes anterior</span>';
        if (montoAnterior > 0) {
            const variacion = ((monto - montoAnterior) / montoAnterior) * 100;
            const subio = variacion > 0.5;
            const bajo = variacion < -0.5;
            const color = subio ? 'var(--red)' : (bajo ? 'var(--green)' : 'var(--text2)');
            const flecha = subio ? '▲' : (bajo ? '▼' : '▬');
            tendenciaHtml = `<span style="font-size:10px;color:${color};font-weight:700">${flecha} ${Math.abs(variacion).toFixed(0)}% vs. mes anterior</span>`;
        }
        return `
        <div style="margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">
            <span style="font-weight:700;font-size:13px">${esc(cat)}</span>
            <span style="font-weight:700;font-size:13px;color:var(--amber)">${fL(monto)} <span style="font-weight:400;color:var(--text2);font-size:11px">(${pct.toFixed(0)}%)</span></span>
          </div>
          <div style="background:var(--bg3);border-radius:6px;height:8px;overflow:hidden">
            <div style="width:${barPct}%;height:100%;background:linear-gradient(90deg,var(--amber),#FF7043);border-radius:6px"></div>
          </div>
          <div style="margin-top:3px">${tendenciaHtml}</div>
        </div>`;
    }).join('');
}
function exportFullReport() {
    try {
        let csv = 'REPORTE FINANCIERO COMPLETO\n';
        csv += 'Cliente: ' + (state.nombre || 'Usuario') + '\n';
        csv += 'Fecha: ' + new Date().toLocaleDateString() + '\n\n';
        const ingresos = state.transactions.filter(t => t.type === 'income' && !t.deletedAt).reduce((a,b) => a+b.amount, 0);
        const gastos = state.transactions.filter(t => t.type === 'expense' && !t.deletedAt).reduce((a,b) => a+b.amount, 0);
        const balance = state.saldoInicial + ingresos - gastos;
        csv += 'RESUMEN\n';
        csv += 'Saldo Inicial,L.' + state.saldoInicial.toFixed(2) + '\n';
        csv += 'Total Ingresos,L.' + ingresos.toFixed(2) + '\n';
        csv += 'Total Gastos,L.' + gastos.toFixed(2) + '\n';
        csv += 'Balance Actual,L.' + balance.toFixed(2) + '\n\n';
        csv += 'TRANSACCIONES\n';
        csv += 'Fecha,Tipo,Categoria,Subcategoria,Monto,Banco/Tarjeta\n';
        const txOrdenadas = state.transactions.filter(t => !t.deletedAt).sort((a, b) => new Date(b.date) - new Date(a.date));
        txOrdenadas.forEach(t => {
            const fecha = new Date(t.date).toLocaleDateString();
            const tipo = t.type === 'income' ? 'INGRESO' : 'GASTO';
            const cat = (t.cat || '').replace(/,/g, ';');
            const subcat = (t.subcat || '').replace(/,/g, ';');
            const monto = t.type === 'income' ? '+' + t.amount.toFixed(2) : '-' + t.amount.toFixed(2);
            const banco = (t.banco || t.tarjetaNombre || '').replace(/,/g, ';');
            csv += fecha + ',' + tipo + ',' + cat + ',' + subcat + ',' + monto + ',' + banco + '\n';
        });
        csv += '\n';
        if (state.receivables && state.receivables.length > 0) {
            csv += 'CUENTAS POR COBRAR\nPersona,Monto Total,Pagado,Pendiente\n';
            state.receivables.forEach(r => {
                const pendiente = r.monto - (r.pagado || 0);
                csv += r.persona + ',' + r.monto.toFixed(2) + ',' + (r.pagado || 0).toFixed(2) + ',' + pendiente.toFixed(2) + '\n';
            });
            csv += '\n';
        }
        if (state.payables && state.payables.length > 0) {
            csv += 'CUENTAS POR PAGAR\nAcreedor,Monto Total,Pagado,Pendiente\n';
            state.payables.forEach(p => {
                const pendiente = p.monto - (p.pagado || 0);
                csv += p.creditor + ',' + p.monto.toFixed(2) + ',' + (p.pagado || 0).toFixed(2) + ',' + pendiente.toFixed(2) + '\n';
            });
            csv += '\n';
        }
        if (state.tarjetas && state.tarjetas.length > 0) {
            csv += 'TARJETAS DE CREDITO\nNombre,Saldo,Limite,Tasa,Dia Corte,Dia Pago\n';
            state.tarjetas.forEach(t => {
                csv += t.nombre + ',' + t.saldo.toFixed(2) + ',' + (t.limite || 0).toFixed(2) + ',' + (t.tasaInteres || 0) + '%,' + t.corte + ',' + t.pago + '\n';
            });
        }
        const BOM = '\uFEFF';
        descargarArchivo(new Blob([BOM + csv], { type: 'text/csv;charset=utf-8' }),
          'Finanzas_' + (state.nombre || 'Usuario') + '_' + todayStr() + '.csv', '✅ Reporte CSV generado');
    } catch (error) {
        alert('❌ Error: ' + error.message);
    }
}
function exportData(){const data=JSON.stringify(state);const a=document.createElement('a');a.href='data:text/json;charset=utf-8,'+encodeURIComponent(data);a.download='backup.json';a.click();}
// ═══════════════════════════════════════════════════════════════════════
// P0-5: CIFRADO REAL con AES-GCM + PBKDF2 (Web Crypto API)
// ─────────────────────────────────────────────────────────────────────
// El antiguo "cifrado XOR" se rompía en segundos: con plaintext conocido
// (todos los backups empiezan con {"setup":...) se recuperaba la contraseña
// directamente. Ahora usamos el mismo patrón que ya empleamos para el hash
// del PIN: PBKDF2 → clave AES-GCM-256.
//
// Helpers de codificación:
function _b64Encode(bytes) {
  let bin = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}
function _b64Decode(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function _deriveBackupKey(password, salt, iterations = 250000) {
  const baseKey = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password),
    { name: 'PBKDF2' }, false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false, ['encrypt', 'decrypt']
  );
}
const BACKUP_KDF_ITER = 600000;

async function exportDataEncriptado() {
  try {
    const password = await pedirContrasenaNube(false, {
      titulo: '💾 Respaldo cifrado',
      intro: 'Crea una contraseña para cifrar el archivo de respaldo (mínimo ' + cloudSync.CLOUD_PASS_MIN + ' caracteres).',
      nota: 'Guárdala fuera del teléfono: sin ella el archivo no se puede abrir.',
    });
    if (!password) return;

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv   = crypto.getRandomValues(new Uint8Array(12));
    const key  = await _deriveBackupKey(password, salt, BACKUP_KDF_ITER);
    const plaintext = new TextEncoder().encode(JSON.stringify(state));
    const cipherBuf = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv }, key, plaintext
    );

    const archivoFinal = {
      version: '2.0',
      tipo: 'mipistohn-aes-gcm',
      algoritmo: 'AES-GCM-256 + PBKDF2-SHA256 (600k iter)',
      iteraciones: BACKUP_KDF_ITER,
      fecha: new Date().toISOString(),
      cliente: state.nombre || 'Usuario',
      salt: _b64Encode(salt),
      iv:   _b64Encode(iv),
      datos: _b64Encode(cipherBuf)
    };
    descargarArchivo(new Blob([JSON.stringify(archivoFinal, null, 2)], { type: 'application/json' }),
      'Backup_MiPistoHN_' + todayStr() + '.json',
      '✅ Respaldo cifrado generado con AES-GCM-256.\n⚠️ NO OLVIDES TU CONTRASEÑA — sin ella el archivo es irrecuperable.');
  } catch (error) {
    console.error('Error al exportar:', error);
    alert('❌ Error al cifrar el respaldo: ' + error.message);
  }
}

async function _descifrarBackupAES(archivo, password) {
  const salt = _b64Decode(archivo.salt);
  const iv   = _b64Decode(archivo.iv);
  const datos = _b64Decode(archivo.datos);
  // Respaldos anteriores no guardaban las iteraciones: usaban 250k
  const iter = Number.isInteger(archivo.iteraciones) && archivo.iteraciones >= 100000 && archivo.iteraciones <= 5000000
    ? archivo.iteraciones : 250000;
  const key  = await _deriveBackupKey(password, salt, iter);
  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv }, key, datos
  );
  return JSON.parse(new TextDecoder().decode(plainBuf));
}

// Compatibilidad hacia atrás: descifrar backups antiguos en formato XOR
function _descifrarBackupXORLegacy(archivo, password) {
  try {
    const cifrado = decodeURIComponent(escape(atob(archivo.datos)));
    let descifrado = '';
    for (let i = 0; i < cifrado.length; i++) {
      descifrado += String.fromCharCode(
        cifrado.charCodeAt(i) ^ password.charCodeAt(i % password.length)
      );
    }
    return JSON.parse(descifrado);
  } catch { return null; }
}
function resetApp(){
  if(!confirm('⚠️ ZONA DE PELIGRO\n\n¿Estás seguro de que deseas BORRAR TODOS tus datos?\n\nEsto eliminará:\n• Todos tus gastos e ingresos\n• Préstamos y tarjetas\n• Metas de ahorro\n• Configuración personal\n\nEsta acción NO se puede deshacer.')) return;
  if(!confirm('¿Confirmas? Se borrará TODO y volverás al tutorial inicial.')) return;
  
  // 1. Limpiar localStorage
  localStorage.clear();
  
  // 2. Limpiar IndexedDB
  try {
    if(window.indexedDB) {
      indexedDB.databases().then(dbs => {
        dbs.forEach(db => indexedDB.deleteDatabase(db.name));
      }).catch(()=>{});
    }
  } catch(e){}
  
  // 3. Limpiar Service Worker caches
  try {
    if('caches' in window) {
      caches.keys().then(keys => {
        keys.forEach(k => caches.delete(k));
      }).catch(()=>{});
    }
  } catch(e){}
  
  // 4. Desregistrar Service Workers
  try {
    if('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(reg => reg.unregister());
      }).catch(()=>{});
    }
  } catch(e){}
  
  // 5. Recargar a la pantalla de onboarding
  setTimeout(() => location.reload(), 300);
}
