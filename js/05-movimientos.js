// Mi Pisto HN · 05-movimientos.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.
// ═══════════════════════════════════════════════════════════════════════
// MULTIMONEDA: helpers para conversión en vivo en modales de gasto/ingreso
// ─────────────────────────────────────────────────────────────────────
// REGLA DE NEGOCIO:
//   Gasto en USD  → necesitas USD para pagar → banco te VENDE USD → tasa ASK
//   Ingreso en USD → recibiste USD y los conviertes → banco te COMPRA USD → tasa BID
// ═══════════════════════════════════════════════════════════════════════

function _formatMoneda(amount, code) {
  const cm = window.currencyManager;
  if (cm && typeof cm.format === 'function') return cm.format(amount, code);
  return code + ' ' + Number(amount).toFixed(2);
}

function _renderConversion(infoEl, monto, moneda, tipoTx) {
  if (!infoEl) return;
  if (!moneda || moneda === 'HNL' || !monto || monto <= 0) {
    infoEl.style.display = 'none';
    return;
  }
  const cm = window.currencyManager;
  if (!cm) {
    infoEl.style.display = 'none';
    return;
  }
  const rate = cm.getRate(moneda);
  if (!rate) {
    infoEl.className = 'conversion-info error';
    infoEl.innerHTML = '⚠️ No hay tasa configurada para ' + moneda;
    infoEl.style.display = 'block';
    return;
  }
  // Gasto → ask (compras moneda extranjera). Ingreso → bid (vendes moneda extranjera).
  const usaAsk = (tipoTx === 'expense');
  const tasa = usaAsk ? rate.ask : rate.bid;
  const ladoLabel = usaAsk ? 'venta' : 'compra';
  const ladoIcon = usaAsk ? '📤' : '📥';
  const equivalenteHNL = monto * tasa;
  infoEl.className = 'conversion-info';
  infoEl.innerHTML =
    '💱 Equivale a <span class="conv-amount">L. ' + equivalenteHNL.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) + '</span>' +
    '<span class="conv-note">' + ladoIcon + ' Tasa de referencia (' + ladoLabel + '): 1 ' + moneda + ' = L. ' + tasa.toFixed(4) + ' · Se guardará en HNL</span>';
  infoEl.style.display = 'block';
}

function actualizarConversionGasto() {
  const monto = parseMonto(document.getElementById('gasto-monto')?.value);
  const moneda = document.getElementById('gasto-moneda')?.value || 'HNL';
  const info = document.getElementById('gasto-conversion-info');
  _renderConversion(info, monto, moneda, 'expense');
  const wrap = document.getElementById('gasto-cobrado-wrap');
  if (wrap) {
    wrap.style.display = moneda !== 'HNL' ? 'block' : 'none';
    const rate = moneda !== 'HNL' && window.currencyManager && window.currencyManager.getRate(moneda);
    const cobrado = parseMonto(document.getElementById('gasto-cobrado').value);
    document.getElementById('gasto-margen-info').innerHTML = rate && monto > 0 && cobrado > 0
      ? _textoMargen(monto, moneda, r2(monto * rate.ask), cobrado)
      : 'Si lo anotas, el gasto queda por lo que de verdad pagaste y ves cuánto cobra tu banco por el cambio.';
  }
  if (typeof updateGastoSplitTotal === 'function') updateGastoSplitTotal();
}

function actualizarConversionIngreso() {
  const monto = parseMonto(document.getElementById('ingreso-monto')?.value);
  const moneda = document.getElementById('ingreso-moneda')?.value || 'HNL';
  const info = document.getElementById('ingreso-conversion-info');
  _renderConversion(info, monto, moneda, 'income');
}

// ═══ MARGEN DEL BANCO EN COMPRAS EN MONEDA EXTRANJERA ═════════════════════
// La conversión se guarda con la tasa de referencia del día (conversionRate).
// El banco cobra con su propia tasa, casi siempre más alta: si el usuario anota
// lo que de verdad le cobraron, el gasto pasa a ese monto (cobradoBanco) y la
// diferencia con la referencia es el margen.
const r2 = n => Math.round(n * 100) / 100;
function referenciaHNL(t) { return r2((t.originalAmount || 0) * (t.conversionRate || 0)); }
function margenDeTx(t) {
  if (!t.cobradoBanco || !t.originalAmount || !t.conversionRate) return null;
  const ref = referenciaHNL(t);
  return { referencia: ref, cobrado: t.amount, margen: r2(t.amount - ref), pct: ref ? (t.amount - ref) / ref * 100 : 0, tasaBanco: t.amount / t.originalAmount };
}
function _textoMargen(original, moneda, referencia, cobrado) {
  const dif = r2(cobrado - referencia), pct = referencia ? dif / referencia * 100 : 0;
  const tasa = (cobrado / original).toFixed(4);
  if (Math.abs(dif) < 0.01) return '✅ Te cobraron a la tasa de referencia.';
  return (dif > 0 ? '🏦 El banco te cobró ' + fL(dif) + ' de más' : '🎉 Te cobraron ' + fL(-dif) + ' menos') +
    ' (' + (dif > 0 ? '+' : '') + pct.toFixed(1) + '%). Tasa del banco: 1 ' + esc(moneda) + ' = L. ' + tasa + '.';
}
// Un monto muy lejos de la referencia suele ser un error (se escribió en dólares)
function _cobradoRazonable(cobrado, referencia) {
  return !(referencia > 0) || (cobrado >= referencia * 0.8 && cobrado <= referencia * 1.25) ||
    confirm('Lo que te cobró el banco (' + fL(cobrado) + ') está muy lejos de la tasa de referencia (' + fL(referencia) + ').\n\n¿Está bien escrito en lempiras?');
}
// Reparte el nuevo total entre las partes de un gasto dividido, en proporción
function _escalarSplits(splits, total) {
  if (!Array.isArray(splits) || !splits.length) return splits;
  const suma = splits.reduce((a, p) => a + p.monto, 0);
  if (!(suma > 0)) return splits;
  let resto = total;
  return splits.map((p, i) => {
    const m = i === splits.length - 1 ? r2(resto) : r2(p.monto * total / suma);
    resto -= m;
    return { cat: p.cat, monto: m };
  });
}

