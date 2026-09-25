// Mi Pisto HN · 04-interfaz-y-kit.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.
// ========== LÓGICA DE NAVEGACIÓN Y UI ==========
function toggleHamburger_legacy(){/* reemplazada por la v2 */}
function saveBudgetRules(){const gastos=parseInt(document.getElementById('rule-gastos').value)||0;const ahorro=parseInt(document.getElementById('rule-ahorro').value)||0;const extra=parseInt(document.getElementById('rule-extra').value)||0;if(gastos+ahorro+extra!==100){document.getElementById('budget-total-warning').style.display='block';return}state.budgetRules={gastos,ahorro,extra};save();closeModal('modal-budget-rules');renderBudgetRules();alert(`✅ Reglas actualizadas`)}
function renderBudgetRules(){const rules=state.budgetRules||{gastos:65,ahorro:20,extra:15};document.getElementById('budget-gastos-val').textContent=rules.gastos+'%';document.getElementById('budget-ahorro-val').textContent=rules.ahorro+'%';document.getElementById('budget-extra-val').textContent=rules.extra+'%';document.getElementById('rule-gastos').value=rules.gastos;document.getElementById('rule-ahorro').value=rules.ahorro;document.getElementById('rule-extra').value=rules.extra}

let deferredPrompt=null,pwaDismissed=localStorage.getItem('pwa_banner_dismissed')==='true',isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
function isAppInstalled(){return window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true}
function cerrarIOSBar(){const b=document.getElementById('ios-bar');if(b)b.classList.remove('visible');localStorage.setItem('pwa_banner_dismissed','true');pwaDismissed=true}
function showPwaBanner(){
  if(isAppInstalled()||pwaDismissed)return;
  if(isIOS){
    // Mostrar el banner inferior de iOS inmediatamente (2 segundos)
    setTimeout(()=>{
      if(!isAppInstalled()&&!pwaDismissed){
        const b=document.getElementById('ios-bar');
        if(b)b.classList.add('visible');
      }
    },2000);
    return;
  }
  if(deferredPrompt)document.getElementById('pwa-banner').classList.remove('hidden');
}
window.addEventListener('beforeinstallprompt',(e)=>{e.preventDefault();deferredPrompt=e;setTimeout(showPwaBanner,5000)});
document.getElementById('install-btn')?.addEventListener('click',async()=>{if(!deferredPrompt)return;document.getElementById('pwa-banner').classList.add('hidden');deferredPrompt.prompt();const{outcome}=await deferredPrompt.userChoice;deferredPrompt=null});
function dismissPwaBanner(){document.getElementById('pwa-banner').classList.add('hidden');localStorage.setItem('pwa_banner_dismissed','true');pwaDismissed=true}

// ── P0-1: PBKDF2 helpers ─────────────────────────────────────
async function _derivarHashPIN(pin, salt, iterations = 100000) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(pin), { name: 'PBKDF2' }, false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2,'0')).join('');
}

