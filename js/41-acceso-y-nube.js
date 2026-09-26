// Mi Pisto HN · 41-acceso-y-nube.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.
// ========== HUELLA QUE ABRE, NUBE AL EMPEZAR, ACTUALIZAR Y ABRIR EN LA COMPU ==========

// ── Huella / Face ID que de verdad abren la app ─────────────────────────
// Antes la huella solo confirmaba quién eras y después pedía el PIN igual,
// porque el PIN es el que abre la clave de los datos. Con la extensión PRF de
// WebAuthn el lector de huellas entrega un secreto que solo sale con tu dedo o
// tu cara: con él se guarda una segunda copia de la clave de los datos. En los
// teléfonos que no la tienen, la huella no se activa y se sigue con el PIN.
const BIO_DEK_KEY = 'mph_bio_dek', BIO_IV_KEY = 'mph_bio_dek_iv';
const _BIO_SAL = new TextEncoder().encode('mi-pisto-hn · huella · v1');

async function _llaveDeHuella(prf) {
  const h = await crypto.subtle.digest('SHA-256', new Uint8Array([..._BIO_SAL, ...new Uint8Array(prf)]));
  return crypto.subtle.importKey('raw', h, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
function huellaAbreLaApp() {
  return !!(localStorage.getItem(WEBAUTHN_KEY) && localStorage.getItem(BIO_DEK_KEY) && localStorage.getItem(BIO_IV_KEY));
}
/** Pide la huella y devuelve el secreto PRF, o null si no se pudo */
async function _secretoDeHuella(credId) {
  try {
    const cred = await navigator.credentials.get({ publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ id: _b64ToBuf(credId), type: 'public-key' }],
      userVerification: 'required', timeout: 60000,
      extensions: { prf: { eval: { first: _BIO_SAL } } },
    } });
    const r = cred && cred.getClientExtensionResults ? cred.getClientExtensionResults() : {};
    return (r.prf && r.prf.results && r.prf.results.first) || null;
  } catch (e) { console.warn('Huella:', e.name); return null; }
}
/** Borra la copia de la clave que abre la huella (cuando la clave cambió o se desactivó) */
function _olvidarHuella(avisarle) {
  const tenia = huellaAbreLaApp();
  [WEBAUTHN_KEY, BIO_DEK_KEY, BIO_IV_KEY].forEach(k => localStorage.removeItem(k));
  if (typeof renderBiometriaConfig === 'function') renderBiometriaConfig();
  if (tenia && avisarle) setTimeout(() => avisar('👆 Tus datos cambiaron de clave al sincronizar. Vuelve a activar la huella en Configuración → Seguridad.'), 1800);
}

registrarBiometria = async function () {
  if (!isWebAuthnAvailable()) return avisar('❌ Tu dispositivo no tiene huella ni Face ID disponibles para la app.');
  if (!_sessionDEK) return avisar('🔐 Primero crea tu PIN y entra con él. La huella es un atajo para no escribirlo.');
  try {
    const cred = await navigator.credentials.create({ publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'Mi Pisto HN', id: _getRpId() },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'usuario', displayName: 'Mi Pisto HN' },
      pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      timeout: 60000, attestation: 'none',
      extensions: { prf: { eval: { first: _BIO_SAL } } },
    } });
    const credId = _bufToB64(cred.rawId);
    const r = cred.getClientExtensionResults ? cred.getClientExtensionResults() : {};
    if (!r.prf || r.prf.enabled === false) {
      return avisar('📵 Tu teléfono confirma la huella, pero no permite usarla para abrir tus datos cifrados. Seguirás entrando con tu PIN.\n\n(Funciona en Android con Chrome reciente y en iPhone con iOS 18 o más nuevo.)');
    }
    // Algunos lectores dan el secreto al crear; los demás, al usarla por primera vez
    const secreto = (r.prf.results && r.prf.results.first) || await _secretoDeHuella(credId);
    if (!secreto) return avisar('❌ No se pudo leer la huella. Inténtalo otra vez.');
    const { encrypted, iv } = await _encryptDEK(_sessionDEK, await _llaveDeHuella(secreto));
    localStorage.setItem(WEBAUTHN_KEY, credId);
    localStorage.setItem(BIO_DEK_KEY, _b64EncodeArr(encrypted));
    localStorage.setItem(BIO_IV_KEY, _b64EncodeArr(iv));
    renderBiometriaConfig();
    avisar('✅ ¡Listo! La próxima vez entra con tu huella o Face ID. El PIN sigue sirviendo si la huella falla.');
  } catch (e) {
    if (e.name === 'NotAllowedError') avisar('❌ Se canceló o no se dio permiso.');
    else avisar('❌ No se pudo activar: ' + e.message);
  }
};

