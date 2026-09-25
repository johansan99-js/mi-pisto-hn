// Mi Pisto HN · 11-arranque.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.
// SOBRESCRIBIR window.onload (async + IDB)
// ==========================================
// ── P1-5: Purga de soft-delete con más de 30 días ────────────
function purgarEliminadosViejos() {
  const LIMITE_MS = 30 * 24 * 60 * 60 * 1000; // 30 días
  const ahora = Date.now();
  const antes = state.transactions.length;
  state.transactions = state.transactions.filter(t => {
    if (!t.deletedAt) return true; // transacción activa: conservar
    return (ahora - new Date(t.deletedAt).getTime()) < LIMITE_MS;
  });
  const purgados = antes - state.transactions.length;
  if (purgados > 0) {
    console.log(`🗑️ Purga: ${purgados} transacciones eliminadas hace >30 días`);
    save();
  }
}

// ── P0-1: Migración PIN legado (texto plano → PBKDF2) ─────────
async function migrarPINLegadoSiNecesario() {
  const oldPIN = localStorage.getItem('finanzas_pin');
  const newHash = localStorage.getItem('finanzas_pin_hash');
  if (oldPIN && !newHash) {
    console.log('🔐 Migrando PIN a PBKDF2...');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await _derivarHashPIN(oldPIN, salt);
    localStorage.setItem('finanzas_pin_hash', hash);
    localStorage.setItem('finanzas_pin_salt', btoa(String.fromCharCode(...salt)));
    localStorage.removeItem('finanzas_pin');
    appPIN = hash;
    console.log('✅ PIN migrado a hash seguro');
  }
}

// ═══════════════════════════════════════════════════════════════════════
// FIX SEGURIDAD: Helper para completar la carga de la app DESPUÉS de
// verificar el PIN exitosamente. Antes, loadStateFromDB() se llamaba al
// inicio sin importar el PIN — los datos quedaban en memoria aunque no
// hubieras ingresado el PIN, lo que invalidaba todo el cifrado AES-256.
// ═══════════════════════════════════════════════════════════════════════
async function _completarCargaApp() {
  // Cargar state desde IndexedDB (ya pasamos la verificación de PIN)
  const idbState = await loadStateFromDB();
  if (idbState) {
    Object.keys(state).forEach(key => {
      if (idbState[key] !== undefined) state[key] = idbState[key];
    });
    if (!state.pagosRecurrentes) state.pagosRecurrentes = [];
    if (!state.prestamos) state.prestamos = [];
    if (!state.budgetRules) state.budgetRules = { gastos: 65, ahorro: 20, extra: 15 };
    if (!state.receivables) state.receivables = [];
    if (!state.payables) state.payables = [];
    if (!state.tarjetas) state.tarjetas = [];
    if (!state.goals) state.goals = [];
    console.log('✅ Estado restaurado desde IndexedDB (post-PIN)');
  } else {
    if (!state.pagosRecurrentes) state.pagosRecurrentes = [];
    if (!state.prestamos) state.prestamos = [];
    if (!state.budgetRules) state.budgetRules = { gastos: 65, ahorro: 20, extra: 15 };
    if (state.setup) saveStateToDB(state);
  }
  migrarCuentasIniciales();
  migrarPagosTarjeta();
  recalcularSaldosTarjetas();
  _tomarBaseSync();
  purgarEliminadosViejos();
  // Renderizar la app con los datos ya cargados
  if (state.setup) {
    if (typeof renderAll === 'function') renderAll();
  } else {
    const ob = document.getElementById('onboarding');
    if (ob) ob.style.display = 'flex';
  }
}
window._completarCargaApp = _completarCargaApp; // exponer por si el IIFE lo necesita

