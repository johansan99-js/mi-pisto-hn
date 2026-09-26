// Mi Pisto HN · 37-consejero.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.
// ========== CONSEJERO: SOLUCIONES CON TUS PROPIOS NÚMEROS ==========
// Sin inteligencia artificial externa: reglas que corren en el teléfono, así
// que es gratis, funciona sin internet y los datos no salen de aquí. Cada
// consejo dice qué hacer, cuánto ganas o ahorras, y trae un botón para hacerlo.
// Se ordenan por impacto (lempiras en juego). "Ya lo vi" lo oculta ese mes.

const _CONSEJO_OCULTOS = 'mph_consejos_ocultos';
const _SUSCRIPCIONES = /netflix|spotify|disney|hbo|max\b|prime video|amazon prime|youtube|apple|icloud|deezer|crunchyroll|paramount|star\+|chatgpt|suscrip/i;

function _consejosOcultos() {
  try { return JSON.parse(localStorage.getItem(_CONSEJO_OCULTOS) || '{}') || {}; } catch (e) { return {}; }
}
function ocultarConsejo(id) {
  const o = _consejosOcultos(), hoy = new Date();
  o[id] = hoy.getFullYear() + '-' + hoy.getMonth();
  try { localStorage.setItem(_CONSEJO_OCULTOS, JSON.stringify(o)); } catch (e) {}
  renderConsejero(); renderConsejoInicio();
}

