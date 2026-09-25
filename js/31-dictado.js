// Mi Pisto HN · 31-dictado.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.

// ═══ DICTAR UN MOVIMIENTO ═════════════════════════════════════════════════
// En el teclado de registrar, 🎤 escucha una frase como
//   "gasté 350 en comida", "ayer pagué 1,200 de luz con la tarjeta BAC",
//   "me pagaron la quincena, 15 mil", "pasé 500 del efectivo al ahorro",
//   "mi mamá me mandó 200 dólares por Remitly"
// y llena el teclado: tipo, monto, categoría, cuenta, fecha y nota. No guarda
// solo: quien dicta revisa y toca Guardar, porque el dictado se equivoca.
// Sin reconocimiento de voz (algunos navegadores), la misma hoja deja
// escribir la frase; el micrófono del teclado del celular también sirve.

// ─── Números dichos con palabras ────────────────────────────────────────
const _NUM_PALABRAS = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiun: 21, veintiuno: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
  cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300, cuatrocientos: 400, cuatrocientas: 400,
  quinientos: 500, quinientas: 500, seiscientos: 600, seiscientas: 600, setecientos: 700, setecientas: 700,
  ochocientos: 800, ochocientas: 800, novecientos: 900, novecientas: 900,
};
const _MONEDA_L = /^(lempiras?|lps?|pesos|varas|lucas|barras)$/;
const _MONEDA_USD = /^(dolares|dolar|usd|dolaritos)$/;

/** Los montos de la frase, en orden: { valor, desde, hasta, moneda } (desde/hasta en palabras) */
function _montosDictados(palabras) {
  const out = [];
  let i = 0;
  const esNum = w => /^\d+(\.\d+)?$/.test(w) || w in _NUM_PALABRAS || w === 'mil';
  while (i < palabras.length) {
    if (!esNum(palabras[i]) || (palabras[i] === 'un' || palabras[i] === 'una') && !esNum(palabras[i + 1] || '')) { i++; continue; }
    const desde = i;
    let total = 0, actual = 0, hubo = false;
    while (i < palabras.length) {
      const w = palabras[i];
      if (/^\d+(\.\d+)?$/.test(w)) { actual += Number(w); hubo = true; i++; }
      else if (w in _NUM_PALABRAS) { actual += _NUM_PALABRAS[w]; hubo = true; i++; }
      else if (w === 'mil') { total += (actual || 1) * 1000; actual = 0; hubo = true; i++; }
      else if ((w === 'millon' || w === 'millones') && hubo) { total = (total + (actual || 1)) * 1e6; actual = 0; i++; }
      else if (w === 'y' && hubo && palabras[i + 1] in _NUM_PALABRAS) i++;
      else break;
    }
    let valor = total + actual;
    // "350 con 50" → 350.50
    if (palabras[i] === 'con' && /^\d{1,2}$/.test(palabras[i + 1] || '') && !/^(la|el|tarjeta)$/.test(palabras[i + 2] || '')) { valor += Number(palabras[i + 1]) / 100; i += 2; }
    let moneda = null;
    if (_MONEDA_USD.test(palabras[i] || '')) { moneda = 'USD'; i++; }
    else if (_MONEDA_L.test(palabras[i] || '')) { moneda = 'HNL'; i++; }
    else if (palabras[desde - 1] === 'usd') moneda = 'USD';
    if (valor > 0) out.push({ valor: _c2(valor), desde, hasta: i, moneda });
  }
  return out;
}

