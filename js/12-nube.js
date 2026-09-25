// Mi Pisto HN · 12-nube.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.
// CLOUD SYNC v1 (Fase 1): conexión a Supabase + auth con magic link
// ─────────────────────────────────────────────────────────────────────
// Filosofía:
//   • TODO es opcional. Si el usuario no activa sync, la app es 100% local
//     como siempre.
//   • Si Supabase JS no carga (offline), no rompe nada — verificamos
//     window.supabase antes de cualquier operación.
//   • Las credenciales son la "anon key" (publishable), diseñada para estar
//     en el frontend. La protección real es RLS en Supabase.
//   • En esta Fase 1 NO sincronizamos datos todavía — solo establecemos la
//     conexión y el flujo de auth. Sync de datos viene en Fase 2.
// ═══════════════════════════════════════════════════════════════════════

const CLOUD_SYNC_CONFIG = {
  url: 'https://aetaktkexbtluoxehuwi.supabase.co',
  // anon JWT legacy — el SDK 2.45.x espera este formato (no el sb_publishable_*)
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFldGFrdGtleGJ0bHVveGVodXdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3MzcwNzYsImV4cCI6MjA5MzMxMzA3Nn0.4kvz7wVxK-H69jY208bqEuF06UP9-p_ysHzo1_jfERE',
  // localStorage flag: si true, el usuario activó sync en este dispositivo
  enabledKey: 'mph_cloud_sync_enabled',
  // localStorage flag: identificador único del dispositivo (persistente)
  deviceIdKey: 'mph_device_id',
  deviceNameKey: 'mph_device_name'
};

