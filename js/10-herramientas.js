// Mi Pisto HN · 10-herramientas.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.
// ==========================================
// 📊 OPCIÓN 6: LIQUIDEZ PROYECTADA 7 DÍAS
// ==========================================
function renderLiquidez7Dias() {
  const container = document.getElementById('liquidez-7dias');
  if (!container) return;
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  // P0-2: excluir transferencias internas (las conciliaciones SÍ son ajustes legítimos del balance)
  const saldoActual = state.saldoInicial
    + state.transactions.filter(t=>t.type==='income'&&!t.deletedAt&&!t.esTransferencia).reduce((a,b)=>a+b.amount,0)
    - state.transactions.filter(t=>t.type==='expense'&&!t.deletedAt&&!t.esTransferencia).reduce((a,b)=>a+b.amount,0);
  const pagosProximos = [];
  (state.pagosRecurrentes||[]).forEach(p => {
    let fp = new Date(hoy.getFullYear(), hoy.getMonth(), p.dia);
    if (fp < hoy) fp.setMonth(fp.getMonth()+1);
    const dias = Math.ceil((fp-hoy)/86400000);
    if (dias>=0 && dias<=7) pagosProximos.push({nombre:p.servicio, monto:p.monto, dias});
  });
  (state.prestamos||[]).forEach(p => {
    if (!p.cuota || p.cuotasPagadas >= p.cuotasTotal) return;
    const diaPago = p.fechaPago ? new Date(p.fechaPago).getDate() : 5;
    let fp = new Date(hoy.getFullYear(), hoy.getMonth(), diaPago);
    if (fp < hoy) fp.setMonth(fp.getMonth()+1);
    const dias = Math.ceil((fp-hoy)/86400000);
    if (dias>=0 && dias<=7) pagosProximos.push({nombre:'Cuota: '+p.entidad, monto:p.cuota, dias});
  });
  (state.tarjetas||[]).forEach(t => {
    const monto = pagoMinimoTarjeta(t) + cuotasDelMes(t);
    if (monto <= 0) return;
    let fp = new Date(hoy.getFullYear(), hoy.getMonth(), t.pago||15);
    if (fp < hoy) fp.setMonth(fp.getMonth()+1);
    const dias = Math.ceil((fp-hoy)/86400000);
    if (dias>=0 && dias<=7) pagosProximos.push({nombre:(cuotasDelMes(t)>0?'Pago ':'Mín. ')+t.nombre, monto, dias});
  });
  const totalEgresos = pagosProximos.reduce((a,b)=>a+b.monto,0);
  const liquidezReal = saldoActual - totalEgresos;
  const ratio = saldoActual>0 ? Math.max(0, liquidezReal/saldoActual) : 0;
  let estado, barColor;
  if (liquidezReal<0)    { estado='danger';  barColor='var(--red)'; }
  else if (ratio<0.3)    { estado='warning'; barColor='var(--amber)'; }
  else                   { estado='safe';    barColor='var(--green)'; }
  const badges = {safe:'badge-liq-safe',warning:'badge-liq-warning',danger:'badge-liq-danger'};
  const labels = {safe:'✅ Liquidez Saludable',warning:'⚠️ Liquidez Ajustada',danger:'🚨 Riesgo de Iliquidez'};
  const pct = Math.min(100,(ratio*100)).toFixed(0);
  const filas = pagosProximos.length > 0
    ? pagosProximos.sort((a,b)=>a.dias-b.dias).map(p=>{
        const dc = p.dias===0?'liq-dias-hoy':p.dias<=2?'liq-dias-1-2':'liq-dias-3-7';
        const dl = p.dias===0?'HOY':p.dias===1?'1 día':p.dias+' días';
        return `<div class="liquidez-pago-row"><span style="font-weight:600">${esc(p.nombre)}</span><div style="display:flex;align-items:center;gap:8px"><span class="liq-dias ${dc}">${dl}</span><span style="font-weight:700;color:var(--red)">-${fL(p.monto)}</span></div></div>`;
      }).join('')
    : `<div style="text-align:center;font-size:12px;color:var(--text2);padding:6px 0">✅ Sin pagos en los próximos 7 días</div>`;
  container.innerHTML = `<div class="liquidez-widget">
    <div class="liquidez-header"><span class="liquidez-title">💧 Liquidez · próximos 7 días</span><span class="liquidez-badge ${badges[estado]}">${labels[estado]}</span></div>
    <div class="liquidez-grid">
      <div class="liquidez-box"><div class="liquidez-box-label">Saldo Actual</div><div class="liquidez-box-value" style="color:var(--blue)">${fL(saldoActual)}</div></div>
      <div class="liquidez-box"><div class="liquidez-box-label">Egresos 7d</div><div class="liquidez-box-value" style="color:var(--red)">-${fL(totalEgresos)}</div></div>
      <div class="liquidez-box"><div class="liquidez-box-label">Disponible Real</div><div class="liquidez-box-value" style="color:${barColor}">${fL(liquidezReal)}</div></div>
    </div>
    <div class="liquidez-bar-wrap"><div class="liquidez-bar" style="width:${pct}%;background:${barColor}"></div></div>
    <div class="liquidez-pagos">${filas}</div>
  </div>`;
}