// Parámetros del PIN local. "legacy": hash a 100k y KEK a 250k con el mismo
// salt. "v2": ambos a 600k; el hash usa un salt con sufijo propio porque, con
// mismo salt e iteraciones, el hash guardado sería idéntico a la KEK.
const PIN_KDF = {
  legacy: { hashIter: 100000, kekIter: 250000, sep: false },
  v2:     { hashIter: 600000, kekIter: 600000, sep: true },
};
const PIN_MIN_DIGITOS = 6;
function _pinKdf() { return localStorage.getItem('finanzas_pin_kdf') === 'v2' ? PIN_KDF.v2 : PIN_KDF.legacy; }
function _saltHashPIN(salt, kdf) {
  return kdf.sep ? new Uint8Array([...salt, ...new TextEncoder().encode('|mph-pin-hash')]) : salt;
}
async function _hashPIN(pin, salt, kdf = _pinKdf()) { return _derivarHashPIN(pin, _saltHashPIN(salt, kdf), kdf.hashIter); }
async function _kekPIN(pin, salt, kdf = _pinKdf()) { return _deriveKEKFromPIN(pin, salt, kdf.kekIter); }
// ═══ KIT DE RECUPERACIÓN ════════════════════════════════════════════════
// Una clave aleatoria de 128 bits (26 caracteres base32 de Crockford)
// envuelve la DEK y esa copia se guarda en este teléfono junto a la del
// PIN. Si se olvida el PIN, la clave abre la DEK y se crea un PIN nuevo sin
// perder datos. Por su entropía no se puede adivinar, así que las
// iteraciones de PBKDF2 son solo una capa extra.
const REC_ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const REC_KDF_ITER = 100000;
function _generarClaveRecuperacion() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let bits = '', txt = '';
  bytes.forEach(b => bits += b.toString(2).padStart(8, '0'));
  bits = bits.padEnd(130, '0');
  for (let i = 0; i < 130; i += 5) txt += REC_ALFABETO[parseInt(bits.slice(i, i + 5), 2)];
  return txt.match(/.{1,4}/g).join('-');
}
// Normaliza lo que escribe la persona: sin guiones ni espacios, O→0, I/L→1
function _normalizarClaveRecuperacion(txt) {
  const limpio = String(txt || '').toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  return /^[0-9A-HJKMNP-TV-Z]{26}$/.test(limpio) ? limpio : null;
}
function tieneKitRecuperacion() { return !!localStorage.getItem('finanzas_rec_dek'); }
function _borrarKitRecuperacion() {
  ['finanzas_rec_dek', 'finanzas_rec_iv', 'finanzas_rec_salt', 'finanzas_rec_fecha'].forEach(k => localStorage.removeItem(k));
}
async function _kekRecuperacion(claveNorm, salt) { return _deriveKEKFromPIN(claveNorm, salt, REC_KDF_ITER); }

async function generarKitRecuperacion() {
  if (!_sessionDEK) return alert('🔐 Primero configura un PIN: el kit protege tus datos cifrados.');
  if (tieneKitRecuperacion() && !confirm('Ya tienes un kit de recuperación. Si generas uno nuevo, la clave anterior dejará de funcionar.\n\n¿Generar uno nuevo?')) return;
  const clave = _generarClaveRecuperacion();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const { encrypted, iv } = await _encryptDEK(_sessionDEK, await _kekRecuperacion(_normalizarClaveRecuperacion(clave), salt));
  localStorage.setItem('finanzas_rec_dek', _b64EncodeArr(encrypted));
  localStorage.setItem('finanzas_rec_iv', _b64EncodeArr(iv));
  localStorage.setItem('finanzas_rec_salt', _b64EncodeArr(salt));
  localStorage.setItem('finanzas_rec_fecha', new Date().toISOString());
  document.getElementById('kit-rec-clave').textContent = clave;
  document.getElementById('btn-kit-descargar').onclick = () => {
    const texto = 'MI PISTO HN · KIT DE RECUPERACIÓN\n\n' +
      'Clave de recuperación:\n\n    ' + clave + '\n\n' +
      'Creada: ' + new Date().toLocaleString('es-HN') + '\n\n' +
      'Si olvidas tu PIN, en la pantalla de desbloqueo toca "¿Olvidaste tu PIN?" y escribe esta clave.\n' +
      'Funciona solo en el teléfono donde la generaste. Guarda este archivo fuera del teléfono\n' +
      '(impreso, en otro dispositivo o en un gestor de contraseñas) y no lo compartas.';
    descargarArchivo(new Blob([texto], { type: 'text/plain' }), 'MiPistoHN_kit_recuperacion.txt');
  };
  openModal('modal-kit-rec');
  renderEstadoKitRecuperacion();
  renderPrimerosPasos();
}
function renderEstadoKitRecuperacion() {
  const el = document.getElementById('kit-rec-estado');
  if (!el) return;
  const f = localStorage.getItem('finanzas_rec_fecha');
  el.textContent = f ? '✅ Kit creado el ' + new Date(f).toLocaleDateString('es-HN') : '⚠️ Sin kit: si olvidas tu PIN, perderás tus datos.';
  el.style.color = f ? 'var(--green)' : 'var(--aviso)';
}
/** Olvido de PIN: abre la DEK con la clave y crea un PIN nuevo. */
async function recuperarConKit() {
  const txt = prompt('🆘 Escribe tu clave de recuperación (los guiones son opcionales):');
  if (txt === null) return false;
  const clave = _normalizarClaveRecuperacion(txt);
  if (!clave) { alert('❌ La clave debe tener 26 caracteres (letras y números).'); return false; }
  const dek = await _decryptDEK(
    _b64DecodeArr(localStorage.getItem('finanzas_rec_dek')),
    _b64DecodeArr(localStorage.getItem('finanzas_rec_iv')),
    await _kekRecuperacion(clave, _b64DecodeArr(localStorage.getItem('finanzas_rec_salt'))));
  if (!dek) { alert('❌ Clave de recuperación incorrecta.'); return false; }
  const nuevo = prompt('✅ Clave correcta. Crea un PIN nuevo (' + PIN_MIN_DIGITOS + ' a 8 dígitos):');
  if (nuevo === null) return false;
  if (!new RegExp('^\\d{' + PIN_MIN_DIGITOS + ',8}$').test(nuevo)) { alert('❌ Debe tener entre ' + PIN_MIN_DIGITOS + ' y 8 números.'); return false; }
  if (prompt('Confirma tu PIN nuevo:') !== nuevo) { alert('❌ Los PINs no coinciden.'); return false; }
  await _guardarPINv2(nuevo, crypto.getRandomValues(new Uint8Array(16)), dek);
  if (typeof _registrarPINCorrecto === 'function') _registrarPINCorrecto();
  alert('✅ PIN cambiado. Tus datos siguen intactos: entra con tu PIN nuevo.');
  location.reload();
  return true;
}