const cloudSync = {
  client: null,        // Cliente Supabase (lazy-initialized)
  user: null,          // Usuario autenticado (auth.user object)
  ready: false,        // Una vez inicializado correctamente

  /** Verifica si el SDK de Supabase está disponible (puede no haber cargado si offline) */
  sdkAvailable() {
    return typeof window.supabase !== 'undefined' &&
           typeof window.supabase.createClient === 'function';
  },

  /** ¿El usuario activó sync en este dispositivo? */
  isEnabled() {
    return localStorage.getItem(CLOUD_SYNC_CONFIG.enabledKey) === 'true';
  },

  /** ID único del dispositivo (para el device_log) */
  getDeviceId() {
    let id = localStorage.getItem(CLOUD_SYNC_CONFIG.deviceIdKey);
    if (!id) {
      // Generar uno nuevo
      id = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'dev-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem(CLOUD_SYNC_CONFIG.deviceIdKey, id);
    }
    return id;
  },

  /** Nombre legible del dispositivo (auto-detectado, editable después) */
  getDeviceName() {
    let name = localStorage.getItem(CLOUD_SYNC_CONFIG.deviceNameKey);
    if (!name) {
      const ua = navigator.userAgent;
      if (/iPhone/.test(ua))      name = 'iPhone';
      else if (/iPad/.test(ua))   name = 'iPad';
      else if (/Android/.test(ua))name = 'Android';
      else if (/Mac/.test(ua))    name = 'Mac';
      else if (/Windows/.test(ua))name = 'Windows';
      else if (/Linux/.test(ua))  name = 'Linux';
      else                        name = 'Dispositivo';
      localStorage.setItem(CLOUD_SYNC_CONFIG.deviceNameKey, name);
    }
    return name;
  },

  /** Inicializa el cliente Supabase y restaura sesión si existía */
  async init() {
    if (this.ready) return true;
    if (!this.sdkAvailable()) {
      console.log('☁️ Supabase SDK no disponible (¿offline?). Sync deshabilitado.');
      return false;
    }
    try {
      this.client = window.supabase.createClient(
        CLOUD_SYNC_CONFIG.url,
        CLOUD_SYNC_CONFIG.anonKey,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,  // detecta el token del magic link en la URL
            flowType: 'pkce'
          }
        }
      );
      // Restaurar sesión existente si la hay
      const { data: { session } } = await this.client.auth.getSession();
      if (session) {
        this.user = session.user;
        console.log('☁️ Sesión restaurada:', this.user.email);
        this._logDevice().catch(e => console.warn('device_log:', e.message));
        // FASE 3: Mostrar indicador y chequear si hay versión nueva en nube
        setTimeout(() => {
          this._updateIndicator('synced');
          this.checkForNewerVersion();
        }, 3000); // Esperar 3s para que la app termine de cargar primero
      }
      // Listener para cambios de auth (login, logout, token refresh)
      this.client.auth.onAuthStateChange((event, session) => {
        console.log('☁️ Auth event:', event);
        this.user = session ? session.user : null;
        if (event === 'SIGNED_IN') {
          this._logDevice().catch(()=>{});
          renderCloudSyncUI();
          // Si veníamos del magic link, mostrar feedback
          const url = new URL(window.location.href);
          if (url.searchParams.has('code') || window.location.hash.includes('access_token')) {
            history.replaceState({}, document.title, window.location.pathname);
            setTimeout(async () => {
              const isNewDevice = !state.setup || !state.transactions || state.transactions.length === 0;
              if (isNewDevice) {
                // FASE 3: dispositivo nuevo — ofrecer restaurar de la nube
                const remInfo = await this.getRemoteInfo();
                if (remInfo) {
                  const ok = confirm(
                    '☁️ Sesión iniciada como ' + this.user.email + '\n\n' +
                    '¡Bienvenido a un dispositivo nuevo!\n\n' +
                    'Encontramos datos en la nube:\n' +
                    '• Versión #' + remInfo.version + '\n' +
                    '• Subidos: ' + new Date(remInfo.updated_at).toLocaleString('es-HN') + '\n' +
                    '• Desde: ' + (remInfo.device_name || 'otro dispositivo') + '\n\n' +
                    '¿Querés restaurar tus datos aquí?\n' +
                    '(Vas a necesitar tu PIN)'
                  );
                  if (ok) {
                    if (typeof switchView === 'function') switchView('config');
                    setTimeout(() => { if (typeof abrirModalBajarCloud === 'function') abrirModalBajarCloud(); }, 300);
                  } else {
                    alert('✅ Sesión iniciada. Podés descargar tus datos en cualquier momento desde Configuración → Sincronización.');
                  }
                } else {
                  alert('✅ Sesión iniciada como ' + this.user.email + '\n\nLa sincronización de datos está activa. Subí tus datos desde Configuración → Sincronización.');
                }
              } else {
                // Dispositivo que ya tenía datos — solo avisamos y chequeamos versiones
                alert('✅ Sesión iniciada como ' + this.user.email);
                setTimeout(() => this.checkForNewerVersion(), 1000);
              }
            }, 100);
          } else {
            // Login en segundo plano (refresh de token) — solo chequear versiones
            setTimeout(() => this.checkForNewerVersion(), 2000);
          }
        } else if (event === 'SIGNED_OUT') {
          this._cancelAutoSync();
          renderCloudSyncUI();
        } else if (event === 'TOKEN_REFRESHED') {
          // Sesión renovada: chequear si hay cambios en la nube
          setTimeout(() => this.checkForNewerVersion(), 1000);
        }
      });
      this.ready = true;
      return true;
    } catch (e) {
      console.error('☁️ Error inicializando Supabase:', e);
      return false;
    }
  },

  /** Inicia sesión con Google (OAuth vía Supabase, flujo PKCE).
      Redirige a Google y de vuelta a la misma URL — el listener de
      onAuthStateChange ya detecta el SIGNED_IN al volver, sin cambios. */
  async signInWithGoogle() {
    if (!await this.init()) {
      return { ok: false, error: 'No hay conexión con el servidor' };
    }
    try {
      const { error } = await this.client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + window.location.pathname
        }
      });
      if (error) return { ok: false, error: error.message };
      // La página navega a Google; no hay más que hacer aquí.
      localStorage.setItem(CLOUD_SYNC_CONFIG.enabledKey, 'true');
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  /** Cierra sesión y deshabilita sync en este dispositivo */
  async signOut() {
    if (!this.ready) return;
    try { await this.client.auth.signOut(); } catch(e) {}
    this.user = null;
    localStorage.setItem(CLOUD_SYNC_CONFIG.enabledKey, 'false');
    renderCloudSyncUI();
  },

  /** Borra la cuenta en la nube y todos sus datos (función eliminar_mi_cuenta
      en Supabase, que solo actúa sobre el usuario autenticado). Los datos de
      este teléfono no se tocan. */
  async eliminarCuenta() {
    if (!this.user || !await this.init()) return { ok: false, error: 'No has iniciado sesión en la nube' };
    try {
      const { error } = await this.client.rpc('eliminar_mi_cuenta');
      if (error) return { ok: false, error: error.message };
    } catch (e) { return { ok: false, error: e.message || String(e) }; }
    this._cancelAutoSync && this._cancelAutoSync();
    ['mph_cloud_dek', 'mph_cloud_dek_iv', 'mph_cloud_salt', 'mph_cloud_version'].forEach(k => localStorage.removeItem(k));
    try { await this.client.auth.signOut(); } catch (e) {}
    this.user = null;
    localStorage.setItem(CLOUD_SYNC_CONFIG.enabledKey, 'false');
    return { ok: true };
  },

  /** Registra/actualiza el dispositivo en device_log */
  async _logDevice() {
    if (!this.user || !this.client) return;
    const deviceId   = this.getDeviceId();
    const deviceName = this.getDeviceName();
    try {
      // upsert: si existe (user_id + device_id) actualiza last_seen, si no inserta
      const { error } = await this.client
        .from('device_log')
        .upsert({
          user_id: this.user.id,
          device_id: deviceId,
          device_name: deviceName,
          last_seen: new Date().toISOString(),
          user_agent: navigator.userAgent.substr(0, 500)
        }, {
          onConflict: 'user_id,device_id'
        });
      if (error) console.warn('device_log upsert:', error.message);
    } catch (e) {
      console.warn('device_log:', e.message);
    }
  },

  /** Lista todos los dispositivos del usuario actual */
  async listDevices() {
    if (!this.user || !this.client) return [];
    try {
      const { data, error } = await this.client
        .from('device_log')
        .select('device_id, device_name, last_seen, user_agent')
        .order('last_seen', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.warn('listDevices:', e.message);
      return [];
    }
  },

  // ═══════════════════════════════════════════════════════════════════
  // FASE 2: UPLOAD / DOWNLOAD del state cifrado E2E
  // ───────────────────────────────────────────────────────────────────
  // Modelo: el servidor recibe SIEMPRE blobs cifrados que NO puede leer:
  //   • ciphertext: state completo cifrado con DEK del usuario
  //   • dek_ciphertext + dek_iv: la DEK cifrada con KEK derivada del PIN
  //   • pin_salt: salt PBKDF2 (público por diseño, necesario para
  //     que un dispositivo nuevo pueda re-derivar la KEK desde el PIN)
  // ═══════════════════════════════════════════════════════════════════

  /** Sube el state local cifrado a Supabase. Requiere que el usuario
      esté autenticado Y que tenga la DEK desbloqueada (sesión activa). */
  // ── Contraseña de la nube ──────────────────────────────────────────
  // El blob de la nube lleva la DEK cifrada con una KEK derivada de una
  // contraseña larga (no del PIN de 4-8 dígitos, que se puede probar
  // entero offline). El salt se guarda con prefijo "p2:" para distinguirlo
  // de los blobs viejos protegidos con el PIN. La DEK envuelta se guarda en
  // este dispositivo para que el auto-sync no tenga que pedirla cada vez.
  CLOUD_KDF_ITER: 600000,
  CLOUD_PASS_MIN: 12,
  hasCloudKey() {
    return !!(localStorage.getItem('mph_cloud_dek') && localStorage.getItem('mph_cloud_dek_iv') && localStorage.getItem('mph_cloud_salt'));
  },
  _saveCloudKey(dekB64, ivB64, saltStr) {
    localStorage.setItem('mph_cloud_dek', dekB64);
    localStorage.setItem('mph_cloud_dek_iv', ivB64);
    localStorage.setItem('mph_cloud_salt', saltStr);
  },
  async _kekDeContrasena(pass, saltStr) {
    return _deriveKEKFromPIN(pass, _b64DecodeArr(saltStr.slice(3)), this.CLOUD_KDF_ITER);
  },
  async crearClaveNube(pass) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const saltStr = 'p2:' + _b64EncodeArr(salt);
    const kek = await this._kekDeContrasena(pass, saltStr);
    const { encrypted, iv } = await _encryptDEK(_sessionDEK, kek);
    this._saveCloudKey(_b64EncodeArr(encrypted), _b64EncodeArr(iv), saltStr);
  },
  /** Verifica la contraseña contra el blob remoto; si abre la misma DEK de
      este dispositivo, guarda la clave. */
  async adoptarClaveNube(pass) {
    const { data, error } = await this.client.from('encrypted_states')
      .select('dek_ciphertext, dek_iv, pin_salt').eq('user_id', this.user.id).maybeSingle();
    if (error) return { ok: false, error: error.message };
    const kek = await this._kekDeContrasena(pass, data.pin_salt);
    const dek = await _decryptDEK(_b64DecodeArr(data.dek_ciphertext), _b64DecodeArr(data.dek_iv), kek);
    if (!dek) return { ok: false, error: 'Contraseña de la nube incorrecta.' };
    if (_b64EncodeArr(dek) !== _b64EncodeArr(_sessionDEK)) {
      return { ok: false, error: 'Los datos de la nube se cifraron en otro dispositivo con otra clave. Usa "⬇️ Bajar de la nube" en este dispositivo primero.' };
    }
    this._saveCloudKey(data.dek_ciphertext, data.dek_iv, data.pin_salt);
    return { ok: true };
  },
  /** Deja lista la clave de nube (la crea o la pide). false si se canceló o falló. */
  async asegurarClaveNube() {
    if (this.hasCloudKey()) return true;
    let info;
    try { info = await this.getRemoteInfo({ strict: true }); }
    catch (e) { alert('❌ No se pudo consultar la nube:\n\n' + e.message); return false; }
    const existe = !!(info && String(info.pin_salt || '').startsWith('p2:'));
    const pass = await pedirContrasenaNube(existe);
    if (!pass) return false;
    if (!existe) { await this.crearClaveNube(pass); return true; }
    const r = await this.adoptarClaveNube(pass);
    if (!r.ok) alert('❌ ' + r.error);
    return r.ok;
  },

  async uploadState() {
    if (!this.user) return { ok: false, error: 'No has iniciado sesión en la nube' };
    if (!await this.init()) return { ok: false, error: 'Sin conexión con el servidor' };
    // Validar que tengamos la DEK en sesión (usuario desbloqueó con PIN)
    if (typeof _sessionDEK === 'undefined' || _sessionDEK === null) {
      return { ok: false, error: 'Necesitas tener PIN configurado y la sesión desbloqueada para subir' };
    }
    if (!this.hasCloudKey()) {
      return { ok: false, needsPassphrase: true, error: 'Falta la contraseña de la nube en este dispositivo' };
    }

    try {
      // 1) Cifrar el state con la DEK actual (el resultado ya incluye IV embebido)
      const stateClone = JSON.parse(JSON.stringify(state));
      const ciphertextB64 = await _encryptState(stateClone, _sessionDEK);
      if (!ciphertextB64) return { ok: false, error: 'Error al cifrar el state' };

      // 2) DEK envuelta con la contraseña de la nube (no con el PIN)
      const dekCiphertextB64 = localStorage.getItem('mph_cloud_dek');
      const dekIvB64         = localStorage.getItem('mph_cloud_dek_iv');
      const pinSalt          = localStorage.getItem('mph_cloud_salt');

      // 3) Construir payload
      const payload = {
        user_id: this.user.id,
        ciphertext:     ciphertextB64,
        iv:             '',  // IV embebido en ciphertext, columna queda vacía pero no NULL
        dek_ciphertext: dekCiphertextB64,
        dek_iv:         dekIvB64,
        pin_salt:       pinSalt,
        device_id:      this.getDeviceId(),
        device_name:    this.getDeviceName(),
        size_bytes:     ciphertextB64.length
      };

      // 4) Upsert (insert si no existe, update si ya tenía blob este usuario)
      // El trigger en SQL incrementa `version` automáticamente en cada update.
      const { data, error } = await this.client
        .from('encrypted_states')
        .upsert(payload, { onConflict: 'user_id' })
        .select()
        .single();

      if (error) return { ok: false, error: error.message };

      // 5) Actualizar device_log también (último uso)
      this._logDevice().catch(()=>{});

      console.log('☁️ Upload OK. Versión nube:', data.version, 'Tamaño:', ciphertextB64.length, 'B');
      // FASE 3: guardar la versión para detección de conflictos
      cloudSync.setLocalSyncVersion(data.version);
      return { ok: true, version: data.version, sizeBytes: ciphertextB64.length, updatedAt: data.updated_at };
    } catch (e) {
      console.error('☁️ uploadState:', e);
      return { ok: false, error: e.message || String(e) };
    }
  },

  /** Bajá el blob de Supabase y descifralo con el PIN dado.
      Si todo va bien, REEMPLAZA el state local con el de la nube,
      sincroniza la DEK y el salt local, y guarda en localStorage+IDB.
      
      Esta función está diseñada para funcionar incluso si el dispositivo
      perdió la DEK local (ej. tras un reset) — solo necesita el PIN. */
  async downloadState({ pin, passphrase } = {}) {
    if (!this.user) return { ok: false, error: 'No has iniciado sesión en la nube' };
    if (!await this.init()) return { ok: false, error: 'Sin conexión con el servidor' };
    if (!pin || !/^\d{4,8}$/.test(pin)) return { ok: false, error: 'PIN inválido' };

    try {
      // 1) Bajar el blob
      const { data, error } = await this.client
        .from('encrypted_states')
        .select('ciphertext, dek_ciphertext, dek_iv, pin_salt, version, updated_at, size_bytes, device_name')
        .eq('user_id', this.user.id)
        .maybeSingle();

      if (error) return { ok: false, error: error.message };
      if (!data) return { ok: false, error: 'No hay datos sincronizados todavía. Sube primero desde otro dispositivo.' };
      if (!data.ciphertext || !data.dek_ciphertext || !data.dek_iv || !data.pin_salt) {
        return { ok: false, error: 'El blob de la nube está incompleto o corrupto.' };
      }

      // 2) Derivar la KEK: blobs nuevos con la contraseña de la nube,
      //    blobs viejos (salt sin "p2:") con el PIN
      const conContrasena = String(data.pin_salt).startsWith('p2:');
      if (conContrasena && !passphrase) return { ok: false, error: 'Escribe la contraseña de la nube.' };
      const kek = conContrasena
        ? await this._kekDeContrasena(passphrase, data.pin_salt)
        : await _deriveKEKFromPIN(pin, _b64DecodeArr(data.pin_salt), PIN_KDF.legacy.kekIter);

      // 3) Descifrar la DEK con la KEK
      const dekEncrypted = _b64DecodeArr(data.dek_ciphertext);
      const dekIv        = _b64DecodeArr(data.dek_iv);
      const dek = await _decryptDEK(dekEncrypted, dekIv, kek);
      if (!dek) {
        return { ok: false, error: conContrasena
          ? 'Contraseña de la nube incorrecta. No se pudo descifrar la clave de tus datos.'
          : 'PIN incorrecto. No se pudo descifrar la clave de tus datos.' };
      }

      // 4) Descifrar el state con la DEK
      const decryptedState = await _decryptState(data.ciphertext, dek);
      if (!decryptedState) {
        return { ok: false, error: 'Datos en la nube corruptos o de versión incompatible.' };
      }

      // 5) Validación básica: el state debe verse como un state real
      if (typeof decryptedState !== 'object' || decryptedState === null) {
        return { ok: false, error: 'Formato del state descifrado inválido.' };
      }

      // 6) ÉXITO. Sincronizar todo localmente:
      //    a) Reemplazar la DEK en sesión y en localStorage. Si cambia, el
      //       kit de recuperación de este teléfono ya no la abriría.
      const cambiaDEK = !_sessionDEK || _b64EncodeArr(_sessionDEK) !== _b64EncodeArr(dek);
      if (cambiaDEK && tieneKitRecuperacion()) {
        _borrarKitRecuperacion();
        setTimeout(() => alert('🆘 Tu kit de recuperación anterior ya no sirve con los datos de la nube. Genera uno nuevo en Config → Seguridad.'), 1500);
      }
      _sessionDEK = dek;
      _sessionPIN = pin;
      if (conContrasena) {
        // La DEK local se envuelve con el PIN de este dispositivo (salt propio)
        await _guardarPINv2(pin, crypto.getRandomValues(new Uint8Array(16)), dek);
        this._saveCloudKey(data.dek_ciphertext, data.dek_iv, data.pin_salt);
      } else {
        // Blob viejo: la DEK local queda con los parámetros legacy del PIN;
        // el próximo desbloqueo la sube a v2
        const saltBytes = _b64DecodeArr(data.pin_salt);
        _saveDEKToStorage(dekEncrypted, dekIv);
        localStorage.setItem('finanzas_pin_salt', data.pin_salt);
        localStorage.removeItem('finanzas_pin_kdf');
        const pinHash = await _hashPIN(pin, saltBytes, PIN_KDF.legacy);
        localStorage.setItem('finanzas_pin_hash', pinHash);
        appPIN = pinHash;
      }

      //    b) Reemplazar state global y persistir cifrado en localStorage
      Object.keys(state).forEach(k => delete state[k]);
      Object.assign(state, decryptedState);
      _huellaBase(state);
      _tomarBaseSync();
      // Migraciones de campos faltantes
      if (!state.pagosRecurrentes) state.pagosRecurrentes = [];
      if (!state.prestamos) state.prestamos = [];
      if (!state.budgetRules) state.budgetRules = { gastos: 65, ahorro: 20, extra: 15 };
      if (!state.receivables) state.receivables = [];
      if (!state.payables) state.payables = [];
      if (!state.grupos) state.grupos = [];
      if (!state.presupuestos) state.presupuestos = [];
      if (!state.misCuentas) state.misCuentas = [];
      if (!state.categorias) state.categorias = [];
      if (!state.tarjetas) state.tarjetas = [];
      if (!state.goals) state.goals = [];
      if (!state.cuentas) state.cuentas = { efectivo: 0, ahorro: 0 };

      //    c) Re-cifrar y guardar en localStorage + IDB
      const reEncryptedB64 = await _encryptState(state, dek);
      localStorage.setItem(LS_KEY, reEncryptedB64);
      try { await saveStateToDB(state); } catch(e) { console.warn('IDB sync:', e); }

      console.log('☁️ Download OK. Versión:', data.version, 'Subido por:', data.device_name);
      // FASE 3: sincronizar versión local
      cloudSync.setLocalSyncVersion(data.version);
      return {
        ok: true,
        version: data.version,
        sizeBytes: data.size_bytes,
        updatedAt: data.updated_at,
        deviceName: data.device_name
      };
    } catch (e) {
      console.error('☁️ downloadState:', e);
      return { ok: false, error: e.message || String(e) };
    }
  },

  /** Descarga y descifra el estado remoto SIN reemplazar el local.
      Usa _sessionDEK que ya está en memoria — no pide PIN de nuevo. */
  async fetchRemoteState() {
    if (!this.user || !this.client) return { ok: false, error: 'No autenticado' };
    if (typeof _sessionDEK === 'undefined' || !_sessionDEK) {
      return { ok: false, error: 'PIN no desbloqueado en esta sesión' };
    }
    try {
      const { data, error } = await this.client
        .from('encrypted_states')
        .select('ciphertext, version, updated_at, device_name, size_bytes')
        .eq('user_id', this.user.id)
        .maybeSingle();
      if (error) return { ok: false, error: error.message };
      if (!data || !data.ciphertext) return { ok: false, noData: true };
      const decrypted = await _decryptState(data.ciphertext, _sessionDEK);
      if (!decrypted) return { ok: false, error: 'No se pudo descifrar el blob remoto' };
      return { ok: true, state: decrypted, version: data.version,
               updatedAt: data.updated_at, deviceName: data.device_name };
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
  },

  /** Metadatos del blob remoto, o null si el usuario aún no tiene blob.
      Con { strict: true } lanza en error de red/servidor en vez de devolver
      null, para que quien va a subir no confunda "no pude leer" con "no hay". */
  async getRemoteInfo({ strict = false } = {}) {
    if (!this.user || !this.client) {
      if (strict) throw new Error('No autenticado');
      return null;
    }
    try {
      const { data, error } = await this.client
        .from('encrypted_states')
        .select('version, updated_at, size_bytes, device_id, device_name, pin_salt')
        .eq('user_id', this.user.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data || null;
    } catch (e) {
      if (strict) throw e;
      return null;
    }
  },

  // ═══════════════════════════════════════════════════════════════════
  // FASE 3 + 4: AUTO-SYNC, INDICADOR, CHECK ON-OPEN, MERGE INTELIGENTE
  // ═══════════════════════════════════════════════════════════════════

  getLocalSyncVersion() {
    return parseInt(localStorage.getItem('mph_cloud_version') || '0', 10);
  },
  setLocalSyncVersion(v) {
    localStorage.setItem('mph_cloud_version', String(v));
  },

  _updateIndicator(st, msg) {
    const el = document.getElementById('cloud-sync-indicator');
    if (!el) return;
    el.className = st;
    const icons  = { synced:'☁️✓', pending:'☁️…', uploading:'☁️⬆', error:'☁️⚠', offline:'☁️✗' };
    const labels = { synced:'Sincronizado', pending:'Guardando…', uploading:'Subiendo…', error:'Error sync', offline:'Offline', hidden:'' };
    if (st === 'hidden') { el.style.display = 'none'; return; }
    el.innerHTML = (icons[st]||'☁️') + ' ' + (msg || labels[st]);
  },

  _scheduleAutoSync() {
    if (!this.user || !this.isEnabled()) return;
    if (this._isSyncing) { this._resyncPendiente = true; return; }
    if (this._autoSyncTimer) clearTimeout(this._autoSyncTimer);
    this._updateIndicator('pending');
    this._autoSyncTimer = setTimeout(async () => {
      this._autoSyncTimer = null;
      if (!navigator.onLine) { this._updateIndicator('offline'); return; }
      this._updateIndicator('uploading');
      const result = await this._autoMergeAndUpload();
      if (result.ok) {
        this._syncRetryCount = 0; // reset contador en éxito
        this.setLocalSyncVersion(result.version);
        const msg = result.mergeStats ? '✓ +' + result.mergeStats.totalRemoteNew + ' fusionados' : 'v' + result.version;
        this._updateIndicator('synced', msg);
        setTimeout(() => { if (document.getElementById('cloud-sync-indicator')?.className==='synced') this._updateIndicator('hidden'); }, 4000);
      } else if (result.needsPassphrase) {
        this._updateIndicator('error', 'Falta contraseña de la nube');
      } else {
        // Exponential backoff: reintenta hasta 3 veces (1s, 2s, 4s)
        this._syncRetryCount = (this._syncRetryCount || 0) + 1;
        if (this._syncRetryCount <= 3) {
          const delay = Math.min(1000 * Math.pow(2, this._syncRetryCount - 1), 8000); // 1s, 2s, 4s
          console.warn(`☁️ Auto-sync falló (intento ${this._syncRetryCount}/3), reintentando en ${delay}ms:`, result.error);
          this._updateIndicator('error', `Reintento ${this._syncRetryCount}/3…`);
          this._autoSyncTimer = setTimeout(() => {
            this._autoSyncTimer = null;
            this._scheduleAutoSync();
          }, delay);
        } else {
          // Agotados los reintentos: indicar error persistente
          this._syncRetryCount = 0;
          this._updateIndicator('error', result.error?.substr(0,20) || 'Error sync');
          console.error('☁️ Auto-sync falló tras 3 reintentos:', result.error);
        }
      }
    }, 3000);
  },

  _cancelAutoSync() {
    if (this._autoSyncTimer) { clearTimeout(this._autoSyncTimer); this._autoSyncTimer = null; }
    this._syncRetryCount = 0;
    this._updateIndicator('hidden');
  },

  async checkForNewerVersion() {
    if (!this.user || !this.isEnabled()) return;
    try {
      const info = await this.getRemoteInfo();
      if (!info) return;
      const remoteV = info.version || 0;
      const localV  = this.getLocalSyncVersion();
      const diffMs  = Date.now() - new Date(info.updated_at).getTime();
      if (remoteV > localV && diffMs > 10000 && info.device_id !== this.getDeviceId()) {
        this._showNewerVersionBanner(info);
      } else {
        this._updateIndicator('synced', 'v' + remoteV);
        setTimeout(() => this._updateIndicator('hidden'), 3000);
      }
    } catch (e) { console.warn('checkForNewerVersion:', e.message); }
  },

  _showNewerVersionBanner(info) {
    const existing = document.getElementById('cloud-newer-banner');
    if (existing) existing.remove();
    const fecha = new Date(info.updated_at);
    const diffMin = Math.floor((Date.now() - fecha) / 60000);
    const cuando = diffMin < 1 ? 'hace unos segundos' : diffMin < 60 ? 'hace ' + diffMin + ' min' : fecha.toLocaleTimeString('es-HN',{timeStyle:'short'});
    const banner = document.createElement('div');
    banner.id = 'cloud-newer-banner';
    banner.className = 'cloud-banner';
    banner.innerHTML =
      '<span>☁️ Datos nuevos en la nube (' + cuando + ', desde <strong>' + esc(info.device_name||'otro dispositivo') + '</strong>)</span>' +
      '<button onclick="window._onCloudBannerDownload()">⬇️ Combinar</button>' +
      '<button onclick="document.getElementById(\'cloud-newer-banner\')?.remove()" style="background:rgba(255,255,255,.1)">✕</button>';
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 20000);
  },

  // ─────────── FASE 4: MERGE INTELIGENTE ─────────────────────────────

  /** Descifra el blob remoto con la DEK de la sesión (para auto-merge) */
  async _downloadAndDecrypt() {
    if (!this.user || !this.client) return { ok: false, error: 'Sin sesión' };
    if (typeof _sessionDEK === 'undefined' || !_sessionDEK) return { ok: false, error: 'PIN no desbloqueado' };
    try {
      const { data, error } = await this.client
        .from('encrypted_states')
        .select('ciphertext, version, updated_at, device_name, size_bytes')
        .eq('user_id', this.user.id)
        .maybeSingle();
      if (error) return { ok: false, error: error.message };
      if (!data || !data.ciphertext) return { ok: false, noRemote: true };
      const decrypted = await _decryptState(data.ciphertext, _sessionDEK);
      if (!decrypted) return { ok: false, error: 'Error descifrando (¿PIN cambiado en otro dispositivo?)' };
      return { ok: true, data: decrypted, version: data.version, updatedAt: data.updated_at, deviceName: data.device_name };
    } catch (e) { return { ok: false, error: e.message }; }
  },

  /**
   * MERGE de 2 estados. Retorna { merged, diff }.
   * diff = { localNew:{}, remoteNew:{}, conflicts:{}, totalLocalNew, totalRemoteNew, totalConflicts }
   */
  mergeStates(localState, remoteState) {
    const diff = { localNew:{}, remoteNew:{}, conflicts:{}, totalLocalNew:0, totalRemoteNew:0, totalConflicts:0, totalRemovidos:0 };
    const merged = {};
    // Escalares: remoto gana
    ['nombre','saldoInicial','cuentas','cuentasIniciales','cuentasInicialesV','budgetRules','diasPago','tarjetaAlPagar','premium','setup'].forEach(f => {
      merged[f] = (remoteState[f] !== undefined) ? remoteState[f] : localState[f];
    });
    // Días sin gastos (racha): se juntan los de ambos lados; la mejor racha, la mayor
    merged.diasSinGastos = [...new Set([].concat(localState.diasSinGastos || [], remoteState.diasSinGastos || []))].sort().slice(-400);
    merged.mejorRacha = Math.max(localState.mejorRacha || 0, remoteState.mejorRacha || 0);
    merged.sellosV = Math.max(localState.sellosV || 0, remoteState.sellosV || 0);
    // Borrados definitivos de ambos lados (se queda la fecha más reciente)
    const eliminados = Object.assign({}, localState.eliminados || {});
    Object.entries(remoteState.eliminados || {}).forEach(([id, t]) => {
      if (!eliminados[id] || Date.parse(t) > Date.parse(eliminados[id])) eliminados[id] = t;
    });
    merged.eliminados = eliminados;
    const sello = x => (x && x.updatedAt && Date.parse(x.updatedAt)) || 0;
    const LABELS = { transactions:'transacciones', goals:'metas de ahorro', receivables:'deudas a cobrar',
      payables:'deudas a pagar', prestamos:'préstamos', tarjetas:'tarjetas', pagosRecurrentes:'pagos recurrentes', transferenciasProgramadas:'transferencias programadas', grupos:'gastos compartidos', presupuestos:'presupuestos', misCuentas:'cuentas', categorias:'categorías' };
    const anotar = (bucket, field, item) => { if (!diff[bucket][field]) diff[bucket][field] = []; diff[bucket][field].push(item); };
    for (const field of Object.keys(LABELS)) {
      const localArr  = Array.isArray(localState[field])  ? localState[field]  : [];
      const remoteArr = Array.isArray(remoteState[field]) ? remoteState[field] : [];
      const localMap  = new Map(localArr.map(x  => [String(x.id),  x]));
      const remoteMap = new Map(remoteArr.map(x => [String(x.id), x]));
      const allIds    = new Set([...localMap.keys(), ...remoteMap.keys()]);
      const result    = [];
      for (const id of allIds) {
        const L = localMap.get(id), R = remoteMap.get(id);
        // Borrado definitivo en algún dispositivo: se descarta salvo que se
        // haya editado después de borrarlo.
        if (eliminados[id] && Math.max(sello(L), sello(R)) <= Date.parse(eliminados[id])) {
          if (L) diff.totalRemovidos++;
          continue;
        }
        if (L && !R) {
          result.push(L);
          if (!L.deletedAt) { anotar('localNew', field, L); diff.totalLocalNew++; }
        } else if (!L && R) {
          result.push(R);
          if (!R.deletedAt) { anotar('remoteNew', field, R); diff.totalRemoteNew++; }
        } else if (JSON.stringify(L) === JSON.stringify(R)) {
          result.push(L);
        } else if (sello(L) !== sello(R)) {
          // Gana el cambio más reciente (incluye borrar o restaurar de la papelera)
          const gana = sello(L) > sello(R) ? L : R;
          result.push(gana);
          anotar('conflicts', field, { local:L, remote:R, resolved:gana, label:LABELS[field] });
          diff.totalConflicts++;
        } else {
          // Sin sellos (datos de antes de esta versión): regla anterior
          const lDel = !!L.deletedAt, rDel = !!R.deletedAt;
          let resolved;
          if (lDel || rDel) resolved = (lDel && rDel) ? (new Date(L.deletedAt)>=new Date(R.deletedAt)?L:R) : (lDel?L:R);
          else if (field === 'goals') resolved = { ...R, actual: Math.max(L.actual||0, R.actual||0) };
          else resolved = R;
          result.push(resolved);
          anotar('conflicts', field, { local:L, remote:R, resolved, label:LABELS[field] });
          diff.totalConflicts++;
        }
      }
      merged[field] = result;
    }
    return { merged, diff };
  },

  /** Genera HTML del diff para el modal de merge */
  buildDiffHtml(diff, localDeviceName, remoteDeviceName, remoteDate) {
    const LABELS = { transactions:'transacciones', goals:'metas de ahorro', receivables:'deudas a cobrar',
      payables:'deudas a pagar', prestamos:'préstamos', tarjetas:'tarjetas', pagosRecurrentes:'pagos recurrentes', transferenciasProgramadas:'transferencias programadas', grupos:'gastos compartidos', presupuestos:'presupuestos', misCuentas:'cuentas', categorias:'categorías' };
    let html = '';
    const renderSection = (title, color, entries) => {
      html += '<div style="margin-bottom:10px"><div style="font-weight:700;font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px">' + title + '</div>';
      if (entries.length) {
        entries.forEach(([field, items]) => {
          html += '<div style="padding:4px 8px;background:' + color + ';border-radius:4px;margin-bottom:3px;font-size:12px">';
          html += '➕ ' + items.length + ' ' + (LABELS[field]||field) + ' nueva' + (items.length>1?'s':'');
          html += '</div>';
        });
      } else {
        html += '<div style="font-size:12px;color:var(--text2);padding:4px 8px">Sin cambios nuevos</div>';
      }
      html += '</div>';
    };
    renderSection('📱 ESTE DISPOSITIVO (' + esc(localDeviceName||'Local') + ')', 'rgba(var(--green-rgb),.12)', Object.entries(diff.localNew));
    renderSection('☁️ NUBE (' + esc(remoteDeviceName||'otro dispositivo') + (remoteDate?', '+remoteDate:'') + ')', 'rgba(var(--blue-rgb),.12)', Object.entries(diff.remoteNew));
    if (diff.totalConflicts > 0) {
      html += '<div style="margin-bottom:10px"><div style="font-weight:700;font-size:11px;color:var(--aviso);text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px">⚠️ CONFLICTOS RESUELTOS (' + diff.totalConflicts + ')</div>';
      Object.entries(diff.conflicts).forEach(([field, items]) => {
        html += '<div style="padding:4px 8px;background:rgba(var(--aviso-rgb),.1);border-radius:4px;margin-bottom:3px;font-size:12px">';
        html += '🔀 ' + items.length + ' ' + (LABELS[field]||field) + ': se conservó el cambio más reciente';
        html += '</div>';
      });
      html += '</div>';
    }
    const totalNew = diff.totalLocalNew + diff.totalRemoteNew;
    html += '<div style="background:rgba(var(--green-rgb),.08);border:1px solid rgba(var(--green-rgb),.25);padding:10px;border-radius:8px;font-size:12px;line-height:1.7">';
    html += '<strong style="color:var(--green)">✅ RESULTADO COMBINADO:</strong><br>';
    if (totalNew > 0) html += '• ' + totalNew + ' elemento' + (totalNew>1?'s nuevos':' nuevo') + ' de ambos dispositivos incluido' + (totalNew>1?'s':'') + '<br>';
    if (diff.totalRemovidos > 0) html += '• 🗑️ ' + diff.totalRemovidos + ' elemento' + (diff.totalRemovidos>1?'s borrados':' borrado') + ' en otro dispositivo<br>';
    if (diff.totalConflicts > 0) html += '• ' + diff.totalConflicts + ' conflicto' + (diff.totalConflicts>1?'s resueltos':' resuelto') + ' automáticamente<br>';
    if (totalNew === 0 && diff.totalConflicts === 0) html += '• Cambios menores en configuración o metadatos<br>';
    html += '</div>';
    return html;
  },

  /** AUTO-MERGE silencioso: descarga → merge → sube. No interrumpe al usuario. */
  async _autoMergeAndUpload() {
    if (this._isSyncing) return { ok: false, error: 'Sync en progreso' };
    this._isSyncing = true;
    try {
      if (!this.user || !await this.init()) return { ok: false, error: 'Sin sesión' };
      if (typeof _sessionDEK === 'undefined' || !_sessionDEK) return { ok: false, error: 'PIN no desbloqueado' };
      const dekData = (typeof _loadDEKFromStorage === 'function') ? _loadDEKFromStorage() : null;
      if (!dekData || !localStorage.getItem('finanzas_pin_salt')) return { ok: false, error: 'Faltan datos de cifrado' };

      let remoteInfo;
      try { remoteInfo = await this.getRemoteInfo({ strict: true }); }
      catch (e) { return { ok: false, error: 'No se pudo consultar la nube: ' + e.message }; }
      const localV = this.getLocalSyncVersion();
      let mergeStats = null;

      if (remoteInfo && remoteInfo.version > localV) {
        const dl = await this._downloadAndDecrypt();
        if (dl.ok) {
          const { merged, diff } = this.mergeStates(state, dl.data);
          const hasChanges = diff.totalLocalNew>0 || diff.totalRemoteNew>0 || diff.totalConflicts>0 || diff.totalRemovidos>0;
          if (hasChanges) {
            // Backup de seguridad antes de aplicar el merge automático
            _createPreMergeBackup();
            // Mostrar overlay brevemente durante el merge
            _showMergeOverlay('Sincronizando…');
            // Aplicar merged sin disparar otro auto-sync
            Object.keys(state).forEach(k => delete state[k]);
            Object.assign(state, merged);
            ['pagosRecurrentes','prestamos','goals','tarjetas','receivables','payables','transferenciasProgramadas','grupos','presupuestos','misCuentas','categorias'].forEach(f => { if (!state[f]) state[f] = []; });
            _tomarBaseSync();
            // Persistir localmente sin trigger
            try {
              const enc = await _encryptState(state, _sessionDEK);
              localStorage.setItem(LS_KEY, enc);
              saveStateToDB(state).catch(()=>{});
            } catch(e) {}
            _hideMergeOverlay();
            // Refrescar UI con los nuevos datos
            if (typeof renderAll === 'function') setTimeout(() => renderAll(), 150);
            _mostrarBotonDeshacer();
            mergeStats = diff;
            console.log('☁️ Auto-merge OK: +'+ diff.totalRemoteNew +' remotos, +'+ diff.totalLocalNew +' locales');
          }
        } else if (!dl.noRemote) {
          // Subir ahora reemplazaría datos más nuevos de otro dispositivo
          return { ok: false, error: 'No se pudo bajar la versión más nueva de la nube: ' + dl.error };
        }
      }

      const uploadResult = await this.uploadState();
      if (uploadResult.ok && mergeStats) uploadResult.mergeStats = mergeStats;
      return uploadResult;
    } finally {
      this._isSyncing = false;
      if (this._resyncPendiente) {
        this._resyncPendiente = false;
        this._scheduleAutoSync();
      }
    }
  }
};

