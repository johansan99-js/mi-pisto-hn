// Mi Pisto HN · 09-saldos-y-sincronizacion.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.
// ========== INICIALIZACIÓN ==========
// P1-7: ELIMINADA esta versión obsoleta de window.onload (era código muerto:
// el archivo asigna window.onload de nuevo más abajo con la versión async + IDB
// + biometría). Mantener dos definiciones inducía bugs latentes.


// ══════════════════════════════════════════════════════════════
//  SALUDO PERSONALIZADO + TOPBAR DESKTOP
// ══════════════════════════════════════════════════════════════
function calcBalance(){
  if(!state.setup)return 0;
  // P0-2: excluir transferencias internas (neutras); las conciliaciones SÍ cuentan en el balance global
  const normal=state.transactions.filter(t=>!t.deletedAt && !t.esTransferencia);
  const income=normal.filter(t=>t.type==='income').reduce((a,b)=>a+b.amount,0);
  const expense=normal.filter(t=>t.type==='expense').reduce((a,b)=>a+b.amount,0);
  return (state.saldoInicial||0)+income-expense;
}

// ═══════════════════════════════════════════════════════════════════════
// P0-4: BALANCE POR CUENTA DERIVADO desde transactions (no almacenado).
// ─────────────────────────────────────────────────────────────────────
// Antes, state.cuentas.efectivo / state.cuentas.ahorro eran "snapshots"
// que sólo se actualizaban en onboarding y conciliación, pero NUNCA en
// saveGasto / saveIngreso. Resultado: el badge de cuenta y el balance
// global divergían con cada movimiento.
//
// Ahora ambos saldos se calculan en tiempo real desde el log de
// transacciones. state.cuentasIniciales guarda los saldos del onboarding
// como punto de partida y NO se muta jamás.
//
// Las transferencias internas SÍ afectan getCuentaBalance porque cambian
// el saldo de cada cuenta individualmente, aunque el balance global sea
// neutral.
// ═══════════════════════════════════════════════════════════════════════
// Versiones anteriores sumaban/restaban cobros, abonos y cuotas en state.cuentas
// además de registrar la transacción, y cuentasIniciales no sobrevivía a la
// recarga: el saldo contaba esos movimientos dos veces. Se reconstruye el saldo
// inicial deshaciendo esas mutaciones (de la más reciente a la más antigua; si
// el Math.max(0) de entonces recortó, se toma el mínimo posible).
function migrarCuentasIniciales() {
  if (!state.setup || state.cuentasInicialesV >= 2) return;
  const c = {
    efectivo: (state.cuentas && typeof state.cuentas.efectivo === 'number') ? state.cuentas.efectivo : 0,
    ahorro:   (state.cuentas && typeof state.cuentas.ahorro   === 'number') ? state.cuentas.ahorro   : 0,
  };
  (state.transactions || [])
    .filter(t => (t.cuenta === 'efectivo' || t.cuenta === 'ahorro') && typeof t.amount === 'number' &&
      ((t.type === 'income' && t.cat === 'Cobro Deuda') ||
       (t.type === 'expense' && (t.cat === 'Pago Deuda' || t.cat === 'Préstamo'))))
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .forEach(t => {
      if (t.type === 'income') c[t.cuenta] -= t.amount;
      else c[t.cuenta] = c[t.cuenta] > 0 ? c[t.cuenta] + t.amount : 0;
    });
  state.cuentasIniciales = c;
  state.cuentasInicialesV = 2;
}

// ═══ SELLOS POR ÍTEM PARA EL MERGE ENTRE DISPOSITIVOS ═══════════════════
// En vez de marcar updatedAt en cada una de las decenas de funciones que
// editan datos, save() compara cada ítem con su huella (_h) del último
// guardado: si cambió, lo sella con la hora. Los ids que desaparecen
// (borrados definitivos) se anotan en state.eliminados para que otro
// dispositivo no los reviva al combinar.
const SYNC_ARRAYS = ['transactions','goals','receivables','payables','prestamos','tarjetas','pagosRecurrentes','transferenciasProgramadas','grupos','presupuestos','misCuentas'];
const ELIMINADOS_MAX_DIAS = 180;
let _idsGuardados = null;

function _huellaItem(it) {
  const { _h, updatedAt, ...resto } = it;
  const txt = JSON.stringify(resto);
  let h = 0x811c9dc5;
  for (let i = 0; i < txt.length; i++) { h ^= txt.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36) + '.' + txt.length.toString(36);
}
// Huella sin sello para ítems que llegan de una versión sin sellos (otro
// dispositivo desactualizado): no deben contar como recién editados.
function _huellaBase(stateObj) {
  SYNC_ARRAYS.forEach(f => (stateObj[f] || []).forEach(it => {
    if (it && typeof it === 'object' && it._h === undefined) it._h = _huellaItem(it);
  }));
}
function _tomarBaseSync() {
  _idsGuardados = {};
  SYNC_ARRAYS.forEach(f => { _idsGuardados[f] = new Set((state[f] || []).map(x => String(x.id))); });
}
function sellarCambios() {
  if (!state.setup) return;
  const ahora = new Date().toISOString();
  const primeraVez = state.sellosV !== 1;
  if (primeraVez) _huellaBase(state);
  SYNC_ARRAYS.forEach(f => (state[f] || []).forEach(it => {
    if (!it || typeof it !== 'object') return;
    const h = _huellaItem(it);
    if (it._h === h) return;
    it._h = h;
    it.updatedAt = ahora;
  }));
  if (!state.eliminados || typeof state.eliminados !== 'object') state.eliminados = {};
  if (_idsGuardados && !primeraVez) {
    SYNC_ARRAYS.forEach(f => {
      const actuales = new Set((state[f] || []).map(x => String(x.id)));
      _idsGuardados[f].forEach(id => { if (!actuales.has(id)) state.eliminados[id] = ahora; });
    });
  }
  const limite = Date.now() - ELIMINADOS_MAX_DIAS * 864e5;
  Object.keys(state.eliminados).forEach(id => { if (Date.parse(state.eliminados[id]) < limite) delete state.eliminados[id]; });
  state.sellosV = 1;
  _tomarBaseSync();
}

// Antes, el pago de tarjeta se registraba como un gasto más (la compra ya lo
// era) y sin cuenta: el balance bajaba dos veces y la cuenta no bajaba.
function migrarPagosTarjeta() {
  (state.transactions || []).forEach(t => {
    if (t.type !== 'expense' || t.cat !== 'Pago Tarjeta' || t.esTransferencia) return;
    t.esTransferencia = true;
    if (!t.cuenta) t.cuenta = t.pago === 'ahorro' ? 'ahorro' : 'efectivo';
  });
}

// ═══ SALDO DE TARJETAS DERIVADO DE LOS MOVIMIENTOS ══════════════════════
// Antes el saldo se sumaba y restaba a mano en cada compra y pago: borrar,
// restaurar o editar una compra no lo tocaba, y al combinar dos teléfonos
// ganaba el saldo de uno solo. Ahora saldo = saldoBase + compras - pagos.
// saldoBase es el saldo inicial más los ajustes de conciliación; las compras
// y cuotas Tasa Cero (planCuotasId) van por su propio plan y no cuentan.
// t.saldo se sigue guardando como copia calculada para el resto del código.
function _movimientosPorTarjeta() {
  const neto = {};
  (state.transactions || []).forEach(t => {
    if (!t || t.deletedAt || !t.tarjetaId || t.planCuotasId || typeof t.amount !== 'number' || t.type !== 'expense') return;
    const id = String(t.tarjetaId);
    if (t.esTransferencia) { if (t.cat === 'Pago Tarjeta') neto[id] = (neto[id] || 0) - t.amount; }
    else neto[id] = (neto[id] || 0) + t.amount;
  });
  return neto;
}
function recalcularSaldosTarjetas() {
  if (!Array.isArray(state.tarjetas) || !state.tarjetas.length) return;
  const neto = _movimientosPorTarjeta(), r2 = n => Math.round(n * 100) / 100;
  state.tarjetas.forEach(tc => {
    const n = neto[String(tc.id)] || 0;
    // Migración: la tarjeta conserva el saldo que tenía y la diferencia queda como base
    if (typeof tc.saldoBase !== 'number' || !isFinite(tc.saldoBase)) tc.saldoBase = r2((Number(tc.saldo) || 0) - n);
    tc.saldo = r2(tc.saldoBase + n);
  });
}

