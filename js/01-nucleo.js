// Mi Pisto HN · 01-nucleo.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.
// ═════════════════════════════════════════════════════════════
// FIX: Utility - Fetch con timeout compatible con navegadores antiguos
// (Safari <15.3, Android <13 no tienen AbortSignal.timeout)
// ═════════════════════════════════════════════════════════════
function timeoutFetch(url, options = {}, ms = 3000) {
  if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
    // Navegadores modernos (2024+)
    return fetch(url, {
      ...options,
      signal: AbortSignal.timeout(ms)
    });
  }
  
  // Fallback para navegadores antiguos
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  
  return fetch(url, {
    ...options,
    signal: controller.signal
  }).finally(() => clearTimeout(timer));
}

// ═════════════════════════════════════════════════════════════
// FIX: Manager centralizado de timeouts (prevenir memory leaks)
// ═════════════════════════════════════════════════════════════
window._timeoutIds = [];
window._intervalIds = [];

window.createTimeout = function(fn, ms) {
  const id = setTimeout(() => {
    // Auto-remover de la lista al ejecutarse
    const idx = window._timeoutIds.indexOf(id);
    if (idx > -1) window._timeoutIds.splice(idx, 1);
    fn();
  }, ms);
  window._timeoutIds.push(id);
  return id;
};

window.createInterval = function(fn, ms) {
  const id = setInterval(fn, ms);
  window._intervalIds.push(id);
  return id;
};

window.clearAllTimeouts = function() {
  window._timeoutIds.forEach(id => clearTimeout(id));
  window._timeoutIds = [];
};

window.clearAllIntervals = function() {
  window._intervalIds.forEach(id => clearInterval(id));
  window._intervalIds = [];
};

// Cleanup automático al cerrar/recargar página
window.addEventListener('beforeunload', () => {
  window.clearAllTimeouts();
  window.clearAllIntervals();
});

// Cleanup también en pagehide (Safari móvil)
window.addEventListener('pagehide', () => {
  window.clearAllTimeouts();
  window.clearAllIntervals();
});

// ══════════════════════════════════════════════════════════════
// 🔒 DSS05.04/05.05 — Auto-bloqueo al pasar a segundo plano
// ──────────────────────────────────────────────────────────────
// Antes: una vez desbloqueada con el PIN, la app quedaba abierta
// indefinidamente aunque cambiaras de app, apagaras la pantalla o
// soltaras el celular — cualquiera que lo tomara veía todos los datos
// financieros sin volver a pedir el PIN. Ahora, si la app estuvo oculta
// más de 60 segundos, se vuelve a bloquear al regresar.
// ══════════════════════════════════════════════════════════════
const AUTO_LOCK_GRACIA_MS = 60 * 1000;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    sessionStorage.setItem('_ocultoDesde', String(Date.now()));
  } else if (document.visibilityState === 'visible') {
    const ocultoDesdeStr = sessionStorage.getItem('_ocultoDesde');
    sessionStorage.removeItem('_ocultoDesde');
    if (!ocultoDesdeStr) return;
    const transcurrido = Date.now() - parseInt(ocultoDesdeStr, 10);
    if (transcurrido > AUTO_LOCK_GRACIA_MS) _bloquearAppPorInactividad();
  }
});

function _bloquearAppPorInactividad() {
  // Solo bloquea si hay PIN configurado y la sesión estaba desbloqueada
  const storedHash = localStorage.getItem('finanzas_pin_hash');
  if (!storedHash || sessionStorage.getItem('pinVerificado') !== 'true') return;
  sessionStorage.removeItem('pinVerificado');
  _sessionPIN = null;
  _sessionDEK = null;
  const modal = document.getElementById('modal-pin');
  if (modal) {
    modal.style.display = 'flex';
    const input = document.getElementById('pin-input');
    if (input) { input.value = ''; input.focus(); }
  }
}

// ═════════════════════════════════════════════════════════════
// FIX: Constantes globales para validación de tasas
// ═════════════════════════════════════════════════════════════
const USD_HNL_VALID_RANGE = { min: 20, max: 35 };