// Guarda hash + salt + DEK envuelta con los parámetros v2
async function _guardarPINv2(pin, salt, dek) {
  const { encrypted, iv } = await _encryptDEK(dek, await _kekPIN(pin, salt, PIN_KDF.v2));
  const hash = await _hashPIN(pin, salt, PIN_KDF.v2);
  localStorage.setItem('finanzas_pin_hash', hash);
  localStorage.setItem('finanzas_pin_salt', _b64EncodeArr(salt));
  _saveDEKToStorage(encrypted, iv);
  localStorage.setItem('finanzas_pin_kdf', 'v2');
  appPIN = hash;
  return hash;
}

async function configurarPIN({ soloCambiar = false } = {}) {
  const esPrimerPIN = !localStorage.getItem('finanzas_pin_hash');
  const esActualizacion = !esPrimerPIN && _sessionDEK; // Tiene PIN + DEK en sesión
  
  const nuevoPIN = prompt('Crea un PIN de 6 a 8 dígitos (mientras más largo, más seguro):' + (soloCambiar ? '' : '\n(Deja en blanco para eliminar)'));
  if (nuevoPIN === null || (soloCambiar && nuevoPIN === '')) return;
  
  if (nuevoPIN === '') {
    // ⚠️ Eliminar PIN cuando hay datos cifrados es DESTRUCTIVO
    if (!esPrimerPIN && _isStateEncrypted()) {
      const confirma = confirm(
        '⚠️ ADVERTENCIA: Si eliminas el PIN, tus datos quedarán SIN CIFRAR en este teléfono ' +
        'y cualquiera con acceso a él podrá verlos.\n\n' +
        '¿Estás SEGURO de eliminar el PIN?'
      );
      if (!confirma) return;
    }
    
    // Guardar en plano ANTES de borrar la DEK: sin ella, las copias cifradas
    // de localStorage e IndexedDB ya no se podrían leer.
    await _convertirFacturas(false);
    _borrarKitRecuperacion();
    _sessionDEK = null;
    _sessionPIN = null;
    if (state.setup) await save();
    localStorage.removeItem('finanzas_pin_hash');
    localStorage.removeItem('finanzas_pin_salt');
    localStorage.removeItem('finanzas_pin_kdf');
    localStorage.removeItem('finanzas_dek_encrypted');
    localStorage.removeItem('finanzas_dek_iv');
    localStorage.removeItem('finanzas_pin'); // legacy
    appPIN = '';
    _sessionDEK = null;
    _sessionPIN = null;
    alert('🔓 PIN eliminado. Tus datos ya no están cifrados.');
    return;
  }
  
  // SEGURIDAD: un PIN de 4 dígitos (10,000 combinaciones) se fuerza por
  // fuerza bruta offline en minutos si alguien roba el localStorage. Se
  // permite hasta 8 dígitos — mientras más largo, más seguro.
  if (!/^\d{6,8}$/.test(nuevoPIN)) { alert('❌ Debe tener entre 6 y 8 números'); return; }

  const salt = crypto.getRandomValues(new Uint8Array(16));

  // ────────────────────────────────────────────────────────────
  // CASO 1: Primer PIN (creación inicial)
  // ────────────────────────────────────────────────────────────
  if (esPrimerPIN) {
    // Generar DEK nueva
    const dek = _generateDEK();
    _sessionDEK = dek;
    _sessionPIN = nuevoPIN;
    
    // Guardar PIN hash + salt + DEK cifrada (parámetros v2)
    await _guardarPINv2(nuevoPIN, salt, dek);
    
    // Si ya hay state (ej. terminó onboarding), cifrarlo ahora
    if (state.setup) {
      const encryptedState = await _encryptState(state, dek);
      localStorage.setItem(LS_KEY, encryptedState);
      await saveStateToDB(state); // reemplaza la copia en plano de IDB por una cifrada
      await _convertirFacturas(true);
      console.log('🔒 State inicial cifrado');
    }
    
    alert('✅ PIN configurado. Tus datos están protegidos con cifrado AES-256.');
    return;
  }
  
  // ────────────────────────────────────────────────────────────
  // CASO 2: Cambiar PIN existente (re-cifrar DEK)
  // ────────────────────────────────────────────────────────────
  if (esActualizacion) {
    // La DEK ya está en memoria, solo re-cifrarla con el nuevo PIN
    await _guardarPINv2(nuevoPIN, salt, _sessionDEK);
    _sessionPIN = nuevoPIN;
    
    alert('✅ PIN actualizado. Tu DEK se re-cifró con el nuevo PIN.');
    return;
  }
  
  // ────────────────────────────────────────────────────────────
  // CASO 3: Cambiar PIN pero sin DEK en sesión (ej. cambió sin verificar)
  // ────────────────────────────────────────────────────────────
  alert('⚠️ Para cambiar tu PIN, primero debes verificar el PIN actual e ingresar a la app.');
}
// P1-7: ELIMINADA verificarPIN síncrona obsoleta (comparaba intento crudo === appPIN
// donde appPIN ahora es el HASH PBKDF2; nunca matchearía). La versión async correcta
// se asigna más abajo en el archivo (sección "MEJORAS CRÍTICAS v1.1").
// Stub temprano por si algo invoca verificarPIN antes de que se sobrescriba:
var verificarPIN = function(){ /* será sobrescrita por la versión async */ };

