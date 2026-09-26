// Mi Pisto HN · 21-premium.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.

// ═══ MI PISTO PREMIUM (preparado, todavía apagado) ════════════════════════
// Lo que aprendimos de las opiniones de otras apps:
//   · "Compré el premium y me volvió a cobrar" / "detecta otra cuenta de
//     correo": la compra se valida con Google Play (Digital Goods API) y hay
//     un botón "Restaurar mi compra" siempre visible.
//   · "¿Es pago único o anual?": el precio y el tipo de pago se dicen antes.
//   · "Quisiera un mes de prueba": 30 días gratis, una sola vez, sin tarjeta.
//   · Nunca se bloquean tus datos: si el Premium vence, sigues viendo,
//     editando y exportando todo; solo se pausa crear más de lo gratis.
// Gratis: todo, menos el reporte en PDF y pasar de 3 cuentas propias, 1 grupo
// compartido y 3 presupuestos. Lo que ya tenías sigue funcionando igual.
// Mientras PREMIUM.activo sea false (no existen los productos en Play Console),
// tienePremium() devuelve true y nada se bloquea.
const PREMIUM = {
  activo: false,
  // Una suscripción por plan en Play Console (Monetizar → Suscripciones).
  // El precio de aquí se reemplaza por el que devuelva Play.
  planes: [
    { id: 'mipisto_premium_mensual', nombre: 'Mensual', precio: 'L 25', valor: 25, meses: 1, periodo: 'al mes' },
    { id: 'mipisto_premium_anual', nombre: 'Anual', precio: 'L 199', valor: 199, meses: 12, periodo: 'al año' },
  ],
  tipo: 'se renueva solo; lo cancelas cuando quieras en Google Play',
  diasPrueba: 30,
  limites: { cuentas: 3, grupos: 1, presupuestos: 3 },
  beneficios: [
    ['📄', 'Reportes en PDF', 'El reporte de cada mes listo para guardar o compartir.'],
    ['🏦', 'Cuentas sin límite', 'Todos tus bancos y billeteras (gratis: 3 además de Efectivo y Ahorro).'],
    ['👨‍👩‍👧', 'Gastos compartidos sin límite', 'Todos los grupos que quieras (gratis: 1).'],
    ['📅', 'Presupuestos sin límite', 'Por categoría, quincena, semana o mes (gratis: 3).'],
  ],
};
const PLAY_BILLING = 'https://play.google.com/billing';
const _idsPremium = () => PREMIUM.planes.map(p => p.id);
// Cuánto ahorra el anual frente a pagar 12 meses sueltos
function _ahorroPlan(p) {
  const mensual = PREMIUM.planes.find(x => x.meses === 1);
  if (!mensual || p.meses <= 1 || !(mensual.valor > 0)) return 0;
  return Math.round((1 - p.valor / (mensual.valor * p.meses)) * 100);
}

function estadoPremium() {
  const p = state.premium || {};
  const ahora = Date.now();
  const finPrueba = p.pruebaInicio ? new Date(p.pruebaInicio).getTime() + PREMIUM.diasPrueba * 864e5 : 0;
  const compraVigente = !!(p.compra && (!p.compra.vence || new Date(p.compra.vence).getTime() > ahora));
  const enPrueba = !compraVigente && finPrueba > ahora;
  return {
    compraVigente, enPrueba, pruebaUsada: !!p.pruebaInicio,
    diasPrueba: enPrueba ? Math.ceil((finPrueba - ahora) / 864e5) : 0,
    activo: compraVigente || enPrueba,
    plan: compraVigente ? PREMIUM.planes.find(x => x.id === p.compra.plan) || null : null,
  };
}
function tienePremium() { return !PREMIUM.activo || estadoPremium().activo; }

