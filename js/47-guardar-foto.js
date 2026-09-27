// Mi Pisto HN · 47-guardar-foto.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.
// ========== COMPARTIR Y DESCARGAR LA FOTO DE UNA FACTURA ==========
// En el visor de la foto (gastos, lo que me deben, lo que debo y préstamos):
// "📤 Compartir" abre el menú del teléfono (WhatsApp, correo, Drive…) y
// "⬇️ Descargar" la guarda en los archivos. La foto sale del teléfono sin
// cifrar: solo cuando la persona toca uno de los dos botones.

/** Nombre del archivo: Factura-2026-09-27-Comercio.jpg (Comprobante-… en un ingreso) */
function _nombreArchivoFoto(dataURL, fecha, detalle, prefijo) {
  const tipo = (String(dataURL).match(/^data:image\/([a-z0-9.+-]+);/i) || [, 'jpeg'])[1].toLowerCase();
  const ext = tipo === 'jpeg' ? 'jpg' : tipo.replace(/[^a-z0-9]/g, '') || 'jpg';
  const d = fecha ? new Date(fecha) : new Date();
  const dia = isNaN(d) ? fechaLocal() : fechaLocal(d);
  const limpio = String(detalle || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return (prefijo || 'Factura') + '-' + dia + (limpio ? '-' + limpio : '') + '.' + ext;
}

function _archivoDeFoto(dataURL, nombre) {
  const [cabecera, datos] = String(dataURL).split(',');
  const tipo = (cabecera.match(/^data:([^;]+);/) || [, 'image/jpeg'])[1];
  const bin = atob(datos.replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], nombre, { type: tipo });
}

const _puedeCompartirArchivos = () => {
  try { return typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([new Uint8Array(1)], 'x.jpg', { type: 'image/jpeg' })] }); } catch (e) { return false; }
};

function descargarFoto(dataURL, nombre) {
  const url = URL.createObjectURL(_archivoDeFoto(dataURL, nombre));
  const a = document.createElement('a');
  a.href = url; a.download = nombre; a.style.display = 'none';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  if (typeof avisoRapido === 'function') avisoRapido('⬇️ Foto guardada en tus descargas', 2500);
}

async function compartirFoto(dataURL, nombre) {
  const archivo = _archivoDeFoto(dataURL, nombre);
  if (_puedeCompartirArchivos() && navigator.canShare({ files: [archivo] })) {
    try { await navigator.share({ files: [archivo], title: nombre }); return 'compartida'; }
    catch (e) { if (e && e.name === 'AbortError') return 'cancelada'; }
  }
  // Sin menú de compartir (algunas computadoras): se descarga y se envía desde ahí
  descargarFoto(dataURL, nombre);
  return 'descargada';
}

/** Pone los botones en el visor que ya está abierto */
function _botonesDeFoto(visor, dataURL, nombre, antesDe) {
  if (!visor || visor.querySelector('.foto-acciones')) return;
  const barra = document.createElement('div');
  barra.className = 'foto-acciones';
  barra.innerHTML = (_puedeCompartirArchivos() ? '<button type="button" class="btn btn-primary foto-compartir">📤 Compartir</button>' : '') +
    '<button type="button" class="btn btn-secondary foto-descargar">⬇️ Descargar</button>';
  const c = barra.querySelector('.foto-compartir');
  if (c) c.onclick = e => { e.stopPropagation(); compartirFoto(dataURL, nombre); };
  barra.querySelector('.foto-descargar').onclick = e => { e.stopPropagation(); descargarFoto(dataURL, nombre); };
  if (antesDe && antesDe.parentNode) antesDe.parentNode.insertBefore(barra, antesDe);
  else visor.appendChild(barra);
}

// Visor de la factura de un gasto
if (typeof verFactura === 'function') {
  const _verFacturaSinBotones = verFactura;
  verFactura = window.verFactura = async function (id) {
    await _verFacturaSinBotones.apply(this, arguments);
    const visor = document.getElementById('visor-factura');
    const img = visor && visor.querySelector('img');
    if (!img) return;
    const t = (state.transactions || []).find(x => String(x.id) === String(id)) || {};
    visor.style.flexDirection = 'column';
    visor.style.gap = '48px';
    _botonesDeFoto(visor, img.getAttribute('src'), _nombreArchivoFoto(img.getAttribute('src'), t.date, t.nota || t.etiqueta || t.cat, t.type === 'income' ? 'Comprobante' : 'Factura'));
  };
}

// Visor de la foto de lo que me deben, lo que debo o un préstamo
if (typeof _adjVer === 'function') {
  const _adjVerSinBotones = _adjVer;
  _adjVer = window._adjVer = async function (k, id) {
    await _adjVerSinBotones.apply(this, arguments);
    const visor = document.getElementById('visor-factura');
    const img = visor && visor.querySelector('img');
    if (!img) return;
    const x = typeof _adjItem === 'function' ? _adjItem(k, id) : null;
    const nombre = x && _ADJ[k] ? _ADJ[k].nombre(x) : '';
    const filaBotones = [...visor.children].find(el => el.querySelector && el.querySelector('button'));
    _botonesDeFoto(visor, img.getAttribute('src'), _nombreArchivoFoto(img.getAttribute('src'), x && (x.fecha || x.date || x.createdAt), nombre), filaBotones);
  };
}