/** Lista de consejos para hoy, del más al menos importante */
function consejos(ahora) {
  if (!state.setup) return [];
  const hoy = ahora ? new Date(ahora) : new Date();
  const y = hoy.getFullYear(), m = hoy.getMonth();
  const lista = [];
  const agregar = (c) => lista.push(Object.assign({ impacto: 0 }, c));
  const txs = (state.transactions || []).filter(t => !t.deletedAt && typeof t.amount === 'number');
  const mes = calcularResumenMes(y, m);
  const prev = new Date(y, m - 1, 1), mesPrev = calcularResumenMes(prev.getFullYear(), prev.getMonth());
  const diasMes = new Date(y, m + 1, 0).getDate(), dia = hoy.getDate();

  if (txs.filter(t => !t.esTransferencia).length < 5) {
    agregar({ id: 'empezar', icono: '📝', titulo: 'Anota unos días para recibir consejos', texto: 'Con tus gastos e ingresos de una o dos semanas, aquí te diremos dónde ahorrar, cómo salir más rápido de las deudas y cuánto guardar.', accion: ['Anotar un gasto', "abrirRegistro('gasto')"], impacto: 1 });
    return lista;
  }

  // 1) Cuentas en negativo: casi siempre falta anotar algo
  listaCuentas().forEach(c => {
    const s = getCuentaBalance(c.id);
    if (s < -0.5) agregar({ id: 'negativo-' + c.id, icono: '⚠️', tono: 'rojo', titulo: `${nombreCompletoCuenta(c)} está en ${fL(s)}`, texto: 'Una cuenta no puede quedar en negativo: seguro faltó anotar un ingreso o una transferencia. Ajusta el saldo al real para que los demás consejos sean exactos.', accion: ['Ajustar el saldo', `ajustarSaldoCuenta('${esc(c.id)}')`], impacto: 100000 + Math.abs(s) });
  });

  // 2) Tarjetas: cuánto te ahorras pagando más que el mínimo
  (state.tarjetas || []).forEach(t => {
    const saldo = typeof deudaTarjetaL === 'function' ? deudaTarjetaL(t) : t.saldo;
    if (!(saldo > 300) || !(t.tasaInteres > 0)) return;
    const minimo = simularPagoTarjeta(saldo, t.tasaInteres);
    const cuota = Math.ceil(cuotaParaSaldarEn(saldo, t.tasaInteres, 12));
    const plan = simularPagoTarjeta(saldo, t.tasaInteres, cuota);
    const ahorro = minimo.nunca ? null : Math.max(0, minimo.interes - plan.interes);
    agregar({
      id: 'tarjeta-' + t.id, icono: '💳', tono: 'rojo',
      titulo: `Sal de ${t.nombre} en 12 meses`,
      texto: `Debes ${fL(saldo)} al ${t.tasaInteres}% anual. Pagando solo el mínimo ${minimo.nunca ? '<strong>nunca terminas</strong>' : `tardas <strong>${fmtDuracion(minimo.meses)}</strong> y pagas <strong>${fL(minimo.interes)}</strong> de intereses`}. Si pagas <strong>${fL(cuota)} al mes</strong>, terminas en un año${ahorro ? ` y te ahorras <strong>${fL(ahorro)}</strong>` : ''}.`,
      accion: ['Ver el costo real', `abrirSimuladorTarjeta('${esc(t.id)}')`],
      impacto: minimo.nunca ? saldo * 2 : ahorro,
    });
  });

  // 3) Varias deudas: primero la de interés más alto
  const deudas = [].concat(
    (state.tarjetas || []).map(t => ({ nombre: t.nombre, saldo: typeof deudaTarjetaL === 'function' ? deudaTarjetaL(t) : t.saldo, tasa: t.tasaInteres })),
    (state.prestamos || []).map(p => ({ nombre: p.entidad, saldo: saldoPrestamo(p), tasa: p.tasaInteres })),
  ).filter(d => d.saldo > 300 && d.tasa > 0).sort((a, b) => b.tasa - a.tasa);
  if (deudas.length >= 2) {
    agregar({ id: 'avalancha', icono: '🎯', titulo: `Ataca primero ${deudas[0].nombre}`, texto: `Tienes ${deudas.length} deudas con interés. Paga el mínimo en todas y todo lo extra ponlo en <strong>${esc(deudas[0].nombre)}</strong> (${deudas[0].tasa}% anual, la más cara). Cuando la termines, pasa ese pago a <strong>${esc(deudas[1].nombre)}</strong> (${deudas[1].tasa}%). Así pagas menos intereses en total.`, accion: ['Ver mis deudas', "switchView('tarjetas')"], impacto: deudas[0].saldo * deudas[0].tasa / 100 / 2 });
  }

  // 4) Este mes vas a gastar más de lo que entró
  if (mes.ingresos > 0 && dia >= 5) {
    const proyeccion = mes.gastos / dia * diasMes;
    if (proyeccion > mes.ingresos * 1.02) {
      const recorte = Math.ceil((proyeccion - mes.ingresos) / Math.max(1, diasMes - dia));
      agregar({ id: 'ritmo', icono: '📉', tono: 'rojo', titulo: 'A este ritmo el mes cierra en rojo', texto: `Llevas ${fL(mes.gastos)} en ${dia} días: al final del mes serían unos <strong>${fL(proyeccion)}</strong>, ${fL(proyeccion - mes.ingresos)} más de lo que entró. Para cerrar a mano, gasta unos <strong>${fL(recorte)} menos por día</strong> lo que queda del mes.`, accion: ['Ver en qué se fue', "switchView('historico')"], impacto: proyeccion - mes.ingresos });
    }
  }

  // 5) La categoría que más subió contra el mes pasado
  if (mesPrev.gastos > 0) {
    const factor = diasMes / Math.max(1, dia);
    const subida = mes.top.map(c => ({ c, proy: c.monto * factor })).filter(x => x.c.antes > 0 && x.proy - x.c.antes >= 300 && x.proy >= x.c.antes * 1.25)
      .sort((a, b) => (b.proy - b.c.antes) - (a.proy - a.c.antes))[0];
    if (subida) {
      const tiene = (state.presupuestos || []).some(p => p.cat === subida.c.cat);
      agregar({ id: 'subio-' + subida.c.cat, icono: '🔎', titulo: `${subida.c.cat} va más alto que el mes pasado`, texto: `Llevas ${fL(subida.c.monto)} en ${esc(subida.c.cat)}; a este ritmo serían unos <strong>${fL(subida.proy)}</strong>, contra ${fL(subida.c.antes)} el mes pasado.${tiene ? '' : ' Ponle un tope y te avisamos antes de pasarte.'}`, accion: tiene ? ['Ver mis presupuestos', "switchView('presupuestos')"] : ['Ponerle un tope', 'abrirPresupuestos()'], impacto: subida.proy - subida.c.antes });
    }
  }

  // 6) Presupuestos pasados o por pasarse
  (state.presupuestos || []).forEach(p => {
    if (typeof estadoPresupuesto !== 'function') return;
    const e = estadoPresupuesto(p, hoy), nombre = nombreCatPresupuesto(p.cat);
    if (e.nivel === 'pasado') agregar({ id: 'presu-' + p.id, icono: '🚨', tono: 'rojo', titulo: `Te pasaste en ${nombre}`, texto: `Gastaste ${fL(e.gastado)} de ${fL(p.monto)}. Lo que gastes de más aquí sale de otra cosa: intenta no usar esta categoría hasta que empiece el siguiente periodo.`, accion: ['Ver presupuestos', "switchView('presupuestos')"], impacto: e.gastado - p.monto + 500 });
    else if (e.nivel === 'aviso') agregar({ id: 'presu-' + p.id, icono: '⏳', titulo: `Cuida ${nombre}`, texto: `Llevas el ${Math.round(e.pct)}% (${fL(e.gastado)} de ${fL(p.monto)}). Para llegar al final te quedan <strong>${fL(e.porDia)} por día</strong> durante ${e.dias} ${e.dias === 1 ? 'día' : 'días'}.`, accion: ['Ver presupuestos', "switchView('presupuestos')"], impacto: p.monto * 0.2 });
  });

  // 7) Gastos hormiga
  if (mes.hormiga.cantidad >= 8 && mes.hormiga.total >= 400) {
    const alMes = mes.hormiga.total / dia * diasMes;
    agregar({ id: 'hormiga', icono: '🐜', titulo: 'Los gastos chiquitos se están sumando', texto: `Llevas ${mes.hormiga.cantidad} compras de menos de ${fL(GASTO_HORMIGA)} que suman <strong>${fL(mes.hormiga.total)}</strong>. Si las bajas a la mitad, te quedan unos <strong>${fL(alMes / 2)} al mes</strong> (${fL(alMes * 6)} al año).`, accion: ['Ver los movimientos', "switchView('dashboard')"], impacto: alMes / 2 });
  }

  // 8) Suscripciones
  const hace35 = new Date(hoy.getTime() - 35 * 864e5);
  const subs = {};
  txs.filter(t => t.type === 'expense' && new Date(t.date) >= hace35 && _SUSCRIPCIONES.test((t.cat || '') + ' ' + (t.subcat || '') + ' ' + (t.etiqueta || '')))
    .forEach(t => { const k = (t.subcat || t.cat || '').trim().toLowerCase(); subs[k] = Math.max(subs[k] || 0, t.amount); });
  (state.pagosRecurrentes || []).filter(p => p.tipo !== 'ingreso' && _SUSCRIPCIONES.test((p.servicio || '') + ' ' + (p.cat || ''))).forEach(p => { const k = (p.servicio || '').trim().toLowerCase(); subs[k] = Math.max(subs[k] || 0, p.monto || 0); });
  const totalSubs = Object.values(subs).reduce((a, b) => a + b, 0);
  if (Object.keys(subs).length >= 2 && totalSubs >= 200) {
    agregar({ id: 'suscripciones', icono: '📺', titulo: `Pagas ${fL(totalSubs)} al mes en suscripciones`, texto: `Son ${Object.keys(subs).length} servicios: ${fL(totalSubs * 12)} al año. Revisa cuáles usaste este mes; cancelar una sola ya se nota.`, accion: ['Ver pagos fijos', "switchView('pagos')"], impacto: totalSubs * 3 });
  }

  // 9) Pagos de la semana contra lo que tienes
  const semana = (state.pagosRecurrentes || []).filter(p => p.tipo !== 'ingreso' && p.monto > 0 && typeof diasHastaPagoFijo === 'function' && diasHastaPagoFijo(p, hoy) <= 7);
  const porPagar = semana.reduce((a, p) => a + p.monto, 0), tienes = totalEnCuentas();
  if (porPagar > 0 && porPagar > tienes) {
    agregar({ id: 'semana', icono: '📅', tono: 'rojo', titulo: 'No te alcanza para los pagos de esta semana', texto: `En 7 días vencen ${semana.length} ${semana.length === 1 ? 'pago' : 'pagos'} por ${fL(porPagar)} y en tus cuentas hay ${fL(tienes)}. Te faltan <strong>${fL(porPagar - tienes)}</strong>: decide hoy cuál se puede mover para no pagar recargos.`, accion: ['Ver pagos fijos', "switchView('pagos')"], impacto: 50000 + porPagar - tienes });
  }

  // 10) Fondo de emergencia
  const fondo = typeof fondoEmergencia === 'function' ? fondoEmergencia() : null;
  const esencial = typeof gastoMensualEsencial === 'function' ? gastoMensualEsencial().monto : 0;
  const sobra = Math.max(mesPrev.sobrante, 0);
  if (!fondo && esencial > 0) {
    const meta = esencial * 3, aporte = sobra > 0 ? Math.max(100, Math.round(sobra * 0.3 / 50) * 50) : Math.round(esencial * 0.1 / 50) * 50;
    agregar({ id: 'fondo', icono: '🛟', titulo: 'Arma tu fondo de emergencia', texto: `Con 3 meses de gastos básicos (${fL(meta)}) aguantas un imprevisto sin endeudarte. Guardando <strong>${fL(aporte)} al mes</strong> lo completas en ${fmtDuracion(Math.ceil(meta / Math.max(1, aporte)))}.`, accion: ['Crear mi fondo', 'abrirFondoEmergencia()'], impacto: meta * 0.1 });
  } else if (fondo && typeof mesesCubiertos === 'function' && mesesCubiertos(fondo) < (fondo.meses || 3)) {
    agregar({ id: 'fondo', icono: '🛟', titulo: 'Sigue con tu fondo de emergencia', texto: `Cubre ${mesesCubiertos(fondo).toFixed(1)} de ${fondo.meses || 3} meses. Te faltan ${fL(fondo.objetivo - fondo.actual)}.`, accion: ['Abonar', `openAbono('${esc(fondo.id)}')`], impacto: (fondo.objetivo - fondo.actual) * 0.05 });
  }

  // 11) Te sobró dinero el mes pasado y no está trabajando
  if (sobra >= 1000) {
    const metas = (state.goals || []).filter(g => !g.esFondoEmergencia && g.actual < g.objetivo);
    if (metas.length) {
      const g = metas.sort((a, b) => (b.actual / b.objetivo) - (a.actual / a.objetivo))[0], aporte = Math.round(sobra * 0.5 / 50) * 50, falta = g.objetivo - g.actual;
      agregar({ id: 'meta-' + g.id, icono: '🎯', titulo: `Acércate a "${g.nombre}"`, texto: `El mes pasado te sobraron ${fL(sobra)}. Si pones la mitad (${fL(aporte)}) en "${esc(g.nombre)}" cada mes, la completas en <strong>${fmtDuracion(Math.max(1, Math.ceil(falta / Math.max(1, aporte))))}</strong>.`, accion: ['Abonar a la meta', `openAbono('${esc(g.id)}')`], impacto: aporte * 0.5 });
    } else {
      agregar({ id: 'meta-nueva', icono: '🎯', titulo: `Te sobraron ${fL(sobra)} el mes pasado`, texto: 'Ponle nombre a ese dinero antes de que se vaya en gastos pequeños: un viaje, un fondo para la escuela, el enganche de algo. Con una meta es más fácil no tocarlo.', accion: ['Crear una meta', "openModal('modal-meta')"], impacto: sobra * 0.2 });
    }
  }

  // 12) Mucho dinero quieto en efectivo
  const efectivo = getCuentaBalance('efectivo');
  if (efectivo >= 20000) {
    agregar({ id: 'efectivo-quieto', icono: '🏦', titulo: 'Tienes mucho efectivo sin ganar nada', texto: `Hay ${fL(efectivo)} en efectivo. Lo que no necesites este mes, en una cuenta de ahorro o un plazo fijo gana intereses: por ejemplo, al 5% anual serían unos <strong>${fL(efectivo * 0.05 / 12)} al mes</strong>. Además, el efectivo se pierde o se va más fácil.`, accion: ['Ver mis cuentas', "switchView('cuentas')"], impacto: efectivo * 0.05 / 12 });
  }

  // 13) Bien hecho (para que no todo sean regaños)
  if (!lista.some(c => c.tono === 'rojo') && mesPrev.ingresos > 0 && mesPrev.sobrante > 0) {
    agregar({ id: 'bien', icono: '🎉', titulo: 'Vas bien', texto: `El mes pasado guardaste el ${Math.round(mesPrev.sobrante / mesPrev.ingresos * 100)}% de lo que ganaste. Sigue anotando: la constancia es lo que hace la diferencia.`, impacto: 0.5 });
  }

  const ocultos = _consejosOcultos(), clave = y + '-' + m;
  return lista.filter(c => ocultos[c.id] !== clave).sort((a, b) => b.impacto - a.impacto);
}

