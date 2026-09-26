// Mi Pisto HN · 40-guia.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.
// ========== GUÍA: CÓMO USAR MI PISTO SIN ESFUERZO ==========
// Trucos cortos, cada uno con sus pasos y un botón para probarlo ahí mismo.

const GUIA = [
  { grupo: 'Anotar en segundos', temas: [
    { id: 'registro', icono: '⚡', titulo: 'Anota un gasto en 3 segundos', pasos: ['Toca el botón verde <strong>+</strong> (en la computadora, la tecla <strong>N</strong>).', 'Escribe el monto con el teclado. También es calculadora: <strong>150+75</strong> da 225.', 'Elige la categoría y toca <strong>✓ Guardar</strong>. La cuenta, la fecha y la hora ya vienen puestas.'], boton: ['Anotar un gasto', "abrirRegistro('gasto')"] },
    { id: 'favoritos', icono: '⭐', titulo: 'Gastos de un toque', pasos: ['Cuando anotas el mismo gasto 3 veces (el café, el bus, la gasolina), la app lo aprende.', 'Aparece como botón en <strong>"Tus gastos de siempre"</strong> en el Inicio y arriba del registro.', 'Un toque y queda anotado. ¿Fue sin querer? Toca <strong>Deshacer</strong>.'], boton: ['Ver el registro', "abrirRegistro('gasto')"] },
    { id: 'aprende', icono: '✨', titulo: 'La categoría se elige sola', pasos: ['En el registro, escribe el comercio en la nota: <em>PriceSmart, Uber, Pollo Campero…</em>', 'Si ya lo habías anotado, la categoría aparece sola (dice <strong>"la de siempre"</strong>).', 'Si la cambias, la app aprende la nueva. También funciona al dictar, con los SMS y al importar del banco.'] },
    { id: 'dictado', icono: '🎤', titulo: 'Dictar en vez de escribir', pasos: ['En el registro toca <strong>🎤 Dictar</strong>.', 'Di algo como: <em>"gasté 350 en comida con la tarjeta BAC"</em> o <em>"me pagaron 12 mil de salario"</em>.', 'Revisa lo que llenó y guarda.'], boton: ['Probar el dictado', "abrirRegistro('gasto');abrirDictado()"] },
    { id: 'sms', icono: '💬', titulo: 'El SMS o la notificación del banco', pasos: ['Cuando te llegue el mensaje del banco, cópialo… o en la notificación toca <strong>Compartir → Mi Pisto HN</strong>.', 'La app saca el monto, el comercio y la tarjeta.', 'Toca <strong>Usar estos datos</strong> y guarda.'], boton: ['Pegar un SMS', "openModal('modal-gasto');abrirModalSMS()"] },
    { id: 'recibo', icono: '📸', titulo: 'Foto del recibo', pasos: ['En el registro toca <strong>📸 Recibo</strong>.', 'Toma la foto con el total bien visible.', 'La app lee el monto y guarda la foto junto al gasto.'], boton: ['Tomar una foto', "abrirRegistro('gasto');masOpcionesRegistro('recibo')"] },
  ] },
  { grupo: 'Que la app trabaje sola', temas: [
    { id: 'pagos-fijos', icono: '🔁', titulo: 'Pagos fijos que se anotan solos', pasos: ['Salario, luz, agua, alquiler, Netflix: guárdalos <strong>una vez</strong> con el día del mes y el monto.', 'Deja marcado <strong>"Anotarlo solo cada mes"</strong>.', 'Ese día se anota solo. Si vino distinto (la luz más cara), tócalo en el Inicio y corrige el monto.'], boton: ['Agregar un pago fijo', 'abrirPagoFijo()'] },
    { id: 'importar', icono: '🏦', titulo: 'Importar el estado de cuenta del banco', pasos: ['Entra a tu banca en línea (BAC, Atlántida, Ficohsa, Banpaís…) y descarga el estado de cuenta en <strong>Excel o CSV</strong>.', 'Aquí toca <strong>Importar</strong>, elige el archivo y di de qué cuenta o tarjeta es.', 'Revisa la lista: los que ya tenías y los pagos de tarjeta vienen sin marcar. Toca <strong>Importar</strong> y listo.'], nota: 'Ideal si no anotas nada durante el mes: te pones al día en un minuto.', boton: ['Importar ahora', 'abrirImportarBanco()'] },
    { id: 'cuadre', icono: '⚖️', titulo: 'Cuadre del efectivo', pasos: ['¿No anotas cada gasto en efectivo? No pasa nada.', 'Una vez por semana dile a la app <strong>cuánto efectivo tienes</strong> de verdad.', 'La diferencia se anota como <strong>"Día a día"</strong> y tus cuentas vuelven a cuadrar.'], boton: ['Cuadrar el efectivo', "ajustarSaldoCuenta('efectivo')"] },
    { id: 'recordatorio', icono: '🔔', titulo: 'Recordatorio diario', pasos: ['En <strong>Configuración → Recordatorio</strong>, actívalo y elige la hora (la noche funciona bien).', 'Cada día te avisa para anotar lo del día. Si ya anotaste, no molesta.'], boton: ['Activarlo', 'irARecordatorio()'] },
    { id: 'atajos', icono: '📱', titulo: 'Atajos en el ícono de la app', pasos: ['Mantén presionado el ícono de <strong>Mi Pisto HN</strong> en tu teléfono.', 'Elige <strong>Nuevo gasto</strong>, <strong>Dictar gasto</strong> o <strong>Gastos de siempre</strong>, sin pasar por el Inicio.'] },
  ] },
  { grupo: 'Planear sin pensar', temas: [
    { id: 'presupuestos', icono: '📅', titulo: 'Presupuestos en un toque', pasos: ['Con dos meses de gastos anotados, la app calcula cuánto sueles gastar en cada categoría.', 'Toca <strong>Armarlos</strong>: pone topes un 5% más bajos para que te sobre algo.', 'Te avisa cuando llegas al 80% y te dice cuánto puedes gastar por día.'], boton: ['Armar mis presupuestos', 'armarPresupuestosSolo()'] },
    { id: 'consejero', icono: '💡', titulo: 'El Consejero', pasos: ['Revisa tus números y te dice qué hacer primero: salir de una tarjeta, dónde se va el dinero, cuánto guardar.', 'Cada consejo trae un botón para hacerlo ahí mismo.', 'El más importante aparece en el Inicio como <strong>"Consejo para ti"</strong>.'], boton: ['Ver mis consejos', "switchView('consejero')"] },
    { id: 'mes', icono: '🗓️', titulo: 'Tu mes en resumen', pasos: ['En <strong>Análisis</strong> ves en qué se fue el dinero, por semana, mes o año.', 'Al terminar el mes, la app te muestra tu resumen como historias para compartir (sin montos).'], boton: ['Ver el análisis', "switchView('historico')"] },
  ] },
  { grupo: 'Tranquilidad', temas: [
    { id: 'seguridad', icono: '🔐', titulo: 'Que nadie vea tus datos y no los pierdas', pasos: ['Pon un <strong>PIN</strong>: tus datos quedan cifrados en el teléfono y la app se bloquea sola al minuto de no usarla.', 'Activa la <strong>huella o Face ID</strong> (Configuración → Seguridad) para entrar sin escribir el PIN.', 'Crea tu <strong>kit de recuperación</strong>: si olvidas el PIN, con esa clave entras sin perder nada.', 'Activa el <strong>respaldo en la nube</strong> para no perder nada si cambias de teléfono.'], boton: ['Ir a Configuración', "switchView('config')"] },
    { id: 'nube', icono: '☁️', titulo: 'Tus datos en el celular y en la compu', pasos: ['Al crear tu perfil (en el teléfono o en la compu, da igual cuál primero) la app te pregunta si quieres <strong>conectar tu cuenta de Google</strong>. Di que sí.', 'La primera vez creas la <strong>contraseña de la nube</strong>: 10 caracteres o más, con letras (por ejemplo <em>Toby2026casa</em>). Anótala: sin ella no se abren tus datos en otro lado.', 'En el otro dispositivo abre la app (menú ☰ → <strong>💻 Abrir en la computadora</strong> te da la dirección y un QR), toca <strong>📲 Ya uso Mi Pisto en otro dispositivo</strong> y entra con <strong>la misma cuenta de Google</strong>.', 'Escribe la contraseña de la nube y crea un PIN para ese dispositivo. Si los dos ya tenían datos, se <strong>juntan</strong> sin perder nada.', 'Desde ahí se actualizan <strong>solos, en segundos</strong>: lo que anotas o dictas en el teléfono aparece en la compu sin tocar nada (y el Excel sale con lo último). Si algo no llegó, toca <strong>🔄 Actualizar</strong>.'], nota: 'Si dice que no hay datos, casi siempre es otra cuenta de Google. Tus datos viajan cifrados: solo tu cuenta los ve, y ni Google ni nosotros podemos leerlos.', boton: ['Abrir en la computadora', 'abrirEnLaComputadora()'] },
    { id: 'compu', icono: '💻', titulo: 'En la computadora', pasos: ['Abre la misma dirección de la app en el navegador y trae tus datos (mira <strong>"Tus datos en el celular y en la compu"</strong>).', 'Atajos: <strong>N</strong> gasto, <strong>I</strong> ingreso, <strong>T</strong> transferencia, <strong>/</strong> buscar y <strong>Esc</strong> cerrar.', 'El <strong>🔒</strong> de arriba bloquea la app si te levantas de la compu.'] },
  ] },
];