function resumenMargenExtranjero(desde) {
  const lim = desde || new Date(Date.now() - 365 * 864e5);
  const tx = state.transactions.filter(t => !t.deletedAt && t.type === 'expense' && !t.esTransferencia &&
    t.originalCurrency && t.originalCurrency !== 'HNL' && t.originalAmount && t.conversionRate && new Date(t.date) >= lim);
  const conf = tx.filter(t => t.cobradoBanco), pend = tx.filter(t => !t.cobradoBanco);
  const ref = conf.reduce((a, t) => a + referenciaHNL(t), 0), cob = conf.reduce((a, t) => a + t.amount, 0);
  const usd = conf.filter(t => t.originalCurrency === 'USD');
  const usdOrig = usd.reduce((a, t) => a + t.originalAmount, 0);
  return {
    total: tx.length, confirmadas: conf.length, pendientes: pend.sort((a, b) => new Date(b.date) - new Date(a.date)),
    referencia: r2(ref), cobrado: r2(cob), margen: r2(cob - ref), pct: ref ? (cob - ref) / ref * 100 : 0,
    tasaBancoUSD: usdOrig ? usd.reduce((a, t) => a + t.amount, 0) / usdOrig : null,
    tasaRefUSD: usdOrig ? usd.reduce((a, t) => a + referenciaHNL(t), 0) / usdOrig : null,
  };
}
function renderMargenExtranjero() {
  const card = document.getElementById('margen-dolares');
  if (!card) return;
  const r = resumenMargenExtranjero();
  if (!r.total) { card.style.display = 'none'; return; }
  card.style.display = 'block';
  let html = '<h4 style="margin-bottom:6px">💱 Tus compras en dólares</h4><p style="font-size:11px;color:var(--text2);margin-bottom:10px">Últimos 12 meses, contra la tasa de referencia del día de cada compra.</p>';
  if (r.confirmadas) {
    html += '<div style="font-size:13px;line-height:1.6">' + (r.margen > 0
        ? 'El banco te cobró <strong style="color:var(--red)">' + fL(r.margen) + ' de más</strong> (+' + r.pct.toFixed(1) + '%) en ' + r.confirmadas + (r.confirmadas === 1 ? ' compra.' : ' compras.')
        : 'En ' + r.confirmadas + (r.confirmadas === 1 ? ' compra' : ' compras') + ' te cobraron a la tasa de referencia o menos.') + '</div>';
    if (r.tasaBancoUSD) html += '<div style="font-size:12px;color:var(--text2);margin-top:4px">Tasa promedio del banco: <strong>L. ' + r.tasaBancoUSD.toFixed(4) + '</strong> · referencia: L. ' + r.tasaRefUSD.toFixed(4) + '</div>';
  }
  if (r.pendientes.length) {
    html += '<div style="font-size:12px;margin-top:12px;color:var(--amber)">⚠️ ' + r.pendientes.length + (r.pendientes.length === 1 ? ' compra' : ' compras') +
      ' sin confirmar lo que te cobró el banco. Búscalo en tu estado de cuenta:</div>' +
      r.pendientes.slice(0, 5).map(t => '<div class="pasos-item" data-tx="' + esc(t.id) + '" onclick="abrirEdicionTx(\'' + esc(t.id) + '\')"><span style="flex:1">' + esc(t.subcat || t.cat || 'Compra') +
        ' <span style="color:var(--text2);font-size:11px">· ' + new Date(t.date).toLocaleDateString('es-HN') + '</span></span><span>' + esc(window.currencyManager ? window.currencyManager.format(t.originalAmount, t.originalCurrency) : t.originalAmount + ' ' + t.originalCurrency) + ' ›</span></div>').join('');
  }
  card.innerHTML = html;
}