function _htmlConsejo(c, compacto) {
  return `<div class="consejo${c.tono === 'rojo' ? ' consejo-rojo' : ''}">
    <div class="consejo-ico">${c.icono}</div>
    <div class="consejo-cuerpo">
      <div class="consejo-titulo">${esc(c.titulo)}</div>
      <div class="consejo-texto">${c.texto}</div>
      <div class="consejo-acciones">
        ${c.accion ? `<button type="button" class="btn btn-primary consejo-btn" onclick="${c.accion[1]}">${esc(c.accion[0])}</button>` : ''}
        ${compacto ? `<button type="button" class="consejo-link" onclick="switchView('consejero')">Ver todos los consejos</button>` : c.id !== 'empezar' ? `<button type="button" class="consejo-link" onclick="ocultarConsejo('${esc(c.id)}')">Ya lo vi</button>` : ''}
      </div>
    </div>
  </div>`;
}

function renderConsejero() {
  const el = document.getElementById('consejero-lista');
  if (!el) return;
  const lista = consejos();
  el.innerHTML = lista.length ? lista.map(c => _htmlConsejo(c)).join('') : '<div class="card" style="text-align:center;color:var(--text2)">✅ No hay nada urgente por ahora. Vuelve en unos días.</div>';
}

// El consejo más importante, en el Inicio
function renderConsejoInicio() {
  const el = document.getElementById('consejo-inicio');
  if (!el) return;
  const c = state.setup ? consejos()[0] : null;
  if (!c || c.id === 'empezar' || c.id === 'bien') { el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = 'block';
  el.innerHTML = `<div class="consejo-cabeza">💡 Consejo para ti</div>` + _htmlConsejo(c, true);
}

const _switchViewConsejero = switchView;
switchView = function (v) {
  _switchViewConsejero(v);
  if (v === 'consejero') renderConsejero();
};
const _renderAllConsejero = renderAll;
renderAll = function () {
  const r = _renderAllConsejero.apply(this, arguments);
  renderConsejoInicio();
  if (document.getElementById('view-consejero')?.classList.contains('active')) renderConsejero();
  return r;
};