// ─── La frase → lo que se llena en el teclado ───────────────────────────
const _DIC_INGRESO = /\b(me pagaron|me depositaron|me cayo|me cayeron|me mando|me mandaron|me envio|me enviaron|me dieron|me dio|me transfirieron|recibi|cobre|gane|vendi|ingreso|ingresaron|entro|entraron|quincena|salario|sueldo|remesa)\b/;
const _DIC_TRANSF = /\b(transferi|pase|movi|mande|meti|saque|deposite)\b.*\b(a|al|hacia|para)\b/;
const _DIC_DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const _PARIENTES = { mama: 'Mamá', papa: 'Papá', mami: 'Mamá', papi: 'Papá', hermano: 'Hermano', hermana: 'Hermana', tio: 'Tío', tia: 'Tía', hijo: 'Hijo', hija: 'Hija', esposo: 'Esposo', esposa: 'Esposa', abuela: 'Abuela', abuelo: 'Abuelo', primo: 'Primo', prima: 'Prima', novio: 'Novio', novia: 'Novia' };
const _capital = s => s.replace(/(^|\s)\S/g, c => c.toUpperCase());

/** Cuentas y tarjetas que se nombran en la frase, en el orden en que aparecen */
function _cuentasDictadas(txt) {
  const hallados = [];
  const buscar = (nombre, dato) => {
    const n = _normCat(nombre);
    if (n.length < 3) return;
    const m = new RegExp('\\b' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').exec(txt);
    if (m) hallados.push(Object.assign({ pos: m.index, largo: n.length }, dato));
  };
  (state.tarjetas || []).forEach(t => { buscar(t.nombre, { tarjeta: t.id }); if (t.banco) buscar('tarjeta ' + t.banco, { tarjeta: t.id }); });
  listaCuentas().forEach(c => {
    buscar(nombreCompletoCuenta(c), { cuenta: c.id });
    if (!c.base) buscar(c.nombre, { cuenta: c.id });
  });
  if (/\b(en |con |del |de )?efectivo\b/.test(txt)) hallados.push({ pos: txt.search(/\befectivo\b/), largo: 8, cuenta: 'efectivo' });
  if (/\b(la )?(cuenta de )?ahorros?\b/.test(txt)) hallados.push({ pos: txt.search(/\bahorros?\b/), largo: 6, cuenta: 'ahorro' });
  // "con tarjeta" y solo hay una
  if (!hallados.some(h => h.tarjeta) && /\bcon (la )?tarjeta\b/.test(txt) && (state.tarjetas || []).length === 1) hallados.push({ pos: txt.search(/\btarjeta\b/), largo: 7, tarjeta: state.tarjetas[0].id });
  // Si una se encontró dentro de otra más larga ("BAC" dentro de "tarjeta BAC"), queda la larga
  const limpios = hallados.sort((a, b) => a.pos - b.pos || b.largo - a.largo).filter((h, i, arr) => !arr.some((o, j) => j !== i && o.pos <= h.pos && o.pos + o.largo >= h.pos + h.largo && o.largo > h.largo));
  return limpios.filter((h, i) => !limpios.slice(0, i).some(o => (o.cuenta && o.cuenta === h.cuenta) || (o.tarjeta && o.tarjeta === h.tarjeta)));
}

/** La categoría que se nombra (la más específica), o null */
function _categoriaDictada(txt, tipo) {
  const base = tipo === 'ingreso' ? CATS_INGRESO : CATS_GASTO;
  const nombres = categoriasParaElegir(tipo);
  let mejor = null;
  const probar = (palabra, cat) => {
    const n = _normCat(palabra);
    if (n.length < 3) return;
    if (new RegExp('\\b' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(txt) && (!mejor || n.length > mejor.largo)) mejor = { cat, largo: n.length };
  };
  nombres.forEach(nm => probar(nm, nm));
  base.forEach(c => {
    const nm = nombres.find(x => _normCat(x) === _normCat(c.n));
    if (nm) c.k.forEach(k => probar(k, nm));
  });
  return mejor ? mejor.cat : null;
}

function _fechaDictada(txt, ahora) {
  const d = new Date(ahora || Date.now());
  if (/\b(anteayer|antier|antes de ayer)\b/.test(txt)) { d.setDate(d.getDate() - 2); return d; }
  if (/\bayer\b/.test(txt)) { d.setDate(d.getDate() - 1); return d; }
  const m = /\bel (domingo|lunes|martes|miercoles|jueves|viernes|sabado)( pasado)?\b/.exec(txt);
  if (m) {
    const objetivo = _DIC_DIAS.indexOf(m[1]);
    let atras = (d.getDay() - objetivo + 7) % 7;
    if (atras === 0) atras = 7;
    d.setDate(d.getDate() - atras);
    return d;
  }
  return null;
}

/** Lo que se entiende de una frase. No toca el teclado. */
function interpretarDictado(frase, ahora) {
  const original = String(frase || '').trim().slice(0, 200);
  // Los separadores de miles se quitan antes ("1,500" y "1.500"), los decimales quedan ("350.50")
  let txt = _normCat(original)
    .replace(/(\d)[.,](\d{3})(?!\d)/g, '$1$2').replace(/(\d)[.,](\d{3})(?!\d)/g, '$1$2')
    .replace(/(\d),(\d{1,2})(?!\d)/g, '$1.$2')
    .replace(/(us)?\$\s?(\d)/g, 'usd $2')
    .replace(/(\d)(mil)\b/g, '$1 $2')
    .replace(/[¿?¡!;:"]/g, ' ').replace(/,/g, ' , ').replace(/\s+/g, ' ').trim();
  const palabras = txt.split(' ');
  const montos = _montosDictados(palabras);
  // El monto: el que dice moneda o, si no, el más grande (en "2 baleadas de 45" es 45... o el último)
  const conMoneda = montos.filter(m => m.moneda);
  const monto = conMoneda[0] || montos.slice().sort((a, b) => b.valor - a.valor)[0] || null;

  let tipo = 'gasto';
  const cuentas = _cuentasDictadas(txt);
  if (_DIC_TRANSF.test(txt) && cuentas.filter(c => c.cuenta).length >= 2) tipo = 'transferencia';
  else if (_DIC_INGRESO.test(txt) && !/\b(gaste|pague|compre)\b/.test(txt)) tipo = 'ingreso';

  const r = { tipo, monto: monto ? monto.valor : null, moneda: monto ? monto.moneda || 'HNL' : 'HNL', cat: null, cuenta: null, tarjeta: null, hacia: null, fecha: _fechaDictada(txt, ahora), nota: '', remesa: null, frase: original };
  if (tipo === 'transferencia') {
    const cs = cuentas.filter(c => c.cuenta);
    r.cuenta = cs[0].cuenta; r.hacia = cs[1].cuenta;
  } else {
    // La categoría se busca sin los nombres de cuentas ("Tigo Money" no es Internet y teléfono)
    let txtCat = txt;
    cuentas.forEach(c => { txtCat = txtCat.slice(0, c.pos) + ' '.repeat(c.largo) + txtCat.slice(c.pos + c.largo); });
    r.cat = _categoriaDictada(txtCat, tipo);
    if (!r.cat && tipo === 'ingreso' && /\b(quincena|sueldo|salario)\b/.test(txt)) r.cat = 'Salario';
    const c = cuentas[0];
    if (c && c.tarjeta && tipo === 'gasto') r.tarjeta = c.tarjeta;
    else if (c && c.cuenta) r.cuenta = c.cuenta;
    else if (cuentas.find(x => x.cuenta)) r.cuenta = cuentas.find(x => x.cuenta).cuenta;
  }

  // Remesa: quién la manda y por dónde
  if (tipo === 'ingreso' && (esCatRemesa(r.cat || '') || /\b(me mando|me mandaron|me envio|me enviaron|remesa)\b/.test(txt) && (r.moneda === 'USD' || /\b(western|remitly|ria|moneygram|viamericas|remesa)\b/.test(txt)))) {
    r.cat = categoriasParaElegir('ingreso').find(esCatRemesa) || 'Remesa';
    const via = SERVICIOS_REMESA.find(s => new RegExp('\\b' + _normCat(s).split(' ')[0] + '\\b').test(txt)) || '';
    const pariente = /\bmi (mama|papa|mami|papi|hermano|hermana|tio|tia|hijo|hija|esposo|esposa|abuela|abuelo|primo|prima|novio|novia)( [a-z]+)?\b/.exec(txt);
    let de = '';
    if (pariente) {
      const extra = pariente[2] && !/^(me|por|de|que|y|con|en|desde)$/.test(pariente[2].trim()) ? ' ' + _capital(pariente[2].trim()) : '';
      de = _PARIENTES[pariente[1]] + extra;
    } else {
      const m = /\b(?:de parte de|me (?:lo |la )?(?:mando|envio)) ([a-z]+)\b/.exec(txt);
      if (m && !/^(\d+|por|desde|de|un|una|mil|el|la|los)$/.test(m[1]) && !(m[1] in _NUM_PALABRAS)) de = _capital(m[1]);
    }
    r.remesa = { de, via };
  }

  // Nota: lo que queda sin el verbo, el monto, la moneda, la fecha y la cuenta
  if (tipo === 'gasto') {
    let resto = palabras.slice();
    if (monto) resto.splice(monto.desde, monto.hasta - monto.desde);
    let n = ' ' + resto.join(' ') + ' ';
    // Sin la cuenta o tarjeta con que se pagó ("con la tarjeta BAC", "en efectivo")
    const nombres = ['cuenta de ahorros?', 'ahorros?', 'efectivo'];
    (state.tarjetas || []).forEach(t => { nombres.push(_normCat(t.nombre)); if (t.banco) nombres.push(_normCat(t.banco)); });
    listaCuentas().forEach(c => { if (!c.base) { nombres.push(_normCat(nombreCompletoCuenta(c))); nombres.push(_normCat(c.nombre)); } });
    if (cuentas.some(c => c.tarjeta)) nombres.push('');
    nombres.filter((x, i, a) => a.indexOf(x) === i).sort((x, y) => y.length - x.length).forEach(nm => {
      const cuerpo = nm ? '(?:tarjeta\\s+)?' + nm.replace(/[.*+?^${}()|[\]\\]/g, m => m === '?' || m === 's' ? m : '\\' + m) : 'tarjeta';
      n = n.replace(new RegExp('\\s(?:(?:con|en|del|de|desde|por|a|al)\\s+)?(?:(?:la|el|mi)\\s+)?' + cuerpo + '(?=\\s)', 'g'), ' ');
    });
    n = n.replace(/\b(hoy|ayer|anteayer|antier|antes de ayer|el (domingo|lunes|martes|miercoles|jueves|viernes|sabado)( pasado)?)\b/g, '')
      .replace(/^\s*(yo )?(gaste|pague|compre|me costo|me costaron|fueron|son|fue|es|gasto de|un gasto de|anota|anotar|registra|registrar)\b/, '')
      .replace(/\b(usd|lempiras?|lps?|pesos|varas|lucas|dolares?)\b/g, '')
      .replace(/[,.]/g, ' ').replace(/\s+/g, ' ').trim()
      .replace(/^(en|de|por|el|la|los|las|un|una|unos|unas|para)\s+/, '').replace(/^(en|de|por|el|la|los|las|un|una|unos|unas|para)\s+/, '').trim();
    if (r.cat && _normCat(n) === _normCat(r.cat)) n = '';
    // La nota se toma de la frase original (con tildes) cuando se puede
    const i = _normCat(original).indexOf(n);
    r.nota = (n && i >= 0 ? original.slice(i, i + n.length) : n).slice(0, 80);
    if (r.nota) r.nota = r.nota.charAt(0).toUpperCase() + r.nota.slice(1);
  }
  return r;
}

// ─── Llenar el teclado ──────────────────────────────────────────────────
function aplicarDictado(r) {
  if (!r) return false;
  if (r.tipo !== _reg.tipo) cambiarTipoRegistro(r.tipo);
  let monto = r.monto;
  let aviso = '';
  const esRemesa = r.remesa && r.tipo === 'ingreso';
  // Con una tarjeta en lempiras y dólares, el gasto queda en dólares (32-tarjetas-dolares.js)
  // Sin cuenta en la frase se queda la tarjeta que ya estaba elegida
  const tcEfectiva = r.tarjeta || (!r.cuenta && _reg.tipo === 'gasto' ? _reg.tarjeta : null);
  const tcDolares = r.tipo === 'gasto' && tcEfectiva && esBimoneda((state.tarjetas || []).find(x => String(x.id) === String(tcEfectiva)));
  _reg.moneda = tcDolares && r.moneda === 'USD' ? 'USD' : 'HNL';
  if (monto && r.moneda === 'USD' && !esRemesa && !tcDolares) {
    // Solo las remesas guardan dólares desde el teclado; lo demás se pasa a lempiras
    const tasa = tasaUSD(r.tipo === 'gasto' ? 'ask' : 'bid');
    aviso = `US$ ${_regNumTxt(monto)} ≈ ${fL(_c2(monto * tasa))}`;
    monto = _c2(monto * tasa);
  }
  if (monto) { _reg.expr = _regNumTxt(monto); }
  if (r.tipo === 'transferencia') {
    if (r.cuenta) _reg.cuenta = r.cuenta;
    if (r.hacia) _reg.hacia = r.hacia;
  } else {
    if (r.tarjeta) { _reg.tarjeta = r.tarjeta; }
    else if (r.cuenta) { _reg.cuenta = r.cuenta; _reg.tarjeta = null; }
    _reg.cat = r.cat || null;
    if (esRemesa) {
      if (r.remesa.de) _remReg.de = r.remesa.de;
      if (r.remesa.via) _remReg.via = r.remesa.via;
      // Sin decir la moneda va en lempiras: así un monto nunca se multiplica por la tasa sin querer
      if (r.monto) _remReg.moneda = r.moneda === 'USD' ? 'USD' : 'HNL';
    }
  }
  const nota = document.getElementById('reg-nota');
  if (nota) nota.value = [r.nota, aviso && r.tipo === 'gasto' ? aviso : ''].filter(Boolean).join(' · ').slice(0, 80);
  if (r.fecha) {
    const f = document.getElementById('reg-fecha'); if (f) f.value = fechaLocal(r.fecha);
    const h = document.getElementById('reg-hora'); if (h) { h.value = '12:00'; h.dataset.tocada = ''; }
  }
  renderRegistro();
  const falta = !r.monto ? 'el monto' : r.tipo !== 'transferencia' && !r.cat ? 'la categoría' : '';
  avisoRapido(falta ? `🎤 No entendí ${falta}: complétalo y toca Guardar` : (aviso ? '🎤 ' + aviso + ' · ' : '🎤 ') + 'Revisa y toca Guardar');
  if (falta === 'la categoría') abrirSelectorRegistro('b');
  return true;
}

// ─── Escuchar ───────────────────────────────────────────────────────────
let _reconocedor = null;
const _Reconocimiento = () => window.SpeechRecognition || window.webkitSpeechRecognition || null;
const _EJEMPLOS_DICTADO = ['"Gasté 350 en comida"', '"Ayer pagué 1,200 de luz con tarjeta"', '"Me pagaron la quincena, 15 mil"', '"Pasé 500 del efectivo al ahorro"', '"Mi mamá me mandó 200 dólares por Remitly"'];

function abrirDictado() {
  const hoja = document.getElementById('reg-selector');
  if (!hoja) return;
  const R = _Reconocimiento();
  hoja.innerHTML = `<div class="reg-sel-head"><strong>🎤 Dictar movimiento</strong><button type="button" onclick="cerrarDictado()" aria-label="Cerrar">✕</button></div>
    <div class="dic-caja">
      ${R ? `<button type="button" id="dic-mic" class="dic-mic" onclick="escucharDictado()" aria-label="Hablar"><span>🎤</span></button>
      <p id="dic-estado" class="dic-estado">Toca el micrófono y di lo que gastaste o recibiste</p>` : `<p class="dic-estado">Escribe la frase. También puedes usar el micrófono del teclado de tu celular.</p>`}
      <input type="text" id="dic-texto" class="input-field" maxlength="200" autocomplete="off" placeholder="Ej. Gasté 350 en comida" onkeydown="if(event.key==='Enter')usarTextoDictado()">
      <button type="button" class="btn btn-primary" onclick="usarTextoDictado()">✓ Llenar</button>
      <div class="dic-ejemplos"><small>Puedes decir:</small>${_EJEMPLOS_DICTADO.map(e => `<span>${esc(e)}</span>`).join('')}</div>
    </div>`;
  hoja.classList.add('abierto');
  if (R) escucharDictado();
}
function cerrarDictado() {
  if (_reconocedor) { try { _reconocedor.abort(); } catch (e) {} _reconocedor = null; }
  cerrarSelectorRegistro();
}
function usarTextoDictado() {
  const inp = document.getElementById('dic-texto');
  const frase = inp ? inp.value.trim() : '';
  if (!frase) return avisoRapido('Escribe o di la frase');
  if (_reconocedor) { try { _reconocedor.abort(); } catch (e) {} _reconocedor = null; }
  cerrarSelectorRegistro();
  aplicarDictado(interpretarDictado(frase));
}

function escucharDictado() {
  const R = _Reconocimiento();
  if (!R) return;
  if (_reconocedor) { try { _reconocedor.abort(); } catch (e) {} }
  const estado = document.getElementById('dic-estado'), mic = document.getElementById('dic-mic'), inp = document.getElementById('dic-texto');
  const rec = new R();
  _reconocedor = rec;
  rec.lang = 'es-HN';
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  rec.continuous = false;
  let final = '';
  rec.onstart = () => { if (mic) mic.classList.add('escuchando'); if (estado) estado.textContent = 'Te escucho…'; };
  rec.onresult = ev => {
    let parcial = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const t = ev.results[i][0].transcript;
      if (ev.results[i].isFinal) final += t; else parcial += t;
    }
    if (inp) inp.value = (final + parcial).trim();
  };
  rec.onerror = ev => {
    if (mic) mic.classList.remove('escuchando');
    const e = ev && ev.error;
    if (!estado) return;
    estado.textContent = e === 'not-allowed' || e === 'service-not-allowed' ? 'La app no tiene permiso para usar el micrófono. Actívalo en los permisos del teléfono, o escribe la frase.'
      : e === 'network' ? 'El dictado necesita internet. Escribe la frase o intenta de nuevo.'
      : e === 'no-speech' ? 'No te escuché. Toca el micrófono e intenta de nuevo.'
      : e === 'aborted' ? '' : 'No se pudo usar el micrófono. Escribe la frase.';
  };
  rec.onend = () => {
    if (mic) mic.classList.remove('escuchando');
    if (_reconocedor !== rec) return;
    _reconocedor = null;
    if (final.trim()) {
      if (inp) inp.value = final.trim();
      cerrarSelectorRegistro();
      aplicarDictado(interpretarDictado(final));
    } else if (estado && estado.textContent === 'Te escucho…') estado.textContent = 'No te escuché. Toca el micrófono e intenta de nuevo.';
  };
  try { rec.start(); } catch (e) { if (estado) estado.textContent = 'No se pudo usar el micrófono. Escribe la frase.'; }
}

// Mantener presionado el + abre el teclado ya escuchando
function dictarMovimiento() {
  abrirRegistro('gasto');
  abrirDictado();
}
document.addEventListener('DOMContentLoaded', () => {
  const fab = document.getElementById('nav-fab-btn');
  if (!fab) return;
  let timer = null, largo = false;
  const cancelar = () => { clearTimeout(timer); timer = null; };
  fab.addEventListener('pointerdown', () => { largo = false; cancelar(); timer = setTimeout(() => { largo = true; timer = null; if (navigator.vibrate) try { navigator.vibrate(20); } catch (e) {} dictarMovimiento(); }, 550); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => fab.addEventListener(ev, cancelar));
  fab.addEventListener('contextmenu', e => e.preventDefault());
  // El toque que termina la pulsación larga no abre el teclado otra vez
  fab.addEventListener('click', e => { if (largo) { largo = false; e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  fab.setAttribute('title', 'Registrar (mantén presionado para dictar)');
});