// ========== VARIABLES GLOBALES Y ESTADO ==========
const LS_KEY='mifinanzashn_pro_v20_full';
let state={setup:false,nombre:'',saldoInicial:0,cuentas:{efectivo:0,ahorro:0},cuentasIniciales:null,cuentasInicialesV:0,eliminados:{},sellosV:0,transactions:[],goals:[],receivables:[],payables:[],prestamos:[],tarjetas:[],pagosRecurrentes:[],transferenciasProgramadas:[],grupos:[],presupuestos:[],misCuentas:[],diasPago:null,budgetRules:{gastos:65,ahorro:20,extra:15}};

// ────────────────────────────────────────────────────────────────────
// CARGA INICIAL — detecta si el state está cifrado o en plano
// ────────────────────────────────────────────────────────────────────
// Nota: si está cifrado, el state se carga DESPUÉS de verificar el PIN.
// Aquí solo intentamos cargar si está en plano (usuarios legacy sin cifrado).
(function() {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return; // No hay state guardado
  
  // Intentar parsear como JSON (state en plano, legacy)
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof parsed.setup === 'boolean') {
      // Es un state plano válido
      Object.keys(state).forEach(key => {
        if (parsed[key] !== undefined) {
          if (Array.isArray(state[key]) && !Array.isArray(parsed[key])) {
            state[key] = [];
          } else {
            state[key] = parsed[key];
          }
        }
      });
      // Migrate: ensure cuentas exists
      if (!state.cuentas) state.cuentas = {efectivo: state.saldoInicial||0, ahorro: 0};
      if (typeof state.cuentas.efectivo === 'undefined') state.cuentas.efectivo = 0;
      if (typeof state.cuentas.ahorro === 'undefined') state.cuentas.ahorro = 0;
      
      console.log('📂 State cargado en plano (legacy)');
    }
  } catch (e) {
    // No es JSON válido → probablemente está cifrado (base64)
    // El state se cargará después de verificar el PIN
    console.log('🔒 State cifrado detectado — se cargará tras verificar PIN');
  }
})();