// Datos de versiones anteriores:
// - los abonos a metas eran gastos: pasan a movimiento interno
// - cobros y pagos a personas guardaban el nombre escapado ("José &amp; María")
// - la cuota del préstamo se guardaba con todos los decimales
function migrarDatosViejos() {
  const des = s => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  (state.transactions || []).forEach(t => {
    if (t.type === 'expense' && !t.esTransferencia && (t.metaId || (t.cat === 'Ahorros' && /^Meta: /.test(t.subcat || '')))) t.esTransferencia = true;
    if ((t.cat === 'Cobro Deuda' || t.cat === 'Pago Deuda') && /&(amp|lt|gt|quot|#39);/.test(t.subcat || '')) t.subcat = des(t.subcat);
  });
  (state.prestamos || []).forEach(p => { if (typeof p.cuota === 'number') p.cuota = Math.round(p.cuota * 100) / 100; });
}

function getCuentaBalance(cuenta) {
  // Cuentas en dólares: su saldo en USD a la tasa de compra de hoy (19-cuentas.js)
  if (typeof esCuentaUSD === 'function' && esCuentaUSD(cuenta)) return _c2(saldoUSDCuenta(cuenta) * tasaUSD('bid'));
  // Migración invisible: si el usuario viene de versión vieja, copiar state.cuentas
  if (!state.cuentasIniciales) {
    state.cuentasIniciales = {
      efectivo: (state.cuentas && typeof state.cuentas.efectivo === 'number') ? state.cuentas.efectivo : 0,
      ahorro:   (state.cuentas && typeof state.cuentas.ahorro   === 'number') ? state.cuentas.ahorro   : 0,
    };
  }
  const inicial = state.cuentasIniciales[cuenta] || 0;
  return state.transactions
    .filter(t => !t.deletedAt && t.cuenta === cuenta)
    .reduce((acc, t) => acc + (t.type === 'income' ? t.amount : -t.amount), inicial);
}

function getGreeting(){
  const h=new Date().getHours();
  if(h>=5 && h<12)  return {saludo:'Buenos días',emoji:'🌅'};
  if(h>=12 && h<18) return {saludo:'Buenas tardes',emoji:'☀️'};
  return {saludo:'Buenas noches',emoji:'🌙'};
}

function getMotivationalMsg(nombre, balance){
  const msgs=[
    `Tu economía está en buenas manos, ${nombre}.`,
    `Cada decisión que tomas te acerca a tu libertad financiera.`,
    `El control de tu dinero comienza con información. ¡Y la tienes!`,
    `${nombre}, hoy es un buen día para revisar tus finanzas.`,
    `Quien controla su dinero, controla su futuro.`
  ];
  const day=new Date().getDay();
  return msgs[day % msgs.length];
}

function renderWelcome(){
  if(!state.setup||!state.nombre) return;
  const nombre=state.nombre;
  const {saludo,emoji}=getGreeting();
  const balance=calcBalance();
  const inicial=nombre.charAt(0).toUpperCase();
  
  // ── Actualizar topbar desktop ──
  const dtSub=document.getElementById('dt-greeting-sub');
  const dtName=document.getElementById('dt-greeting-name');
  const dtDate=document.getElementById('dt-date');
  if(dtSub)  dtSub.textContent=`${emoji} ${saludo}`;
  if(dtName) dtName.textContent=nombre;
  if(dtDate){
    const now=new Date();
    const dias=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    const meses=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    dtDate.innerHTML=`<strong style="color:var(--text)">${dias[now.getDay()]}</strong><br>${now.getDate()} de ${meses[now.getMonth()]}`;
  }
  
  // ── Avatar sidebar ──
  const sbAvatar=document.getElementById('sb-avatar');
  if(sbAvatar) sbAvatar.textContent=inicial;
  const sbName=document.getElementById('sb-user-name');
  if(sbName) sbName.textContent=nombre;
  
  // ── Welcome card MÓVIL ──
  const mobileWrap=document.getElementById('mobile-welcome-wrap');
  if(mobileWrap){
    mobileWrap.innerHTML=`
      <div style="
        background:linear-gradient(135deg,var(--bg2),var(--bg3));
        border:1px solid var(--border);
        border-radius:16px;
        padding:18px 16px 14px;
        margin-bottom:14px;
        position:relative;
        overflow:hidden;
      ">
        <!-- Fondo decorativo -->
        <div style="position:absolute;top:-20px;right:-20px;width:100px;height:100px;background:radial-gradient(circle,rgba(var(--amber-rgb),.08),transparent 70%);border-radius:50%;pointer-events:none"></div>
        <div style="position:absolute;bottom:-15px;left:-15px;width:80px;height:80px;background:radial-gradient(circle,rgba(var(--red-rgb),.06),transparent 70%);border-radius:50%;pointer-events:none"></div>

        <div style="display:flex;align-items:center;gap:12px;position:relative">
          <!-- Avatar -->
          <div style="
            width:46px;height:46px;border-radius:50%;flex-shrink:0;
            background:linear-gradient(135deg,var(--red),var(--amber));
            display:flex;align-items:center;justify-content:center;
            font-size:20px;font-weight:900;color:var(--acento-txt);
            box-shadow:0 4px 12px rgba(var(--amber-rgb),.3);
            animation:glowPulse 3s ease-in-out infinite;
          ">${esc(inicial)}</div>
          <!-- Texto -->
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;color:var(--text2);font-weight:500;margin-bottom:1px">${emoji} ${saludo}</div>
            <div style="
              font-size:22px;font-weight:900;letter-spacing:-.5px;
              background:var(--grad-texto);
              -webkit-background-clip:text;-webkit-text-fill-color:transparent;
              background-clip:text;
              line-height:1.1;
              white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
            ">${esc(nombre)}</div>
          </div>
        </div>

        <!-- Frase motivacional -->
        <div style="
          margin-top:10px;
          font-size:11.5px;
          color:var(--text2);
          line-height:1.5;
          font-style:italic;
          border-top:1px solid var(--border);
          padding-top:9px;
        ">"${esc(getMotivationalMsg(nombre, balance))}"</div>
      </div>
    `;
  }
}

// ── Activar sidebar item correcto al switchView ──
function setSidebarActive(id){
  document.querySelectorAll('.sidebar-item').forEach(el=>{
    el.classList.remove('active');
    const icon=el.querySelector('.si-icon');
    if(icon) icon.style.background='';
  });
  const el=document.getElementById(id);
  if(el){
    el.classList.add('active');
  }
}


function openTransferirCuentas(){
  updateTransferPreview();
  openModal('modal-transferir');
}
function updateTransferPreview(){
  // P0-4: lecturas derivadas
  const from=document.getElementById('transfer-from')?.value||'efectivo';
  const to=document.getElementById('transfer-to')?.value||'ahorro';
  const monto=parseMonto(document.getElementById('transfer-monto')?.value)||0;
  const saldoFrom=getCuentaBalance(from);
  const saldoTo=getCuentaBalance(to);
  const fromBal=document.getElementById('transfer-from-bal');
  const toBal=document.getElementById('transfer-to-bal');
  const preview=document.getElementById('transfer-preview');
  if(fromBal)fromBal.textContent=fL(saldoFrom);
  if(toBal)toBal.textContent=fL(saldoTo);
  if(preview&&monto>0){
    if(monto>saldoFrom)preview.innerHTML=`<span style="color:var(--red)">⚠️ Saldo insuficiente en ${nombreCompletoCuenta(infoCuenta(from))}</span>`;
    else preview.innerHTML=`Después: <strong>${nombreCompletoCuenta(infoCuenta(from))}</strong> ${fL(saldoFrom-monto)} → <strong>${nombreCompletoCuenta(infoCuenta(to))}</strong> ${fL(saldoTo+monto)}`;
  }
}
// opts (del registro rápido): { silencioso: sin alerta al terminar, fecha: Date del movimiento }
function ejecutarTransferencia(opts){
  opts=opts||{};
  const fechaTx=(opts.fecha||new Date()).toISOString();
  const from=document.getElementById('transfer-from')?.value||'efectivo';
  const to=document.getElementById('transfer-to')?.value||'ahorro';
  const monto=parseMonto(document.getElementById('transfer-monto')?.value);
  if(!monto||monto<=0)return alert('Ingresa un monto válido');
  if(from===to)return alert('Las cuentas deben ser diferentes');
  // P0-4: validación con saldo derivado
  const saldoDisponible=getCuentaBalance(from);
  if(monto>saldoDisponible)return alert('Saldo insuficiente en '+nombreCompletoCuenta(infoCuenta(from)));
  const fromNom=from==='ahorro'?'Ahorro':nombreCompletoCuenta(infoCuenta(from));
  const toNom=to==='ahorro'?'Ahorro':nombreCompletoCuenta(infoCuenta(to));
  // Registrar como par de transacciones internas — el saldo se recalcula automáticamente
  state.transactions.push({id:uid(),type:'expense',amount:monto,cat:'Transferencia',subcat:`Salida de ${fromNom}`,cuenta:from,tipo:'fijo',date:fechaTx,esTransferencia:true});
  state.transactions.push({id:uid(),type:'income',amount:monto,cat:'Transferencia',subcat:`Entrada a ${toNom}`,cuenta:to,date:fechaTx,esTransferencia:true});
  save();closeModal('modal-transferir');renderAll();
  if(!opts.silencioso)alert(`✅ Transferencia completada.\n${fromNom}: ${fL(getCuentaBalance(from))}\n${toNom}: ${fL(getCuentaBalance(to))}`);
}

// ══════════════════════════════════════════════════════════════
// 🔁 TRANSFERENCIAS PROGRAMADAS (recurrentes entre cuentas)
// ══════════════════════════════════════════════════════════════
function saveTransferenciaProgramada(){
  const nombre = document.getElementById('tprog-nombre').value.trim();
  const monto = parseMonto(document.getElementById('tprog-monto').value);
  const desde = document.getElementById('tprog-desde').value;
  const hasta = document.getElementById('tprog-hasta').value;
  const dia = parseInt(document.getElementById('tprog-dia').value);
  if (!nombre) return alert('Ponle un nombre a la transferencia.');
  if (monto === null || monto <= 0) return alert('Monto inválido.');
  if (desde === hasta) return alert('Las cuentas deben ser diferentes.');
  if (!dia || dia < 1 || dia > 31) return alert('El día del mes debe estar entre 1 y 31.');
  if (!state.transferenciasProgramadas) state.transferenciasProgramadas = [];
  state.transferenciasProgramadas.push({
    id: uid(), nombre, monto, desde, hasta, dia, activa: true, ultimaEjecucion: null
  });
  save();
  closeModal('modal-transferencia-prog');
  ['tprog-nombre','tprog-monto','tprog-dia'].forEach(id => document.getElementById(id).value = '');
  renderAll();
  alert(`✅ "${nombre}" programada para el día ${dia} de cada mes.`);
}

function renderTransferenciasProgramadas(){
  const c = document.getElementById('transferencias-prog-list');
  if (!c) return;
  const lista = state.transferenciasProgramadas || [];
  if (lista.length === 0) {
    c.innerHTML = `<div class="empty-state-simple">
      <div class="es-icon">🔁</div>
      <div class="es-title">Sin transferencias programadas</div>
      <div class="es-sub">Automatiza tu ahorro mensual o el pago de una cuota entre tus cuentas.</div>
      <button class="btn-empty-secondary" onclick="openModal('modal-transferencia-prog')">➕ Programar transferencia</button>
    </div>`;
    return;
  }
  const nombreCuenta = c => c === 'ahorro' ? '🏦 Ahorro' : etiquetaCuenta(c);
  const hoy = new Date();
  c.innerHTML = lista.map(t => {
    let prox = new Date(hoy.getFullYear(), hoy.getMonth(), t.dia);
    if (prox < hoy) prox.setMonth(prox.getMonth()+1);
    const yaEsteMonth = t.ultimaEjecucion === `${hoy.getFullYear()}-${hoy.getMonth()}`;
    const estadoTxt = !t.activa
        ? '<span style="color:var(--text2)">⏸️ Pausada</span>'
        : (yaEsteMonth
            ? `<span style="color:var(--green)">✓ Ya se ejecutó este mes</span>`
            : `<span style="color:var(--amber)">Próxima: día ${t.dia}</span>`);
    return `<div class="card" style="padding:14px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:14px">${esc(t.nombre)}</div>
          <div style="font-size:11px;color:var(--text2);margin-top:2px">${nombreCuenta(t.desde)} → ${nombreCuenta(t.hasta)}</div>
          <div style="font-size:11px;margin-top:4px">${estadoTxt}</div>
        </div>
        <div style="font-size:17px;font-weight:800;color:var(--blue)">${fL(t.monto)}</div>
      </div>
      <div class="tx-actions" style="grid-template-columns:1fr 1fr 1fr">
        <button class="btn-tx-edit" onclick="toggleTransferenciaProgramada('${esc(t.id)}')">${t.activa?'⏸️ Pausar':'▶️ Reactivar'}</button>
        <button class="btn-tx-edit" onclick="ejecutarTransferenciaProgramadaAhora('${esc(t.id)}')">⚡ Ejecutar ahora</button>
        <button class="btn-tx-delete" onclick="eliminarTransferenciaProgramada('${esc(t.id)}')">🗑️ Eliminar</button>
      </div>
    </div>`;
  }).join('');
}

function toggleTransferenciaProgramada(id){
  const t = (state.transferenciasProgramadas||[]).find(x => x.id === id);
  if (!t) return;
  t.activa = !t.activa;
  save(); renderAll();
}

function eliminarTransferenciaProgramada(id){
  const t = (state.transferenciasProgramadas||[]).find(x => x.id === id);
  if (!t) return;
  if (!confirm(`¿Eliminar la transferencia programada "${t.nombre}"?`)) return;
  state.transferenciasProgramadas = state.transferenciasProgramadas.filter(x => x.id !== id);
  save(); renderAll();
}

/** Ejecuta una transferencia (programada o manual desde el botón "Ejecutar ahora")
    y registra el par de transacciones, igual que ejecutarTransferencia(). */
function _ejecutarTransferenciaInterna(desde, hasta, monto, nombre, transferenciaProgramadaId){
  const fromNom = desde === 'ahorro' ? 'Ahorro' : nombreCompletoCuenta(infoCuenta(desde));
  const toNom = hasta === 'ahorro' ? 'Ahorro' : nombreCompletoCuenta(infoCuenta(hasta));
  const meta = transferenciaProgramadaId ? { transferenciaProgramadaId } : {};
  state.transactions.push({id:uid(), type:'expense', amount:monto, cat:'Transferencia', subcat:`${nombre} · Salida de ${fromNom}`, cuenta:desde, tipo:'fijo', date:new Date().toISOString(), esTransferencia:true, ...meta});
  state.transactions.push({id:uid(), type:'income', amount:monto, cat:'Transferencia', subcat:`${nombre} · Entrada a ${toNom}`, cuenta:hasta, date:new Date().toISOString(), esTransferencia:true, ...meta});
}

function ejecutarTransferenciaProgramadaAhora(id){
  const t = (state.transferenciasProgramadas||[]).find(x => x.id === id);
  if (!t) return;
  const saldoDisponible = getCuentaBalance(t.desde);
  if (t.monto > saldoDisponible) return alert(`Saldo insuficiente en ${nombreCompletoCuenta(infoCuenta(t.desde))} para ejecutar "${t.nombre}".`);
  const hoy = new Date();
  _ejecutarTransferenciaInterna(t.desde, t.hasta, t.monto, t.nombre, t.id);
  t.ultimaEjecucion = `${hoy.getFullYear()}-${hoy.getMonth()}`;
  save(); renderAll();
  alert(`✅ "${t.nombre}" ejecutada.`);
}

/** Revisa todas las transferencias programadas activas y ejecuta las que
    ya llegaron a su día del mes y no se han ejecutado todavía este mes. */
function verificarTransferenciasProgramadas(){
  const hoy = new Date();
  const mesActual = `${hoy.getFullYear()}-${hoy.getMonth()}`;
  let ejecutadas = [];
  (state.transferenciasProgramadas||[]).forEach(t => {
    if (!t.activa) return;
    if (t.ultimaEjecucion === mesActual) return;
    if (hoy.getDate() < t.dia) return;
    const saldoDisponible = getCuentaBalance(t.desde);
    if (t.monto > saldoDisponible) return; // se reintenta el próximo día que abra la app
    _ejecutarTransferenciaInterna(t.desde, t.hasta, t.monto, t.nombre, t.id);
    t.ultimaEjecucion = mesActual;
    ejecutadas.push(t.nombre);
  });
  if (ejecutadas.length) {
    save();
    renderAll();
    alert(`🔁 Se ejecutaron ${ejecutadas.length} transferencia(s) programada(s): ${ejecutadas.join(', ')}.`);
  }
}

// Registro del Service Worker (fuera del window.onload, aquí sí va)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
    .then(reg => {
      console.log('✅ Service Worker registrado', reg);
      // P1-10: detectar versión nueva y ofrecer recargar al usuario.
      // Sin esto, el SW viejo sigue sirviendo la app vieja hasta cerrar todas las pestañas.
      reg.addEventListener('updatefound', () => {
        const nuevoSW = reg.installing;
        if (!nuevoSW) return;
        nuevoSW.addEventListener('statechange', () => {
          if (nuevoSW.state === 'installed' && navigator.serviceWorker.controller) {
            // Hay versión nueva esperando a tomar el control
            if (confirm('🆕 Hay una nueva versión de Mi Pisto HN disponible. ¿Actualizar ahora?')) {
              nuevoSW.postMessage({ type: 'SKIP_WAITING' });
              // Cuando el nuevo SW tome control, recargamos
              navigator.serviceWorker.addEventListener('controllerchange', () => {
                window.location.reload();
              }, { once: true });
            }
          }
        });
      });
    })
    .catch(err => console.error('❌ Error al registrar SW:', err));
}


// ========================================================
// ========== MEJORAS CRITICAS v1.1 ==========
// ========================================================

function verificarPINmejorado() {
  const credId = localStorage.getItem(WEBAUTHN_KEY);
  const tienePin = appPIN && appPIN.length > 0;
  _updatePinBioBtn();

  // FIX SEGURIDAD: si hay PIN configurado, SIEMPRE exigir verificación.
  // El antiguo "Recordar PIN 30 días" entraba sin verificar y dependía
  // de que IDB tuviera state plano — eso ya no aplica.
  if (!tienePin) {
    // Sin PIN: flujo libre
    if (!state.setup) document.getElementById('onboarding').style.display = 'flex';
    else renderAll();
    return;
  }

  // Si biometría está configurada, intentarla primero
  if (credId && isWebAuthnAvailable()) {
    _showBioScreen();
    authenticateWithWebAuthn().then(async ok => {
      _setBioResult(ok);
      setTimeout(async () => {
        _hideBioScreen();
        if (ok) {
          // Biometría OK → simular el flujo completo de verificarPIN: descifrar y cargar
          // (esto requiere que el PIN esté guardado o que la biometría libere la DEK
          //  por otro mecanismo; si no, caemos al PIN)
          const tieneSesionPIN = !!_sessionPIN;
          if (tieneSesionPIN) {
            sessionStorage.setItem('pinVerificado','true');
            if (!state.setup) document.getElementById('onboarding').style.display='flex';
            else renderAll();
          } else {
            // Biometría OK pero sin DEK accesible — pedir PIN para descifrar
            document.getElementById('modal-pin').style.display = 'flex';
            document.getElementById('pin-input')?.focus();
          }
        } else {
          // Falló biometría → caer al PIN
          document.getElementById('modal-pin').style.display = 'flex';
          document.getElementById('pin-input')?.focus();
        }
      }, 1000);
    });
    return;
  }

  // Sin biometría: siempre pedir PIN (ignoramos recordarPIN por seguridad)
  document.getElementById('modal-pin').style.display = 'flex';
  document.getElementById('pin-input')?.focus();
}

// ══════════════════════════════════════════════════════════════
// 🔒 DSS05.04 — Bloqueo progresivo tras intentos fallidos de PIN
// ──────────────────────────────────────────────────────────────
// Antes: se podía escribir cualquier PIN, sin límite, cuantas veces se
// quisiera — quien tuviera el celular en la mano podía probar los 10,000
// PINs de 4 dígitos posibles sin ninguna fricción. Ahora, tras 5 fallos
// consecutivos, cada intento adicional exige esperar un tiempo que
// crece exponencialmente (30s, 1min, 2min... hasta un tope de 30min).
// El estado se guarda en localStorage para que el bloqueo sobreviva a
// recargas o cerrar y abrir la app de nuevo.
// ══════════════════════════════════════════════════════════════
const PIN_INTENTOS_KEY = 'pin_intentos_fallidos';
const PIN_BLOQUEO_KEY = 'pin_bloqueo_hasta';
const PIN_INTENTOS_ANTES_DE_BLOQUEAR = 5;

function _estadoBloqueoPIN() {
  const hastaStr = localStorage.getItem(PIN_BLOQUEO_KEY);
  if (!hastaStr) return { bloqueado: false };
  const hasta = parseInt(hastaStr, 10);
  const restanteMs = hasta - Date.now();
  if (!Number.isFinite(hasta) || restanteMs <= 0) {
    localStorage.removeItem(PIN_BLOQUEO_KEY);
    return { bloqueado: false };
  }
  return { bloqueado: true, segundosRestantes: Math.ceil(restanteMs / 1000) };
}

function _registrarIntentoFallidoPIN() {
  const fallos = (parseInt(localStorage.getItem(PIN_INTENTOS_KEY), 10) || 0) + 1;
  localStorage.setItem(PIN_INTENTOS_KEY, String(fallos));
  if (fallos >= PIN_INTENTOS_ANTES_DE_BLOQUEAR) {
    const exceso = fallos - PIN_INTENTOS_ANTES_DE_BLOQUEAR;
    const segundos = Math.min(30 * Math.pow(2, exceso), 30 * 60); // tope 30 min
    localStorage.setItem(PIN_BLOQUEO_KEY, String(Date.now() + segundos * 1000));
  }
}

function _registrarPINCorrecto() {
  localStorage.removeItem(PIN_INTENTOS_KEY);
  localStorage.removeItem(PIN_BLOQUEO_KEY);
}

function _formatoTiempoBloqueo(segundos) {
  if (segundos < 60) return segundos + ' segundos';
  const min = Math.ceil(segundos / 60);
  return min + ' minuto' + (min === 1 ? '' : 's');
}

/** Mientras el modal de PIN esté visible, refresca cada segundo si hay
    un bloqueo activo: deshabilita el botón y muestra la cuenta regresiva;
    lo reactiva automáticamente en cuanto expira. */
function _tickBloqueoPIN() {
  const modal = document.getElementById('modal-pin');
  const btn = document.getElementById('btn-entrar-pin');
  const errEl = document.getElementById('pin-error');
  if (!modal || !btn || !errEl || modal.style.display !== 'flex') return;
  const estado = _estadoBloqueoPIN();
  if (estado.bloqueado) {
    btn.disabled = true;
    btn.style.opacity = '0.5';
    errEl.style.display = 'block';
    errEl.textContent = `🔒 Demasiados intentos. Espera ${_formatoTiempoBloqueo(estado.segundosRestantes)}.`;
  } else {
    btn.disabled = false;
    btn.style.opacity = '';
    if (errEl.textContent.startsWith('🔒')) errEl.style.display = 'none';
  }
}
(typeof window.createInterval === 'function' ? window.createInterval : setInterval)(_tickBloqueoPIN, 1000);

// P0-1: verificarPIN async con comparación de hash PBKDF2
var verificarPINoriginal = null; // ya no se usa, se mantiene por compatibilidad
verificarPIN = async function() {
  const bloqueo = _estadoBloqueoPIN();
  if (bloqueo.bloqueado) {
    const errEl = document.getElementById('pin-error');
    errEl.style.display = 'block';
    errEl.textContent = `🔒 Demasiados intentos. Espera ${_formatoTiempoBloqueo(bloqueo.segundosRestantes)}.`;
    document.getElementById('pin-input').value = '';
    return;
  }
  const intento = document.getElementById('pin-input').value;
  const storedHash = localStorage.getItem('finanzas_pin_hash');
  const storedSaltB64 = localStorage.getItem('finanzas_pin_salt');

  if (!storedHash || !storedSaltB64) {
    // Sin PIN configurado: acceso directo (onboarding inicial)
    sessionStorage.setItem('pinVerificado','true');
    document.getElementById('modal-pin').style.display='none';
    if (!state.setup) document.getElementById('onboarding').style.display='flex';
    else renderAll();
    return;
  }
  
  const salt = Uint8Array.from(atob(storedSaltB64), c => c.charCodeAt(0));
  const intentoHash = await _hashPIN(intento, salt);
  
  if (intentoHash === storedHash) {
    // ✅ PIN correcto
    _registrarPINCorrecto();
    sessionStorage.setItem('pinVerificado','true');
    _sessionPIN = intento; // Guardar PIN en memoria para esta sesión
    
    // ────────────────────────────────────────────────────────────
    // Si existe DEK cifrada, descifrarla con la KEK (derivada del PIN)
    // ────────────────────────────────────────────────────────────
    const dekData = _loadDEKFromStorage();
    
    if (dekData) {
      // Hay DEK cifrada → descifrarla y cargar state cifrado
      const kek = await _kekPIN(intento, salt);
      _sessionDEK = await _decryptDEK(dekData.encrypted, dekData.iv, kek);
      
      if (!_sessionDEK) {
        // Fallo al descifrar DEK (datos corruptos o PIN incorrecto — pero el hash coincidió)
        alert('❌ Error descifrando los datos. Contacta soporte o restaura desde backup.');
        return;
      }
      
      // Descifrar state desde localStorage
      const loaded = await loadAndDecryptState();
      if (!loaded) {
        // No había LS cifrado → cargar desde IDB (usuario que solo tenía IDB)
        if (typeof _completarCargaApp === 'function') {
          await _completarCargaApp();
          document.getElementById('modal-pin').style.display='none';
          document.getElementById('pin-input').value='';
          document.getElementById('pin-error').style.display='none';
          return;
        }
        alert('❌ Error cargando tus datos. Restaura desde backup cifrado.');
        return;
      }
      
      // FIX SEGURIDAD: re-sincronizar IDB con el state descifrado.
      // (Antes IDB tenía una copia plana que se cargaba sin PIN; ahora la
      //  sobreescribimos con los datos descifrados y autoritativos.)
      try { await saveStateToDB(state); } catch(e) { console.warn('Sync IDB tras unlock:', e); }
      
      console.log('🔓 Datos descifrados correctamente');
    } else {
      // No hay DEK cifrada → usuario legacy con state en plano
      // Necesitamos MIGRAR: generar DEK, cifrar state, guardar
      console.log('📦 Migrando usuario legacy a cifrado...');
      // Si el state está vacío (porque no lo cargamos en onload por seguridad),
      // primero hay que cargar desde IDB para tener algo que migrar
      if (!state.setup) {
        try {
          const idbState = await loadStateFromDB();
          if (idbState) {
            Object.keys(state).forEach(key => {
              if (idbState[key] !== undefined) state[key] = idbState[key];
            });
          }
        } catch(e) { console.warn('Carga IDB pre-migración:', e); }
      }
      await _migrarStatePlanoACifrado(intento, salt);
    }
    _convertirFacturas(true).then(n => { if (n) console.log('🔐 ' + n + ' facturas cifradas'); });
    // Subir a parámetros v2 una sola vez, ya con el PIN verificado
    if (_sessionDEK && localStorage.getItem('finanzas_pin_kdf') !== 'v2') {
      try { await _guardarPINv2(intento, salt, _sessionDEK); console.log('🔐 PIN actualizado a 600k iteraciones'); }
      catch (e) { console.warn('No se pudo actualizar el PIN a v2:', e); }
    }
    
    document.getElementById('modal-pin').style.display='none';
    document.getElementById('pin-input').value='';
    document.getElementById('pin-error').style.display='none';
    if (intento.length < PIN_MIN_DIGITOS && sessionStorage.getItem('pinCortoAvisado') !== '1') {
      sessionStorage.setItem('pinCortoAvisado', '1');
      setTimeout(() => {
        if (confirm(`🔐 Tu PIN tiene ${intento.length} dígitos. Con tan pocos, alguien con acceso a tu teléfono puede adivinarlo probando todas las combinaciones.\n\n¿Cambiarlo ahora por uno de ${PIN_MIN_DIGITOS} a 8 dígitos?`)) configurarPIN({ soloCambiar: true });
      }, 800);
    }
    
    if (!state.setup) {
      document.getElementById('onboarding').style.display='flex';
    } else {
      renderAll();
    }
  } else {
    // ❌ PIN incorrecto
    _registrarIntentoFallidoPIN();
    document.getElementById('pin-error').style.display='block';
    document.getElementById('pin-input').value='';
    setTimeout(function(){
      // No pisar el mensaje de bloqueo si mientras tanto se activó uno
      if (!_estadoBloqueoPIN().bloqueado) document.getElementById('pin-error').style.display='none';
    }, 3000);
  }
};

// SISTEMA DE PAPELERA
function eliminarGastoConPapelera(id) {
  var gasto = state.transactions.find(function(t) { return t.id === id; });
  if (!gasto) return;
  if (confirm('Eliminar este gasto? Puedes recuperarlo desde la papelera.')) {
    gasto.deletedAt = new Date().toISOString();
    save();
    renderAll();
    alert('Eliminado. Ve a Configuracion > Papelera para restaurar si lo necesitas.');
  }
}

function restaurarGastoDePapelera(id) {
  var gasto = state.transactions.find(function(t) { return t.id == id && t.deletedAt; });
  if (!gasto) return;
  gasto.deletedAt = null;
  save();
  renderAll();
  alert('Gasto restaurado correctamente');
}

function vaciarPapelera() {
  var deleted = state.transactions.filter(function(t) { return t.deletedAt; });
  if (deleted.length === 0) { alert('Papelera vacia'); return; }
  if (confirm('Eliminar permanentemente ' + deleted.length + ' gastos? Esta accion NO se puede deshacer.')) {
    state.transactions = state.transactions.filter(function(t) { return !t.deletedAt; });
    save();
    renderAll();
    alert('Papelera vaciada');
  }
}

function renderPapelera() {
  var deleted = state.transactions.filter(function(t) { return t.deletedAt; })
    .sort(function(a, b) { return new Date(b.deletedAt) - new Date(a.deletedAt); });
  var trashList = document.getElementById('trash-list');
  if (!trashList) return;
  if (deleted.length === 0) {
    trashList.innerHTML = '<p style="text-align:center;color:var(--text2);padding:10px;font-size:12px">Papelera vacia</p>';
    var emptyBtn = document.getElementById('empty-trash-btn');
    if (emptyBtn) emptyBtn.style.display = 'none';
    return;
  }
  var html = '';
  for (var i = 0; i < deleted.length; i++) {
    var t = deleted[i];
    html += '<div class="trash-item">';
    html += '<div><strong>' + esc(t.cat || 'Sin categoria') + '</strong> - L.' + t.amount.toFixed(2);
    html += '<br/><small>' + new Date(t.date).toLocaleDateString() + '</small></div>';
    html += '<button class="btn btn-restore" onclick="restaurarGastoDePapelera(\'' + esc(t.id) + '\')">Restaurar</button>';
    html += '</div>';
  }
  trashList.innerHTML = html;
  var emptyBtn = document.getElementById('empty-trash-btn');
  if (emptyBtn) emptyBtn.style.display = 'block';
}

// ALERTAS DE PRESUPUESTO
/** Calcula cuánto se ha gastado ESTE MES en cada bolsillo del presupuesto
    (fijo/extra) contra lo que la regla 65/20/15 permite según el ingreso
    del mes. La parte "ahorro" no se puede medir contra gastos (es lo que
    sobra), así que solo se vigila gastos fijos y extra. */
function calcularProgresoPresupuestoMes() {
  var hoy = new Date();
  var esteMes = function(t) {
    var f = fechaContable(t);
    return f.getFullYear() === hoy.getFullYear() && f.getMonth() === hoy.getMonth();
  };
  var realTx = state.transactions.filter(function(t) { return !t.deletedAt && !t.esTransferencia && !t.esConciliacion && esteMes(t); });
  var ingresos = realTx.filter(function(t) { return t.type === 'income'; }).reduce(function(a, b) { return a + b.amount; }, 0);
  var gastoFijo = realTx.filter(function(t) { return t.type === 'expense' && t.tipo === 'fijo'; }).reduce(function(a, b) { return a + b.amount; }, 0);
  var gastoExtra = realTx.filter(function(t) { return t.type === 'expense' && t.tipo === 'extra'; }).reduce(function(a, b) { return a + b.amount; }, 0);
  var rules = state.budgetRules || { gastos: 65, ahorro: 20, extra: 15 };
  var limiteFijo = ingresos * (rules.gastos / 100);
  var limiteExtra = ingresos * (rules.extra / 100);
  return {
    ingresos: ingresos,
    fijo: { gastado: gastoFijo, limite: limiteFijo, pct: limiteFijo > 0 ? (gastoFijo / limiteFijo) * 100 : 0 },
    extra: { gastado: gastoExtra, limite: limiteExtra, pct: limiteExtra > 0 ? (gastoExtra / limiteExtra) * 100 : 0 }
  };
}

function _barraPresupuesto(nombre, info) {
  var color = info.pct >= 100 ? 'var(--red)' : (info.pct >= 80 ? 'var(--amber)' : 'var(--green)');
  var pctBarra = Math.min(100, info.pct);
  return '<div style="margin-bottom:8px">' +
    '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px">' +
      '<span>' + nombre + '</span>' +
      '<span style="color:' + color + ';font-weight:700">' + fL(info.gastado) + ' de ' + fL(info.limite) + ' (' + info.pct.toFixed(0) + '%)</span>' +
    '</div>' +
    '<div style="background:var(--bg3);border-radius:6px;height:6px;overflow:hidden">' +
      '<div style="width:' + pctBarra + '%;height:100%;background:' + color + '"></div>' +
    '</div>' +
  '</div>';
}

function verificarAlertasPresupuesto() {
  var alertasDiv = document.getElementById('budget-alerts');
  var progresoDiv = document.getElementById('budget-progreso-mes');
  var progreso = calcularProgresoPresupuestoMes();

  if (progresoDiv) {
    if (progreso.ingresos > 0) {
      progresoDiv.innerHTML = _barraPresupuesto('🏠 Gastos fijos', progreso.fijo) + _barraPresupuesto('🎉 Gastos extra', progreso.extra);
    } else {
      progresoDiv.innerHTML = '';
    }
  }

  if (alertasDiv) {
    var peor = progreso.fijo.pct >= progreso.extra.pct ? { nombre: 'Gastos fijos', info: progreso.fijo } : { nombre: 'Gastos extra', info: progreso.extra };
    var html = '';
    if (progreso.ingresos > 0 && peor.info.pct >= 100) {
      html = '<div class="alert-budget-critical"><span style="font-size:20px">🚨</span><div class="alert-content"><div class="alert-title">¡' + peor.nombre + ' excedidos este mes!</div><div class="alert-detail">' + fL(peor.info.gastado) + ' de ' + fL(peor.info.limite) + ' (' + peor.info.pct.toFixed(0) + '%)</div></div></div>';
    } else if (progreso.ingresos > 0 && peor.info.pct >= 80) {
      html = '<div class="alert-budget-warning"><span style="font-size:20px">⚠️</span><div class="alert-content"><div class="alert-title">' + peor.nombre + ' al ' + Math.round(peor.info.pct) + '%</div><div class="alert-detail">Te quedan ' + fL(Math.max(0, peor.info.limite - peor.info.gastado)) + ' este mes</div></div></div>';
    }
    alertasDiv.innerHTML = html;
  }

  // Push notification cuando se cruza un umbral (una sola vez por mes+categoría+nivel)
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  var hoy = new Date();
  var mesClave = hoy.getFullYear() + '-' + hoy.getMonth();
  var alertasEnviadas = JSON.parse(localStorage.getItem('alertas_enviadas') || '{}');
  [['fijo', 'Gastos fijos', progreso.fijo], ['extra', 'Gastos extra', progreso.extra]].forEach(function(entry) {
    var key = entry[0], nombre = entry[1], info = entry[2];
    if (progreso.ingresos <= 0) return;
    var nivel = info.pct >= 100 ? 'excedido' : (info.pct >= 80 ? 'aviso' : null);
    if (!nivel) return;
    var clave = 'presup_' + key + '_' + mesClave + '_' + nivel;
    if (alertasEnviadas[clave]) return;
    if (nivel === 'excedido') {
      enviarNotificacion('🚨 ' + nombre + ' excedidos', fL(info.gastado) + ' de ' + fL(info.limite) + ' este mes (' + info.pct.toFixed(0) + '%)', null);
    } else {
      enviarNotificacion('⚠️ ' + nombre + ' al ' + Math.round(info.pct) + '%', 'Te quedan ' + fL(Math.max(0, info.limite - info.gastado)) + ' este mes', null);
    }
    alertasEnviadas[clave] = true;
  });
  localStorage.setItem('alertas_enviadas', JSON.stringify(alertasEnviadas));
}

// ═══ RECORDATORIO DIARIO ══════════════════════════════════════════════════
// Con la app abierta se revisa cada minuto. Con la app cerrada lo intenta el
// service worker con Periodic Background Sync, que Android dispara cuando
// quiere (no a una hora exacta); por eso el SW solo necesita una ficha sin
// datos sensibles: si está activo, la hora y el último día con movimientos.
const fechaLocal = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function leerRecordatorio() {
  try { return Object.assign({ activo: false, hora: '20:00' }, JSON.parse(localStorage.getItem('mph_recordatorio') || '{}')); }
  catch (e) { return { activo: false, hora: '20:00' }; }
}
function ultimoDiaConMovimientos() {
  // "Hoy no gasté nada" (racha) también cuenta como día anotado
  let max = (state.diasSinGastos || []).reduce((a, d) => d > a ? d : a, '');
  (state.transactions || []).forEach(t => {
    if (t.deletedAt || t.esTransferencia || t.esConciliacion) return;
    const f = fechaLocal(new Date(t.date)); if (f > max) max = f;
  });
  return max;
}
// Ficha para el service worker (Cache Storage: el SW no puede leer los datos cifrados)
async function _actualizarFichaRecordatorio(extra) {
  if (!('caches' in window)) return;
  try {
    const c = await caches.open('mph-recordatorio');
    const previa = await c.match('ficha.json').then(r => r ? r.json() : {}).catch(() => ({}));
    const racha = typeof calcularRacha === 'function' ? calcularRacha().actual : 0;
    const ficha = Object.assign(previa, leerRecordatorio(), { ultimoRegistro: ultimoDiaConMovimientos(), racha }, extra || {});
    await c.put('ficha.json', new Response(JSON.stringify(ficha), { headers: { 'Content-Type': 'application/json' } }));
  } catch (e) {}
}
function renderRecordatorioConfig() {
  const cfg = leerRecordatorio(), chk = document.getElementById('recordatorio-activo');
  if (!chk) return;
  chk.checked = cfg.activo;
  document.getElementById('recordatorio-hora').value = cfg.hora;
  const nota = document.getElementById('recordatorio-nota');
  if (typeof Notification !== 'undefined' && Notification.permission === 'denied') nota.textContent = '⚠️ Las notificaciones están bloqueadas. Actívalas en los ajustes del teléfono para esta app.';
  else nota.textContent = cfg.activo ? 'Con la app cerrada, Android decide cuándo revisar: el aviso puede llegar un rato después de la hora elegida.' : '';
}
async function guardarRecordatorio() {
  const activo = document.getElementById('recordatorio-activo').checked;
  const hora = document.getElementById('recordatorio-hora').value || '20:00';
  if (activo && !(await solicitarPermisosNotificacion())) { document.getElementById('recordatorio-activo').checked = false; return renderRecordatorioConfig(); }
  localStorage.setItem('mph_recordatorio', JSON.stringify({ activo, hora }));
  await _actualizarFichaRecordatorio();
  if (activo && 'serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg.periodicSync) await reg.periodicSync.register('mph-recordatorio', { minInterval: 3 * 60 * 60 * 1000 });
    } catch (e) { /* sin permiso de sincronización periódica: queda el aviso con la app abierta */ }
  }
  renderRecordatorioConfig();
  renderPrimerosPasos();
}
/** Si ya pasó la hora elegida y hoy no hay movimientos, avisa una vez al día. */
function verificarRegistroDiario(ahora = new Date()) {
  const cfg = leerRecordatorio();
  if (!cfg.activo || !state.setup || typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
  const [h, min] = cfg.hora.split(':').map(Number);
  if (ahora.getHours() * 60 + ahora.getMinutes() < h * 60 + (min || 0)) return false;
  const hoy = fechaLocal(ahora);
  let enviadas = {};
  try { enviadas = JSON.parse(localStorage.getItem('alertas_enviadas') || '{}'); } catch (e) {}
  const clave = 'diario_' + hoy;
  if (enviadas[clave] || ultimoDiaConMovimientos() === hoy) return false;
  const racha = typeof calcularRacha === 'function' ? calcularRacha(ahora).actual : 0;
  enviarNotificacion(racha >= 2 ? '🔥 No pierdas tu racha de ' + racha + ' días' : '📝 ¿Todo tranquilo hoy?', 'Todavía no has anotado nada. Si gastaste algo, regístralo antes de que se te olvide.', null,
    { tag: 'mph-recordatorio', url: './?action=new-expense', actions: [{ action: 'new-expense', title: '➕ Registrar gasto' }] });
  enviadas[clave] = true;
  localStorage.setItem('alertas_enviadas', JSON.stringify(enviadas));
  _actualizarFichaRecordatorio({ avisado: hoy });
  return true;
}
// Revisiones mientras la app está abierta: al cargar, cada minuto y al volver a ella
function iniciarRevisionesPeriodicas() {
  if (window.__revisionesIniciadas) return;
  window.__revisionesIniciadas = true;
  const revisar = () => {
    if (!state.setup) return;
    try { if (localStorage.getItem('notif_activas') === 'true') checkNotificacionesPagos(); else verificarRegistroDiario(); } catch (e) {}
  };
  setTimeout(revisar, 3000);
  setInterval(revisar, 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') revisar(); });
}
// Enlaces de acción: atajos del ícono, notificaciones y "Compartir" desde otra app
function procesarAccionDeURL() {
  const q = new URLSearchParams(location.search);
  const accion = q.get('action'), compartido = [q.get('title'), q.get('text')].filter(Boolean).join(' ');
  if (!accion && !compartido) return;
  history.replaceState({}, document.title, location.pathname);
  setTimeout(() => {
    if (compartido) { openModal('modal-gasto'); abrirModalSMS(compartido.slice(0, 1000)); }
    else if (accion === 'new-expense') abrirRegistro('gasto');
    else if (accion === 'balance' && typeof switchView === 'function') switchView('dashboard');
  }, 400);
}
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data && e.data.tipo === 'accion' && e.data.accion === 'new-expense' && state.setup) abrirRegistro('gasto');
  });
}