// ==========================================
// ✏️ EDITAR / ELIMINAR TRANSACCIONES
// ==========================================
let _editTxType = 'expense';

function abrirEdicionTx(id) {
  const t = state.transactions.find(x => x.id === id);
  if (!t) return;
  _editTxType = t.type;
  document.getElementById('edit-tx-id').value = id;
  document.getElementById('edit-monto').value = t.amount;
  document.getElementById('edit-cat').value = t.cat || '';
  document.getElementById('edit-subcat').value = t.subcat || '';
  document.getElementById('edit-etiqueta').value = t.etiqueta || '';
  // Compra en moneda extranjera: lo que cobró el banco
  const extranjera = t.type === 'expense' && t.originalCurrency && t.originalCurrency !== 'HNL' && t.originalAmount && t.conversionRate;
  document.getElementById('edit-cobrado-wrap').style.display = extranjera ? 'block' : 'none';
  document.getElementById('edit-cobrado').value = extranjera && t.cobradoBanco ? t.amount.toFixed(2) : '';
  _renderMargenEdicion();
  // Fecha
  const d = new Date(t.date);
  const localISO = new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,16);
  document.getElementById('edit-fecha').value = localISO;
  // Tipo de gasto
  const tipoWrap = document.getElementById('edit-tipo-wrap');
  if (t.type === 'expense') {
    tipoWrap.style.display = 'block';
    document.getElementById('edit-tipo').value = t.tipo || 'extra';
  } else {
    tipoWrap.style.display = 'none';
  }
  // Toggle tipo
  document.getElementById('edit-type-income').className = 'edit-type-btn' + (t.type==='income'?' active-income':'');
  document.getElementById('edit-type-expense').className = 'edit-type-btn' + (t.type==='expense'?' active-expense':'');
  openModal('modal-edit-tx');
}

function setEditType(tipo) {
  _editTxType = tipo;
  document.getElementById('edit-type-income').className = 'edit-type-btn' + (tipo==='income'?' active-income':'');
  document.getElementById('edit-type-expense').className = 'edit-type-btn' + (tipo==='expense'?' active-expense':'');
  document.getElementById('edit-tipo-wrap').style.display = tipo==='expense' ? 'block' : 'none';
}