window.cloudSync = cloudSync;

// ─────────────────────────────────────────────────────────────────────
// UI: render del estado actual de sincronización en Configuración
// ─────────────────────────────────────────────────────────────────────
async function renderCloudSyncUI() {
  const container = document.getElementById('cloud-sync-status-container');
  if (!container) return;

  // Estado 1: Supabase no disponible (offline o el CDN falló)
  if (!cloudSync.sdkAvailable()) {
    container.innerHTML =
      '<div style="padding:14px;background:var(--bg3);border-radius:10px;border-left:3px solid var(--aviso);font-size:12px;color:var(--text2);line-height:1.5">' +
        '⚠️ No hay conexión con el servidor de sincronización.<br>' +
        'Verifica tu internet y recarga la app.' +
      '</div>';
    return;
  }

  // Inicializar si no se hizo
  if (!cloudSync.ready) {
    await cloudSync.init();
  }

  // Estado 2: usuario autenticado → mostrar info + botones de sync
  if (cloudSync.user) {
    const devices = await cloudSync.listDevices();
    const deviceItems = devices.length
      ? devices.map(d => {
          const fecha = new Date(d.last_seen).toLocaleString('es-HN', { dateStyle: 'short', timeStyle: 'short' });
          const esActual = d.device_id === cloudSync.getDeviceId();
          return '<div style="display:flex;justify-content:space-between;padding:8px 10px;background:var(--bg2);border-radius:6px;margin-bottom:4px;font-size:11px;align-items:center">' +
            '<div><strong>' + esc(d.device_name || 'Dispositivo') + '</strong>' +
            (esActual ? ' <span style="color:var(--green);font-size:9px">● ESTE</span>' : '') +
            '</div>' +
            '<div style="color:var(--text2);font-size:10px">' + fecha + '</div>' +
          '</div>';
        }).join('')
      : '<div style="font-size:11px;color:var(--text2);padding:8px">Solo este dispositivo registrado.</div>';

    // Bajar metadata del blob remoto (no descifra nada, solo info)
    const remoteInfo = await cloudSync.getRemoteInfo();
    let remoteStatusHtml;
    if (remoteInfo) {
      const fecha = new Date(remoteInfo.updated_at);
      const ahora = new Date();
      const diffMin = Math.floor((ahora - fecha) / 60000);
      let cuando;
      if (diffMin < 1)        cuando = 'hace unos segundos';
      else if (diffMin < 60)  cuando = 'hace ' + diffMin + ' min';
      else if (diffMin < 1440)cuando = 'hace ' + Math.floor(diffMin/60) + ' h';
      else                    cuando = fecha.toLocaleDateString('es-HN', { dateStyle: 'medium' });
      const sizeKB = (remoteInfo.size_bytes / 1024).toFixed(1);
      remoteStatusHtml =
        '<div style="background:rgba(var(--green-rgb),.08);border:1px solid rgba(var(--green-rgb),.25);padding:10px 12px;border-radius:8px;font-size:11px;margin-bottom:10px;line-height:1.6">' +
          '<div>📦 <strong>Última sincronización:</strong> ' + cuando + '</div>' +
          '<div>📏 Tamaño cifrado: ' + sizeKB + ' KB · Versión #' + remoteInfo.version + '</div>' +
          '<div style="color:var(--text2)">📱 Subido desde: ' + esc(remoteInfo.device_name || '?') + '</div>' +
        '</div>';
    } else {
      remoteStatusHtml =
        '<div style="background:var(--bg3);padding:10px 12px;border-radius:8px;font-size:11px;margin-bottom:10px;color:var(--text2);line-height:1.5">' +
          '☁️ Aún no has subido tus datos. Toca <strong>"Subir ahora"</strong> para empezar.' +
        '</div>';
    }

    container.innerHTML =
      '<div style="padding:14px;background:linear-gradient(135deg,rgba(var(--green-rgb),.1),rgba(var(--green-rgb),.04));border:1px solid rgba(var(--green-rgb),.3);border-radius:10px;margin-bottom:12px">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">' +
          '<span style="font-size:20px">✅</span>' +
          '<div style="flex:1">' +
            '<div style="font-weight:700;font-size:13px">Conectado</div>' +
            '<div style="font-size:11px;color:var(--text2);word-break:break-all">' + esc(cloudSync.user.email || '') + '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      // Nota para iOS: el auto-sync solo funciona con la app abierta
      (/iPhone|iPad|iPod/.test(navigator.userAgent) ?
        '<div style="background:rgba(var(--aviso-rgb),.1);border:1px solid rgba(var(--aviso-rgb),.3);padding:10px 12px;border-radius:8px;font-size:11px;margin-bottom:12px;line-height:1.5;color:var(--text)">' +
          '🍎 <strong>iOS detectado:</strong> el auto-sync solo funciona con la app abierta. ' +
          'Usá el botón <strong>"⬆️ Subir ahora"</strong> antes de cambiar de dispositivo.' +
        '</div>' : '') +

      remoteStatusHtml +
      (cloudSync.hasCloudKey() ? '' :
        '<div style="background:rgba(var(--aviso-rgb),.1);border:1px solid rgba(var(--aviso-rgb),.3);padding:10px 12px;border-radius:8px;font-size:11px;margin-bottom:12px;line-height:1.5;color:var(--text)">' +
          '🔑 <strong>Falta la contraseña de la nube</strong> en este dispositivo. Se te pedirá al tocar "⬆️ Subir ahora" o "⬇️ Bajar de la nube".' +
        '</div>') +

      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">' +
        '<button class="btn btn-primary" onclick="subirDatosCloud()" id="btn-cloud-upload" style="font-size:13px;padding:12px 8px">⬆️ Subir ahora</button>' +
        '<button class="btn btn-secondary" onclick="abrirModalBajarCloud()" id="btn-cloud-download" style="font-size:13px;padding:12px 8px">⬇️ Bajar de la nube</button>' +
      '</div>' +

      '<h5 style="font-size:11px;text-transform:uppercase;color:var(--text2);margin:14px 0 8px;letter-spacing:.5px">📱 Tus dispositivos</h5>' +
      deviceItems +

      '<button class="btn btn-secondary" onclick="cerrarSesionCloud()" style="margin-top:14px;width:100%;font-size:12px">🚪 Cerrar sesión en este dispositivo</button>' +
      '<button class="btn btn-danger" onclick="eliminarCuentaCloud()" style="margin-top:8px;width:100%;font-size:12px">🗑️ Eliminar mi cuenta y mis datos de la nube</button>';
    return;
  }

  // Estado 3: no autenticado → mostrar botón para activar
  container.innerHTML =
    '<div style="padding:14px;background:var(--bg3);border-radius:10px;font-size:12px;color:var(--text2);margin-bottom:12px;line-height:1.5">' +
      '🔒 La sincronización está <strong>desactivada</strong>.<br>' +
      'Tus datos están solo en este dispositivo.' +
    '</div>' +
    '<button class="btn btn-primary" onclick="abrirModalCloudLogin()" style="width:100%">' +
      '☁️ Activar sincronización' +
    '</button>';
}