// PROYECCION DE FLUJO DE CAJA
function calcularProyeccionCaja() {
  // P0-2: excluir transferencias internas (las conciliaciones SÍ cuentan en el balance real)
  var balTx = state.transactions.filter(function(t) { return !t.deletedAt && !t.esTransferencia; });
  var ingresos = balTx.filter(function(t) { return t.type === 'income'; }).reduce(function(a, b) { return a + b.amount; }, 0);
  var gastos = balTx.filter(function(t) { return t.type === 'expense'; }).reduce(function(a, b) { return a + b.amount; }, 0);
  var balance = (state.saldoInicial || 0) + ingresos - gastos;
  var hace30dias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  // Promedio diario: excluir conciliaciones (ajustes grandes distorsionan la proyección)
  var gastosUltimos30 = state.transactions.filter(function(t) { return t.type === 'expense' && !t.deletedAt && !t.esTransferencia && !t.esConciliacion && new Date(t.date) > hace30dias; }).reduce(function(a, b) { return a + b.amount; }, 0);
  var gastoDiario = gastosUltimos30 / 30;
  var diasSupervivencia = gastoDiario > 0 ? Math.floor(balance / gastoDiario) : 999;
  var proyectDiv = document.getElementById('cashflow-projection');
  if (!proyectDiv) return;
  if (diasSupervivencia < 999 && balance > 0) {
    var html = '<div class="cashflow-projection">';
    html += '<span class="cashflow-number">' + (document.body.classList.contains('modo-discreto') ? '••' : diasSupervivencia) + '</span>';
    html += '<span class="cashflow-label">Dias hasta fin de fondos</span>';
    html += '<small style="color:var(--text2);display:block;margin-top:5px">Con gasto promedio de ' + fL(gastoDiario) + '/dia</small>';
    html += '</div>';
    proyectDiv.innerHTML = html;
  } else {
    proyectDiv.innerHTML = '';
  }
}

