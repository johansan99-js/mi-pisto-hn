// Mi Pisto HN · 44-fotos-nube.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.
// ========== FOTOS DE FACTURAS EN LA NUBE ==========
// Con la nube conectada, cada foto de factura también se guarda en Supabase
// Storage (carpeta privada "facturas/<tu usuario>/"). Se cifra en el teléfono con
// la misma clave de tus datos antes de subir: el servidor solo ve bytes
// ilegibles. En otro dispositivo, la foto se baja la primera vez que abres el gasto.
// Para no gastar espacio, la copia de la nube va más liviana (1280 px).

const _FOTOS_BUCKET = 'facturas';
let _fotosEnCurso = false, _fotosOtraVez = false;

const _fotosListas = () => { try { return new Set(JSON.parse(localStorage.getItem('mph_fotos_nube_' + cloudSync.user.id) || '[]')); } catch (e) { return new Set(); } };
const _fotosGuardarLista = set => { try { localStorage.setItem('mph_fotos_nube_' + cloudSync.user.id, JSON.stringify([...set])); } catch (e) {} };
const _fotosRuta = id => cloudSync.user.id + '/' + String(id).replace(/[^A-Za-z0-9_-]/g, '');

function _fotosDisponible() {
  return typeof cloudSync !== 'undefined' && cloudSync.user && cloudSync.client && cloudSync.client.storage &&
    _sessionDEK && cloudSync.hasCloudKey();
}

async function _cifrarBytes(bytes) {
  const key = await _importDEKAsCryptoKey(_sessionDEK);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv, 0); out.set(ct, 12);
  return out;
}
async function _descifrarBytes(buf) {
  const key = await _importDEKAsCryptoKey(_sessionDEK);
  const b = new Uint8Array(buf);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(0, 12) }, key, b.slice(12)));
}
const _dataURLaBlob = async dataURL => (await fetch(dataURL)).blob();
const _blobADataURL = blob => new Promise(res => { const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = () => res(null); r.readAsDataURL(blob); });

/** Guarda en este dispositivo una foto con un id dado (cifrada si hay PIN) */
async function _guardarFacturaConId(id, dataURL) {
  const valor = _sessionDEK ? { _enc: await _encryptState(dataURL, _sessionDEK) } : dataURL;
  const db = await initDB();
  await new Promise((res, rej) => {
    const tx = db.transaction(IDB_FACTURAS, 'readwrite');
    tx.objectStore(IDB_FACTURAS).put(valor, id);
    tx.oncomplete = res; tx.onerror = rej;
  });
}

