// Mi Pisto HN · 46-calificar.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.
// ========== "¿NOS AYUDAS EN GOOGLE PLAY?" ==========
// Solo en la app de Play (en la web no hay dónde calificar), y solo cuando ya se
// usó un tiempo: 7 días seguidos anotando, o 30 movimientos en al menos 7 días.
// Nunca apenas se instala ni con una ventana abierta. "Ahora no" lo vuelve a
// ofrecer en 30 días, y después de dos veces no insiste más.
// Las dos opciones valen lo mismo: no se pregunta antes si la app gusta ni se
// da nada a cambio (así lo piden las reglas de Google Play).

const PLAY_PAQUETE = 'hn.mipisto.app';
const PLAY_URL_FICHA = 'https://play.google.com/store/apps/details?id=' + PLAY_PAQUETE;
const _CAL_KEY = 'mph_calificar';
const _CAL_DIA = 86400000;

// La app de Play abre la página con este "referrer" la primera vez
function _marcarSiVieneDePlay(ref) {
  try { if (String(ref || '').startsWith('android-app://' + PLAY_PAQUETE)) localStorage.setItem('mph_desde_play', '1'); } catch (e) {}
}
_marcarSiVieneDePlay(document.referrer);
const _esAppDePlay = () => { try { return localStorage.getItem('mph_desde_play') === '1'; } catch (e) { return false; } };

function _calEstado() { try { return JSON.parse(localStorage.getItem(_CAL_KEY) || '{}') || {}; } catch (e) { return {}; } }
function _calGuardar(e) { try { localStorage.setItem(_CAL_KEY, JSON.stringify(e)); } catch (x) {} }

/** Si ahora es buen momento para pedir la calificación. Devuelve el motivo o null. */
function _momentoDeCalificar(ahora = Date.now()) {
  if (!_esAppDePlay() || typeof state === 'undefined' || !state.setup) return null;
  const e = _calEstado();
  if (e.hecho || (e.veces || 0) >= 2 || (e.proxima && ahora < e.proxima)) return null;
  const racha = typeof calcularRacha === 'function' ? calcularRacha(new Date(ahora)).actual : 0;
  if (racha >= 7) return { racha };
  const movs = (state.transactions || []).filter(t => !t.deletedAt && !t.esSaldoInicial && t.date);
  if (movs.length >= 30) {
    const primero = Math.min(...movs.map(t => Date.parse(t.date) || ahora));
    if (ahora - primero >= 7 * _CAL_DIA) return { movs: movs.length };
  }
  return null;
}

function _hayAlgoAbierto() {
  if (document.querySelector('.dlg-capa')) return true;
  return [...document.querySelectorAll('.modal')].some(m => getComputedStyle(m).display !== 'none');
}

function calificarEnPlay() {
  const e = _calEstado(); e.hecho = true; _calGuardar(e);
  window.open(PLAY_URL_FICHA, '_blank', 'noopener');
}

function pedirCalificacion(motivo) {
  if (document.getElementById('dlg-calificar')) return;
  const porque = motivo && motivo.racha
    ? '🔥 Llevas ' + motivo.racha + ' días seguidos anotando con Mi Pisto.'
    : 'Ya llevas ' + ((motivo && motivo.movs) || 'varios') + ' movimientos anotados con Mi Pisto.';
  const capa = document.createElement('div');
  capa.id = 'dlg-calificar';
  capa.className = 'dlg-capa';
  capa.setAttribute('role', 'dialog');
  capa.setAttribute('aria-modal', 'true');
  capa.innerHTML = `<div class="dlg-caja">
      <div class="dlg-titulo">⭐ ¿Nos ayudas en Google Play?</div>
      <div class="dlg-texto">${esc(porque)}\nTu calificación y tu opinión en Google Play ayudan a que más gente encuentre la app. Toma unos segundos.</div>
      <div class="dlg-botones">
        <button type="button" class="btn btn-secondary cal-no">Ahora no</button>
        <button type="button" class="btn btn-primary cal-si">Calificar</button>
      </div>
      <button type="button" class="cal-comentar">¿Algo no funciona? Cuéntanos</button>
    </div>`;
  const cerrar = () => capa.remove();
  const despues = () => { const e = _calEstado(); e.veces = (e.veces || 0) + 1; e.proxima = Date.now() + 30 * _CAL_DIA; _calGuardar(e); cerrar(); };
  capa.querySelector('.cal-si').onclick = () => { cerrar(); calificarEnPlay(); };
  capa.querySelector('.cal-no').onclick = despues;
  capa.querySelector('.cal-comentar').onclick = () => { despues(); if (typeof enviarComentarios === 'function') enviarComentarios(); };
  document.body.appendChild(capa);
  capa.querySelector('.cal-si').focus();
}

/** Se revisa una vez por sesión, un rato después de abrir y con la app ya desbloqueada */
let _calRevisado = false;
function revisarCalificacion() {
  if (_calRevisado) return false;
  const pin = document.getElementById('modal-pin');
  if (pin && getComputedStyle(pin).display !== 'none') return false; // todavía bloqueada: se revisa después
  const motivo = _momentoDeCalificar();
  if (!motivo) { _calRevisado = true; return false; }
  if (_hayAlgoAbierto()) return false;
  _calRevisado = true;
  pedirCalificacion(motivo);
  return true;
}
if (_esAppDePlay()) {
  const _calTimer = setInterval(() => { if (revisarCalificacion() || _calRevisado) clearInterval(_calTimer); }, 45000);
}