/** MULTIMONEDA: Helper para renderizar el monto de una transacción.
    Si la transacción tiene originalCurrency, muestra:
       - badge de moneda extranjera (ej: $50.00 USD)
       - valor convertido en HNL debajo (ej: L 1,336.48 al cambio)
    Si no, muestra solo el HNL como antes. */
function renderMontoTx(t, signo, color) {
  const sign = signo || '';
  const colorStyle = color ? 'color:' + color + ';' : '';
  if (t.originalCurrency && t.originalAmount && t.originalCurrency !== 'HNL' && window.currencyManager) {
    const originalFormatted = window.currencyManager.format(t.originalAmount, t.originalCurrency);
    const sideLabel = t.conversionSide === 'ask' ? 'venta' : (t.conversionSide === 'bid' ? 'compra' : '');
    const tasaInfo = t.conversionRate ? ' @ L. ' + Number(t.conversionRate).toFixed(4) + (sideLabel ? ' (' + sideLabel + ')' : '') : '';
    return '<div style="text-align:right">' +
      '<div style="font-size:17px;font-weight:800;' + colorStyle + '">' + sign + originalFormatted +
        '<span class="tx-currency-badge">' + esc(t.originalCurrency) + '</span></div>' +
      '<div class="tx-original-amount">≈ ' + sign + fL(t.amount) + tasaInfo + '</div>' +
    '</div>';
  }
  return '<div style="font-size:17px;font-weight:800;' + colorStyle + 'margin-left:12px;flex-shrink:0">' + sign + fL(t.amount) + '</div>';
}