function _renderMargenEdicion() {
  const t = state.transactions.find(x => String(x.id) === String(document.getElementById('edit-tx-id').value));
  const el = document.getElementById('edit-margen-info');
  if (!t || !el || !t.originalAmount || !t.conversionRate) return;
  const cobrado = parseMonto(document.getElementById('edit-cobrado').value);
  const moneda = window.currencyManager ? window.currencyManager.format(t.originalAmount, t.originalCurrency) : t.originalAmount + ' ' + t.originalCurrency;
  el.innerHTML = cobrado > 0 ? _textoMargen(t.originalAmount, t.originalCurrency, referenciaHNL(t), cobrado)
    : 'Compra de ' + esc(moneda) + ' · a la tasa de referencia serían ' + fL(referenciaHNL(t)) + '. Anota lo que dice tu estado de cuenta.';
}
function guardarEdicionTx() {
  const id = document.getElementById('edit-tx-id').value; // P1-4: UUID string, no parseInt
  const t = state.transactions.find(x => String(x.id) === String(id));
  if (!t) return;
  const nuevoMonto = leerMonto(document.getElementById('edit-monto').value);
  if (!nuevoMonto || nuevoMonto <= 0) { alert('Monto inválido'); return; }
  // Ajustar saldo si cambió el monto o tipo
  const montoDiff = nuevoMonto - t.amount;
  const tipoCambio = _editTxType !== t.type;
  // Lo que cobró el banco manda sobre el monto (compras en moneda extranjera)
  let montoFinal = nuevoMonto;
  const wrapCobrado = document.getElementById('edit-cobrado-wrap');
  if (wrapCobrado && wrapCobrado.style.display !== 'none') {
    const txt = document.getElementById('edit-cobrado').value.trim();
    if (txt) {
      const cobrado = parseMonto(txt);
      if (!(cobrado > 0)) { alert('El monto que te cobró el banco no es válido.'); return; }
      if (!_cobradoRazonable(cobrado, referenciaHNL(t))) return;
      montoFinal = cobrado; t.cobradoBanco = true;
    } else if (t.cobradoBanco) {
      delete t.cobradoBanco;
    }
  }
  if (Array.isArray(t.splits) && t.splits.length && montoFinal !== t.amount) t.splits = _escalarSplits(t.splits, montoFinal);
  // Actualizar campos
  t.amount   = montoFinal;
  t.cat      = document.getElementById('edit-cat').value || t.cat;
  t.subcat   = document.getElementById('edit-subcat').value;
  t.etiqueta = document.getElementById('edit-etiqueta').value.trim();
  t.date     = new Date(document.getElementById('edit-fecha').value).toISOString();
  if (_editTxType === 'expense') t.tipo = document.getElementById('edit-tipo').value;
  if (tipoCambio) t.type = _editTxType;
  save();
  closeModal('modal-edit-tx');
  renderAll();
}

// ==========================================
// 🏷️ OPCIÓN 4: ETIQUETAS CON AUTOCOMPLETE
// ==========================================
function getEtiquetasGuardadas() {
  const freq = {};
  (state.transactions||[]).forEach(t => {
    if (t.etiqueta && t.etiqueta.trim()) {
      const e = t.etiqueta.trim().toLowerCase();
      freq[e] = (freq[e]||0)+1;
    }
  });
  return Object.entries(freq).sort((a,b)=>b[1]-a[1]).map(([label,count])=>({label,count}));
}

function onEtiquetaInput() {
  const val = (document.getElementById('etiqueta-input')?.value||'').trim().toLowerCase();
  const todas = getEtiquetasGuardadas();
  const matches = val ? todas.filter(e=>e.label.includes(val)) : todas.slice(0,5);
  renderEtiquetaDropdown(matches, val);
  toggleClearBtn();
}

function onEtiquetaFocus() {
  const todas = getEtiquetasGuardadas().slice(0,5);
  renderEtiquetaDropdown(todas, '');
}

function onEtiquetaBlur() {
  setTimeout(()=>{ document.getElementById('etiqueta-dropdown')?.classList.remove('open'); }, 150);
}

function onEtiquetaKeydown(e) {
  if(e.key==='Escape') clearEtiqueta();
  if(e.key==='Enter'){ e.preventDefault(); document.getElementById('etiqueta-dropdown')?.classList.remove('open'); }
}

function renderEtiquetaDropdown(matches, query) {
  const dd = document.getElementById('etiqueta-dropdown');
  if(!dd) return;
  if(matches.length===0 && !query){ dd.classList.remove('open'); return; }
  let html = matches.map(e=>`<div class="etiqueta-option" data-v="${esc(e.label)}" onclick="selectEtiqueta(this.dataset.v)"><span>${esc(e.label)}</span><span class="etiqueta-option-count">${e.count}x</span></div>`).join('');
  const exact = matches.find(e=>e.label===query);
  if(query && !exact) html += `<div class="etiqueta-option" data-v="${esc(query)}" onclick="selectEtiqueta(this.dataset.v)"><span class="etiqueta-option-new">+ Crear "${esc(query)}"</span></div>`;
  if(!html){ dd.classList.remove('open'); return; }
  dd.innerHTML = html;
  dd.classList.add('open');
}

function selectEtiqueta(val) {
  const input = document.getElementById('etiqueta-input');
  if(input) input.value = val;
  document.getElementById('etiqueta-dropdown')?.classList.remove('open');
  toggleClearBtn();
  renderChipsRapidas();
}

function clearEtiqueta() {
  const input = document.getElementById('etiqueta-input');
  if(input) input.value='';
  toggleClearBtn();
  document.getElementById('etiqueta-dropdown')?.classList.remove('open');
}