window.renderCloudSyncUI = renderCloudSyncUI;

async function eliminarCuentaCloud() {
  if (!confirm('🗑️ ELIMINAR TU CUENTA EN LA NUBE\n\nSe borrarán para siempre:\n• Tu cuenta (' + (cloudSync.user && cloudSync.user.email || '') + ')\n• Tus datos cifrados guardados en la nube\n• La lista de tus dispositivos\n\nLos datos de ESTE teléfono no se borran. Los otros teléfonos dejarán de sincronizar.\n\n¿Continuar?')) return;
  if (!confirm('⚠️ Esta acción no se puede deshacer. ¿Eliminar la cuenta?')) return;
  const r = await cloudSync.eliminarCuenta();
  if (r.ok) alert('✅ Tu cuenta y tus datos de la nube fueron eliminados. Tus datos siguen en este teléfono.');
  else alert('❌ No se pudo eliminar la cuenta:\n\n' + r.error);
  renderCloudSyncUI();
}
window.eliminarCuentaCloud = eliminarCuentaCloud;

function abrirModalCloudLogin() {
  const status = document.getElementById('cloud-login-status');
  if (status) status.style.display = 'none';
  const btn = document.getElementById('btn-google-login');
  if (btn) { btn.disabled = false; }
  openModal('modal-cloud-login');
}
window.abrirModalCloudLogin = abrirModalCloudLogin;