// DETECCION DE DUPLICADOS
function marcarNoDuplicado(a, b) {
  state.transactions.forEach(function(t) { if (t.id === a || t.id === b) t.noDuplicado = true; });
  save(); renderAll();
}
function detectarDuplicados() {
  // Las dos partes de una transferencia (o un ajuste) tienen el mismo monto y
  // hora: no son duplicados, y "Eliminar" dejaba la transferencia a medias.
  var recientes = state.transactions.filter(function(t) { return !t.deletedAt && !t.esTransferencia && !t.esConciliacion && !t.noDuplicado; }).sort(function(a, b) { return new Date(b.date) - new Date(a.date); }).slice(0, 20);
  var duplicadosHtml = [];
  var procesados = {};
  for (var i = 0; i < recientes.length - 1; i++) {
    var t1 = recientes[i];
    if (procesados[t1.id]) continue;
    for (var j = i + 1; j < recientes.length; j++) {
      var t2 = recientes[j];
      if (procesados[t2.id]) continue;
      var mismaCantidad = t1.amount === t2.amount;
      var mismaCategoria = t1.cat === t2.cat && t1.type === t2.type && (t1.cuenta || null) === (t2.cuenta || null) && String(t1.tarjetaId || '') === String(t2.tarjetaId || '');
      var fechaCercana = Math.abs(new Date(t1.date) - new Date(t2.date)) < 5 * 60 * 1000;
      if (mismaCantidad && mismaCategoria && fechaCercana) {
        var html = '<div class="duplicate-warning">';
        html += '<span><strong>⚠️ Duplicado posible:</strong> ' + esc(t1.cat) + ' ' + fL(t1.amount) + '</span>';
        html += '<button class="btn btn-duplicate-action" onclick="eliminarGastoConPapelera(\'' + esc(t2.id) + '\')">Eliminar</button>';
        html += '<button class="btn btn-duplicate-action" style="background:none;border:1px solid var(--border);color:var(--text2)" onclick="marcarNoDuplicado(\'' + esc(t1.id) + '\',\'' + esc(t2.id) + '\')">No es duplicado</button>';
        html += '</div>';
        duplicadosHtml.push(html);
        procesados[t2.id] = true;
      }
    }
  }
  var duplicadosDiv = document.getElementById('duplicates-alert');
  if (!duplicadosDiv) return;
  if (duplicadosHtml.length > 0) {
    duplicadosDiv.innerHTML = duplicadosHtml.join('');
    duplicadosDiv.style.display = 'block';
  } else {
    duplicadosDiv.innerHTML = '';
    duplicadosDiv.style.display = 'none';
  }
}