function irARecordatorio() {
  switchView('config');
  setTimeout(() => { const el = document.getElementById('recordatorio-activo'); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus(); } }, 80);
}

function irASincronizacion() {
  switchView('config');
  setTimeout(() => { const el = document.getElementById('cloud-sync-card'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 80);
}

function renderGuia() {
  const el = document.getElementById('guia-lista');
  if (!el) return;
  el.innerHTML = GUIA.map(g => `<h3 class="guia-grupo">${esc(g.grupo)}</h3>` + g.temas.map(t => `
    <details class="guia-tema" id="guia-${t.id}">
      <summary><span class="guia-ico">${t.icono}</span><span>${esc(t.titulo)}</span></summary>
      <ol>${t.pasos.map(p => `<li>${p}</li>`).join('')}</ol>
      ${t.nota ? `<p class="guia-nota">${t.nota}</p>` : ''}
      ${t.boton ? `<button type="button" class="btn btn-primary guia-btn" onclick="${t.boton[1]}">${esc(t.boton[0])}</button>` : ''}
    </details>`).join('')).join('');
}
function abrirGuia(tema) {
  switchView('guia');
  if (tema) setTimeout(() => { const d = document.getElementById('guia-' + tema); if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, 60);
}
const _switchViewGuia = switchView;
switchView = function (v) { _switchViewGuia(v); if (v === 'guia') renderGuia(); };
