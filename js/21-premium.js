// Mi Pisto HN · 21-premium.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.

// ═══ MI PISTO PREMIUM (preparado, todavía apagado) ════════════════════════
// Lo que aprendimos de las opiniones de otras apps:
//   · "Compré el premium y me volvió a cobrar" / "detecta otra cuenta de
//     correo": la compra se valida con Google Play (Digital Goods API) y hay
//     un botón "Restaurar mi compra" siempre visible.
//   · "¿Es pago único o anual?": el precio y el tipo de pago se dicen antes.
//   · "Quisiera un mes de prueba": 30 días gratis, una sola vez.
//   · Nunca se bloquean tus datos: si el Premium vence, sigues viendo,
//     editando y exportando todo; solo se pausan los extras.
// Mientras PREMIUM.activo sea false (no existe el producto en Play Console),
// tienePremium() devuelve true y nada se bloquea.
const PREMIUM = {
  activo: false,
  producto: 'mipisto_premium',          // id del producto en Play Console
  precio: 'L 99 al año',                // se reemplaza por el precio que devuelva Play
  tipo: 'pago anual, se renueva solo; lo cancelas cuando quieras en Google Play',
  diasPrueba: 30,
  beneficios: [
    ['☁️', 'Sincronización en la nube', 'Tus datos cifrados en el celular y la computadora.'],
    ['📄', 'Reportes en PDF', 'El reporte de cada mes listo para guardar o compartir.'],
    ['👨‍👩‍👧', 'Gastos compartidos sin límite', 'Todos los grupos que quieras (gratis: 1).'],
    ['🏦', 'Cuentas sin límite', 'Todos tus bancos y billeteras (gratis: 3 además de Efectivo y Ahorro).'],
    ['📅', 'Presupuestos sin límite', 'Por categoría, quincena, semana o mes (gratis: 3).'],
  ],
};
const PLAY_BILLING = 'https://play.google.com/billing';

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
  };
}
function tienePremium() { return !PREMIUM.activo || estadoPremium().activo; }

function iniciarPrueba() {
  const e = estadoPremium();
  if (e.pruebaUsada) return alert('Ya usaste tu mes de prueba.');
  state.premium = Object.assign({}, state.premium, { pruebaInicio: new Date().toISOString() });
  save(); renderPremium();
  alert('🎉 Tienes ' + PREMIUM.diasPrueba + ' días de Premium gratis. No se cobra nada: al terminar, todo sigue igual y tus datos no se tocan.');
}

// Google Play (solo dentro de la app instalada desde Play Store)
async function _servicioPlay() {
  if (!('getDigitalGoodsService' in window)) return null;
  try { return await window.getDigitalGoodsService(PLAY_BILLING); } catch (e) { return null; }
}
async function restaurarCompra() {
  const s = await _servicioPlay();
  if (!s) return alert('Restaurar la compra funciona en la app instalada desde Google Play.\n\nSi compraste y no se activa, escríbenos a mipistohn@gmail.com.');
  try {
    const compras = await s.listPurchases();
    const c = (compras || []).find(x => x.itemId === PREMIUM.producto);
    if (!c) return alert('No encontramos una compra de Premium en la cuenta de Google de este teléfono.\n\nSi compraste con otra cuenta de Google, cámbiala en Play Store y vuelve a intentar.');
    state.premium = Object.assign({}, state.premium, { compra: { token: String(c.purchaseToken || '').slice(0, 200), restaurada: new Date().toISOString() } });
    save(); renderPremium();
    alert('✅ Tu Premium está activo de nuevo.');
  } catch (e) {
    alert('No se pudo consultar Google Play. Revisa tu conexión y vuelve a intentar.');
  }
}
async function comprarPremium() {
  const s = await _servicioPlay();
  if (!s || typeof PaymentRequest === 'undefined') return alert('La compra se hace desde la app instalada con Google Play.');
  try {
    const req = new PaymentRequest([{ supportedMethods: PLAY_BILLING, data: { sku: PREMIUM.producto } }], { total: { label: 'Mi Pisto Premium', amount: { currency: 'HNL', value: '0' } } });
    const r = await req.show();
    const token = r.details && r.details.purchaseToken;
    await r.complete('success');
    if (token && s.acknowledge) { try { await s.acknowledge(token, 'onetime'); } catch (e) {} }
    state.premium = Object.assign({}, state.premium, { compra: { token: String(token || '').slice(0, 200), fecha: new Date().toISOString() } });
    save(); renderPremium();
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
    : e.compraVigente ? '<div class="premium-estado ok">⭐ Premium activo. ¡Gracias por apoyar la app!</div>'
    : e.enPrueba ? '<div class="premium-estado ok">⭐ Prueba gratis: te quedan ' + e.diasPrueba + (e.diasPrueba === 1 ? ' día' : ' días') + '.</div>' : '';
  el.innerHTML = `<h4 style="margin-bottom:6px">⭐ Mi Pisto Premium</h4>${estado}
    <ul class="premium-lista">${PREMIUM.beneficios.map(b => `<li><span>${b[0]}</span><div><strong>${b[1]}</strong><small>${b[2]}</small></div></li>`).join('')}</ul>
    <p class="premium-precio"><strong>${esc(PREMIUM.precio)}</strong> · ${esc(PREMIUM.tipo)}</p>
    <p class="premium-garantia">🔒 Tus datos nunca se bloquean: si el Premium termina, sigues viendo, editando y exportando todo.</p>
    ${PREMIUM.activo && !e.activo && !e.pruebaUsada ? `<button class="btn btn-primary" onclick="iniciarPrueba()">🎁 Probar ${PREMIUM.diasPrueba} días gratis</button>` : ''}
    ${PREMIUM.activo && !e.compraVigente ? '<button class="btn btn-primary" onclick="comprarPremium()">⭐ Obtener Premium</button>' : ''}
    <button class="btn btn-secondary" onclick="restaurarCompra()">🔄 Restaurar mi compra</button>`;
}