function toggleClearBtn() {
  const btn = document.getElementById('etiqueta-clear');
  const val = document.getElementById('etiqueta-input')?.value;
  if(btn) btn.classList.toggle('visible', !!(val&&val.length>0));
}

function renderChipsRapidas() {
  const container = document.getElementById('chips-rapidas-gasto');
  if(!container) return;
  const top5 = getEtiquetasGuardadas().slice(0,5);
  if(top5.length===0){ container.innerHTML=''; return; }
  const activa = document.getElementById('etiqueta-input')?.value||'';
  container.innerHTML = top5.map(e=>`<span class="chip-etiqueta ${e.label===activa?'active':''}" data-v="${esc(e.label)}" onclick="selectEtiqueta(this.dataset.v)">${esc(e.label)}</span>`).join('');
}

// ==========================================
// 🔐 OPCIÓN 5: WEBAUTHN — BIOMETRÍA NATIVA
// ==========================================
const WEBAUTHN_KEY = 'mipistohn_webauthn_credId';

function isWebAuthnAvailable() {
  return !!(window.PublicKeyCredential &&
    typeof navigator.credentials?.create === 'function' &&
    typeof navigator.credentials?.get === 'function');
}
function _bufToB64(buf) {
  const b = new Uint8Array(buf); let s = '';
  b.forEach(x => s += String.fromCharCode(x));
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}
function _b64ToBuf(b64) {
  const s = atob(b64.replace(/-/g,'+').replace(/_/g,'/'));
  const b = new Uint8Array(s.length);
  for (let i=0;i<s.length;i++) b[i]=s.charCodeAt(i);
  return b;
}
function _getRpId() { return window.location.hostname || 'localhost'; }

async function registrarBiometria() {
  if (!isWebAuthnAvailable()) { alert('❌ Tu dispositivo no soporta biometría.'); return; }
  try {
    const cred = await navigator.credentials.create({ publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'Mi Pisto HN', id: _getRpId() },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'usuario', displayName: 'Mi Pisto HN' },
      pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      timeout: 60000, attestation: 'none'
    }});
    localStorage.setItem(WEBAUTHN_KEY, _bufToB64(cred.rawId));
    renderBiometriaConfig();
    alert('✅ ¡Biometría activada! La próxima vez usa tu huella o Face ID.');
  } catch(e) {
    if (e.name==='NotAllowedError') alert('❌ Acceso denegado. Verifica los permisos del dispositivo.');
    else if (e.name==='InvalidStateError') alert('⚠️ Ya hay una credencial registrada.');
    else alert('❌ Error: ' + e.message);
  }
}

async function authenticateWithWebAuthn() {
  const credId = localStorage.getItem(WEBAUTHN_KEY);
  if (!credId || !isWebAuthnAvailable()) return false;
  try {
    await navigator.credentials.get({ publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ id: _b64ToBuf(credId), type: 'public-key' }],
      userVerification: 'required', timeout: 60000
    }});
    return true;
  } catch(e) { console.warn('WebAuthn:', e.name); return false; }
}

function desactivarBiometria() {
  if (!confirm('¿Desactivar la autenticación biométrica?')) return;
  localStorage.removeItem(WEBAUTHN_KEY);
  renderBiometriaConfig();
  alert('🚫 Biometría desactivada.');
}

function renderBiometriaConfig() {
  renderEstadoKitRecuperacion();
  const el = document.getElementById('biometria-config');
  if (!el) return;
  if (!isWebAuthnAvailable()) {
    el.innerHTML = `<div class="bio-unavailable">
      <div style="font-size:24px;margin-bottom:6px">📵</div>
      <div style="font-weight:700;font-size:13px;margin-bottom:4px">No disponible en este dispositivo</div>
      <div style="font-size:11px;color:var(--text2)">Requiere iOS Safari 14+ o Chrome 70+ en HTTPS.</div>
    </div>`; return;
  }
  const credId = localStorage.getItem(WEBAUTHN_KEY);
  if (credId) {
    el.innerHTML = `
      <div class="bio-status-card bio-status-active">
        <div style="font-size:28px">✅</div>
        <div><div style="font-weight:700;font-size:13px;color:var(--green)">Biometría Activada</div>
        <div style="font-size:11px;color:var(--text2)">Huella / Face ID activos al abrir la app</div></div>
      </div>
      <button class="btn btn-secondary" onclick="desactivarBiometria()" style="border:1px solid rgba(255,68,68,.3);color:var(--red);min-height:52px">🚫 Desactivar Biometría</button>`;
  } else {
    el.innerHTML = `
      <div class="bio-status-card bio-status-inactive">
        <div style="font-size:28px">👆</div>
        <div><div style="font-weight:700;font-size:13px">Disponible en tu dispositivo</div>
        <div style="font-size:11px;color:var(--text2)">Activa para no escribir el PIN cada vez</div></div>
      </div>
      <button class="btn btn-primary" onclick="registrarBiometria()" style="min-height:52px">🔐 Activar Huella / Face ID</button>`;
  }
}