desactivarBiometria = async function () {
  if (!(await confirmar('¿Desactivar la entrada con huella / Face ID?\n\nSeguirás entrando con tu PIN.'))) return;
  _olvidarHuella(false);
  avisar('🚫 Huella desactivada.');
};

/** Abre la app con la huella. true si entró. */
async function _desbloquearConHuella() {
  if (!huellaAbreLaApp() || !isWebAuthnAvailable()) return false;
  if (typeof _estadoBloqueoPIN === 'function' && _estadoBloqueoPIN().bloqueado) return false;
  const secreto = await _secretoDeHuella(localStorage.getItem(WEBAUTHN_KEY));
  if (!secreto) return false;
  const dek = await _decryptDEK(_b64DecodeArr(localStorage.getItem(BIO_DEK_KEY)), _b64DecodeArr(localStorage.getItem(BIO_IV_KEY)), await _llaveDeHuella(secreto));
  if (!dek) { _olvidarHuella(false); return false; }
  _registrarPINCorrecto();
  sessionStorage.setItem('pinVerificado', 'true');
  _sessionDEK = dek;
  await _continuarDesbloqueo(null, null, true);
  return true;
}

async function _entrarConHuella() {
  document.getElementById('modal-pin').style.display = 'none';
  _showBioScreen();
  const ok = await _desbloquearConHuella();
  _setBioResult(ok);
  await new Promise(r => setTimeout(r, ok ? 500 : 900));
  _hideBioScreen();
  if (!ok) {
    document.getElementById('modal-pin').style.display = 'flex';
    document.getElementById('pin-input')?.focus();
  }
}

// Al abrir: con huella que abre, se pide la huella; si no, directo el PIN
const _verificarPINmejoradoBase = verificarPINmejorado;
verificarPINmejorado = function () {
  const tienePin = !!localStorage.getItem('finanzas_pin_hash');
  // Registros viejos (solo confirmaban identidad): ya no sirven, se limpian
  if (localStorage.getItem(WEBAUTHN_KEY) && !huellaAbreLaApp()) localStorage.removeItem(WEBAUTHN_KEY);
  if (!tienePin || !huellaAbreLaApp()) return _verificarPINmejoradoBase();
  _updatePinBioBtn();
  _entrarConHuella();
};
intentarBiometriaDesdePin = _entrarConHuella;

// ── Al terminar el perfil: ¿respaldar en la nube? ───────────────────────
/** true si se fue a Google (la página navega y vuelve) */
async function ofrecerNubeAlEmpezar() {
  if (typeof cloudSync === 'undefined' || cloudSync.user || !cloudSync.sdkAvailable()) return false;
  const si = await confirmar('☁️ ¿Respaldar tus datos en la nube?\n\nConectando tu cuenta de Google:\n• Si pierdes o cambias el teléfono, no pierdes nada.\n• Puedes ver y anotar también en la computadora.\n• Van cifrados: ni Google ni nosotros podemos verlos.\n\n[Aceptar] = Conectar con Google\n[Cancelar] = Ahora no');
  if (!si) return false;
  await save();
  localStorage.setItem('mph_nube_empezar', '1');
  localStorage.setItem('mph_tour_pendiente', '1');
  const r = await cloudSync.signInWithGoogle();
  if (!r.ok) {
    localStorage.removeItem('mph_nube_empezar');
    localStorage.removeItem('mph_tour_pendiente');
    await avisar('❌ No se pudo conectar con Google: ' + (r.error || '') + '\n\nPuedes hacerlo después en Configuración → Sincronización.');
    return false;
  }
  return true;
}