// olvidePIN: si el usuario olvidó su PIN, la ÚNICA opción real es borrar
// todo y volver al onboarding (los datos están cifrados con AES-256 y no
// hay puerta trasera). Antes era un alert estéril; ahora ejecuta el reset
// completo con doble confirmación (mismo flujo que resetApp).
async function olvidePIN(){
  if (tieneKitRecuperacion() && confirm('🆘 ¿Tienes tu clave de recuperación?\n\nCon ella creas un PIN nuevo sin perder tus datos.\n\n[Cancelar] = no la tengo (borrar todo)')) {
    if (await recuperarConKit()) return;
    if (!confirm('No se recuperó el acceso. ¿Quieres ver la opción de borrar todo?')) return;
  }
  const c1 = confirm(
    '🚨 BORRAR TODO Y EMPEZAR DE CERO\n\n' +
    'Tus datos están cifrados con AES-256 y NO se pueden recuperar sin tu PIN.\n\n' +
    'Si continúas, se BORRARÁ:\n' +
    '• Todas tus transacciones (ingresos y gastos)\n' +
    '• Préstamos, tarjetas y deudas\n' +
    '• Metas de ahorro\n' +
    '• Tu PIN, datos personales y configuración\n\n' +
    '¿Quieres continuar?'
  );
  if (!c1) return;
  
  const c2 = confirm(
    '⚠️ ÚLTIMA ADVERTENCIA\n\n' +
    'Esta acción NO se puede deshacer.\n' +
    'Volverás al tutorial inicial como una instalación nueva.\n\n' +
    '¿Confirmar borrado total?'
  );
  if (!c2) return;
  
  // Limpiar localStorage
  try { localStorage.clear(); } catch(e) {}
  
  // Limpiar sessionStorage
  try { sessionStorage.clear(); } catch(e) {}
  
  // Limpiar IndexedDB (importante: incluye la copia plana del state)
  try {
    if (window.indexedDB) {
      indexedDB.databases().then(dbs => {
        dbs.forEach(db => {
          try { indexedDB.deleteDatabase(db.name); } catch(e) {}
        });
      }).catch(()=>{});
    }
  } catch(e) {}
  
  // Limpiar caches del Service Worker
  try {
    if ('caches' in window) {
      caches.keys().then(keys => {
        keys.forEach(k => caches.delete(k));
      }).catch(()=>{});
    }
  } catch(e) {}
  
  // Desregistrar Service Workers
  try {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(reg => reg.unregister());
      }).catch(()=>{});
    }
  } catch(e) {}
  
  alert('✅ Todo borrado. La app se reiniciará al tutorial.');
  setTimeout(() => location.reload(), 500);
}
function toggleRecordarPIN(){recordarPIN=document.getElementById('recordar-pin').checked;localStorage.setItem('finanzas_recordar',recordarPIN);}