// VALIDACION DE MONTO
function validarMonto(input) {
  var valor = input.value.replace(/[^0-9.]/g, '');
  var partes = valor.split('.');
  if (partes.length > 2) valor = partes[0] + '.' + partes.slice(1).join('');
  if (partes[1] && partes[1].length > 2) valor = partes[0] + '.' + partes[1].slice(0, 2);
  input.value = valor;
}

// VER TUTORIAL DE NUEVO
// Antes abría la pantalla de configuración inicial, y al tocar "Comenzar"
// reemplazaba el state completo: se perdían todos los datos.
function mostrarTutorialDeNuevo() { abrirTour(0); }

// ═══ TUTORIAL Y PRIMEROS PASOS ════════════════════════════════════════════
let _tourPaso = 0;
function abrirTour(paso) {
  if (!state.setup) return;
  const t = document.getElementById('tour-bienvenida');
  t.textContent = state.nombre ? '¡Bienvenido, ' + state.nombre + '!' : 'Tus datos están protegidos';
  document.getElementById('tour-hora').value = leerRecordatorio().hora;
  _tourPaso = 0;
  tourIr(paso || 0);
  openModal('modal-tour');
}
function tourIr(delta) {
  if (delta === 1 && _tourPaso === 2) return cerrarTour();
  _tourPaso = Math.max(0, Math.min(2, _tourPaso + delta));
  document.querySelectorAll('#modal-tour .tour-paso').forEach(el => el.classList.toggle('activo', +el.dataset.paso === _tourPaso));
  document.querySelectorAll('#modal-tour .tour-puntos span').forEach((el, i) => el.classList.toggle('activo', i === _tourPaso));
  document.getElementById('tour-atras').style.visibility = _tourPaso === 0 ? 'hidden' : 'visible';
  document.getElementById('tour-siguiente').textContent = _tourPaso === 2 ? '¡Listo!' : 'Siguiente →';
  _renderEstadoTour();
}
function _renderEstadoTour() {
  const kit = document.getElementById('tour-kit-estado');
  kit.textContent = tieneKitRecuperacion() ? '✅ Kit creado. Guárdalo en un lugar seguro.' : '';
  kit.style.color = 'var(--green)';
  const rec = leerRecordatorio(), el = document.getElementById('tour-recordatorio-estado');
  el.textContent = rec.activo ? '✅ Te avisaremos a las ' + rec.hora + '.' : '';
  el.style.color = 'var(--green)';
}
function cerrarTour() {
  closeModal('modal-tour');
  renderPrimerosPasos();
}
async function tourCrearKit() {
  await generarKitRecuperacion();
  _renderEstadoTour();
  renderPrimerosPasos();
}
function tourRegistrarGasto() {
  cerrarTour();
  openModal('modal-gasto');
}
async function tourActivarRecordatorio() {
  document.getElementById('recordatorio-activo').checked = true;
  document.getElementById('recordatorio-hora').value = document.getElementById('tour-hora').value || '20:00';
  await guardarRecordatorio();
  _renderEstadoTour();
  if (!leerRecordatorio().activo) {
    const el = document.getElementById('tour-recordatorio-estado');
    el.textContent = '⚠️ Sin permiso de notificaciones no podemos avisarte. Puedes activarlo después en Config.';
    el.style.color = 'var(--amber)';
  }
  renderPrimerosPasos();
}