function _showBioScreen() {
  const icon=document.getElementById('bio-icon');
  const title=document.getElementById('bio-title');
  const sub=document.getElementById('bio-sub');
  if(icon){icon.className='biometric-icon';icon.textContent='👆';}
  if(title) title.textContent='Verificando identidad';
  if(sub) sub.textContent='Usa tu huella dactilar o Face ID para continuar';
  document.getElementById('bio-screen')?.classList.add('visible');
}
function _hideBioScreen() { document.getElementById('bio-screen')?.classList.remove('visible'); }
function _setBioResult(ok) {
  const icon=document.getElementById('bio-icon');
  const title=document.getElementById('bio-title');
  const sub=document.getElementById('bio-sub');
  if(ok){
    if(icon){icon.className='biometric-icon success';icon.textContent='✅';}
    if(title) title.textContent='¡Identidad verificada!';
    if(sub) sub.textContent='Entrando a Mi Pisto HN…';
  } else {
    if(icon){icon.className='biometric-icon error';icon.textContent='✕';}
    if(title) title.textContent='No se pudo verificar';
    if(sub) sub.textContent='Usa tu PIN para continuar.';
  }
}

function usarPINcomoFallback() {
  _hideBioScreen();
  document.getElementById('modal-pin').style.display = 'flex';
  document.getElementById('pin-input')?.focus();
}

async function intentarBiometriaDesdePin() {
  document.getElementById('modal-pin').style.display = 'none';
  _showBioScreen();
  const ok = await authenticateWithWebAuthn();
  _setBioResult(ok);
  setTimeout(() => {
    _hideBioScreen();
    if (ok && !_sessionDEK && _isStateEncrypted()) {
      // La huella confirma quién eres, pero no libera la clave de cifrado:
      // sin ella la app se abriría vacía (y el onboarding podría pisar los datos)
      document.getElementById('modal-pin').style.display='flex';
      const errEl = document.getElementById('pin-error');
      if (errEl) { errEl.style.display = 'block'; errEl.textContent = '🔐 Para descifrar tus datos necesitas tu PIN.'; }
      document.getElementById('pin-input')?.focus();
      return;
    }
    if (ok) {
      sessionStorage.setItem('pinVerificado','true');
      if (!state.setup) document.getElementById('onboarding').style.display='flex';
      else renderAll();
    } else {
      document.getElementById('modal-pin').style.display='flex';
      document.getElementById('pin-input')?.focus();
    }
  }, 1000);
}

function _updatePinBioBtn() {
  const wrap = document.getElementById('pin-bio-btn-wrap');
  if (!wrap) return;
  wrap.style.display = (localStorage.getItem(WEBAUTHN_KEY) && isWebAuthnAvailable()) ? 'block' : 'none';
}

// ==========================================
// ==========================================

async function requestPersistence() {
  if (navigator.storage && navigator.storage.persist) {
    try {
      const isPersisted = await navigator.storage.persist();
      console.log('Persistencia ITP: ' + (isPersisted ? '🛡️ BLINDADA' : '⚠️ VOLÁTIL'));
      const persistDiv = document.getElementById('persistence-info');
      if (persistDiv) {
        if (isPersisted) {
          persistDiv.innerHTML = '<div class="card" style="border-left:4px solid var(--green);margin-top:15px"><h4 style="color:var(--green);margin-bottom:8px">✅ Almacenamiento Persistente Activado</h4><p style="font-size:12px;color:var(--text2)">Tu navegador garantiza que los datos no se limpiarán automáticamente. Igual se recomienda hacer respaldos periódicos.</p></div>';
        } else {
          persistDiv.innerHTML = '<div class="card" style="border-left:4px solid var(--amber);margin-top:15px"><h4 style="color:var(--amber);margin-bottom:8px">⚠️ Almacenamiento No Persistente</h4><p style="font-size:12px;color:var(--text2)">Safari/iOS puede borrar los datos después de 7 días sin uso. Exporta un respaldo regularmente.</p><button class="btn btn-primary" onclick="exportDataEncriptado()" style="margin-top:10px">💾 Exportar Respaldo Ahora</button></div>';
        }
      }
    } catch (error) {
      console.error('Error solicitando persistencia:', error);
    }
  }
}