// ────────────────────────────────────────────────────────────────────
// Función auxiliar: cargar y descifrar state con la DEK de sesión
// ────────────────────────────────────────────────────────────────────
async function loadAndDecryptState() {
  if (!_sessionDEK) {
    console.error('❌ No hay DEK en sesión para descifrar');
    return false;
  }
  
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return false;
  
  // Intentar descifrar
  const decrypted = await _decryptState(raw, _sessionDEK);
  if (!decrypted) {
    console.error('❌ Error descifrando state');
    return false;
  }
  
  // Aplicar al state global
  Object.keys(state).forEach(key => {
    if (decrypted[key] !== undefined) {
      if (Array.isArray(state[key]) && !Array.isArray(decrypted[key])) {
        state[key] = [];
      } else {
        state[key] = decrypted[key];
      }
    }
  });
  
  // Migraciones
  if (!state.cuentas) state.cuentas = {efectivo: state.saldoInicial||0, ahorro: 0};
  if (typeof state.cuentas.efectivo === 'undefined') state.cuentas.efectivo = 0;
  if (typeof state.cuentas.ahorro === 'undefined') state.cuentas.ahorro = 0;
  
  console.log('✅ State descifrado y cargado');
  return true;
}
if (state.transactions && state.transactions.length > 0) { state.transactions.forEach(t => { if (t.type === 'expense' && !t.tipo) { t.tipo = (t.cat === 'Vivienda' || t.cat === 'Alimentación' || t.cat === '🏠 Vivienda') ? 'fijo' : 'extra'; } }); }
let mainChart = null;
// P0-1: appPIN ahora almacena el HASH (no el PIN en crudo)
// FIX SEGURIDAD: recordarPIN deshabilitado permanentemente — era un bypass
// del cifrado AES-256 (entraba sin pedir PIN, leyendo state plano de IDB).
// Limpiamos el flag por si quedó activado de versiones anteriores.
let appPIN = localStorage.getItem('finanzas_pin_hash') || '';
try { localStorage.removeItem('finanzas_recordar'); } catch(e) {}
let recordarPIN = false;
// ─────────────────────────────────────────────────────────────────
// MULTIMONEDA: fL ahora delega en window.currencyManager si existe.
// Mantiene fallback a L. para no romper nada antes de que cargue.
// El state SIEMPRE guarda en HNL (moneda base); fL solo cambia el display.
// ─────────────────────────────────────────────────────────────────
// Descarga un Blob como archivo. La URL se libera más tarde: revocarla justo
// después del click puede cancelar la descarga en equipos lentos, y un
// alert() síncrono inmediato también puede frenarla antes de que empiece.
function descargarArchivo(blob, nombre, aviso) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  if (aviso) setTimeout(() => alert(aviso), 300);
}
const fL = n => {
  let txt;
  if (window.currencyManager && typeof window.currencyManager.formatFromBase === 'function') {
    txt = window.currencyManager.formatFromBase(Number(n) || 0);
  } else {
    txt = 'L. ' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
  }
  // Modo discreto: se conserva el símbolo de la moneda, se ocultan las cifras
  return document.body && document.body.classList.contains('modo-discreto') ? txt.replace(/-?[\d][\d.,]*/g, '••••') : txt;
};
function toggleModoDiscreto() {
  const activo = document.body.classList.toggle('modo-discreto');
  try { localStorage.setItem('mph_modo_discreto', activo ? '1' : '0'); } catch (e) {}
  _pintarBotonesDiscreto(activo);
  if (typeof renderAll === 'function' && state.setup) renderAll();
}
document.addEventListener('DOMContentLoaded', () => {
  let activo = false;
  try { activo = localStorage.getItem('mph_modo_discreto') === '1'; } catch (e) {}
  if (activo) {
    document.body.classList.add('modo-discreto');
    _pintarBotonesDiscreto(true);
  }
});
function _pintarBotonesDiscreto(activo) {
  document.querySelectorAll('.btn-modo-discreto').forEach(btn => {
    btn.textContent = activo ? '🙈' : '👁️';
    btn.title = activo ? 'Mostrar montos' : 'Ocultar montos';
  });
}
// P1-6: escape HTML para todos los campos del usuario insertados vía innerHTML.
// Esto cierra la superficie XSS aunque alguien logre meter datos maliciosos
// (por import, edición manual de localStorage, o un payload en una transacción).
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));

// ────────────────────────────────────────────────────────────────────
// CAPA 3: Sanitización de IDs en runtime (defensa en profundidad)
// ────────────────────────────────────────────────────────────────────
// Aunque los IDs están validados en import Y escapados en onclick,
// añadimos una capa adicional: las funciones que reciben IDs los validan.

const _idRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^[a-z0-9_]{5,20}$/i;

function _esIdSeguro(id) {
  if (typeof id !== 'string') return false;
  if (id.length > 50) return false; // Demasiado largo
  return _idRegex.test(id);
}

// Wrapper para funciones críticas: verifica el ID antes de ejecutar
function _conIdValidado(func, nombreFunc) {
  return function(id, ...args) {
    if (!_esIdSeguro(id)) {
      console.error(`⚠️ ID inválido bloqueado en ${nombreFunc}:`, id);
      alert('❌ Error de seguridad: ID inválido detectado.');
      return;
    }
    return func(id, ...args);
  };
}

// Proteger funciones críticas (wrapping automático al cargar)
window.addEventListener('DOMContentLoaded', () => {
  const funcionesCriticas = [
    'abrirEdicionTx', 'softDeleteTx', 'openAbono', 'deleteMeta', 'editarMeta',
    'abonarCobrar', 'editarCobrar', 'eliminarCobrar',
    'abonarPagar', 'editarPagar', 'eliminarPagar',
    'pagarCuotaPrestamo', 'editarPrestamo', 'eliminarPrestamo',
    'pagarTarjeta', 'ajustarSaldoTarjeta', 'deleteTarjeta',
    'marcarPagoRecurrente', 'editarRecurrente', 'eliminarRecurrente',
    'verFactura',
    'abrirGrupo', 'eliminarGrupo', 'abrirGastoGrupo', 'abrirPagoGrupo', 'eliminarMovGrupo', 'compartirGrupoWhatsApp', 'eliminarPresupuesto', 'ajustarSaldoCuenta', 'registrarRendimiento', 'desarchivarCuenta'
  ];
  
  funcionesCriticas.forEach(nombre => {
    if (typeof window[nombre] === 'function') {
      const original = window[nombre];
      window[nombre] = _conIdValidado(original, nombre);
    }
  });
  
  console.log('🛡️ Protección XSS activa: funciones críticas wrapeadas');
}, { once: true });