// ========== GUARDAR GASTO CON FACTURA ADJUNTA ==========
function saveGasto(){
    const montoInput = parseMonto(document.getElementById('gasto-monto').value),
          moneda = document.getElementById('gasto-moneda')?.value || 'HNL',
          subcat = document.getElementById('gasto-subcat').value || '',
          pago = (document.getElementById('gasto-cuenta')?.value||document.getElementById('gasto-pago').value),
          tipo = document.getElementById('gasto-tipo').value || 'extra',
          banco = document.getElementById('gasto-banco').value || '',
          etiqueta = (document.getElementById('etiqueta-input')?.value || '').trim();
    let cat = document.getElementById('gasto-cat').value || 'General';

    if(montoInput===null || montoInput<=0) return alert('Monto inválido (no se permite notación científica ni valores >1.000.000.000)');

    // ── DIVISIÓN EN VARIAS CATEGORÍAS (splits) ──
    // Si el usuario activó "Este pago incluye varias categorías", validamos
    // que la suma de las partes cuadre exactamente con el monto total.
    const splitActivo = document.getElementById('gasto-split-wrap').style.display !== 'none';
    let splitsInput = null;
    if (splitActivo) {
        const filas = document.querySelectorAll('#gasto-split-list .split-row-wrap');
        const partes = [];
        let suma = 0;
        for (const fila of filas) {
            const catFila = fila.querySelector('.split-cat').value.trim();
            const montoFila = parseMonto(fila.querySelector('.split-monto').value);
            if (!catFila && (montoFila === null || montoFila <= 0)) continue; // fila vacía, se ignora
            if (!catFila) return alert('Falta el nombre de la categoría en una de las divisiones.');
            if (montoFila === null || montoFila <= 0) return alert(`Falta el monto para "${catFila}".`);
            partes.push({ cat: catFila, monto: montoFila });
            suma += montoFila;
        }
        if (partes.length < 2) return alert('Agrega al menos 2 categorías para dividir el gasto (o desactiva la división).');
        if (Math.abs(suma - montoInput) > 0.01) {
            return alert(`La suma de las categorías (L.${suma.toFixed(2)}) no cuadra con el monto total (L.${montoInput.toFixed(2)}). Ajusta los montos para que cuadren exactamente.`);
        }
        splitsInput = partes;
        const nombres = partes.map(p => p.cat);
        cat = nombres.length > 2 ? `Varios (${nombres.slice(0,2).join(', ')} +${nombres.length-2})` : `Varios (${nombres.join(', ')})`;
    }

    // ─────────────────────────────────────────────────────────────
    // MULTIMONEDA: convertir a HNL si es necesario
    // Gasto → tasa ASK (banco te VENDE la moneda extranjera)
    // ─────────────────────────────────────────────────────────────
    let monto = montoInput;
    let originalAmount = null;
    let originalCurrency = null;
    let conversionRate = null;
    let conversionSide = null;
    let rate = null;
    if (moneda && moneda !== 'HNL' && window.currencyManager) {
      rate = window.currencyManager.getRate(moneda);
      if (!rate) return alert('⚠️ No hay tasa configurada para ' + moneda + '. Configúrala en Configuración → Tasas.');
      monto = Math.round(montoInput * rate.ask * 100) / 100;
      originalAmount = montoInput;
      originalCurrency = moneda;
      conversionRate = rate.ask;
      conversionSide = 'ask';
    }

    // Convertir cada parte del split a HNL con la misma tasa que el total
    const splits = splitsInput ? splitsInput.map(p => ({
        cat: p.cat,
        monto: rate ? Math.round(p.monto * rate.ask * 100) / 100 : p.monto
    })) : null;

    // Lo que de verdad cobró el banco manda sobre la conversión de referencia
    let cobradoBanco = false;
    const cobradoTxt = originalCurrency ? (document.getElementById('gasto-cobrado')?.value || '').trim() : '';
    if (cobradoTxt) {
        const cobrado = parseMonto(cobradoTxt);
        if (!(cobrado > 0)) return alert('El monto que te cobró el banco no es válido.');
        if (!_cobradoRazonable(cobrado, monto)) return;
        monto = cobrado; cobradoBanco = true;
    }
    const splitsFinal = cobradoBanco ? _escalarSplits(splits, monto) : splits;

    // Recuperar ID de imagen desde IDB (no base64 de localStorage)
    const facturaImagenId = _tempFacturaId || null;

    // P0-4: normalizar la cuenta de imputación.
    //   'efectivo' / 'ahorro' afectan el saldo de esa cuenta.
    //   'credito' impacta el saldo de la tarjeta, no toca cuentas líquidas → cuenta=null.
    //   Cualquier otro valor heredado (debito, transferencia, etc.) se imputa a 'efectivo'.
    let cuentaImputacion = null;
    if (pago === 'efectivo' || pago === 'ahorro') cuentaImputacion = pago;
    else if (pago === 'credito') cuentaImputacion = null;
    else cuentaImputacion = 'efectivo';
    // Una cuenta en negativo casi siempre es un ingreso sin anotar: se avisa, no se bloquea
    if (cuentaImputacion) {
        const saldo = getCuentaBalance(cuentaImputacion);
        if (monto > saldo + 0.005 && !confirm(`Tu ${cuentaImputacion === 'efectivo' ? 'efectivo' : 'cuenta de ahorro'} tiene ${fL(saldo)}: con este gasto quedaría en ${fL(saldo - monto)}.\n\n¿Te faltó anotar un ingreso o una transferencia?\n\n[Aceptar] = guardar el gasto de todos modos`)) return;
    }

    const transaction = {
        id: uid(),
        type: 'expense',
        amount: monto,
        cat: cat,
        subcat: subcat,
        pago: pago,
        cuenta: cuentaImputacion,            // P0-4: explícito para getCuentaBalance
        tipo: tipo,
        banco: banco,
        etiqueta: etiqueta,
        date: new Date().toISOString(),
        facturaImagenId: facturaImagenId,
        facturaImagen: null,
        numeroFactura: `FAC-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(Math.random()*1000).toString().padStart(3,'0')}`
    };
    // MULTIMONEDA: agregar campos opcionales solo si la transacción fue en moneda extranjera
    if (originalCurrency) {
        transaction.originalAmount = originalAmount;
        transaction.originalCurrency = originalCurrency;
        transaction.conversionRate = conversionRate;
        transaction.conversionSide = conversionSide;
        if (cobradoBanco) transaction.cobradoBanco = true;
    }
    // Gasto dividido en varias categorías (ej. una factura de supermercado con
    // comida + limpieza + higiene en un solo pago): el monto total sigue
    // impactando la cuenta una sola vez, pero cada parte cuenta para su
    // propia categoría en las estadísticas.
    if (splitsFinal) {
        transaction.splits = splitsFinal;
    }

    if(pago === 'credito'){
        const tarjetaId = document.getElementById('gasto-tarjeta').value; // P1-4: no parseInt
        const tarjeta = tarjetaId && state.tarjetas.find(t => String(t.id) === String(tarjetaId));
        // Sin tarjeta el gasto no bajaría ninguna cuenta ni subiría ninguna deuda
        if(!tarjeta) return alert('Selecciona la tarjeta de crédito con la que pagaste.');
        transaction.tarjetaId = tarjeta.id;
        transaction.tarjetaNombre = tarjeta.nombre;
        if(document.getElementById('gasto-es-cuotas')?.checked){
            // Tasa Cero: bloquea cupo por el total pero no suma al saldo que
            // genera interés; se paga en cuotas fijas.
            const meses = parseInt(document.getElementById('gasto-cuotas-meses').value) || 12;
            const plan = nuevoPlanCuotas(subcat || cat, monto, meses, 0);
            (tarjeta.cuotas = tarjeta.cuotas || []).push(plan);
            transaction.planCuotasId = plan.id;
        }
        // Sin cuotas, la compra sube el saldo al recalcularse en save()
    }
    
    state.transactions.push(transaction);
    save();
    
    // P0-2: Limpiar estado temporal de imagen (ya NO toca localStorage)
    _tempFacturaId = null;
    window._tempFacturaDataURL = null;
    
    closeModal('modal-gasto');
    renderAll();
    
    ['gasto-monto','gasto-cat','gasto-subcat','gasto-banco','gasto-cobrado'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('gasto-cobrado-wrap').style.display = 'none';
    const sugerencia = document.getElementById('gasto-sugerencia-tc');
    if (sugerencia) { sugerencia.style.display = 'none'; sugerencia.innerHTML = ''; sugerencia.dataset.html = ''; }
    document.getElementById('gasto-tipo').value = 'extra';
    const esCuotas = document.getElementById('gasto-es-cuotas');
    if (esCuotas) { esCuotas.checked = false; document.getElementById('gasto-cuotas-meses').classList.add('hidden'); }
    // MULTIMONEDA: resetear moneda y ocultar info de conversión
    const monedaSel = document.getElementById('gasto-moneda');
    if (monedaSel) monedaSel.value = 'HNL';
    const convInfo = document.getElementById('gasto-conversion-info');
    if (convInfo) convInfo.style.display = 'none';
    document.getElementById('ocr-status').style.display = 'none';
    const prevEl = document.getElementById('ocr-preview');
    if (prevEl) prevEl.style.display = 'none';
    clearEtiqueta();
    resetGastoSplit();

    alert('✅ Gasto guardado. Factura adjuntada si fue escaneada.');
}

// ── UI: dividir un gasto en varias categorías ──
function resetGastoSplit() {
    const wrap = document.getElementById('gasto-split-wrap');
    const catInput = document.getElementById('gasto-cat');
    const btn = document.getElementById('btn-toggle-split');
    if (!wrap) return;
    wrap.style.display = 'none';
    document.getElementById('gasto-split-list').innerHTML = '';
    catInput.style.display = '';
    catInput.disabled = false;
    btn.textContent = '➗ Este pago incluye varias categorías';
}

function toggleGastoSplit() {
    const wrap = document.getElementById('gasto-split-wrap');
    const activo = wrap.style.display !== 'none';
    if (activo) {
        resetGastoSplit();
    } else {
        wrap.style.display = 'block';
        const catInput = document.getElementById('gasto-cat');
        catInput.style.display = 'none';
        catInput.disabled = true;
        document.getElementById('btn-toggle-split').textContent = '✖️ Cancelar división';
        if (!document.getElementById('gasto-split-list').children.length) {
            addGastoSplitRow();
            addGastoSplitRow();
        }
    }
}

function addGastoSplitRow(cat, monto) {
    const list = document.getElementById('gasto-split-list');
    const wrapper = document.createElement('div');
    wrapper.className = 'split-row-wrap';
    wrapper.style.cssText = 'margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border)';
    wrapper.innerHTML = `
      <div class="input-row" style="margin-bottom:6px">
        <input type="text" class="input-field split-cat" placeholder="Categoría" value="${cat ? esc(cat) : ''}">
        <input type="text" inputmode="decimal" pattern="[0-9]*[.,]?[0-9]*" class="input-field split-monto" placeholder="Monto" value="${monto || ''}">
      </div>
      <button type="button" class="btn-tx-delete" style="width:100%">🗑️ Quitar esta categoría</button>
    `;
    wrapper.querySelector('.split-monto').addEventListener('input', updateGastoSplitTotal);
    wrapper.querySelector('button').addEventListener('click', () => { wrapper.remove(); updateGastoSplitTotal(); });
    list.appendChild(wrapper);
    updateGastoSplitTotal();
}

function updateGastoSplitTotal() {
    const montos = document.querySelectorAll('#gasto-split-list .split-monto');
    let suma = 0;
    montos.forEach(inp => { const v = parseMonto(inp.value); if (v) suma += v; });
    const totalEl = document.getElementById('gasto-split-total');
    if (!totalEl) return;
    const montoTotal = parseMonto(document.getElementById('gasto-monto').value) || 0;
    const restante = montoTotal - suma;
    if (Math.abs(restante) < 0.01 && montoTotal > 0) {
        totalEl.style.color = 'var(--green)';
        totalEl.textContent = `✅ Asignado: L.${suma.toFixed(2)} de L.${montoTotal.toFixed(2)}`;
    } else if (restante > 0) {
        totalEl.style.color = 'var(--amber)';
        totalEl.textContent = `Asignado: L.${suma.toFixed(2)} · Falta: L.${restante.toFixed(2)}`;
    } else {
        totalEl.style.color = 'var(--red)';
        totalEl.textContent = `⚠️ Asignado: L.${suma.toFixed(2)} · Sobran: L.${Math.abs(restante).toFixed(2)}`;
    }
}

function saveIngreso(){
  const montoInput=parseMonto(document.getElementById('ingreso-monto').value);
  if(montoInput===null||montoInput<=0)return alert('Monto inválido');
  const moneda = document.getElementById('ingreso-moneda')?.value || 'HNL';
  // P0-4: capturar la cuenta de destino y la nota — antes ambos campos se ignoraban
  const cuentaSel=document.getElementById('ingreso-cuenta')?.value||'efectivo';
  const cuenta=(cuentaSel==='efectivo'||cuentaSel==='ahorro')?cuentaSel:'efectivo';
  const tipoSel=document.getElementById('ingreso-tipo').value;
  const nota=(document.getElementById('ingreso-nota')?.value||'').trim();
  
  // ─────────────────────────────────────────────────────────────
  // MULTIMONEDA: convertir a HNL si es necesario
  // Ingreso → tasa BID (banco te COMPRA la moneda extranjera)
  // ─────────────────────────────────────────────────────────────
  let monto = montoInput;
  let extraFields = {};
  if (moneda && moneda !== 'HNL' && window.currencyManager) {
    const rate = window.currencyManager.getRate(moneda);
    if (!rate) return alert('⚠️ No hay tasa configurada para ' + moneda + '. Configúrala en Configuración → Tasas.');
    monto = Math.round(montoInput * rate.bid * 100) / 100;
    extraFields = {
      originalAmount: montoInput,
      originalCurrency: moneda,
      conversionRate: rate.bid,
      conversionSide: 'bid'
    };
  }
  
  state.transactions.push(Object.assign({
    id:uid(),
    type:'income',
    amount:monto,
    cat: tipoSel==='salario' ? 'Salario' : 'Extra',
    subcat: tipoSel,
    cuenta: cuenta,
    nota: nota,
    date:new Date().toISOString()
  }, extraFields));
  save();closeModal('modal-ingreso');renderAll();
  document.getElementById('ingreso-monto').value='';
  if(document.getElementById('ingreso-nota'))document.getElementById('ingreso-nota').value='';
  // MULTIMONEDA: resetear moneda y ocultar info de conversión
  const monedaSel = document.getElementById('ingreso-moneda');
  if (monedaSel) monedaSel.value = 'HNL';
  const convInfo = document.getElementById('ingreso-conversion-info');
  if (convInfo) convInfo.style.display = 'none';
  renderWelcome();
}

// ============================================================
// 🗑️ SOFT DELETE CON TOAST (reemplaza deleteTx y confirm())
// ============================================================
let _undoTimer = null;
let _undoTxId  = null;

function softDeleteTx(id) {
  const t = state.transactions.find(x => x.id === id);
  if (!t) return;

  // Marcar como eliminado
  t.deletedAt = new Date().toISOString();
  _undoTxId = id;
  save();
  renderAll();

  // Cancelar toast anterior si existía
  if (_undoTimer) { clearTimeout(_undoTimer); _dismissToast(); }

  // Construir toast
  const label = t.type === 'income' ? `+${fL(t.amount)}` : `-${fL(t.amount)}`;
  _showUndoToast(
    `${t.cat || 'Movimiento'} eliminado`,
    label,
    () => { _undoDelete(id); }
  );
}

function _showUndoToast(title, sub, onUndo) {
  _dismissToast();

  const toast = document.createElement('div');
  toast.className = 'undo-toast';
  toast.id = 'undo-toast-el';
  toast.innerHTML = `
    <div class="undo-toast-info">
      <div class="undo-toast-title">🗑️ ${esc(title)}</div>
      <div class="undo-toast-sub">${esc(sub)}</div>
    </div>
    <button class="btn-undo" onclick="_undoDeleteFromToast()">Deshacer</button>
    <div class="undo-toast-bar"><div class="undo-toast-bar-fill" id="undo-bar" style="width:100%"></div></div>
  `;
  document.body.appendChild(toast);

  // Barra que se vacía en 5 segundos
  requestAnimationFrame(() => {
    const bar = document.getElementById('undo-bar');
    if (bar) { bar.style.transitionDuration = '5000ms'; bar.style.width = '0%'; }
  });

  _undoTimer = setTimeout(() => {
    _dismissToast();
    _undoTxId = null;
  }, 5000);
}

function _undoDeleteFromToast() {
  if (_undoTxId !== null) _undoDelete(_undoTxId);
}

function _undoDelete(id) {
  if (_undoTimer) { clearTimeout(_undoTimer); _undoTimer = null; }
  const t = state.transactions.find(x => x.id === id);
  if (t) { t.deletedAt = null; save(); renderAll(); }
  _undoTxId = null;
  _dismissToast();
}

function _dismissToast() {
  const el = document.getElementById('undo-toast-el');
  if (!el) return;
  el.classList.add('hiding');
  setTimeout(() => el.remove(), 220);
}

// Alias para compatibilidad con código existente
function deleteTx(id) { softDeleteTx(id); }

function saveMeta(){const nombre=document.getElementById('meta-nombre').value,objetivo=leerMonto(document.getElementById('meta-objetivo').value);if(!nombre||!objetivo)return alert('Completa nombre y monto');state.goals.push({id:uid(),nombre,objetivo,actual:leerMonto(document.getElementById('meta-actual').value)||0});save();closeModal('modal-meta');renderAll();['meta-nombre','meta-objetivo','meta-actual'].forEach(id=>document.getElementById(id).value=id==='meta-actual'?'0':'')}
function openAbono(id){
  const g=state.goals.find(x=>String(x.id)===String(id));
  if(!g)return;
  document.getElementById('abono-meta-nombre').textContent='🎯 '+g.nombre;
  const pct=Math.min(100,(g.actual/g.objetivo)*100);
  const restante=Math.max(0,g.objetivo-g.actual);
  document.getElementById('abono-meta-progreso').innerHTML=
    `Progreso: <strong>${fL(g.actual)}</strong> de ${fL(g.objetivo)} (${pct.toFixed(0)}%) · Te falta <strong style="color:var(--amber)">${fL(restante)}</strong>`;
  document.getElementById('abono-meta-id').value=id;
  document.getElementById('abono-monto').value='';
  // Default: efectivo, pero si no hay saldo en efectivo y sí en ahorro, sugerir ahorro
  const sel=document.getElementById('abono-cuenta');
  const efSaldo=getCuentaBalance('efectivo');
  const ahSaldo=getCuentaBalance('ahorro');
  sel.value=(efSaldo<=0 && ahSaldo>0)?'ahorro':'efectivo';
  actualizarSaldoAbono();
  // Listener una sola vez
  if(!sel.dataset.bound){
    sel.addEventListener('change',actualizarSaldoAbono);
    sel.dataset.bound='1';
  }
  openModal('modal-abono');
}
function actualizarSaldoAbono(){
  const sel=document.getElementById('abono-cuenta');
  const info=document.getElementById('abono-saldo-info');
  if(!sel||!info)return;
  const cuenta=sel.value;
  const saldo=getCuentaBalance(cuenta);
  const nombre=cuenta==='efectivo'?'💵 Efectivo':'🏦 Cuenta de Ahorro';
  const color=saldo<=0?'var(--red)':(saldo<100?'var(--amber)':'var(--green)');
  info.innerHTML=`Saldo disponible en ${nombre}: <strong style="color:${color}">${fL(saldo)}</strong>`;
}
function saveAbono(){
  const id=document.getElementById('abono-meta-id').value;
  const monto=parseMonto(document.getElementById('abono-monto').value);
  const cuenta=document.getElementById('abono-cuenta')?.value||'efectivo';
  if(monto===null||monto<=0)return alert('⚠️ Monto inválido');
  const g=state.goals.find(x=>String(x.id)===String(id));
  if(!g)return alert('⚠️ Meta no encontrada');
  // Validar saldo disponible en la cuenta seleccionada
  const saldoCuenta=getCuentaBalance(cuenta);
  if(monto>saldoCuenta){
    const nomCuenta=cuenta==='efectivo'?'efectivo':'cuenta de ahorro';
    return alert(`⚠️ Saldo insuficiente en ${nomCuenta}.\n\nDisponible: ${fL(saldoCuenta)}\nQuieres abonar: ${fL(monto)}`);
  }
  // Aplicar abono a la meta
  g.actual+=monto;
  // Sale de la cuenta pero sigue siendo tuyo: es un movimiento interno
  // (esTransferencia), no un gasto. Antes bajaba el patrimonio y el resumen
  // del mes lo contaba como "gastaste".
  state.transactions.push({
    id:uid(),
    type:'expense',
    amount:monto,
    cat:'Ahorros',
    subcat:`Meta: ${g.nombre}`,
    pago:cuenta,
    cuenta:cuenta,
    tipo:'fijo',
    metaId:g.id,
    esTransferencia:true,
    date:new Date().toISOString()
  });
  save();
  closeModal('modal-abono');
  renderAll();
  document.getElementById('abono-monto').value='';
  // Mensaje de confirmación simple (sin confeti)
  const pct=Math.min(100,(g.actual/g.objetivo)*100);
  if(pct>=100){
    setTimeout(()=>alert(`🎯 ¡Meta "${g.nombre}" completada!`),100);
  }
}
function deleteMeta(id){
  const g=state.goals.find(x=>String(x.id)===String(id));
  if(!g)return;
  const pct=((g.actual/g.objetivo)*100).toFixed(0);
  if(confirm(`¿Eliminar la meta "${g.nombre}"?\n\nProgreso actual: ${fL(g.actual)} de ${fL(g.objetivo)} (${pct}%)\n\nEsta acción no se puede deshacer. Los abonos ya registrados como transacciones permanecerán en tu historial.`)){
    // Lo abonado desde tus cuentas vuelve a una de ellas (si no, desaparecería de los saldos)
    const abonado=Math.round(state.transactions.filter(t=>!t.deletedAt&&t.metaId===g.id&&t.esTransferencia).reduce((a,t)=>a+(t.type==='expense'?t.amount:-t.amount),0)*100)/100;
    if(abonado>0){
      const cuenta=confirm(`Devolver los ${fL(abonado)} abonados a "${g.nombre}".\n\n[Aceptar] = a la Cuenta de Ahorro\n[Cancelar] = a Efectivo`)?'ahorro':'efectivo';
      state.transactions.push({id:uid(),type:'income',amount:abonado,cat:'Ahorros',subcat:`Retiro de meta: ${g.nombre}`,cuenta,metaId:g.id,esTransferencia:true,date:new Date().toISOString()});
    }
    state.goals=state.goals.filter(x=>String(x.id)!==String(id));
    save();renderAll();
  }
}
function renderMetas(){
  const container=document.getElementById('metas-list');
  if(!container)return;
  
  // Estado vacío
  if(state.goals.length===0){
    container.innerHTML=`<div class="empty-state-simple"><div class="es-icon">🎯</div><div class="es-title">Sin metas de ahorro</div><div class="es-sub">Define una meta (viaje, fondo de emergencia, auto) y rastrea tu progreso.</div><button class="btn-empty-secondary" onclick="openModal('modal-meta')">➕ Crear primera meta</button></div>`;
    return;
  }
  
  // FIX CRÍTICO: HTML correctamente escapado con grid de 3 botones (Abonar, Editar, Eliminar)
  container.innerHTML = state.goals.map(g => {
    const pct = Math.min(100, (g.actual / g.objetivo) * 100);
    const isComplete = pct >= 100;
    const safeId = esc(g.id);
    const safeName = esc(g.nombre);
    
    return `
      <div class="card card-saving" data-goal-id="${safeId}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <div style="font-weight:700;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${safeName}</div>
          <div style="font-weight:800;color:var(--amber);font-size:14px">${pct.toFixed(0)}%</div>
        </div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:8px">
          <strong style="color:var(--amber)">${fL(g.actual)}</strong> de ${fL(g.objetivo)}
          ${isComplete ? ' · 🎉 ¡Completada!' : ''}
        </div>
        <div style="height:10px;background:var(--bg4);border-radius:5px;margin:10px 0;overflow:hidden">
          <div style="width:${pct}%;height:100%;background:${isComplete ? 'var(--green)' : 'linear-gradient(90deg,var(--amber),var(--green))'};transition:width .6s ease"></div>
        </div>
        <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:6px;margin-top:12px">
          <button class="btn btn-primary" style="margin:0;padding:10px 6px;font-size:12px" onclick="openAbono('${safeId}')">💰 Abonar</button>
          <button class="btn btn-secondary" style="margin:0;padding:10px 6px;font-size:12px" onclick="editarMeta('${safeId}')">✏️ Editar</button>
          <button class="btn" style="margin:0;padding:10px 6px;font-size:12px;background:var(--bg3);color:var(--red);border:1px solid rgba(255,68,68,.3)" onclick="deleteMeta('${safeId}')">🗑️ Eliminar</button>
        </div>
      </div>`;
  }).join('');
}

// FIX: Función global editarMeta (faltaba en la versión original)
function editarMeta(id) {
  const g = state.goals.find(x => String(x.id) === String(id));
  if (!g) return;
  
  let modal = document.getElementById('modal-editar-meta');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-editar-meta';
    modal.className = 'modal';
    modal.onclick = e => { if (e.target === modal) modal.style.display = 'none'; };
    modal.innerHTML = `
      <div class="modal-content">
        <h3 style="margin-bottom:16px">✏️ Editar Meta</h3>
        <input type="text" id="edit-meta-nombre" class="input-field" placeholder="Nombre de la meta">
        <input type="number" id="edit-meta-objetivo" class="input-field" placeholder="Monto objetivo (L)" inputmode="decimal" step="0.01">
        <input type="number" id="edit-meta-actual" class="input-field" placeholder="Monto actual ahorrado (L)" inputmode="decimal" step="0.01">
        <input type="hidden" id="edit-meta-id">
        <div style="display:flex;gap:10px;margin-top:8px">
          <button class="btn btn-secondary" onclick="document.getElementById('modal-editar-meta').style.display='none'" style="flex:1">Cancelar</button>
          <button class="btn btn-primary" onclick="guardarEdicionMeta()" style="flex:2">💾 Guardar</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
  
  document.getElementById('edit-meta-nombre').value = g.nombre;
  document.getElementById('edit-meta-objetivo').value = g.objetivo;
  document.getElementById('edit-meta-actual').value = g.actual;
  document.getElementById('edit-meta-id').value = g.id;
  modal.style.display = 'flex';
}

function guardarEdicionMeta() {
  const id = document.getElementById('edit-meta-id').value;
  const nombre = document.getElementById('edit-meta-nombre').value.trim();
  const objetivo = leerMonto(document.getElementById('edit-meta-objetivo').value);
  const actual = leerMonto(document.getElementById('edit-meta-actual').value) || 0;
  
  if (!nombre) { alert('⚠️ El nombre es obligatorio'); return; }
  if (!objetivo || objetivo <= 0) { alert('⚠️ El monto objetivo debe ser mayor a 0'); return; }
  if (actual < 0) { alert('⚠️ El monto actual no puede ser negativo'); return; }
  
  const g = state.goals.find(x => String(x.id) === String(id));
  if (!g) return;
  
  g.nombre = nombre;
  g.objetivo = objetivo;
  g.actual = actual;
  
  save();
  document.getElementById('modal-editar-meta').style.display = 'none';
  renderAll();
}
function renderDashboardGoals(){const container=document.getElementById('dashboard-goals');if(!container)return;container.innerHTML=state.goals.slice(0,3).map(g=>{const pct=Math.min(100,(g.actual/g.objetivo)*100);return `<div class="goal-mini"><div class="goal-mini-header"><span>${esc(g.nombre)}</span><span>${pct.toFixed(0)}%</span></div><div class="goal-mini-bar"><div class="goal-mini-progress" style="width:${pct}%"></div></div></div>`}).join('')}