/** El PIN de este dispositivo: el de la sesión o, si se entró con huella, se pide y se comprueba */
async function _pinDeEsteDispositivo() {
  if (_sessionPIN) return _sessionPIN;
  const salt = localStorage.getItem('finanzas_pin_salt');
  if (!salt) return null;
  const pin = await preguntar('🔐 Escribe tu PIN para terminar:');
  if (pin === null) return null;
  if (await _hashPIN(String(pin).trim(), _b64DecodeArr(salt)) !== localStorage.getItem('finanzas_pin_hash')) {
    await avisar('❌ Ese no es tu PIN. No se cambió nada.');
    return null;
  }
  return (_sessionPIN = String(pin).trim());
}

/** Este dispositivo pasa a usar otra clave de datos (la de la nube) */
async function _usarOtraClaveLocal(dek, pin) {
  const cambia = !_sessionDEK || _b64EncodeArr(_sessionDEK) !== _b64EncodeArr(dek);
  if (!cambia) return;
  await _guardarPINv2(pin, crypto.getRandomValues(new Uint8Array(16)), dek);
  _sessionDEK = dek;
  if (typeof tieneKitRecuperacion === 'function' && tieneKitRecuperacion()) {
    _borrarKitRecuperacion();
    setTimeout(() => avisar('🆘 Tu kit de recuperación anterior ya no sirve con los datos juntos. Genera uno nuevo en Configuración → Seguridad.'), 1500);
  }
  _olvidarHuella(true);
}

// ── Botón "Actualizar": traer lo nuevo de tu cuenta ahora mismo ─────────
async function actualizarDesdeNube() {
  if (typeof cloudSync === 'undefined' || !cloudSync.user) {
    if (await confirmar('☁️ Para tener tus datos en el celular y en la computadora, conecta tu cuenta de Google.\n\n[Aceptar] = Ir a Sincronización\n[Cancelar] = Ahora no')) irASincronizacion();
    return;
  }
  if (!_sessionDEK) return avisar('🔐 Entra con tu PIN para sincronizar.');
  if (!cloudSync.hasCloudKey() && !(await cloudSync.asegurarClaveNube())) return;
  const botones = document.querySelectorAll('.btn-actualizar-nube');
  botones.forEach(b => { b.disabled = true; b.classList.add('girando'); });
  let r;
  try { r = await cloudSync._autoMergeAndUpload(); }
  finally { botones.forEach(b => { b.disabled = false; b.classList.remove('girando'); }); }
  if (r.ok) {
    cloudSync.setLocalSyncVersion(r.version);
    renderAll();
    const nuevos = r.mergeStats ? r.mergeStats.totalRemoteNew : 0;
    cloudSync._updateIndicator('synced', nuevos ? '✓ +' + nuevos + ' nuevos' : '✓ Al día');
    setTimeout(() => cloudSync._updateIndicator('hidden'), 3000);
  } else if (/bajar la versión más nueva/.test(r.error || '')) {
    // La nube tiene datos con otra clave: el camino de "Subir" los junta
    subirDatosCloud();
  } else avisar('❌ No se pudo actualizar: ' + (r.error || 'error desconocido'));
}

// Los botones de actualizar solo se ven con la cuenta conectada
const _renderCloudSyncUIBase = renderCloudSyncUI;
renderCloudSyncUI = window.renderCloudSyncUI = async function () {
  const r = await _renderCloudSyncUIBase.apply(this, arguments);
  document.body.classList.toggle('nube-conectada', !!(typeof cloudSync !== 'undefined' && cloudSync.user));
  return r;
};