// ── P1-6: Singleton IDB + P0-2: store 'facturas' ─────────────
const IDB_NAME = 'MisFinanzasHN_DB';
const IDB_STORE = 'app_state';
const IDB_FACTURAS = 'facturas';
const IDB_VERSION = 2; // incrementado por el nuevo store

let _dbPromise = null; // P1-6: singleton

function initDB() {
  if (_dbPromise) return _dbPromise; // reutilizar conexión existente
  _dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onerror = () => { _dbPromise = null; reject('Error abriendo IndexedDB'); };
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE))
        db.createObjectStore(IDB_STORE);
      if (!db.objectStoreNames.contains(IDB_FACTURAS)) // P0-2: store de imágenes
        db.createObjectStore(IDB_FACTURAS);
    };
    request.onsuccess = (e) => {
      const db = e.target.result;
      // FIX: invalidar el singleton si la conexión se cierra inesperadamente
      // (otra pestaña actualiza versión, navegador la descarta por inactividad, etc.)
      // Sin esto, db.transaction() lanza InvalidStateError "connection is closing".
      db.onclose = () => {
        console.warn('⚠️ Conexión IDB cerrada inesperadamente, invalidando singleton');
        _dbPromise = null;
      };
      db.onversionchange = () => {
        try { db.close(); } catch(_) {}
        _dbPromise = null;
        console.warn('⚠️ IDB versionchange detectado — conexión cerrada para permitir upgrade');
      };
      resolve(db);
    };
  });
  return _dbPromise;
}

// ── P0-2: Helpers para imágenes de facturas en IDB ───────────
let _tempFacturaId = null; // reemplaza localStorage('temp_factura_imagen')

async function _guardarTempFactura(dataURL) {
  if (!dataURL) return null;
  const id = (crypto.randomUUID ? crypto.randomUUID() : `fac_${Date.now()}_${Math.random().toString(36).slice(2,7)}`);
  try {
    // Con PIN desbloqueado la imagen se guarda cifrada con la DEK
    const valor = _sessionDEK ? { _enc: await _encryptState(dataURL, _sessionDEK) } : dataURL;
    const db = await initDB();
    await new Promise((res, rej) => {
      const tx = db.transaction(IDB_FACTURAS, 'readwrite');
      tx.objectStore(IDB_FACTURAS).put(valor, id);
      tx.oncomplete = res;
      tx.onerror = rej;
    });
    return id;
  } catch (e) { console.warn('IDB factura error:', e); return null; }
}

async function _obtenerFactura(id) {
  if (!id) return null;
  try {
    const db = await initDB();
    const valor = await new Promise((res) => {
      const tx = db.transaction(IDB_FACTURAS, 'readonly');
      const req = tx.objectStore(IDB_FACTURAS).get(id);
      req.onsuccess = () => res(req.result || null);
      req.onerror = () => res(null);
    });
    if (valor && valor._enc) return _sessionDEK ? await _decryptState(valor._enc, _sessionDEK) : null;
    return valor;
  } catch { return null; }
}

// Re-escribe todas las facturas: cifrar=true cifra las que están en plano
// (tras desbloquear); cifrar=false las deja en plano (antes de quitar el PIN,
// porque sin la DEK ya no se podrían leer).
async function _convertirFacturas(cifrar) {
  if (!_sessionDEK) return 0;
  try {
    const db = await initDB();
    const todas = await new Promise(res => {
      const out = [];
      const req = db.transaction(IDB_FACTURAS, 'readonly').objectStore(IDB_FACTURAS).openCursor();
      req.onsuccess = () => { const c = req.result; if (c) { out.push([c.key, c.value]); c.continue(); } else res(out); };
      req.onerror = () => res(out);
    });
    const cambios = [];
    for (const [k, v] of todas) {
      if (cifrar && typeof v === 'string') cambios.push([k, { _enc: await _encryptState(v, _sessionDEK) }]);
      else if (!cifrar && v && v._enc) { const plano = await _decryptState(v._enc, _sessionDEK); if (plano) cambios.push([k, plano]); }
    }
    if (!cambios.length) return 0;
    await new Promise((res, rej) => {
      const tx = db.transaction(IDB_FACTURAS, 'readwrite');
      const st = tx.objectStore(IDB_FACTURAS);
      cambios.forEach(([k, v]) => st.put(v, k));
      tx.oncomplete = res; tx.onerror = rej;
    });
    return cambios.length;
  } catch (e) { console.warn('Convertir facturas:', e); return 0; }
}