async function iniciarSesionConGoogle() {
  const status = document.getElementById('cloud-login-status');
  const btn = document.getElementById('btn-google-login');
  if (btn) { btn.disabled = true; }
  if (status) {
    status.style.display = 'block';
    status.style.color = 'var(--text2)';
    status.textContent = 'Conectando con Google...';
  }
  const result = await cloudSync.signInWithGoogle();
  if (!result.ok) {
    if (status) {
      status.style.color = 'var(--red)';
      status.textContent = '❌ ' + (result.error || 'Error desconocido');
    }
    if (btn) btn.disabled = false;
  }
  // Si result.ok, la página ya está navegando a Google — no hay nada más que hacer.
}

async function cerrarSesionCloud() {
  if (!confirm('¿Cerrar sesión en este dispositivo?\n\nTus datos locales (cifrados con tu PIN) NO se borrarán. Solo se desconectará la sincronización en la nube.')) return;
  await cloudSync.signOut();
  alert('🚪 Sesión cerrada. Tus datos locales siguen intactos.');
}
window.cerrarSesionCloud = cerrarSesionCloud;

// ─────────────────────────────────────────────────────────────────────
// FASE 2 UI: Subir / Bajar datos cifrados
// ─────────────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════
// SEGURIDAD: backup pre-merge + overlay de solo-lectura
// ═══════════════════════════════════════════════════════════════════