// P1-8: parseo estricto de montos. Rechaza notación científica ('e'/'E'),
// caracteres no numéricos y valores absurdos. Acepta coma o punto como decimal.
// Calculadora rápida: evalúa expresiones aritméticas simples ("150+200",
// "45.50*2") escritas directamente en un campo de monto. Parser manual
// (sin eval/Function) — solo entiende dígitos, + - * / ( ) y espacios.
function evaluarExpresionSegura(expr) {
  if (!/^[\d+\-*/().\s]+$/.test(expr)) return null;
  let i = 0;
  function skipSpaces() { while (expr[i] === ' ') i++; }
  function parseNumber() {
    skipSpaces();
    const start = i;
    if (expr[i] === '-') i++;
    const digitsStart = i;
    while (i < expr.length && /[\d.]/.test(expr[i])) i++;
    if (i === digitsStart) return null; // no había dígitos tras el posible signo
    const num = parseFloat(expr.slice(start, i));
    return Number.isFinite(num) ? num : null;
  }
  function parseFactor() {
    skipSpaces();
    if (expr[i] === '(') {
      i++;
      const val = parseExpr();
      skipSpaces();
      if (val === null || expr[i] !== ')') return null;
      i++;
      return val;
    }
    return parseNumber();
  }
  function parseTerm() {
    let val = parseFactor();
    if (val === null) return null;
    skipSpaces();
    while (expr[i] === '*' || expr[i] === '/') {
      const op = expr[i]; i++;
      const rhs = parseFactor();
      if (rhs === null) return null;
      val = op === '*' ? val * rhs : val / rhs;
      skipSpaces();
    }
    return val;
  }
  function parseExpr() {
    let val = parseTerm();
    if (val === null) return null;
    skipSpaces();
    while (expr[i] === '+' || expr[i] === '-') {
      const op = expr[i]; i++;
      const rhs = parseTerm();
      if (rhs === null) return null;
      val = op === '+' ? val + rhs : val - rhs;
      skipSpaces();
    }
    return val;
  }
  const result = parseExpr();
  skipSpaces();
  if (i !== expr.length) return null; // sobraron caracteres sin consumir
  return result;
}

// Igual que parseMonto pero devuelve NaN (como parseFloat) si no es válido,
// para no cambiar las validaciones isNaN()/||0 de quien lo llama.
function leerMonto(str) {
  const n = parseMonto(str);
  return n === null ? NaN : n;
}

function parseMonto(str) {
  if (str === null || str === undefined) return null;
  // En Honduras la coma separa miles ("1,500.00"): una coma seguida de
  // exactamente 3 dígitos se descarta; cualquier otra se toma como decimal.
  let s = String(str).trim().replace(/\s+/g, '')
    .replace(/(\d),(?=\d{3}(?!\d))/g, '$1').replace(',', '.');
  // Si no es un número simple pero parece una operación (+ - * /), intentar
  // evaluarla como calculadora rápida antes de rechazarla.
  if (!/^-?\d+(\.\d+)?$/.test(s) && /[+\-*/()]/.test(s)) {
    const resultado = evaluarExpresionSegura(s);
    if (resultado === null) return null;
    s = String(resultado);
  }
  // Rechazar notación científica y cualquier letra
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = parseFloat(s);
  if (!Number.isFinite(n) || n < 0 || n > 1e9) return null;
  return Math.round(n * 100) / 100;
}