async function _eliminarFactura(id) {
  if (!id) return;
  try {
    const db = await initDB();
    const tx = db.transaction(IDB_FACTURAS, 'readwrite');
    tx.objectStore(IDB_FACTURAS).delete(id);
  } catch {}
}

async function saveStateToDB(stateObj) {
  // Con PIN desbloqueado, la copia de IDB también va cifrada con la DEK
  // (antes quedaba en plano y el PIN no protegía nada en reposo).
  const meta = { _version: '1.0.0', _lastSave: new Date().toISOString() };
  const toSave = _sessionDEK
    ? Object.assign({ _enc: await _encryptState(stateObj, _sessionDEK) }, meta)
    : Object.assign({}, stateObj, meta);
  // FIX: helper interno reutilizable para reintento con conexión fresca
  const _doSave = async () => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      let tx;
      try {
        tx = db.transaction(IDB_STORE, 'readwrite');
      } catch (e) {
        // La conexión estaba cerrándose — invalidar singleton para forzar
        // reapertura en el próximo intento
        _dbPromise = null;
        return reject(e);
      }
      const store = tx.objectStore(IDB_STORE);
      try {
        store.put(toSave, 'current_state');
      } catch (e) {
        return reject(e);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(tx.error || e);
      tx.onabort = (e) => reject(tx.error || e);
    });
  };
  try {
    return await _doSave();
  } catch (error) {
    // Reintento único si la conexión vieja estaba cerrándose
    if (error && (error.name === 'InvalidStateError' ||
                  String(error.message || '').includes('closing'))) {
      console.warn('⚠️ IDB save: conexión cerrándose, reintentando con conexión fresca...');
      _dbPromise = null;
      try {
        return await _doSave();
      } catch (e2) {
        console.warn('IDB save falló tras reintento, fallback a localStorage:', e2);
      }
    } else {
      console.warn('IDB no disponible, usando solo localStorage:', error);
    }
  }
}

async function loadStateFromDB() {
  try {
    const db = await initDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const request = store.get('current_state');
      request.onsuccess = () => {
        const rec = request.result;
        if (rec && rec._enc) {
          // Copia cifrada: solo se puede leer con la DEK de la sesión
          if (!_sessionDEK) { resolve(null); return; }
          _decryptState(rec._enc, _sessionDEK).then(obj => {
            if (obj) console.log('📂 Estado cifrado cargado desde IndexedDB');
            resolve(obj || null);
          }, () => resolve(null));
        } else if (rec) {
          console.log('📂 Estado cargado desde IndexedDB');
          resolve(rec);
        } else {
          console.log('⚠️ IDB vacío, usando localStorage como respaldo');
          resolve(null);
        }
      };
      request.onerror = () => resolve(null);
    });
  } catch (error) {
    console.warn('Error en loadStateFromDB:', error);
    return null;
  }
}

// ==========================================
// 🛑 PREVENCIÓN DE PÉRDIDA EN MODALES
// ==========================================
let hasUnsavedModalData = false;

window.addEventListener('beforeunload', (e) => {
  if (hasUnsavedModalData) {
    e.preventDefault();
    e.returnValue = '¿Seguro? Tienes datos sin guardar en pantalla.';
  }
});

// Marcar cuando el usuario escribe en un modal
document.addEventListener('input', (e) => {
  if (e.target.closest('.modal-content')) {
    if (e.target.value && e.target.value.trim().length > 0) hasUnsavedModalData = true;
  }
});

// Limpiar el flag al cerrar modales correctamente
const _origCloseModal = closeModal;
closeModal = function(id) {
  hasUnsavedModalData = false;
  _origCloseModal(id);
};

// ==========================================