/** Guarda una snapshot del state actual en sessionStorage antes de
    sobrescribirlo con datos de la nube. Válido por 5 minutos.
    (sessionStorage se borra al cerrar la pestaña — perfect scope) */
function _createPreMergeBackup() {
  try {
    const snapshot = JSON.stringify(state);
    sessionStorage.setItem('mph_premerge_backup', snapshot);
    sessionStorage.setItem('mph_premerge_backup_time', Date.now().toString());
    console.log('☁️ Backup pre-merge creado (' + (snapshot.length/1024).toFixed(1) + ' KB)');
    return true;
  } catch(e) {
    console.warn('Backup pre-merge falló:', e.message);
    return false;
  }
}

/** Restaura el backup pre-merge si existe y no expiró (5 min).
    Retorna true si restauró, false si no había backup válido. */
async function _restorePreMergeBackup() {
  try {
    const snapshot = sessionStorage.getItem('mph_premerge_backup');
    const timeStr  = sessionStorage.getItem('mph_premerge_backup_time');
    if (!snapshot || !timeStr) return false;
    const age = Date.now() - parseInt(timeStr);
    if (age > 5 * 60 * 1000) {
      sessionStorage.removeItem('mph_premerge_backup');
      sessionStorage.removeItem('mph_premerge_backup_time');
      return false;
    }
    const parsed = JSON.parse(snapshot);
    Object.keys(state).forEach(k => delete state[k]);
    Object.assign(state, parsed);
    _tomarBaseSync();
    if (_sessionDEK) {
      const enc = await _encryptState(state, _sessionDEK);
      localStorage.setItem(LS_KEY, enc);
      saveStateToDB(state).catch(()=>{});
    }
    sessionStorage.removeItem('mph_premerge_backup');
    sessionStorage.removeItem('mph_premerge_backup_time');
    if (typeof renderAll === 'function') renderAll();
    return true;
  } catch(e) {
    console.error('Restaurar backup pre-merge falló:', e);
    return false;
  }
}