async function _subirFoto(id) {
  const dataURL = await _obtenerFacturaLocal(id);
  if (!dataURL || !/^data:image\//.test(dataURL)) return false;
  const liviana = await _comprimirImagenParaOCR(await _dataURLaBlob(dataURL), 1280, 0.7);
  const bytes = new Uint8Array(await liviana.arrayBuffer());
  const cifrado = await _cifrarBytes(bytes);
  const { error } = await cloudSync.client.storage.from(_FOTOS_BUCKET)
    .upload(_fotosRuta(id), new Blob([cifrado], { type: 'application/octet-stream' }), { upsert: true, contentType: 'application/octet-stream' });
  if (error) { console.warn('Foto a la nube:', error.message); return false; }
  return true;
}

/** Sube las fotos que todavía no están en la nube. Devuelve cuántas subió. */
async function sincronizarFotos() {
  if (!_fotosDisponible()) return 0;
  if (_fotosEnCurso) { _fotosOtraVez = true; return 0; }
  _fotosEnCurso = true;
  let subidas = 0;
  try {
    const listas = _fotosListas();
    const ids = [...new Set((state.transactions || []).filter(t => t.facturaImagenId && !t.deletedAt).map(t => t.facturaImagenId))];
    for (const id of ids) {
      if (listas.has(id)) continue;
      if (!navigator.onLine) break;
      if (await _subirFoto(id)) { listas.add(id); subidas++; _fotosGuardarLista(listas); }
    }
  } catch (e) { console.warn('Fotos a la nube:', e); }
  finally {
    _fotosEnCurso = false;
    if (_fotosOtraVez) { _fotosOtraVez = false; setTimeout(sincronizarFotos, 1000); }
  }
  return subidas;
}

// La foto que no está en este dispositivo se baja de la nube al pedirla
const _obtenerFacturaLocal = _obtenerFactura;
_obtenerFactura = async function (id) {
  const local = await _obtenerFacturaLocal(id);
  if (local || !id || !_fotosDisponible()) return local;
  try {
    const { data, error } = await cloudSync.client.storage.from(_FOTOS_BUCKET).download(_fotosRuta(id));
    if (error || !data) return null;
    const bytes = await _descifrarBytes(await data.arrayBuffer());
    const dataURL = await _blobADataURL(new Blob([bytes], { type: 'image/jpeg' }));
    if (!dataURL) return null;
    await _guardarFacturaConId(id, dataURL);
    const listas = _fotosListas(); listas.add(id); _fotosGuardarLista(listas);
    return dataURL;
  } catch (e) { console.warn('Foto de la nube:', e); return null; }
};

// Quitar una foto también la quita de la nube
const _eliminarFacturaLocal = _eliminarFactura;
_eliminarFactura = async function (id) {
  await _eliminarFacturaLocal(id);
  if (!id || typeof cloudSync === 'undefined' || !cloudSync.user || !cloudSync.client || !cloudSync.client.storage) return;
  try {
    await cloudSync.client.storage.from(_FOTOS_BUCKET).remove([_fotosRuta(id)]);
    const listas = _fotosListas(); listas.delete(id); _fotosGuardarLista(listas);
  } catch (e) {}
};

// Las fotos guardadas en este dispositivo van cifradas con la clave de los
// datos: si esa clave cambia (al juntar o bajar de la nube), se re-cifran
async function _recifrarFacturasLocales(vieja, nueva) {
  if (!vieja || !nueva || _b64EncodeArr(vieja) === _b64EncodeArr(nueva)) return 0;
  const db = await initDB();
  const todas = await new Promise(res => {
    const out = [];
    const req = db.transaction(IDB_FACTURAS, 'readonly').objectStore(IDB_FACTURAS).openCursor();
    req.onsuccess = () => { const c = req.result; if (c) { out.push([c.key, c.value]); c.continue(); } else res(out); };
    req.onerror = () => res(out);
  });
  const cambios = [];
  for (const [k, v] of todas) {
    if (!v || !v._enc) continue;
    const plano = await _decryptState(v._enc, vieja);
    if (plano) cambios.push([k, { _enc: await _encryptState(plano, nueva) }]);
  }
  if (!cambios.length) return 0;
  await new Promise((res, rej) => {
    const tx = db.transaction(IDB_FACTURAS, 'readwrite');
    cambios.forEach(([k, v]) => tx.objectStore(IDB_FACTURAS).put(v, k));
    tx.oncomplete = res; tx.onerror = rej;
  });
  return cambios.length;
}
if (typeof _usarOtraClaveLocal === 'function') {
  const _usarOtraClaveConFotos = _usarOtraClaveLocal;
  _usarOtraClaveLocal = async function (dek) {
    const vieja = _sessionDEK;
    await _recifrarFacturasLocales(vieja, dek).catch(e => console.warn('Re-cifrar fotos:', e));
    return _usarOtraClaveConFotos.apply(this, arguments);
  };
}
if (typeof cloudSync !== 'undefined') {
  const _downloadConFotos = cloudSync.downloadState.bind(cloudSync);
  cloudSync.downloadState = async function () {
    const vieja = _sessionDEK;
    const r = await _downloadConFotos.apply(this, arguments);
    if (r.ok && vieja && _sessionDEK) await _recifrarFacturasLocales(vieja, _sessionDEK).catch(e => console.warn('Re-cifrar fotos:', e));
    return r;
  };

  // Cada vez que los datos se sincronizan, siguen las fotos
  const _autoMergeConFotos = cloudSync._autoMergeAndUpload.bind(cloudSync);
  cloudSync._autoMergeAndUpload = async function () {
    const r = await _autoMergeConFotos.apply(this, arguments);
    if (r && r.ok) setTimeout(sincronizarFotos, 500);
    return r;
  };

  // Eliminar la cuenta también borra las fotos de la nube
  const _eliminarCuentaConFotos = cloudSync.eliminarCuenta.bind(cloudSync);
  cloudSync.eliminarCuenta = async function () {
    if (this.user && this.client && this.client.storage) {
      try {
        const carpeta = this.client.storage.from(_FOTOS_BUCKET);
        for (let vuelta = 0; vuelta < 50; vuelta++) {
          const { data, error } = await carpeta.list(this.user.id, { limit: 100 });
          if (error || !data || !data.length) break;
          const { error: e2 } = await carpeta.remove(data.map(f => this.user.id + '/' + f.name));
          if (e2) break;
        }
      } catch (e) { console.warn('Borrar fotos de la nube:', e); }
    }
    return _eliminarCuentaConFotos.apply(this, arguments);
  };
}
// Al abrir la app ya desbloqueada, se ponen al día las que faltan
setTimeout(() => { sincronizarFotos(); }, 8000);
