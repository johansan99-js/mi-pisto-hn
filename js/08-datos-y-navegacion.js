// Mi Pisto HN · 08-datos-y-navegacion.js
// Se carga como script clásico en el orden de index.html: todos comparten el ámbito global.
// ========== IMPORTAR DATOS ==========
// P0-5 + P1-6: soporta backups planos, AES-GCM (nuevo) y XOR legacy.
// Valida la estructura antes de aceptar para cerrar el vector XSS por
// import malicioso (un .json con <script> en state.nombre, etc.).

// ────────────────────────────────────────────────────────────────────
// VALIDACIÓN ENDURECIDA DE BACKUPS — defensa contra XSS por import
// ────────────────────────────────────────────────────────────────────
// Quick Fix XSS: validar estrictamente IDs, montos, strings para evitar
// inyección de código malicioso vía backups manipulados.
function _validarSchemaBackup(obj) {
  if (typeof obj !== 'object' || obj === null) return 'No es un objeto';
  
  // ── Validar campos top-level ──
  if (typeof obj.setup !== 'boolean') return 'Falta setup:boolean';
  if (obj.nombre !== undefined) {
    if (typeof obj.nombre !== 'string' || obj.nombre.length > 200) return 'Campo nombre inválido';
    // Rechazar caracteres de control y scripts
    if (/[<>]/.test(obj.nombre)) return 'nombre contiene caracteres prohibidos';
  }
  if (obj.saldoInicial !== undefined) {
    if (typeof obj.saldoInicial !== 'number' || !isFinite(obj.saldoInicial)) return 'saldoInicial inválido';
    if (obj.saldoInicial < 0 || obj.saldoInicial > 1e12) return 'saldoInicial fuera de rango';
  }
  
  // ── Validar arrays esperados ──
  const arrays = ['transactions','goals','receivables','payables','prestamos','tarjetas','pagosRecurrentes','transferenciasProgramadas','grupos','presupuestos','misCuentas','categorias'];
  for (const k of arrays) {
    if (obj[k] !== undefined && !Array.isArray(obj[k])) return `${k} debe ser array`;
  }
  
  // ── Validar tamaño total ──
  if (JSON.stringify(obj).length > 10 * 1024 * 1024) return 'Archivo demasiado grande (>10MB)';
  
  // ── Regex de validación ──
  // UUID v4: 8-4-4-4-12 dígitos hex
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // ID legacy (timestamp_random): hasta 20 caracteres alfanuméricos con guión bajo
  const legacyIdRegex = /^[a-z0-9_]{5,20}$/i;
  
  function esIdValido(id) {
    if (typeof id !== 'string') return false;
    return uuidRegex.test(id) || legacyIdRegex.test(id);
  }
  
  function esFechaValida(fecha) {
    if (!fecha) return true; // opcional
    if (typeof fecha !== 'string') return false;
    const d = new Date(fecha);
    return !isNaN(d.getTime()) && d.getFullYear() > 2000 && d.getFullYear() < 2100;
  }
  
  function esStringSeguro(str, maxLen = 500) {
    if (str === undefined || str === null) return true; // opcional
    if (typeof str !== 'string') return false;
    if (str.length > maxLen) return false;
    // Rechazar <script>, <iframe>, javascript:, data:, on* attributes
    const dangerous = /<script|<iframe|javascript:|data:image|onerror=|onclick=/i;
    return !dangerous.test(str);
  }
  
  // ── Validar transacciones (todas: antes solo se miraban las primeras 100) ──
  if (Array.isArray(obj.transactions)) {
    for (const t of obj.transactions) {
      if (typeof t !== 'object' || t === null) return 'Transacción inválida';
      
      // ID obligatorio y válido
      if (!esIdValido(t.id)) return `ID inválido en transacción: ${JSON.stringify(t.id || 'missing')}`;
      
      // Type obligatorio
      if (t.type !== 'income' && t.type !== 'expense') return `type inválido: ${t.type}`;
      
      // Amount obligatorio y razonable
      if (typeof t.amount !== 'number' || !isFinite(t.amount)) return 'amount inválido';
      if (t.amount < 0 || t.amount > 1e9) return `amount fuera de rango: ${t.amount}`;
      
      // Fecha válida si existe
      if (t.date && !esFechaValida(t.date)) return `fecha inválida: ${t.date}`;
      
      // Strings seguros
      if (!esStringSeguro(t.cat, 100)) return `categoría sospechosa: ${t.cat}`;
      if (!esStringSeguro(t.subcat, 100)) return `subcategoría sospechosa`;
      if (!esStringSeguro(t.nota, 1000)) return `nota sospechosa`;
      if (!esStringSeguro(t.etiqueta, 100)) return `etiqueta sospechosa`;
    }
  }
  
  // ── Validar metas ──
  if (Array.isArray(obj.goals)) {
    for (const g of obj.goals) {
      if (!esIdValido(g.id)) return `ID inválido en meta: ${g.id}`;
      if (!esStringSeguro(g.nombre, 200)) return 'nombre de meta sospechoso';
      if (typeof g.objetivo !== 'number' || g.objetivo < 0 || g.objetivo > 1e9) return 'objetivo inválido';
      if (g.baseMensual !== undefined && (typeof g.baseMensual !== 'number' || !(g.baseMensual >= 0) || g.baseMensual > 1e9)) return 'gasto mensual del fondo inválido';
      if (g.meses !== undefined && ![3, 6].includes(g.meses)) return 'meses del fondo inválidos';
    }
  }
  
  // ── Validar cuentas por cobrar ──
  if (Array.isArray(obj.receivables)) {
    for (const r of obj.receivables) {
      if (!esIdValido(r.id)) return `ID inválido en cobrar: ${r.id}`;
      if (!esStringSeguro(r.persona, 200)) return 'persona sospechosa en cobrar';
    }
  }
  
  // ── Validar cuentas por pagar ──
  if (Array.isArray(obj.payables)) {
    for (const p of obj.payables) {
      if (!esIdValido(p.id)) return `ID inválido en pagar: ${p.id}`;
      if (!esStringSeguro(p.creditor, 200)) return 'acreedor sospechoso';
    }
  }
  
  if (obj.diasSinGastos !== undefined && !(Array.isArray(obj.diasSinGastos) && obj.diasSinGastos.length <= 1000 && obj.diasSinGastos.every(d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)))) return 'días sin gastos inválidos';
  if (obj.mejorRacha !== undefined && !(Number.isInteger(obj.mejorRacha) && obj.mejorRacha >= 0 && obj.mejorRacha < 100000)) return 'racha inválida';
  if (obj.premium !== undefined && obj.premium !== null && (typeof obj.premium !== 'object' || Array.isArray(obj.premium))) return 'premium inválido';

  // ── Validar mis cuentas ──
  if (Array.isArray(obj.misCuentas)) {
    for (const c of obj.misCuentas) {
      if (!esIdValido(c.id) || !esStringSeguro(c.nombre, 40) || !esStringSeguro(c.grupo, 40) || /[<>"']/.test((c.nombre || '') + (c.grupo || '') + (c.color || '') + (c.icono || ''))) return 'cuenta inválida';
      if (c.color !== undefined && !/^#[0-9a-f]{6}$/i.test(c.color)) return 'color de cuenta inválido';
      if (c.moneda !== undefined && c.moneda !== 'USD' && c.moneda !== 'HNL') return 'moneda de cuenta inválida';
    }
  }

  // ── Validar presupuestos ──
  if (Array.isArray(obj.presupuestos)) {
    for (const p of obj.presupuestos) {
      if (!esIdValido(p.id) || !esStringSeguro(p.cat, 60) || typeof p.monto !== 'number' || !['semana','quincena','mes'].includes(p.periodo)) return 'presupuesto inválido';
    }
  }
  // ── Validar categorías propias ──
  if (Array.isArray(obj.categorias)) {
    for (const c of obj.categorias) {
      if (!esIdValido(c.id) || !esStringSeguro(c.nombre, 40) || !c.nombre || /[<>]/.test(c.nombre) || !['gasto', 'ingreso'].includes(c.tipo)) return 'categoría inválida';
      if (typeof c.icono !== 'string' || !c.icono || c.icono.length > 12 || /[<>"'&]/.test(c.icono)) return 'ícono de categoría inválido';
      if (!/^#[0-9a-f]{6}$/i.test(c.color || '')) return 'color de categoría inválido';
    }
  }
  if (obj.diasPago !== undefined && obj.diasPago !== null && !(Array.isArray(obj.diasPago) && obj.diasPago.length === 2 && obj.diasPago.every(n => Number.isInteger(n) && n >= 1 && n <= 31))) return 'días de pago inválidos';

  // ── Validar gastos compartidos ──
  if (Array.isArray(obj.grupos)) {
    for (const g of obj.grupos) {
      if (!esIdValido(g.id)) return `ID inválido en grupo: ${g.id}`;
      if (!esStringSeguro(g.nombre, 60)) return 'nombre de grupo sospechoso';
      if (!Array.isArray(g.miembros) || !Array.isArray(g.gastos) || !Array.isArray(g.pagos)) return 'grupo mal formado';
      for (const m of g.miembros) if (!esIdValido(m.id) || !esStringSeguro(m.nombre, 60)) return 'miembro de grupo sospechoso';
      for (const e of g.gastos) if (!esIdValido(e.id) || !esStringSeguro(e.desc, 60) || typeof e.monto !== 'number') return 'gasto de grupo sospechoso';
    }
  }

  // ── Validar préstamos ──
  if (Array.isArray(obj.prestamos)) {
    for (const p of obj.prestamos) {
      if (!esIdValido(p.id)) return `ID inválido en préstamo: ${p.id}`;
      if (!esStringSeguro(p.entidad, 200)) return 'entidad sospechosa';
    }
  }
  
  // ── Validar tarjetas ──
  if (Array.isArray(obj.tarjetas)) {
    for (const tc of obj.tarjetas) {
      if (!esIdValido(tc.id)) return `ID inválido en tarjeta: ${tc.id}`;
      if (!esStringSeguro(tc.nombre, 100)) return 'nombre de tarjeta sospechoso';
      if (tc.ultimos4 !== undefined && !/^\d{4}$/.test(String(tc.ultimos4))) return 'últimos dígitos de tarjeta inválidos';
      if (tc.saldoBase !== undefined && (typeof tc.saldoBase !== 'number' || !isFinite(tc.saldoBase) || Math.abs(tc.saldoBase) > 1e12)) return 'saldo base de tarjeta inválido';
      if (tc.saldoBaseUSD !== undefined && (typeof tc.saldoBaseUSD !== 'number' || !isFinite(tc.saldoBaseUSD) || Math.abs(tc.saldoBaseUSD) > 1e12)) return 'saldo en dólares de tarjeta inválido';
      if (tc.beneficios !== undefined) {
        if (!Array.isArray(tc.beneficios) || tc.beneficios.length > 30) return 'beneficios de tarjeta inválidos';
        for (const b of tc.beneficios) {
          if (!b || !esIdValido(b.id)) return `ID inválido en beneficio: ${b && b.id}`;
          if (typeof b.porcentaje !== 'number' || !(b.porcentaje > 0) || b.porcentaje > 30) return 'porcentaje de beneficio inválido';
          if (!esStringSeguro(b.categoria, 60) || !esStringSeguro(b.comercio, 60) || /[<>]/.test((b.categoria || '') + (b.comercio || ''))) return 'beneficio de tarjeta sospechoso';
          if (b.tope !== undefined && b.tope !== null && (typeof b.tope !== 'number' || !(b.tope > 0))) return 'tope de beneficio inválido';
        }
      }
      if (tc.cuotas !== undefined) {
        if (!Array.isArray(tc.cuotas)) return 'cuotas de tarjeta inválidas';
        for (const c of tc.cuotas) {
          if (!esIdValido(c.id)) return `ID inválido en compra a cuotas: ${c.id}`;
          if (!esStringSeguro(c.descripcion, 100)) return 'descripción de compra a cuotas sospechosa';
        }
      }
    }
  }
  
  // ── Pagos fijos, transferencias programadas y abonos de grupos ──
  for (const p of obj.pagosRecurrentes || []) {
    if (!p || !esIdValido(p.id) || !esStringSeguro(p.servicio, 100)) return 'pago fijo inválido';
    if (p.dia !== undefined && p.dia !== null && !(Number.isInteger(+p.dia) && +p.dia >= 1 && +p.dia <= 31)) return 'día de pago fijo inválido';
    if (p.dias !== undefined && p.dias !== null && !(Array.isArray(p.dias) && p.dias.length <= 31 && p.dias.every(d => Number.isInteger(+d) && +d >= 1 && +d <= 31))) return 'días de pago fijo inválidos';
  }
  for (const tp of obj.transferenciasProgramadas || []) {
    if (!tp || !esIdValido(tp.id) || !esStringSeguro(tp.nombre, 100)) return 'transferencia programada inválida';
    if (tp.dia !== undefined && tp.dia !== null && !(Number.isInteger(+tp.dia) && +tp.dia >= 1 && +tp.dia <= 31)) return 'día de transferencia inválido';
  }
  for (const g of obj.grupos || []) for (const pg of g.pagos) if (!pg || !esIdValido(pg.id) || typeof pg.monto !== 'number') return 'abono de grupo sospechoso';

  return _revisionProfunda(obj);
}

// Revisión de todo el árbol (también se usa con lo que baja de la nube):
// ids y referencias con formato de id, montos que sean números de verdad y
// ningún texto con etiquetas HTML o javascript:. Un solo "amount":"100" en un
// respaldo dejaba la app rota para siempre.
const _CAMPOS_NUMERO = new Set(['amount', 'monto', 'pagado', 'objetivo', 'limite', 'saldoBase', 'saldoBaseUSD', 'saldoUSD', 'pagoUSD', 'originalAmount', 'conversionRate', 'saldoInicial']);
function _revisionProfunda(obj) {
  // Sin comillas ni símbolos: así un id nunca puede romper un onclick="f('id')"
  const idOk = v => typeof v === 'number' ? isFinite(v) : typeof v === 'string' && /^[a-z0-9_-]{1,64}$/i.test(v);
  const peligro = /<\s*\/?\s*[a-z!]|javascript:/i;
  let malo = null, nodos = 0;
  const ver = (v, clave, prof) => {
    if (malo) return;
    if (++nodos > 2e6 || prof > 12) { malo = 'estructura demasiado grande o profunda'; return; }
    if (typeof v === 'string') { if (peligro.test(v)) malo = `texto sospechoso en ${clave}`; return; }
    if (typeof v === 'number') { if (!isFinite(v)) malo = `número inválido en ${clave}`; return; }
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) { v.forEach(x => ver(x, clave, prof + 1)); return; }
    for (const k of Object.keys(v)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') { malo = 'clave prohibida'; return; }
      const x = v[k];
      if (x !== undefined && x !== null && x !== '' && (k === 'id' || /[a-z]Id$/.test(k)) && !idOk(x)) { malo = `id inválido en ${k}`; return; }
      if (x !== undefined && x !== null && _CAMPOS_NUMERO.has(k) && (typeof x !== 'number' || !isFinite(x))) { malo = `${k} debe ser un número`; return; }
      ver(x, k, prof + 1);
    }
  };
  ver(obj, 'raíz', 0);
  return malo;
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { alert('❌ Archivo demasiado grande (>10MB)'); event.target.value=''; return; }

  const reader = new FileReader();
  reader.onload = async (e) => {
    let parsed;
    try {
      parsed = JSON.parse(e.target.result);
    } catch {
      alert('❌ Archivo de respaldo inválido (JSON corrupto)');
      event.target.value=''; return;
    }

    let datosRecuperados = null;

    // 1) Backup plano (sin cifrar): el archivo ES el state directamente
    if (parsed && typeof parsed === 'object' && typeof parsed.setup === 'boolean') {
      datosRecuperados = parsed;
    }
    // 2) Backup cifrado AES-GCM (nuevo formato P0-5)
    else if (parsed && parsed.tipo === 'mipistohn-aes-gcm' && parsed.salt && parsed.iv && parsed.datos) {
      const password = await pedirContrasenaNube(true, {
        titulo: '💾 Respaldo cifrado',
        intro: 'Escribe la contraseña con la que cifraste este respaldo.',
        nota: '',
      });
      if (!password) { event.target.value=''; return; }
      try {
        datosRecuperados = await _descifrarBackupAES(parsed, password);
      } catch {
        alert('❌ Contraseña incorrecta o archivo corrupto');
        event.target.value=''; return;
      }
    }
    // 3) Backup XOR legacy (compatibilidad con versiones < 2.0)
    else if (parsed && parsed.tipo === 'finanzas-hn-encriptado' && parsed.datos) {
      const password = (await preguntar('🔐 Contraseña del respaldo (formato antiguo):'));
      if (!password) { event.target.value=''; return; }
      datosRecuperados = _descifrarBackupXORLegacy(parsed, password);
      if (!datosRecuperados) {
        alert('❌ Contraseña incorrecta o archivo corrupto');
        event.target.value=''; return;
      }
      alert('⚠️ Estás importando un respaldo en formato antiguo (XOR). Tras importar, exporta uno nuevo en formato seguro AES-GCM.');
    }
    else {
      alert('❌ Formato de respaldo no reconocido');
      event.target.value=''; return;
    }

    // Validación de schema antes de reemplazar el state — cierra XSS por import malicioso
    const errorSchema = _validarSchemaBackup(datosRecuperados);
    if (errorSchema) {
      alert('❌ Estructura del respaldo inválida: ' + errorSchema);
      event.target.value=''; return;
    }

    if (!(await confirmar('⚠️ Esto reemplazará TODOS tus datos actuales con los del respaldo.\n\n¿Continuar?'))) {
      event.target.value=''; return;
    }

    // Lo que falte en el respaldo viejo queda con su valor por defecto
    state = Object.assign(estadoInicial(), datosRecuperados);
    save().then(() => location.reload());
  };
  reader.readAsText(file);
}

// ========== VISOR DE FACTURAS ==========
async function verFactura(id) {
    const gasto = state.transactions.find(t => String(t.id) === String(id));
    if (!gasto) return alert('Transacción no encontrada.');
    
    // P0-2: Cargar desde IDB si existe facturaImagenId, o usar facturaImagen legacy
    let imagenBase64 = null;
    if (gasto.facturaImagenId) {
        imagenBase64 = await _obtenerFactura(gasto.facturaImagenId);
    } else if (gasto.facturaImagen) {
        imagenBase64 = gasto.facturaImagen; // legacy base64
    }
    
    if (!imagenBase64) {
        alert('No hay factura adjunta a este gasto.');
        return;
    }
    // Viene de IDB o de un respaldo importado: solo se acepta una imagen en base64
    if (!/^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+$/i.test(imagenBase64)) {
        alert('La factura adjunta no es una imagen válida.');
        return;
    }
    
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);z-index:1000;display:flex;justify-content:center;align-items:center;padding:20px';
    modal.innerHTML = `
        <div style="position:relative;max-width:90%;max-height:90%">
            <button onclick="this.parentElement.parentElement.remove()" style="position:absolute;top:-40px;right:0;background:var(--red);color:white;border:none;padding:10px 20px;border-radius:8px;cursor:pointer">✕ Cerrar</button>
            <img src="${imagenBase64}" style="max-width:100%;max-height:90vh;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.5)">
            <div style="position:absolute;bottom:-40px;left:0;color:var(--text2);font-size:12px">Factura #${esc(gasto.numeroFactura || 'N/A')} • ${new Date(gasto.date).toLocaleDateString()}</div>
        </div>
    `;
    document.body.appendChild(modal);
    
    const closeOnEsc = (e) => { if(e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', closeOnEsc); } };
    document.addEventListener('keydown', closeOnEsc);
}



// ========== EXPORTACIÓN A EXCEL PROFESIONAL ==========
// exportToExcelPro() está en 23-excel.js

// ========== NAVEGACIÓN Y MODALES (v2 — Bottom Nav) ==========

// Mapa: vista → tab activo en la barra
// Pestaña de la barra de abajo que se marca en cada pantalla (tarjetas,
// préstamos y deudas se abren desde Cuentas)
const NAV_TAB_MAP = {
  dashboard:    'tab-dashboard',
  historico:    'tab-historico',
  presupuestos: 'tab-presupuestos',
  cuentas:      'tab-cuentas',
  tarjetas:     'tab-cuentas',
  prestamos:    'tab-cuentas',
  pagar:        'tab-cuentas',
};

function switchView(v){
  closeFabMenu();
  document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));
  const el = document.getElementById('view-'+v);
  if(el) el.classList.add('active');
  // Actualizar tab activo en la barra
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  const tabId = NAV_TAB_MAP[v];
  if(tabId) document.getElementById(tabId)?.classList.add('active');
  // Renders según vista
  if(v==='gastos')renderGastos();
  if(v==='ingresos')renderIngresos();
  if(v==='metas')renderMetas();
  if(v==='cobrar')renderCobrar();
  if(v==='pagar')renderPagar();
  if(v==='prestamos')renderPrestamos();
  if(v==='grupos')renderGrupos();
  if(v==='cuentas')renderMisCuentas();
  // Scroll to top on desktop
  const mainArea=document.getElementById('main-scroll-area');
  if(mainArea) mainArea.scrollTo({top:0,behavior:'smooth'});
  if(v==='tarjetas')renderTarjetas();
  if(v==='pagos')renderPagosRecurrentes();
  if(v==='historico')renderHistorico();
  if(v==='presupuestos'&&typeof renderVistaPresupuestos==='function')renderVistaPresupuestos();
  if(v==='categorias'&&typeof renderCategorias==='function')renderCategorias();
  if(v==='remesas'&&typeof renderRemesas==='function')renderRemesas();
  // Cloud sync: refrescar estado al entrar a config
  if(v==='config' && typeof renderCloudSyncUI === 'function') renderCloudSyncUI();
}

function toggleHamburger(){
  const panel=document.getElementById('hamburgerPanel');
  const overlay=document.getElementById('hamburgerOverlay');
  const isOpen=panel.classList.contains('active');
  if(isOpen){panel.classList.remove('active');overlay.classList.remove('active');document.body.style.overflow=''}
  else{closeFabMenu();panel.classList.add('active');overlay.classList.add('active');document.body.style.overflow='hidden'}
}

function openModal(id){
  document.getElementById(id).style.display='flex';
  closeFabMenu();
}
function closeModal(id){document.getElementById(id).style.display='none'}
async function closeModalIfBg(e,id){if(e.target.id===id){if(hasUnsavedModalData){if((await confirmar("¿Descartar los datos ingresados?"))){{hasUnsavedModalData=false;closeModal(id)}}}else{closeModal(id)}}}

let _fabOpen = false;
function toggleFabMenu(){
  // El botón + abre el registro rápido con teclado (24-registro-rapido.js)
  if (typeof abrirRegistro === 'function') { abrirRegistro('gasto'); return; }
  _fabOpen = !_fabOpen;
  const menu=document.getElementById('fab-menu');
  const btn=document.getElementById('nav-fab-btn');
  if(menu) menu.classList.toggle('open',_fabOpen);
  if(btn)  btn.classList.toggle('open',_fabOpen);
}
function closeFabMenu(){
  _fabOpen=false;
  document.getElementById('fab-menu')?.classList.remove('open');
  document.getElementById('nav-fab-btn')?.classList.remove('open');
}

// Cerrar FAB al tocar fuera
document.addEventListener('click',e=>{
  const menu=document.getElementById('fab-menu');
  const btn=document.getElementById('nav-fab-btn');
  if(_fabOpen && menu && btn && !menu.contains(e.target) && !btn.contains(e.target)) closeFabMenu();
});

function renderAll(){
    recalcularSaldosTarjetas();
    renderDashboard();renderGastos();renderIngresos();renderMetas();renderCobrar();renderPagar();renderPrestamos();renderTarjetas();renderPagosRecurrentes();renderTransferenciasProgramadas();renderHistorico();
    // FIX: el saludo/topbar (nombre, fecha, avatar) tiene su propio ciclo de
    // render independiente de renderAll(). Sin esto, cualquier flujo que solo
    // llame renderAll() tras cargar el state (ej. desbloqueo con PIN o con
    // biometría) deja el saludo mostrando "Cargando..." indefinidamente.
    if (typeof renderWelcome === 'function') renderWelcome();
    setTimeout(function(){ renderLiquidez7Dias(); renderChipsRapidas(); }, 50);
    renderRecordatorioConfig();
    renderPrimerosPasos();
    renderMargenExtranjero();
    renderBeneficiosMes();
    if (typeof renderAccesoPlanDeudas === 'function') renderAccesoPlanDeudas();
    if (typeof renderFondoEmergencia === 'function') renderFondoEmergencia();
    if (typeof renderPresupuestos === 'function') renderPresupuestos();
    if (typeof renderTilesCuentas === 'function') renderTilesCuentas();
    if (typeof renderConfigTarjetaAlPagar === 'function') renderConfigTarjetaAlPagar();
    if (typeof renderConfigTema === 'function') { renderConfigTema(); aplicarTema(temaActual()); }
    if (typeof renderAvisoCuadre === 'function') renderAvisoCuadre();
    if (typeof renderPremium === 'function') renderPremium();
    if (typeof renderRacha === 'function') renderRacha();
    if (typeof renderRegistrosMes === 'function') renderRegistrosMes();
    if (typeof renderSugerenciaRecurrente === 'function') renderSugerenciaRecurrente();
    if (typeof renderAutoAnotados === 'function') renderAutoAnotados();
    renderResumenMes();
    renderAvisoResumen();
    if (typeof notificarInformeMes === 'function') notificarInformeMes();
    if (!window.__revisionesIniciadas) { iniciarRevisionesPeriodicas(); procesarAccionDeURL(); }
}

// ========== BOTÓN ATRÁS (Android) ==========
// Antes el botón atrás cerraba la app aunque hubiera una ventana abierta.
// Ahora cierra lo que está encima (selector, ventana, menú), luego vuelve al
// Inicio, y en el Inicio pide tocar atrás otra vez para salir.
let _atrasSalir = 0;
function _armarAtras() { try { history.pushState({ miPisto: 1 }, ''); } catch (e) {} }
function _modalAbiertoArriba() {
  const abiertos = [...document.querySelectorAll('.modal')].filter(m => m.id !== 'modal-pin' && getComputedStyle(m).display !== 'none');
  return abiertos.sort((a, b) => (parseInt(getComputedStyle(a).zIndex) || 0) - (parseInt(getComputedStyle(b).zIndex) || 0)).pop() || null;
}
function manejarAtras() {
  // Con la app bloqueada no se navega
  const pin = document.getElementById('modal-pin');
  if (pin && getComputedStyle(pin).display !== 'none') return true;
  const hoja = document.getElementById('reg-selector');
  if (hoja && hoja.classList.contains('abierto')) { typeof cerrarDictado === 'function' ? cerrarDictado() : cerrarSelectorRegistro(); return true; }
  const modal = _modalAbiertoArriba();
  if (modal) {
    if (modal.id === 'modal-registro' && typeof cerrarRegistro === 'function') cerrarRegistro();
    else closeModal(modal.id);
    return true;
  }
  if (document.getElementById('hamburgerPanel')?.classList.contains('active')) { toggleHamburger(); return true; }
  if (_fabOpen) { closeFabMenu(); return true; }
  const vista = document.querySelector('.view.active');
  if (vista && vista.id !== 'view-dashboard') { switchView('dashboard'); return true; }
  // En el Inicio: no se vuelve a armar por 2 segundos, así el segundo toque sí sale
  if (typeof avisoRapido === 'function') avisoRapido('Toca atrás otra vez para salir', 2000);
  clearTimeout(_atrasSalir);
  _atrasSalir = setTimeout(_armarAtras, 2000);
  return false;
}
window.addEventListener('popstate', () => { if (manejarAtras()) _armarAtras(); });
_armarAtras();