// ── "Abrir en la computadora": la dirección, copiar, compartir y QR ────
function direccionDeLaApp() {
  return location.origin + location.pathname.replace(/index\.html$/, '');
}
function _cargarQR() {
  if (window.qrcode) return Promise.resolve(true);
  return new Promise(res => {
    const s = document.createElement('script');
    s.src = 'js/vendor/qrcode.js';
    s.onload = () => res(!!window.qrcode);
    s.onerror = () => res(false);
    document.head.appendChild(s);
  });
}
async function abrirEnLaComputadora() {
  const url = direccionDeLaApp();
  let modal = document.getElementById('modal-abrir-compu');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-abrir-compu';
    modal.className = 'modal';
    modal.onclick = e => { if (e.target === modal) closeModal('modal-abrir-compu'); };
    document.body.appendChild(modal);
  }
  modal.innerHTML = `<div class="modal-content" style="text-align:center">
    <h3 style="margin-bottom:6px">💻 Abrir en la computadora</h3>
    <p style="font-size:12px;color:var(--text2);line-height:1.5;margin-bottom:12px">Escribe esta dirección en el navegador de tu computadora (Chrome, Edge o Safari):</p>
    <div id="compu-url" style="font-weight:700;font-size:15px;word-break:break-all;padding:12px;border-radius:10px;background:var(--bg3);margin-bottom:12px">${esc(url)}</div>
    <div id="compu-qr" style="display:flex;justify-content:center;margin-bottom:12px"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
      <button type="button" class="btn btn-secondary" style="margin:0" onclick="copiarDireccionApp()">📋 Copiar</button>
      <button type="button" class="btn btn-secondary" style="margin:0" onclick="compartirDireccionApp()">📤 Enviar</button>
    </div>
    <p style="font-size:11px;color:var(--text2);line-height:1.5;text-align:left;margin-bottom:12px">Allá toca <strong>"📲 Ya uso Mi Pisto en otro dispositivo"</strong> y entra con <strong>la misma cuenta de Google</strong>${typeof cloudSync !== 'undefined' && cloudSync.user && cloudSync.user.email ? ` (<strong>${esc(cloudSync.user.email)}</strong>)` : ''}. Si todavía no conectas la nube en este teléfono, hazlo primero en Configuración → Sincronización.</p>
    <button type="button" class="btn btn-primary" onclick="closeModal('modal-abrir-compu')">Listo</button>
  </div>`;
  openModal('modal-abrir-compu');
  if (await _cargarQR()) {
    try {
      const qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      document.getElementById('compu-qr').innerHTML = qr.createSvgTag({ cellSize: 5, margin: 3, scalable: true });
      const svg = document.querySelector('#compu-qr svg');
      if (svg) { svg.style.width = '170px'; svg.style.height = '170px'; svg.style.background = '#fff'; svg.style.borderRadius = '8px'; }
    } catch (e) {}
  }
}
async function copiarDireccionApp() {
  try { await navigator.clipboard.writeText(direccionDeLaApp()); avisar('📋 Dirección copiada.'); }
  catch (e) { avisar('Copia esta dirección:\n\n' + direccionDeLaApp()); }
}
async function compartirDireccionApp() {
  const url = direccionDeLaApp();
  if (navigator.share) {
    try { await navigator.share({ title: 'Mi Pisto HN', text: 'Abre Mi Pisto HN en la computadora:', url }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  copiarDireccionApp();
}

// ── Tiempo real: lo que anotas en el teléfono aparece solo en la compu ──
// Supabase Realtime avisa cuando cambia la fila de tu cuenta (respeta RLS:
// solo llegan los cambios de tu propia fila). El aviso no trae nada legible:
// al recibirlo se baja el bloque cifrado, se descifra aquí y se junta.
let _canalNube = null, _traerTimer = null, _ultimoTraer = 0;

/** Baja lo nuevo de la nube y lo junta en silencio. Devuelve cuántos elementos llegaron (o null si no se pudo). */
async function traerDeLaNube() {
  if (typeof cloudSync === 'undefined' || !cloudSync.user || !_sessionDEK || !cloudSync.hasCloudKey()) return null;
  if (cloudSync._isSyncing) return 0; // la sincronización en curso ya junta lo remoto
  _ultimoTraer = Date.now();
  let info;
  try { info = await cloudSync.getRemoteInfo({ strict: true }); } catch (e) { return null; }
  if (!info || info.version <= cloudSync.getLocalSyncVersion()) return 0;
  cloudSync._isSyncing = true;
  try {
    const dl = await cloudSync._downloadAndDecrypt();
    if (!dl.ok) return null;
    const { merged, diff } = cloudSync.mergeStates(state, dl.data);
    const cambios = diff.totalRemoteNew + diff.totalConflicts + diff.totalRemovidos;
    if (cambios || diff.totalLocalNew) {
      Object.keys(state).forEach(k => delete state[k]);
      Object.assign(state, merged);
      ['pagosRecurrentes', 'prestamos', 'goals', 'tarjetas', 'receivables', 'payables', 'transferenciasProgramadas', 'grupos', 'presupuestos', 'misCuentas', 'categorias'].forEach(f => { if (!state[f]) state[f] = []; });
      _tomarBaseSync();
      try { localStorage.setItem(LS_KEY, await _encryptState(state, _sessionDEK)); saveStateToDB(state).catch(() => {}); } catch (e) {}
    }
    cloudSync.setLocalSyncVersion(dl.version);
    if (cambios) {
      renderAll();
      const n = diff.totalRemoteNew;
      if (typeof avisoRapido === 'function') avisoRapido('☁️ ' + (n ? n + (n === 1 ? ' cambio nuevo' : ' cambios nuevos') : 'Datos al día') + ' desde ' + (dl.deviceName || 'tu otro dispositivo'), 3500);
    }
    // Lo que este dispositivo tenía y la nube no, se sube
    if (diff.totalLocalNew || diff.totalConflicts) setTimeout(() => cloudSync._scheduleAutoSync(), 0);
    return diff.totalRemoteNew;
  } finally {
    cloudSync._isSyncing = false;
    if (cloudSync._resyncPendiente) { cloudSync._resyncPendiente = false; cloudSync._scheduleAutoSync(); }
  }
}

function _escucharNube() {
  if (typeof cloudSync === 'undefined' || !cloudSync.client || typeof cloudSync.client.channel !== 'function') return;
  const uid = cloudSync.user && cloudSync.user.id;
  if (!uid) { _dejarDeEscucharNube(); return; }
  if (_canalNube && _canalNube.__uid === uid) return;
  _dejarDeEscucharNube();
  _canalNube = cloudSync.client.channel('estado-' + uid)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'encrypted_states', filter: 'user_id=eq.' + uid }, p => {
      const fila = (p && p.new) || {};
      if (fila.device_id && fila.device_id === cloudSync.getDeviceId()) return; // el cambio lo hice yo
      clearTimeout(_traerTimer);
      _traerTimer = setTimeout(traerDeLaNube, 600);
    })
    .subscribe();
  _canalNube.__uid = uid;
}
function _dejarDeEscucharNube() {
  if (_canalNube && cloudSync.client && typeof cloudSync.client.removeChannel === 'function') { try { cloudSync.client.removeChannel(_canalNube); } catch (e) {} }
  _canalNube = null;
}

// Se engancha cada vez que cambia el estado de la sesión (entrar, salir, abrir la app)
const _renderCloudSyncUIConCanal = renderCloudSyncUI;
renderCloudSyncUI = window.renderCloudSyncUI = async function () {
  const r = await _renderCloudSyncUIConCanal.apply(this, arguments);
  _escucharNube();
  return r;
};

// Al abrir la app: en vez del aviso "Datos nuevos · Combinar", se junta solo
if (typeof cloudSync !== 'undefined') {
  const _checkBase = cloudSync.checkForNewerVersion.bind(cloudSync);
  cloudSync.checkForNewerVersion = async function () {
    if (_sessionDEK && this.hasCloudKey()) { if (await traerDeLaNube() !== null) return; }
    return _checkBase();
  };
}

// Al volver a la app o a la pestaña: por si el aviso en tiempo real se perdió.
// Al salir: lo que quedó pendiente se sube ya, sin esperar.
document.addEventListener('visibilitychange', () => {
  if (typeof cloudSync === 'undefined' || !cloudSync.user) return;
  if (document.visibilityState === 'visible') {
    if (Date.now() - _ultimoTraer > 5000) traerDeLaNube();
  } else if (cloudSync._autoSyncTimer) {
    clearTimeout(cloudSync._autoSyncTimer);
    cloudSync._autoSyncTimer = null;
    cloudSync._autoMergeAndUpload().then(r => { if (r && r.ok) cloudSync.setLocalSyncVersion(r.version); });
  }
});

// El Excel siempre sale con lo último de tu cuenta
if (typeof exportToExcelPro === 'function') {
  const _excelBase = exportToExcelPro;
  exportToExcelPro = async function () {
    if (typeof cloudSync !== 'undefined' && cloudSync.user && _sessionDEK) {
      await Promise.race([traerDeLaNube(), new Promise(r => setTimeout(r, 5000))]);
    }
    return _excelBase.apply(this, arguments);
  };
}
