// Mi Pisto HN · 42-anotar-rapido.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.
// ========== ANOTAR SIN DESBLOQUEAR ==========
// Desde los atajos del ícono (o el botón de la pantalla del PIN) se puede anotar
// un gasto o un ingreso sin poner el PIN. Solo se puede AGREGAR: lo anotado se
// cifra con una llave pública ("buzón") cuya llave privada está guardada con la
// clave de tus datos, así que sin tu PIN nadie puede leer ni lo anotado ni nada
// más. Al entrar a la app, lo del buzón pasa a tus movimientos.

const BUZON_PUB = 'mph_buzon_pub', BUZON_PRIV = 'mph_buzon_priv', BUZON = 'mph_buzon', BUZON_OFF = 'mph_buzon_off';
const _ECDH = { name: 'ECDH', namedCurve: 'P-256' };

function buzonActivo() {
  return !!localStorage.getItem('finanzas_pin_hash') && !!localStorage.getItem(BUZON_PUB) && localStorage.getItem(BUZON_OFF) !== '1';
}
function _buzonLeer() { try { return JSON.parse(localStorage.getItem(BUZON) || '[]'); } catch (e) { return []; } }

async function _aesCon(dek) { return crypto.subtle.importKey('raw', dek, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']); }
async function _cifrarCon(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
  return { iv: _b64EncodeArr(iv), ct: _b64EncodeArr(new Uint8Array(ct)) };
}
async function _descifrarCon(key, caja) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: _b64DecodeArr(caja.iv) }, key, _b64DecodeArr(caja.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}
async function _llaveCompartida(privada, publica) {
  return crypto.subtle.deriveKey({ name: 'ECDH', public: publica }, privada, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** Con la app abierta: crea las llaves del buzón si no existen */
async function _buzonAsegurarLlaves() {
  if (!_sessionDEK || !localStorage.getItem('finanzas_pin_hash') || localStorage.getItem(BUZON_PUB)) return;
  const par = await crypto.subtle.generateKey(_ECDH, true, ['deriveKey']);
  const pub = await crypto.subtle.exportKey('jwk', par.publicKey);
  const priv = await crypto.subtle.exportKey('jwk', par.privateKey);
  localStorage.setItem(BUZON_PRIV, JSON.stringify(await _cifrarCon(await _aesCon(_sessionDEK), priv)));
  localStorage.setItem(BUZON_PUB, JSON.stringify(pub));
}

/** Cuando los datos pasan a otra clave (al juntar o bajar de la nube), la llave privada se vuelve a guardar con la nueva */
async function _buzonCambiarClave(dekVieja, dekNueva) {
  const caja = localStorage.getItem(BUZON_PRIV);
  if (!caja || !dekVieja) return;
  try {
    const priv = await _descifrarCon(await _aesCon(dekVieja), JSON.parse(caja));
    localStorage.setItem(BUZON_PRIV, JSON.stringify(await _cifrarCon(await _aesCon(dekNueva), priv)));
  } catch (e) { console.warn('Buzón:', e); }
}

/** Sin desbloquear: guarda un movimiento cifrado en el buzón */
async function _buzonGuardar(mov) {
  const pub = await crypto.subtle.importKey('jwk', JSON.parse(localStorage.getItem(BUZON_PUB)), _ECDH, false, []);
  const efimera = await crypto.subtle.generateKey(_ECDH, true, ['deriveKey']);
  const caja = await _cifrarCon(await _llaveCompartida(efimera.privateKey, pub), mov);
  caja.epk = await crypto.subtle.exportKey('jwk', efimera.publicKey);
  const lista = _buzonLeer();
  if (lista.length >= 100) throw new Error('Ya tienes 100 movimientos esperando. Entra a la app para guardarlos.');
  lista.push(caja);
  localStorage.setItem(BUZON, JSON.stringify(lista));
}

/** Ya desbloqueada la app: lo del buzón pasa a los movimientos */
async function _buzonProcesar() {
  const lista = _buzonLeer();
  if (!lista.length || !_sessionDEK || !state.setup) return;
  let privada;
  try {
    const jwk = await _descifrarCon(await _aesCon(_sessionDEK), JSON.parse(localStorage.getItem(BUZON_PRIV)));
    privada = await crypto.subtle.importKey('jwk', jwk, _ECDH, false, ['deriveKey']);
  } catch (e) { console.warn('Buzón: no se pudo abrir', e); return; }
  const movs = [];
  for (const caja of lista) {
    try {
      const epk = await crypto.subtle.importKey('jwk', caja.epk, _ECDH, false, []);
      const m = await _descifrarCon(await _llaveCompartida(privada, epk), caja);
      if (m && (m.tipo === 'gasto' || m.tipo === 'ingreso') && m.monto > 0 && m.monto < 1e9) movs.push(m);
    } catch (e) { console.warn('Buzón: un movimiento no se pudo abrir', e); }
  }
  // Se vacía antes de guardar: si algo falla a medias, no se duplica
  localStorage.removeItem(BUZON);
  const guardados = [];
  for (const m of movs) if (await _guardarComoRegistro(m)) guardados.push(m);
  if (!guardados.length) return;
  renderAll();
  avisar('📥 Anotaste ' + guardados.length + (guardados.length === 1 ? ' movimiento' : ' movimientos') + ' sin desbloquear. Ya están en tus movimientos:\n\n' +
    guardados.map(m => (m.tipo === 'ingreso' ? '➕ ' : '➖ ') + fL(m.monto) + ' · ' + m.cat + (m.nota ? ' · ' + m.nota : '')).join('\n') +
    '\n\nSi alguno no lo anotaste tú, bórralo desde el Inicio.');
}

/** Usa el mismo registro rápido de siempre (cuentas, tarjetas, sellos, sincronización) */
async function _guardarComoRegistro(m) {
  const antes = state.transactions.length;
  try {
    abrirRegistro(m.tipo);
    _reg.tipo = m.tipo;
    _reg.cat = m.cat;
    _reg.catAprendida = false;
    _reg.expr = _regNumTxt(m.monto);
    _reg.tarjeta = null;
    _reg.cuenta = 'efectivo';
    const nota = document.getElementById('reg-nota'); if (nota) nota.value = m.nota || '';
    const d = new Date(m.fecha || Date.now());
    const f = document.getElementById('reg-fecha'), h = document.getElementById('reg-hora');
    if (f) f.value = fechaLocal(d);
    if (h) { h.value = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); h.dataset.tocada = '1'; }
    renderRegistro();
    await guardarRegistro();
  } catch (e) { console.warn('Buzón: no se pudo guardar', e); }
  if (document.getElementById('modal-registro')?.style.display === 'flex') cerrarRegistro();
  return state.transactions.length > antes;
}

// ── La ventanita para anotar sin desbloquear ────────────────────────────
const _rap = { tipo: 'gasto', cat: null, alCerrar: null };

function abrirAnotarRapido(tipo, { dictar = false, alCerrar = null } = {}) {
  _rap.tipo = tipo === 'ingreso' ? 'ingreso' : 'gasto';
  _rap.cat = null;
  _rap.alCerrar = alCerrar;
  let modal = document.getElementById('modal-anotar-rapido');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-anotar-rapido';
    modal.className = 'modal';
    document.body.appendChild(modal);
  }
  const R = typeof _Reconocimiento === 'function' ? _Reconocimiento() : null;
  modal.innerHTML = `<div class="modal-content rap-caja">
    <h3 style="margin-bottom:4px">⚡ Anotar sin desbloquear</h3>
    <p class="rap-sub">🔒 Solo se puede agregar: sin tu PIN nadie ve tus datos. Se guarda en tus movimientos cuando entres a la app.</p>
    <div class="rap-tipos">
      <button type="button" id="rap-t-gasto" onclick="_rapTipo('gasto')">➖ Gasto</button>
      <button type="button" id="rap-t-ingreso" onclick="_rapTipo('ingreso')">➕ Ingreso</button>
    </div>
    <input type="text" id="rap-monto" class="input-field rap-monto" inputmode="decimal" autocomplete="off" placeholder="L 0.00" aria-label="Monto">
    <input type="text" id="rap-nota" class="input-field" maxlength="80" autocomplete="off" placeholder="¿En qué? (almuerzo, bus, PriceSmart…)" oninput="_rapSugerir()">
    <div id="rap-cats" class="rap-cats"></div>
    <div class="rap-acciones">
      ${R ? '<button type="button" class="btn btn-secondary" id="rap-mic" onclick="_rapDictar()">🎤 Dictar</button>' : ''}
      <button type="button" class="btn btn-primary" id="rap-guardar" onclick="guardarAnotarRapido()">✓ Guardar</button>
    </div>
    <p id="rap-estado" class="rap-estado"></p>
    <button type="button" class="rap-entrar" onclick="cerrarAnotarRapido()">Entrar a la app</button>
  </div>`;
  openModal('modal-anotar-rapido');
  _rapTipo(_rap.tipo);
  _rapEstado();
  setTimeout(() => document.getElementById('rap-monto')?.focus(), 100);
  if (dictar && R) _rapDictar();
}
function cerrarAnotarRapido() {
  closeModal('modal-anotar-rapido');
  const fn = _rap.alCerrar; _rap.alCerrar = null;
  if (fn) fn();
}
function _rapTipo(t) {
  _rap.tipo = t;
  _rap.cat = null;
  ['gasto', 'ingreso'].forEach(x => document.getElementById('rap-t-' + x)?.classList.toggle('activo', x === t));
  _rapPintarCats();
  _rapSugerir();
}
function _rapPintarCats() {
  const el = document.getElementById('rap-cats');
  if (!el) return;
  const lista = (_rap.tipo === 'ingreso' ? CATS_INGRESO : CATS_GASTO).slice(0, _rap.tipo === 'ingreso' ? 8 : 12);
  el.innerHTML = lista.map(c => `<button type="button" class="rap-cat${_rap.cat === c.n ? ' activo' : ''}" data-cat="${esc(c.n)}" onclick="_rapElegir(this.dataset.cat)"><span>${c.i}</span>${esc(c.n)}</button>`).join('');
}
function _rapElegir(cat) { _rap.cat = cat; _rap.catSugerida = false; _rapPintarCats(); }
function _rapSugerir() {
  if (_rap.cat && !_rap.catSugerida) return;
  const nota = document.getElementById('rap-nota')?.value || '';
  const cat = nota && typeof _categoriaDictada === 'function' ? _categoriaDictada(_normCat(nota), _rap.tipo) : null;
  if (cat) { _rap.cat = cat; _rap.catSugerida = true; _rapPintarCats(); }
}
function _rapEstado(txt) {
  const el = document.getElementById('rap-estado');
  if (!el) return;
  const n = _buzonLeer().length;
  el.textContent = txt || (n ? '📥 ' + n + (n === 1 ? ' movimiento esperando' : ' movimientos esperando') + ' a que entres a la app' : '');
}
function _rapDictar() {
  const R = _Reconocimiento();
  if (!R) return;
  const rec = new R();
  rec.lang = 'es-HN'; rec.interimResults = false; rec.maxAlternatives = 1; rec.continuous = false;
  const mic = document.getElementById('rap-mic');
  rec.onstart = () => { mic && mic.classList.add('escuchando'); _rapEstado('🎤 Te escucho… (ej. "gasté 150 en almuerzo")'); };
  rec.onerror = ev => { mic && mic.classList.remove('escuchando'); _rapEstado(ev && ev.error === 'not-allowed' ? 'La app no tiene permiso para el micrófono. Escribe el monto.' : 'No te escuché. Intenta de nuevo o escribe el monto.'); };
  rec.onend = () => mic && mic.classList.remove('escuchando');
  rec.onresult = ev => {
    const frase = ev.results[0][0].transcript;
    const r = interpretarDictado(frase);
    if (r.tipo === 'ingreso' || r.tipo === 'gasto') _rapTipo(r.tipo);
    if (r.monto) document.getElementById('rap-monto').value = _regNumTxt(r.monto);
    const nota = r.nota || '';
    document.getElementById('rap-nota').value = nota;
    if (r.cat) { _rap.cat = r.cat; _rap.catSugerida = false; _rapPintarCats(); } else _rapSugerir();
    _rapEstado('🎤 "' + frase + '" · revisa y toca Guardar');
  };
  try { rec.start(); } catch (e) {}
}
async function guardarAnotarRapido() {
  const monto = typeof leerMonto === 'function' ? leerMonto(document.getElementById('rap-monto').value) : parseFloat(document.getElementById('rap-monto').value);
  if (!monto || monto <= 0 || monto >= 1e9) { _rapEstado('✏️ Escribe el monto'); document.getElementById('rap-monto').focus(); return; }
  if (!_rap.cat) { _rapEstado('👆 Elige la categoría'); return; }
  const mov = { tipo: _rap.tipo, monto: Math.round(monto * 100) / 100, cat: _rap.cat, nota: (document.getElementById('rap-nota').value || '').trim().slice(0, 80), fecha: new Date().toISOString() };
  const btn = document.getElementById('rap-guardar');
  if (btn) btn.disabled = true;
  try {
    if (_sessionDEK) {
      // App abierta: directo a los movimientos
      await _guardarComoRegistro(mov);
      renderAll();
    } else await _buzonGuardar(mov);
  } catch (e) { if (btn) btn.disabled = false; return _rapEstado('❌ ' + e.message); }
  if (btn) btn.disabled = false;
  document.getElementById('rap-monto').value = '';
  document.getElementById('rap-nota').value = '';
  _rap.cat = null;
  _rapPintarCats();
  _rapEstado('✅ ' + (mov.tipo === 'ingreso' ? 'Ingreso' : 'Gasto') + ' de ' + fL(mov.monto) + ' anotado. ¿Otro?' + (_sessionDEK ? '' : ' (' + _buzonLeer().length + ' esperando)'));
  document.getElementById('rap-monto').focus();
}

// ── Enganches ───────────────────────────────────────────────────────────
// Al desbloquear: crear las llaves (la primera vez) y pasar lo del buzón
const _continuarDesbloqueoBase = _continuarDesbloqueo;
_continuarDesbloqueo = async function () {
  const r = await _continuarDesbloqueoBase.apply(this, arguments);
  if (_sessionDEK) {
    _buzonAsegurarLlaves().catch(e => console.warn('Buzón:', e));
    setTimeout(() => _buzonProcesar().catch(e => console.warn('Buzón:', e)), 600);
    _ejecutarAccionPendiente();
  }
  return r;
};
// Usuarios que ya tenían PIN y la app abierta (p. ej. tras actualizar)
setTimeout(() => { if (_sessionDEK) _buzonAsegurarLlaves().catch(() => {}); }, 3000);

// Si los datos cambian de clave, la llave del buzón se muda con ellos
if (typeof _usarOtraClaveLocal === 'function') {
  const _usarOtraClaveBase = _usarOtraClaveLocal;
  _usarOtraClaveLocal = async function (dek, pin) {
    await _buzonCambiarClave(_sessionDEK, dek);
    return _usarOtraClaveBase.apply(this, arguments);
  };
}
if (typeof cloudSync !== 'undefined') {
  const _downloadBase = cloudSync.downloadState.bind(cloudSync);
  cloudSync.downloadState = async function (opts) {
    const antes = _sessionDEK;
    const cajaAntes = localStorage.getItem(BUZON_PRIV);
    const r = await _downloadBase(opts);
    if (r.ok && antes && _sessionDEK && _b64EncodeArr(antes) !== _b64EncodeArr(_sessionDEK) && cajaAntes) {
      localStorage.setItem(BUZON_PRIV, cajaAntes);
      await _buzonCambiarClave(antes, _sessionDEK);
    }
    return r;
  };
}

// Atajos del ícono con la app bloqueada: gasto, ingreso y dictar se anotan sin
// PIN; lo demás (pago fijo…) queda pendiente y se hace al desbloquear.
const _ACCIONES_RAPIDAS = { 'new-expense': ['gasto', false], 'new-income': ['ingreso', false], 'dictar': ['gasto', true] };
function _ejecutarAccionPendiente() {
  const a = sessionStorage.getItem('mph_accion_pendiente');
  if (!a) return;
  sessionStorage.removeItem('mph_accion_pendiente');
  setTimeout(() => { if (a === 'pago-fijo' && typeof abrirPagoFijo === 'function') abrirPagoFijo(); }, 900);
}
const _verificarPINconAtajos = verificarPINmejorado;
verificarPINmejorado = function () {
  const accion = new URLSearchParams(location.search).get('action');
  const bloqueada = !!localStorage.getItem('finanzas_pin_hash') && !_sessionDEK;
  if (bloqueada && accion) {
    history.replaceState({}, document.title, location.pathname);
    if (_ACCIONES_RAPIDAS[accion] && buzonActivo()) {
      const [tipo, dictar] = _ACCIONES_RAPIDAS[accion];
      abrirAnotarRapido(tipo, { dictar, alCerrar: () => _verificarPINconAtajos() });
      return;
    }
    if (accion === 'pago-fijo') sessionStorage.setItem('mph_accion_pendiente', 'pago-fijo');
  }
  return _verificarPINconAtajos();
};

// Botón en la pantalla del PIN
function _botonAnotarEnPIN() {
  const modal = document.getElementById('modal-pin');
  if (!modal || document.getElementById('btn-anotar-sin-pin')) return;
  const caja = modal.querySelector('.modal-content') || modal;
  const b = document.createElement('button');
  b.type = 'button';
  b.id = 'btn-anotar-sin-pin';
  b.className = 'btn btn-secondary';
  b.style.marginTop = '10px';
  b.textContent = '⚡ Anotar un gasto sin desbloquear';
  b.onclick = () => {
    modal.style.display = 'none';
    abrirAnotarRapido('gasto', { alCerrar: () => { modal.style.display = 'flex'; document.getElementById('pin-input')?.focus(); } });
  };
  caja.appendChild(b);
}
function _mostrarBotonAnotarEnPIN() {
  _botonAnotarEnPIN();
  const b = document.getElementById('btn-anotar-sin-pin');
  if (b) b.style.display = buzonActivo() ? '' : 'none';
}
setTimeout(_mostrarBotonAnotarEnPIN, 0);
const _bloquearParaBoton = _bloquearAppPorInactividad;
_bloquearAppPorInactividad = function () { const r = _bloquearParaBoton.apply(this, arguments); _mostrarBotonAnotarEnPIN(); return r; };

// Interruptor en Configuración → Seguridad
function renderConfigBuzon() {
  const el = document.getElementById('buzon-config');
  if (!el) return;
  if (!localStorage.getItem('finanzas_pin_hash')) { el.innerHTML = ''; return; }
  const on = localStorage.getItem(BUZON_OFF) !== '1';
  el.innerHTML = `<label class="switch-fila" style="display:flex;justify-content:space-between;align-items:center;gap:12px;cursor:pointer;margin-top:12px">
    <span><strong style="font-size:13px">⚡ Anotar sin desbloquear</strong><br><small style="color:var(--text2)">Desde los atajos del ícono o la pantalla del PIN. Solo agrega: nadie ve tus datos sin el PIN.</small></span>
    <input type="checkbox" ${on ? 'checked' : ''} onchange="localStorage.setItem('${BUZON_OFF}', this.checked ? '0' : '1'); _mostrarBotonAnotarEnPIN()">
  </label>`;
}
const _renderBioConBuzon = renderBiometriaConfig;
renderBiometriaConfig = function () { const r = _renderBioConBuzon.apply(this, arguments); renderConfigBuzon(); return r; };
// Al crear o cambiar el PIN también quedan listas las llaves
const _configurarPINconBuzon = configurarPIN;
configurarPIN = async function () {
  const r = await _configurarPINconBuzon.apply(this, arguments);
  if (_sessionDEK) await _buzonAsegurarLlaves().catch(() => {});
  if (!localStorage.getItem('finanzas_pin_hash')) [BUZON_PUB, BUZON_PRIV, BUZON].forEach(k => localStorage.removeItem(k));
  renderConfigBuzon();
  return r;
};