function syncObSaldo(){
  const ef=leerMonto(document.getElementById('ob-efectivo')?.value)||0;
  const ah=leerMonto(document.getElementById('ob-ahorro')?.value)||0;
  const total=ef+ah;
  const salEl=document.getElementById('ob-salario');
  if(salEl&&total>0)salEl.value=total.toFixed(2);
}
async function finishOnboarding(){
  const nombre=document.getElementById('ob-nombre').value.trim();
  const saldoInicial=leerMonto(document.getElementById('ob-salario').value)||0;
  // El saldo puede ser 0: hay quien empieza a anotar desde el día de pago
  if(!nombre)return alert('Escribe tu nombre para comenzar');
  // SEGURIDAD: state.nombre se interpola en varias plantillas HTML (saludo,
  // conciliación, etc.). Sin esto, un nombre como "<img src=x onerror=...>"
  // ejecuta código arbitrario cada vez que se renderiza el dashboard.
  if(/[<>]/.test(nombre))return alert('El nombre no puede contener los caracteres < o >');
  if(nombre.length>100)return alert('El nombre es demasiado largo (máximo 100 caracteres)');
  const saldoEfectivo=leerMonto(document.getElementById('ob-efectivo')?.value)||0;
  const saldoAhorro=leerMonto(document.getElementById('ob-ahorro')?.value)||0;
  
  // ────────────────────────────────────────────────────────────
  // OBLIGAR creación de PIN antes de finalizar onboarding
  // ────────────────────────────────────────────────────────────
  const tienePIN = localStorage.getItem('finanzas_pin_hash');
  if (!tienePIN) {
    const crearPIN = confirm(
      '🔐 Para proteger tus datos, necesitas crear un PIN de 6 a 8 dígitos.\n\n' +
      'Tu PIN cifra todos tus movimientos con AES-256.\n' +
      'Sin el PIN, nadie puede acceder a tus datos.\n\n' +
      '¿Crear PIN ahora?'
    );
    if (!crearPIN) {
      alert('⚠️ No puedes continuar sin crear un PIN.');
      return;
    }

    // Solicitar PIN. SEGURIDAD: 4 dígitos = solo 10,000 combinaciones,
    // forzable offline en minutos si alguien roba el localStorage. Se
    // permite hasta 8 — mientras más largo, más seguro.
    const nuevoPIN = prompt('Crea tu PIN (6 a 8 dígitos — mientras más largo, más seguro):');
    if (!nuevoPIN || !/^\d{6,8}$/.test(nuevoPIN)) {
      alert('❌ PIN inválido. Debe tener entre 6 y 8 números.');
      return;
    }
    
    const confirmaPIN = prompt('Confirma tu PIN:');
    if (nuevoPIN !== confirmaPIN) {
      alert('❌ Los PINs no coinciden.');
      return;
    }
    
    // Generar salt + DEK y guardar con parámetros v2
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const dek = _generateDEK();
    _sessionDEK = dek;
    _sessionPIN = nuevoPIN;
    await _guardarPINv2(nuevoPIN, salt, dek);
  }
  
  // ────────────────────────────────────────────────────────────
  // Crear state inicial
  // ────────────────────────────────────────────────────────────
  state={
    setup:true,
    nombre,
    saldoInicial,
    cuentasIniciales:{efectivo:saldoEfectivo,ahorro:saldoAhorro},
    cuentasInicialesV:2,
    eliminados:{},
    sellosV:1,
    cuentas:{efectivo:saldoEfectivo,ahorro:saldoAhorro}, // legacy
    transactions:[],
    goals:[],
    receivables:[],
    payables:[],
    prestamos:[],
    tarjetas:[],
    pagosRecurrentes:[],
    transferenciasProgramadas:[],
    grupos:[],
    presupuestos:[],
    misCuentas:[],
    budgetRules:{gastos:65,ahorro:20,extra:15}
  };

  // save() ahora cifra automáticamente (porque _sessionDEK está cargado)
  save();
  
  document.getElementById('onboarding').style.display='none';
  renderAll();
  renderWelcome();
  abrirTour(0);
}