// ─── Límites de lo gratis ──────────────────────────────────────────────
// Solo frenan crear uno más; editar, ver, archivar o borrar nunca se frena.
function _usoPremium(que) {
  if (que === 'cuentas') return (state.misCuentas || []).filter(c => !c.archivada).length;
  if (que === 'grupos') return (state.grupos || []).length;
  if (que === 'presupuestos') return (state.presupuestos || []).length;
  return 0;
}
const _TXT_LIMITE = {
  cuentas: n => `Con la versión gratis tienes hasta ${n} cuentas además de Efectivo y Ahorro.`,
  grupos: n => `Con la versión gratis tienes ${n} grupo de gastos compartidos.`,
  presupuestos: n => `Con la versión gratis tienes hasta ${n} presupuestos.`,
  pdf: () => 'El reporte del mes en PDF es parte de Premium.',
};
/** true si se puede; si no, explica y ofrece ver Premium */
function puedeUsarPremium(que) {
  if (tienePremium()) return true;
  const n = PREMIUM.limites[que];
  if (n !== undefined && _usoPremium(que) < n) return true;
  const e = estadoPremium();
  const oferta = e.pruebaUsada ? 'Con Premium no hay límite.' : `Pruébalo ${PREMIUM.diasPrueba} días gratis, sin tarjeta.`;
  // No se espera la respuesta: quien pregunta ya sabe que no se puede
  confirmar('⭐ ' + _TXT_LIMITE[que](n) + '\n\n' + oferta + ' Lo que ya tienes sigue igual.\n\n¿Ver Mi Pisto Premium?').then(si => { if (si) verPremium(); });
  return false;
}
function verPremium() {
  document.querySelectorAll('.modal').forEach(m => { if (m.style.display === 'flex') m.style.display = 'none'; });
  switchView('config');
  renderPremium();
  const el = document.getElementById('premium-card');
  if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function iniciarPrueba() {
  const e = estadoPremium();
  if (e.pruebaUsada) return alert('Ya usaste tu mes de prueba.');
  state.premium = Object.assign({}, state.premium, { pruebaInicio: new Date().toISOString() });
  save(); renderPremium();
  alert('🎉 Tienes ' + PREMIUM.diasPrueba + ' días de Premium gratis. No se cobra nada: al terminar, todo sigue igual y tus datos no se tocan.');
}

// ─── Google Play (solo dentro de la app instalada desde Play Store) ──────
async function _servicioPlay() {
  if (!('getDigitalGoodsService' in window)) return null;
  try { return await window.getDigitalGoodsService(PLAY_BILLING); } catch (e) { return null; }
}
const _compraPlay = compras => (compras || []).find(x => _idsPremium().includes(x.itemId));
function _guardarCompra(c, extra) {
  state.premium = Object.assign({}, state.premium, { compra: Object.assign({ token: String(c.purchaseToken || '').slice(0, 200), plan: c.itemId }, extra) });
  save(); renderPremium();
}

// El precio real en lempiras, como lo muestra Play
async function cargarPreciosPlay() {
  const s = await _servicioPlay();
  if (!s || !s.getDetails) return;
  try {
    (await s.getDetails(_idsPremium()) || []).forEach(d => {
      const plan = PREMIUM.planes.find(p => p.id === d.itemId);
      if (!plan || !d.price) return;
      plan.valor = Number(d.price.value) || plan.valor;
      try { plan.precio = new Intl.NumberFormat('es-HN', { style: 'currency', currency: d.price.currency }).format(Number(d.price.value)); } catch (e) {}
    });
    renderPremium();
  } catch (e) {}
}

// Al abrir la app se pregunta a Play si la suscripción sigue vigente: así un
// pago cancelado o vencido se nota, y uno hecho en otro teléfono se activa.
// Sin conexión o fuera de la app de Play, lo guardado se queda como está.
let _suscripcionRevisada = false;
async function revisarSuscripcion() {
  if (!PREMIUM.activo || _suscripcionRevisada) return;
  const s = await _servicioPlay();
  if (!s) return;
  try {
    const c = _compraPlay(await s.listPurchases());
    _suscripcionRevisada = true;
    const antes = (state.premium || {}).compra;
    if (c) { if (!antes || antes.token !== String(c.purchaseToken || '').slice(0, 200)) _guardarCompra(c, { verificada: new Date().toISOString() }); }
    else if (antes) { state.premium = Object.assign({}, state.premium, { compra: null }); save(); renderPremium(); }
  } catch (e) {}
}

async function restaurarCompra() {
  const s = await _servicioPlay();
  if (!s) return alert('Restaurar la compra funciona en la app instalada desde Google Play.\n\nSi compraste y no se activa, escríbenos a mipistohn@gmail.com.');
  try {
    const c = _compraPlay(await s.listPurchases());
    if (!c) return alert('No encontramos una compra de Premium en la cuenta de Google de este teléfono.\n\nSi compraste con otra cuenta de Google, cámbiala en Play Store y vuelve a intentar.');
    _guardarCompra(c, { restaurada: new Date().toISOString() });
    alert('✅ Tu Premium está activo de nuevo.');
  } catch (e) {
    alert('No se pudo consultar Google Play. Revisa tu conexión y vuelve a intentar.');
  }
}
async function comprarPremium(planId) {
  const plan = PREMIUM.planes.find(p => p.id === planId) || PREMIUM.planes[0];
  const s = await _servicioPlay();
  if (!s || typeof PaymentRequest === 'undefined') return alert('La compra se hace desde la app instalada con Google Play.');
  try {
    const req = new PaymentRequest([{ supportedMethods: PLAY_BILLING, data: { sku: plan.id } }], { total: { label: 'Mi Pisto Premium ' + plan.nombre, amount: { currency: 'HNL', value: '0' } } });
    const r = await req.show();
    const token = r.details && r.details.purchaseToken;
    await r.complete('success');
    // Versiones viejas de la API piden confirmar la compra; las nuevas lo hacen solas
    if (token && s.acknowledge) { try { await s.acknowledge(token, 'onetime'); } catch (e) {} }
    _guardarCompra({ itemId: plan.id, purchaseToken: token }, { fecha: new Date().toISOString() });
    alert('🎉 ¡Gracias! Tu Premium está activo.');
  } catch (e) {
    if (e && e.name !== 'AbortError') alert('No se completó la compra. No se te cobró nada.');
  }
}

function renderPremium() {
  const el = document.getElementById('premium-card');
  if (!el) return;
  const e = estadoPremium();
  const estado = !PREMIUM.activo
    ? '<div class="premium-estado">🎁 Por ahora todo es gratis mientras la app está en prueba.</div>'
    : e.compraVigente ? '<div class="premium-estado ok">⭐ Premium activo' + (e.plan ? ' (' + e.plan.nombre.toLowerCase() + ')' : '') + '. ¡Gracias por apoyar la app!</div>'
    : e.enPrueba ? '<div class="premium-estado ok">⭐ Prueba gratis: te quedan ' + e.diasPrueba + (e.diasPrueba === 1 ? ' día' : ' días') + '.</div>' : '';
  const planes = PREMIUM.activo && !e.compraVigente
    ? `<div class="premium-planes">${PREMIUM.planes.map(p => `<button type="button" class="premium-plan" onclick="comprarPremium('${p.id}')">
        <span>${esc(p.nombre)}</span><strong>${esc(p.precio)}</strong><small>${esc(p.periodo)}</small>${_ahorroPlan(p) > 0 ? `<em>Ahorras ${_ahorroPlan(p)}%</em>` : ''}</button>`).join('')}</div>`
    : '';
  el.innerHTML = `<h4 style="margin-bottom:6px">⭐ Mi Pisto Premium</h4>${estado}
    <ul class="premium-lista">${PREMIUM.beneficios.map(b => `<li><span>${b[0]}</span><div><strong>${b[1]}</strong><small>${b[2]}</small></div></li>`).join('')}</ul>
    <p class="premium-precio">${PREMIUM.planes.map(p => `<strong>${esc(p.precio)} ${esc(p.periodo)}</strong>`).join(' o ')} · ${esc(PREMIUM.tipo)}</p>
    <p class="premium-garantia">🔒 Tus datos nunca se bloquean: si el Premium termina, sigues viendo, editando y exportando todo.</p>
    ${PREMIUM.activo && !e.activo && !e.pruebaUsada ? `<button class="btn btn-primary" onclick="iniciarPrueba()">🎁 Probar ${PREMIUM.diasPrueba} días gratis</button>` : ''}
    ${planes}
    <button class="btn btn-secondary" onclick="restaurarCompra()">🔄 Restaurar mi compra</button>`;
}

window.addEventListener('load', () => { if (PREMIUM.activo) { cargarPreciosPlay(); revisarSuscripcion(); } });