/** Muestra overlay semitransparente durante el merge para prevenir
    ediciones concurrentes mientras se resuelven conflictos */
function _showMergeOverlay(msg) {
  if (document.getElementById('merge-readonly-overlay')) return;
  const el = document.createElement('div');
  el.id = 'merge-readonly-overlay';
  el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9998;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px)';
  el.innerHTML =
    '<div style="background:var(--bg2);border-radius:16px;padding:24px 28px;text-align:center;max-width:280px;border:1px solid var(--border)">' +
      '<div style="font-size:32px;margin-bottom:12px">☁️</div>' +
      '<div style="font-weight:800;font-size:15px;margin-bottom:6px">' + (msg||'Combinando datos…') + '</div>' +
      '<div style="font-size:12px;color:var(--text2);line-height:1.5">Espera un momento.<br>No cierres la app.</div>' +
    '</div>';
  document.body.appendChild(el);
}

function _hideMergeOverlay() {
  document.getElementById('merge-readonly-overlay')?.remove();
}

/** Muestra el botón "↩️ Deshacer merge" por 5 minutos si hay backup disponible */
function _mostrarBotonDeshacer() {
  const timeStr = sessionStorage.getItem('mph_premerge_backup_time');
  if (!timeStr) return;
  const age = Date.now() - parseInt(timeStr);
  if (age > 5 * 60 * 1000) return; // Ya expiró

  const existing = document.getElementById('cloud-undo-merge-btn');
  if (existing) return;

  const btn = document.createElement('button');
  btn.id = 'cloud-undo-merge-btn';
  btn.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);' +
    'background:linear-gradient(135deg,var(--bg2),var(--bg3));border:1px solid var(--amber);' +
    'color:var(--amber);padding:10px 20px;border-radius:20px;font-size:12px;font-weight:700;' +
    'cursor:pointer;z-index:500;box-shadow:0 4px 16px rgba(0,0,0,.4);white-space:nowrap';
  btn.textContent = '↩️ Deshacer merge (5 min)';
  btn.onclick = async function() {
    if (!confirm('¿Deshacer el merge y volver a tus datos locales anteriores?\n\nLos datos de la nube que se combinaron se perderán.')) return;
    btn.remove();
    const ok = await _restorePreMergeBackup();
    if (ok) {
      alert('✅ Datos restaurados al estado anterior al merge.');
    } else {
      alert('⚠️ El backup expiró (válido 5 minutos). No se puede deshacer.');
    }
  };
  document.body.appendChild(btn);

  // Auto-ocultar cuando expire el backup
  const remaining = 5 * 60 * 1000 - age;
  setTimeout(() => btn.remove(), remaining);
}

window._createPreMergeBackup = _createPreMergeBackup;
window._restorePreMergeBackup = _restorePreMergeBackup;
window._showMergeOverlay = _showMergeOverlay;
window._hideMergeOverlay = _hideMergeOverlay;
window._mostrarBotonDeshacer = _mostrarBotonDeshacer;

let _pendingMerge = null; // Estado del merge pendiente para confirmarEstrategiaMerge

async function subirDatosCloud() {
  const btn = document.getElementById('btn-cloud-upload');
  if (!btn) return;
  if (typeof _sessionDEK === 'undefined' || _sessionDEK === null) {
    alert('⚠️ Para subir tus datos a la nube necesitás:\n\n1. Tener un PIN configurado\n2. Haber desbloqueado la app con tu PIN en esta sesión');
    return;
  }
  if (!await cloudSync.asegurarClaveNube()) return;
  // Verificar si hay versión más nueva en la nube
  let remoteInfo;
  try { remoteInfo = await cloudSync.getRemoteInfo({ strict: true }); }
  catch (e) { alert('❌ No se pudo consultar la nube:\n\n' + e.message); return; }
  const localV = cloudSync.getLocalSyncVersion();

  if (remoteInfo && remoteInfo.version > localV) {
    // Descargar y calcular diff para mostrar en el modal
    const dl = await cloudSync._downloadAndDecrypt();
    if (dl.ok) {
      const { merged, diff } = cloudSync.mergeStates(state, dl.data);
      const hasChanges = diff.totalLocalNew > 0 || diff.totalRemoteNew > 0 || diff.totalConflicts > 0 || diff.totalRemovidos > 0;
      if (hasChanges) {
        _pendingMerge = { merged, diff, remoteDeviceName: dl.deviceName||remoteInfo.device_name, remoteDate: new Date(remoteInfo.updated_at).toLocaleString('es-HN',{dateStyle:'short',timeStyle:'short'}) };
        const diffEl = document.getElementById('cloud-merge-diff');
        if (diffEl) diffEl.innerHTML = cloudSync.buildDiffHtml(diff, cloudSync.getDeviceName(), _pendingMerge.remoteDeviceName, _pendingMerge.remoteDate);
        openModal('modal-cloud-merge');
        return;
      }
    } else if (!dl.noRemote) {
      if (!confirm('⚠️ La nube tiene una versión más nueva (subida desde ' + (remoteInfo.device_name || 'otro dispositivo') + '), pero no se pudo bajar:\n\n' + dl.error + '\n\nSi subes ahora la reemplazarás y se perderán los cambios hechos en ese dispositivo. ¿Subir de todos modos?')) return;
    }
    // Si diff vacío, subir normalmente
  }
  await _doDirectUpload(btn);
}
window.subirDatosCloud = subirDatosCloud;

async function _doDirectUpload(btn) {
  const origText = (btn && btn.textContent) || '⬆️ Subir ahora';
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Cifrando y subiendo...'; }
  const result = await cloudSync.uploadState();
  if (btn) { btn.disabled = false; btn.textContent = origText; }
  if (result.ok) {
    alert('✅ Subido exitosamente\n\n📦 ' + (result.sizeBytes/1024).toFixed(1) + ' KB · Versión #' + result.version + '\n🔒 Cifrado E2E con AES-256.');
    renderCloudSyncUI();
  } else {
    alert('❌ Error al subir:\n\n' + (result.error || 'Error desconocido'));
  }
}
window._doDirectUpload = _doDirectUpload;

async function confirmarEstrategiaMerge(strategy) {
  closeModal('modal-cloud-merge');
  const btn = document.getElementById('btn-cloud-upload');

  if (strategy === 'local') {
    // Subir solo lo local sin hacer merge
    await _doDirectUpload(btn);
    _pendingMerge = null;
    return;
  }
  if (strategy === 'merge' && _pendingMerge) {
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Combinando y subiendo...'; }
    // Backup de seguridad antes de sobrescribir
    _createPreMergeBackup();
    _showMergeOverlay('Combinando datos…');
    // Aplicar merged sin disparar otro auto-sync
    const { merged } = _pendingMerge;
    Object.keys(state).forEach(k => delete state[k]);
    Object.assign(state, merged);
    ['pagosRecurrentes','prestamos','goals','tarjetas','receivables','payables','transferenciasProgramadas','grupos','presupuestos','misCuentas','categorias'].forEach(f => { if (!state[f]) state[f] = []; });
    _tomarBaseSync();
    // Persistir localmente
    try {
      if (_sessionDEK) {
        const enc = await _encryptState(state, _sessionDEK);
        localStorage.setItem(LS_KEY, enc);
        saveStateToDB(state).catch(()=>{});
      }
    } catch(e) {}
    // Subir
    const result = await cloudSync.uploadState();
    _hideMergeOverlay();
    if (btn) { btn.disabled = false; btn.textContent = '⬆️ Subir ahora'; }
    _pendingMerge = null;
    if (result.ok) {
      if (typeof renderAll === 'function') renderAll();
      alert('✅ Combinado y subido\n\n📦 ' + (result.sizeBytes/1024).toFixed(1) + ' KB · Versión #' + result.version);
      _mostrarBotonDeshacer();
      renderCloudSyncUI();
    } else {
      alert('❌ Error al subir:\n\n' + (result.error || 'Error desconocido'));
    }
  }
}
window.confirmarEstrategiaMerge = confirmarEstrategiaMerge;