function toggleFabMenu_legacy(){/* reemplazada por la v2 */}
document.addEventListener('click_legacy',(e)=>{/* reemplazado por la v2 */});

function calculateLoan(){const P=leerMonto(document.getElementById('prest-monto').value)||0,r=(leerMonto(document.getElementById('prest-tasa').value)||0)/100/12,n=parseInt(document.getElementById('prest-cuotas').value)||1;let cuota=r===0?P/n:P*(r*Math.pow(1+r,n))/(Math.pow(1+r,n)-1);document.getElementById('prest-cuota-calc').value=fL(cuota);const interes=P*r,capital=cuota-interes;document.getElementById('prest-breakdown').classList.remove('hidden');document.getElementById('prest-breakdown').innerHTML=`<div class="loan-breakdown-row"><span>Cuota mensual:</span><strong>${fL(cuota)}</strong></div><div class="loan-breakdown-row"><span>→ Interés:</span><span style="color:var(--red)">${fL(interes)}</span></div>`;return cuota}
function checkCreditCard(){const cuentaEl=document.getElementById('gasto-cuenta');const pagoType=cuentaEl?cuentaEl.value:document.getElementById('gasto-pago').value;const tarjetaSelect=document.getElementById('gasto-tarjeta');if(pagoType==='credito'){tarjetaSelect.classList.remove('hidden');tarjetaSelect.innerHTML='<option value="">Selecciona tarjeta...</option>';state.tarjetas.forEach(t=>{tarjetaSelect.innerHTML+=`<option value="${t.id}">${esc(t.nombre)} (Saldo: ${typeof textoSaldoTarjeta==='function'?esc(textoSaldoTarjeta(t)):fL(t.saldo)})</option>`})}else{tarjetaSelect.classList.add('hidden')}document.getElementById('gasto-cuotas-wrap')?.classList.toggle('hidden',pagoType!=='credito')}