// Lista del dashboard: desaparece al completar los 3 pasos o si el usuario la oculta
function pasosPendientes() {
  return [
    { id: 'kit', texto: 'Crea tu kit de recuperación del PIN', hecho: tieneKitRecuperacion(), accion: 'generarKitRecuperacion().then(renderPrimerosPasos)' },
    { id: 'gasto', texto: 'Registra tu primer gasto', hecho: (state.transactions || []).some(t => !t.deletedAt && t.type === 'expense' && !t.esTransferencia && !t.esConciliacion), accion: "openModal('modal-gasto')" },
    { id: 'recordatorio', texto: 'Activa el recordatorio diario', hecho: leerRecordatorio().activo, accion: 'abrirTour(2)' },
  ];
}
function renderPrimerosPasos() {
  const card = document.getElementById('primeros-pasos');
  if (!card) return;
  let oculto = false;
  try { oculto = localStorage.getItem('mph_primeros_pasos') === 'oculto'; } catch (e) {}
  const pasos = pasosPendientes(), hechos = pasos.filter(p => p.hecho).length;
  if (!state.setup || oculto || hechos === pasos.length) { card.style.display = 'none'; return; }
  card.style.display = 'block';
  card.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
      '<strong style="font-size:14px">🚀 Primeros pasos · ' + hechos + ' de ' + pasos.length + '</strong>' +
      '<button onclick="ocultarPrimerosPasos()" style="background:none;border:none;color:var(--text2);font-size:12px;cursor:pointer">Ocultar</button></div>' +
    pasos.map(p => '<div class="pasos-item' + (p.hecho ? ' hecho' : '') + '" data-paso="' + p.id + '"' + (p.hecho ? '' : ' onclick="' + p.accion + '"') + '>' +
      '<span class="pasos-check">' + (p.hecho ? '✓' : '') + '</span><span>' + p.texto + '</span></div>').join('');
}
function ocultarPrimerosPasos() {
  try { localStorage.setItem('mph_primeros_pasos', 'oculto'); } catch (e) {}
  renderPrimerosPasos();
}