// Handler del banner flotante "Hay datos nuevos en la nube"
window._onCloudBannerDownload = function() {
  document.getElementById('cloud-newer-banner')?.remove();
  if (typeof switchView === 'function') switchView('config');
  setTimeout(() => { if (typeof subirDatosCloud === 'function') subirDatosCloud(); }, 300);
};

function abrirModalBajarCloud() {
  // Verificar que hay datos en la nube antes de pedir PIN
  cloudSync.getRemoteInfo().then(info => {
    if (!info) {
      alert('☁️ No hay datos sincronizados en la nube todavía.\n\nDesde otro dispositivo, primero usá "⬆️ Subir ahora" para crear el primer respaldo. Luego podés bajarlo en este dispositivo.');
      return;
    }
    // Mostrar el modal con info del blob remoto
    const fecha = new Date(info.updated_at).toLocaleString('es-HN', { dateStyle: 'medium', timeStyle: 'short' });
    const sizeKB = (info.size_bytes / 1024).toFixed(1);
    document.getElementById('cloud-download-info').innerHTML =
      '📦 <strong>Datos disponibles en la nube:</strong><br>' +
      '• Subido: ' + fecha + '<br>' +
      '• Desde: ' + esc(info.device_name || '?') + '<br>' +
      '• Tamaño: ' + sizeKB + ' KB · Versión #' + info.version;
    document.getElementById('cloud-download-pin').value = '';
    document.getElementById('cloud-download-pass').value = '';
    _cloudDownloadConPass = String(info.pin_salt || '').startsWith('p2:');
    document.getElementById('cloud-download-pass-wrap').style.display = _cloudDownloadConPass ? 'block' : 'none';
    const status = document.getElementById('cloud-download-status');
    if (status) status.style.display = 'none';
    const btn = document.getElementById('btn-confirmar-bajar');
    if (btn) { btn.disabled = false; btn.textContent = '⬇️ Sí, sobrescribir con datos de la nube'; }
    openModal('modal-cloud-download');
    setTimeout(() => document.getElementById(_cloudDownloadConPass ? 'cloud-download-pass' : 'cloud-download-pin')?.focus(), 100);
  });
}
let _cloudDownloadConPass = false;

/** Pide la contraseña de la nube en un modal. existe=true: escribir la que ya
    se creó; false: crear una nueva (se pide dos veces). Resuelve con la
    contraseña o null si se cancela. */
function pedirContrasenaNube(existe, textos) {
  const t = Object.assign({
    titulo: '🔑 Contraseña de la nube',
    intro: existe
      ? 'Tus datos en la nube están protegidos con una contraseña. Escríbela para poder sincronizar este dispositivo.'
      : 'Crea una contraseña para proteger tus datos en la nube. Es distinta de tu PIN y debe tener al menos ' + cloudSync.CLOUD_PASS_MIN + ' caracteres.',
    nota: 'Guárdala en un lugar seguro: la necesitarás para bajar tus datos en otro dispositivo y no se puede recuperar.',
  }, textos || {});
  return new Promise(resolve => {
    const p1 = document.getElementById('cloud-pass-1'), p2 = document.getElementById('cloud-pass-2');
    const err = document.getElementById('cloud-pass-error');
    document.getElementById('cloud-pass-titulo').textContent = t.titulo;
    document.getElementById('cloud-pass-nota').textContent = t.nota;
    document.getElementById('cloud-pass-intro').textContent = t.intro;
    p1.value = ''; p2.value = ''; err.style.display = 'none';
    p1.placeholder = existe ? 'Contraseña de la nube' : 'Contraseña (mínimo ' + cloudSync.CLOUD_PASS_MIN + ' caracteres)';
    p1.autocomplete = existe ? 'current-password' : 'new-password';
    p2.style.display = existe ? 'none' : 'block';
    const cerrar = v => { closeModal('modal-cloud-pass'); resolve(v); };
    document.getElementById('btn-cloud-pass-cancel').onclick = () => cerrar(null);
    document.getElementById('btn-cloud-pass-ok').onclick = () => {
      const fallo = msg => { err.textContent = msg; err.style.display = 'block'; };
      if (!existe) {
        if (p1.value.length < cloudSync.CLOUD_PASS_MIN) return fallo('Debe tener al menos ' + cloudSync.CLOUD_PASS_MIN + ' caracteres.');
        if (/^\d+$/.test(p1.value)) return fallo('No uses solo números: combina letras y números o una frase.');
        if (p1.value !== p2.value) return fallo('Las contraseñas no coinciden.');
      } else if (!p1.value) return fallo('Escribe la contraseña.');
      cerrar(p1.value);
    };
    openModal('modal-cloud-pass');
    setTimeout(() => p1.focus(), 100);
  });
}
window.pedirContrasenaNube = pedirContrasenaNube;
window.abrirModalBajarCloud = abrirModalBajarCloud;

async function confirmarBajarCloud() {
  const pin = (document.getElementById('cloud-download-pin')?.value || '').trim();
  const passphrase = document.getElementById('cloud-download-pass')?.value || '';
  const status = document.getElementById('cloud-download-status');
  if (_cloudDownloadConPass && !passphrase) {
    if (status) { status.style.display = 'block'; status.style.color = 'var(--red)'; status.textContent = '⚠️ Escribe la contraseña de la nube'; }
    return;
  }
  const btn = document.getElementById('btn-confirmar-bajar');
  // Con un blob viejo el PIN es el de antes (puede ser de 4); si no, es el
  // PIN nuevo de este dispositivo y aplica el mínimo actual
  if (!(_cloudDownloadConPass ? /^\d{6,8}$/ : /^\d{4,8}$/).test(pin)) {
    if (status) {
      status.style.display = 'block';
      status.style.color = 'var(--red)';
      status.textContent = _cloudDownloadConPass ? '⚠️ Crea un PIN para este dispositivo (6 a 8 dígitos)' : '⚠️ Ingresa tu PIN (4 a 8 dígitos)';
    }
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Bajando y descifrando...'; }
  if (status) {
    status.style.display = 'block';
    status.style.color = 'var(--text2)';
    status.textContent = '🔓 Descifrando tus datos...';
  }

  // Backup de seguridad y overlay antes de sobrescribir
  _createPreMergeBackup();
  _showMergeOverlay('Restaurando datos…');

  const result = await cloudSync.downloadState({ pin, passphrase });

  if (result.ok) {
    _hideMergeOverlay();
    if (status) {
      status.style.color = 'var(--green)';
      status.textContent = '✅ Datos restaurados. Recargando app...';
    }
    setTimeout(() => {
      closeModal('modal-cloud-download');
      if (typeof renderAll === 'function') renderAll();
      alert('✅ Datos sincronizados desde la nube.\n\nVersión #' + result.version + ' · Subido desde: ' + (result.deviceName || '?') + '\n\nTus datos locales fueron reemplazados por los de la nube.');
      _mostrarBotonDeshacer();
      renderCloudSyncUI();
    }, 800);
  } else {
    _hideMergeOverlay(); // Si falló, quitar el overlay
    if (status) {
      status.style.color = 'var(--red)';
      status.textContent = '❌ ' + (result.error || 'Error desconocido');
    }
    if (btn) { btn.disabled = false; btn.textContent = '⬇️ Reintentar'; }
  }
}
window.confirmarBajarCloud = confirmarBajarCloud;

// Inicializar cloudSync al cargar (si el SDK ya estaba listo) o cuando esté disponible
function _initCloudSyncWhenReady() {
  if (cloudSync.sdkAvailable()) {
    cloudSync.init().then(() => {
      // Si el contenedor de UI existe, refrescarlo
      if (document.getElementById('cloud-sync-status-container')) {
        renderCloudSyncUI();
      }
    });
  } else {
    // El SDK puede tardar en cargar (CDN). Reintentar 5 veces con 1s entre cada uno.
    if (!_initCloudSyncWhenReady._attempts) _initCloudSyncWhenReady._attempts = 0;
    _initCloudSyncWhenReady._attempts++;
    if (_initCloudSyncWhenReady._attempts < 5) {
      setTimeout(_initCloudSyncWhenReady, 1000);
    } else {
      console.log('☁️ Supabase SDK no cargó tras 5 intentos. Sync deshabilitado.');
    }
  }
}
// Disparar después de que el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _initCloudSyncWhenReady);
} else {
  _initCloudSyncWhenReady();
}

console.log('✅ Mi Pisto HN v2.0 listo');