window.onload = async function() {
  console.log('🚀 Mi Pisto HN cargando...');

  // 0. Migrar PIN legado a PBKDF2 si es necesario
  await migrarPINLegadoSiNecesario();

  // 1. Solicitar persistencia al SO
  await requestPersistence();

  // 2. ¿Hay PIN configurado?
  const tienePIN = !!localStorage.getItem('finanzas_pin_hash');

  if (tienePIN) {
    // 🔒 NO cargar state desde IDB hasta que el PIN se verifique.
    // El state queda con valores por defecto (vacío) hasta el desbloqueo.
    console.log('🔒 PIN detectado — esperando verificación antes de cargar datos');
    // Resetear el state a vacío por si localStorage cargó algo en plano (legacy)
    state = {
      setup: false, nombre: '', saldoInicial: 0,
      cuentas: { efectivo: 0, ahorro: 0 },
      cuentasIniciales: null, cuentasInicialesV: 0, eliminados: {}, sellosV: 0,
      transactions: [], goals: [], receivables: [], payables: [],
      prestamos: [], tarjetas: [], pagosRecurrentes: [], transferenciasProgramadas: [],
      budgetRules: { gastos: 65, ahorro: 20, extra: 15 }
    };
    // Mostrar modal de PIN (o biometría si está disponible)
    verificarPINmejorado();
    renderBiometriaConfig();
    _updatePinBioBtn();
    // El resto se completa en _completarCargaApp() después de verificar el PIN
    var recordarEl = document.getElementById('recordar-pin');
    if (recordarEl) recordarEl.checked = recordarPIN;
    if (typeof setupCurrencyHandlers === 'function') setupCurrencyHandlers();
    if (typeof initOfflineDetection === 'function') initOfflineDetection();
    return;
  }

  // 3. Sin PIN: flujo normal (primera vez o usuario sin cifrado)
  const idbState = await loadStateFromDB();
  if (idbState) {
    Object.keys(state).forEach(key => {
      if (idbState[key] !== undefined) state[key] = idbState[key];
    });
    if (!state.pagosRecurrentes) state.pagosRecurrentes = [];
    if (!state.prestamos) state.prestamos = [];
    if (!state.budgetRules) state.budgetRules = { gastos: 65, ahorro: 20, extra: 15 };
    if (!state.receivables) state.receivables = [];
    if (!state.payables) state.payables = [];
    if (!state.tarjetas) state.tarjetas = [];
    if (!state.goals) state.goals = [];
    console.log('✅ Estado restaurado desde IndexedDB');
  } else {
    if (!state.pagosRecurrentes) state.pagosRecurrentes = [];
    if (!state.prestamos) state.prestamos = [];
    if (!state.budgetRules) state.budgetRules = { gastos: 65, ahorro: 20, extra: 15 };
    if (state.setup) saveStateToDB(state);
  }

  migrarCuentasIniciales();
  migrarPagosTarjeta();
  recalcularSaldosTarjetas();
  _tomarBaseSync();
  purgarEliminadosViejos();
  verificarPINmejorado();
  renderBiometriaConfig();
  _updatePinBioBtn();

  // 4. Resto de inicialización
  var recordarEl = document.getElementById('recordar-pin');
  if (recordarEl) recordarEl.checked = recordarPIN;
  renderBudgetRules();
  setTimeout(ejecutarVerificacionesNuevas, 500);
  // Mostrar banner PWA iOS si corresponde
  showPwaBanner();
  
  // Renderizar saludo personalizado
  renderWelcome();

  // Verificar y enviar notificaciones de pagos próximos
  if(localStorage.getItem('notif_activas')==='true'){
    setTimeout(checkNotificacionesPagos, 2000);
    // FIX: Usar createInterval para cleanup automático y evitar memory leaks
    window.createInterval(checkNotificacionesPagos, 60*60*1000); // cada hora
  }
  
  // Actualizar estado botón de notificaciones
  if(Notification.permission==='granted'){
    const btn=document.getElementById('btn-activar-notif');
    if(btn)btn.innerHTML='<span style="color:var(--green)">✓ Alertas activas</span>';
  }

  console.log('✅ App lista');
};

// SOBRESCRIBIR renderAll para incluir verificaciones
var originalRenderAll = renderAll;
renderAll = function() {
  originalRenderAll();
  setTimeout(function() {
    verificarAlertasPresupuesto();
    calcularProyeccionCaja();
    detectarDuplicados();
    renderPapelera();
  }, 100);
};

// ═══════════════════════════════════════════════════════════════════════
// FIX CRÍTICO: Exponer state, fL, esc en window para que el IIFE de UX
// (definido en otro <script> tag, scope independiente) pueda leerlos.
// Sin esto, window.state es undefined → el IIFE muestra "Sin metas" aunque
// state.goals tenga datos. Usamos getter para que sobreviva la reasignación
// de state en línea ~4210 cuando se carga desde IndexedDB.
// ═══════════════════════════════════════════════════════════════════════
try {
  Object.defineProperty(window, 'state', {
    get: () => state,
    set: v => { state = v; },
    configurable: true
  });
} catch (e) {
  window.state = state;
  console.warn('No se pudo definir getter de window.state, usando asignación directa:', e);
}
window.fL = fL;
window.esc = esc;

// ═══════════════════════════════════════════════════════════════════════