// ═══ COMENTARIOS ══════════════════════════════════════════════════════════
// Solo datos técnicos para reproducir un error; nada de montos ni nombres.
async function urlComentarios() {
  let version = '';
  try { version = ((await caches.keys()).find(k => k.startsWith('mipistohn-')) || '').replace('mipistohn-', ''); } catch (e) {}
  const modo = window.matchMedia('(display-mode: standalone)').matches ? 'app instalada' : 'navegador';
  const cuerpo = 'Cuéntanos qué pasó o qué te gustaría mejorar:\n\n\n\n' +
    '— Datos técnicos (no incluyen tus finanzas) —\n' +
    'Versión: ' + (version || 'desconocida') + '\n' +
    'Modo: ' + modo + '\n' +
    'Pantalla: ' + screen.width + '×' + screen.height + '\n' +
    'Navegador: ' + navigator.userAgent;
  return 'mailto:mipistohn@gmail.com?subject=' + encodeURIComponent('Comentarios sobre Mi Pisto HN') + '&body=' + encodeURIComponent(cuerpo);
}
async function enviarComentarios() { location.href = await urlComentarios(); }

// INYECTAR ELEMENTOS NUEVOS EN DOM
function inyectarElementosNuevos() {
  var dashboard = document.getElementById('view-dashboard');
  if (dashboard && !document.getElementById('budget-alerts')) {
    var alertasDiv = document.createElement('div');
    alertasDiv.id = 'budget-alerts';
    alertasDiv.style.marginBottom = '15px';
    dashboard.insertBefore(alertasDiv, dashboard.firstChild);
  }
  if (dashboard && !document.getElementById('duplicates-alert')) {
    var dupDiv = document.createElement('div');
    dupDiv.id = 'duplicates-alert';
    dupDiv.style.marginBottom = '15px';
    dupDiv.style.display = 'none';
    dashboard.insertBefore(dupDiv, dashboard.firstChild);
  }
  if (dashboard && !document.getElementById('cashflow-projection')) {
    var projDiv = document.createElement('div');
    projDiv.id = 'cashflow-projection';
    dashboard.appendChild(projDiv);
  }
  var configView = document.getElementById('view-config');
  if (configView && !document.getElementById('tutorial-btn')) {
    var btn = document.createElement('button');
    btn.id = 'tutorial-btn';
    btn.className = 'btn btn-secondary';
    btn.innerHTML = '❓ Ver tutorial nuevamente';
    btn.onclick = mostrarTutorialDeNuevo;
    btn.style.marginTop = '10px';
    configView.appendChild(btn);
  }
  if (configView && !document.getElementById('trash-section-wrapper')) {
    var trashDiv = document.createElement('div');
    trashDiv.id = 'trash-section-wrapper';
    trashDiv.className = 'trash-section';
    trashDiv.innerHTML = '<h4 style="margin-bottom:10px">🗑️ Papelera de Gastos</h4><div id="trash-list"></div><button id="empty-trash-btn" class="btn btn-danger" onclick="vaciarPapelera()" style="margin-top:10px;display:none">Vaciar Papelera</button>';
    configView.appendChild(trashDiv);
  }
}

function ejecutarVerificacionesNuevas() {
  inyectarElementosNuevos();
  setTimeout(function() {
    verificarAlertasPresupuesto();
    calcularProyeccionCaja();
    renderLiquidez7Dias();
    detectarDuplicados();
    renderPapelera();
    renderChipsRapidas();
    verificarTransferenciasProgramadas();
  }, 200);
}
